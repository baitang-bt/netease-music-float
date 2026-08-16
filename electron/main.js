const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen
} = require("electron");
const { createStateStore } = require("./state-store");
const { createPlatformMediaController } = require("./media-controller");
const { createAudioCapture } = require("./audio-capture");
const {
  listInstalledPlayers,
  normalizeTargetPlayerId,
  openOrFocusPlayer
} = require("./music-players");
const { openSystemAudioPrivacySettings } = require("./audio-permission");
const { resolveAudioteeBinary } = require("./paths");
const {
  detectPlaybackMode,
  setPlaybackMode,
  advancePlaybackMode: advanceNeteasePlaybackMode,
  openAccessibilitySettings,
  isAccessibilityTrusted,
  MODE_LABELS
} = require("./netease-playback-mode");
const { createLyricsController } = require("./netease-lyrics");
const { createAutoUpdater } = require("./auto-update");

const FLOAT_WIDTH_DEFAULT = 320;
const FLOAT_HEIGHT_COLLAPSED = 64;
const FLOAT_HEIGHT_EXPANDED_DEFAULT = 220;
const FLOAT_MIN_WIDTH = 260;
const FLOAT_MAX_WIDTH = 560;
const FLOAT_MIN_EXPANDED_HEIGHT = 180;
const FLOAT_MAX_EXPANDED_HEIGHT = 480;
/** Matches the AppKit frame animation so size limits are restored after it. */
const FLOAT_RESIZE_ANIMATION_MS = 260;
const SETTINGS_SIZE = { width: 500, height: 640 };
const SETTINGS_MIN_SIZE = { width: 440, height: 560 };
const SETTINGS_MAX_SIZE = { width: 900, height: 900 };

let floatWindow = null;
let settingsWindow = null;
let tray = null;
let stateStore = null;
let mediaController = null;
let audioCapture = null;
let dragOrigin = null;
let floatExpanded = false;
/** Pending restore of the size limits relaxed for the resize animation. */
let floatConstraintTimer = null;
/** True while setBounds(..., true) is animating; blocks persist of intermediate heights. */
let floatBoundsAnimating = false;
/** Guards before-quit so async media/audio shutdown can finish before exit. */
let isQuitting = false;
let floatWidth = FLOAT_WIDTH_DEFAULT;
let floatExpandedHeight = FLOAT_HEIGHT_EXPANDED_DEFAULT;
let latestTrack = {
  status: "empty",
  isTarget: false,
  isNetease: false,
  playing: false
};
let silenceTimer = null;
/** Last known NetEase playback mode (MediaRemote does not expose this). */
let knownPlaybackMode = null;
/** Ensures launch detect / auto-switch runs once per app session. */
let launchPlaybackModeSynced = false;
let lyricsController = null;
let autoUpdaterController = null;
/** Last auto-update status payload for Settings / float hints. */
let latestUpdateStatus = {
  state: "idle",
  message: ""
};
/** Renderer-facing feature availability for platform-specific settings. */
const PLATFORM_CAPABILITIES = Object.freeze({
  platform: process.platform,
  systemAudioCapture: process.platform === "darwin",
  accessibilityPlaybackMode: process.platform === "darwin"
});

/** Locks the window to the size range of the current expand state. */
function applyFloatSizeConstraints() {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  floatWindow.setResizable(floatExpanded);
  floatWindow.setMinimumSize(
    FLOAT_MIN_WIDTH,
    floatExpanded ? FLOAT_MIN_EXPANDED_HEIGHT : FLOAT_HEIGHT_COLLAPSED
  );
  floatWindow.setMaximumSize(
    FLOAT_MAX_WIDTH,
    floatExpanded ? FLOAT_MAX_EXPANDED_HEIGHT : FLOAT_HEIGHT_COLLAPSED
  );
}

/**
 * Resizes the float window between collapsed and expanded heights.
 * Keeps the top-left corner fixed so the panel grows downward, and animates the
 * frame so the native window follows the renderer transition.
 * @param {boolean} expanded
 */
function setFloatExpanded(expanded) {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  floatExpanded = Boolean(expanded);
  const bounds = floatWindow.getBounds();
  const height = floatExpanded ? floatExpandedHeight : FLOAT_HEIGHT_COLLAPSED;

  // Constraints stay wide open until the animation lands: a min/max that already
  // matches the target height makes macOS snap to it instead of animating.
  floatWindow.setResizable(true);
  floatWindow.setMinimumSize(FLOAT_MIN_WIDTH, FLOAT_HEIGHT_COLLAPSED);
  floatWindow.setMaximumSize(FLOAT_MAX_WIDTH, FLOAT_MAX_EXPANDED_HEIGHT);
  floatBoundsAnimating = true;
  floatWindow.setBounds(
    {
      x: bounds.x,
      y: bounds.y,
      width: floatWidth,
      height
    },
    true
  );

  clearTimeout(floatConstraintTimer);
  floatConstraintTimer = setTimeout(() => {
    floatBoundsAnimating = false;
    applyFloatSizeConstraints();
  }, FLOAT_RESIZE_ANIMATION_MS);
}

/** Persists the current expanded float size after the user resizes. */
function persistFloatSizeFromWindow() {
  if (
    !floatWindow ||
    floatWindow.isDestroyed() ||
    !floatExpanded ||
    floatBoundsAnimating
  ) {
    return;
  }
  const bounds = floatWindow.getBounds();
  floatWidth = Math.min(
    FLOAT_MAX_WIDTH,
    Math.max(FLOAT_MIN_WIDTH, bounds.width)
  );
  floatExpandedHeight = Math.min(
    FLOAT_MAX_EXPANDED_HEIGHT,
    Math.max(FLOAT_MIN_EXPANDED_HEIGHT, bounds.height)
  );
  stateStore.setFloatSize({
    width: floatWidth,
    expandedHeight: floatExpandedHeight
  });
  stateStore.setWindowPosition("float", {
    x: bounds.x,
    y: bounds.y,
    width: floatWidth,
    height: floatExpandedHeight
  });
}

/** Creates the transparent always-on-top floating BrowserWindow. */
function createFloatWindow() {
  const settings = stateStore.getSettings();
  const savedSize = stateStore.getFloatSize();
  floatWidth = savedSize.width;
  floatExpandedHeight = savedSize.expandedHeight;

  const saved = stateStore.getWindowPosition("float");
  const display = screen.getPrimaryDisplay().workArea;
  const position = saved || {
    x: Math.round(display.x + display.width - floatWidth - 24),
    y: Math.round(display.y + 48)
  };

  floatExpanded = false;
  floatWindow = new BrowserWindow({
    width: floatWidth,
    height: FLOAT_HEIGHT_COLLAPSED,
    x: position.x,
    y: position.y,
    minWidth: FLOAT_MIN_WIDTH,
    maxWidth: FLOAT_MAX_WIDTH,
    minHeight: FLOAT_HEIGHT_COLLAPSED,
    maxHeight: FLOAT_HEIGHT_COLLAPSED,
    title: "网易云浮窗",
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  floatWindow.setFullScreenable(false);
  applyAlwaysOnTop(settings.alwaysOnTop);
  floatWindow.loadFile(path.join(__dirname, "..", "src", "index.html"));
  floatWindow.once("ready-to-show", () => {
    floatWindow.show();
  });
  floatWindow.on("show", () => {
    applyFullScreenVisibility();
  });
  floatWindow.webContents.on("did-finish-load", () => {
    // Lyric lines emitted before the renderer was ready are dropped; replay the
    // line for the current playback position so launch starts in sync.
    lyricsController?.resync(latestTrack);
  });
  floatWindow.on("resized", () => {
    persistFloatSizeFromWindow();
  });
  floatWindow.on("closed", () => {
    floatWindow = null;
    floatExpanded = false;
  });
}

/** Builds the menu-bar tray entry. */
function createTray() {
  const icon =
    process.platform === "darwin"
      ? nativeImage.createEmpty()
      : resolveAppIcon();
  tray = new Tray(icon);
  tray.setTitle("♫");
  tray.setToolTip("网易云浮窗");
  const menu = Menu.buildFromTemplate([
    {
      label: "显示浮窗",
      click: () => {
        if (!floatWindow) {
          createFloatWindow();
        } else {
          floatWindow.show();
        }
      }
    },
    {
      label: "隐藏浮窗",
      click: () => floatWindow?.hide()
    },
    {
      label: "设置",
      click: () => toggleSettingsWindow()
    },
    {
      label: "检查更新",
      click: () => {
        autoUpdaterController?.checkForUpdates({ silent: false });
      }
    },
    {
      label: "打开当前音乐软件",
      click: () => {
        const playerId = stateStore?.getSettings().targetPlayerId;
        openOrFocusPlayer(playerId).catch(() => {});
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit()
    }
  ]);
  tray.setContextMenu(menu);
}

/** Resolves the packaged/development app icon for platforms with icon-only trays. */
function resolveAppIcon() {
  const candidates = [
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(__dirname, "..", "build", "icon.png")
  ];
  const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

/** Creates a DesktopPet-style resizable settings window (framed, not float-chrome). */
function createSettingsWindow() {
  if (settingsWindow) {
    return;
  }

  const bounds = getRestoredSettingsBounds();

  settingsWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: SETTINGS_MIN_SIZE.width,
    minHeight: SETTINGS_MIN_SIZE.height,
    maxWidth: SETTINGS_MAX_SIZE.width,
    maxHeight: SETTINGS_MAX_SIZE.height,
    title: "网易云浮窗设置",
    backgroundColor: "#16161b",
    transparent: false,
    frame: true,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 14 }
        }
      : {}),
    resizable: true,
    movable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.setResizable(true);
  settingsWindow.setMinimumSize(SETTINGS_MIN_SIZE.width, SETTINGS_MIN_SIZE.height);
  settingsWindow.setMaximumSize(SETTINGS_MAX_SIZE.width, SETTINGS_MAX_SIZE.height);
  settingsWindow.loadFile(path.join(__dirname, "..", "src", "settings.html"));
  trackWindowBounds("settings", settingsWindow);

  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
    settingsWindow.focus();
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

/**
 * Clamps settings window size into the allowed range.
 * @param {{ width?: number, height?: number }} size
 */
function clampSettingsSize(size = SETTINGS_SIZE) {
  return {
    width: Math.min(
      SETTINGS_MAX_SIZE.width,
      Math.max(SETTINGS_MIN_SIZE.width, Math.round(size.width ?? SETTINGS_SIZE.width))
    ),
    height: Math.min(
      SETTINGS_MAX_SIZE.height,
      Math.max(SETTINGS_MIN_SIZE.height, Math.round(size.height ?? SETTINGS_SIZE.height))
    )
  };
}

/**
 * Restores last settings bounds or centers a default-sized window.
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function getRestoredSettingsBounds() {
  const saved = stateStore.getWindowPosition("settings");
  const size = clampSettingsSize({
    width: saved?.width ?? SETTINGS_SIZE.width,
    height: saved?.height ?? SETTINGS_SIZE.height
  });
  const display = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: Math.round(display.x + (display.width - size.width) / 2),
    y: Math.round(display.y + (display.height - size.height) / 2)
  };
  const x = Number.isFinite(saved?.x) ? saved.x : fallback.x;
  const y = Number.isFinite(saved?.y) ? saved.y : fallback.y;
  return { ...size, x, y };
}

/**
 * Debounced persist of window x/y/width/height while the user moves or resizes.
 * @param {string} windowName
 * @param {Electron.BrowserWindow} browserWindow
 */
function trackWindowBounds(windowName, browserWindow) {
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (browserWindow.isDestroyed()) {
        return;
      }
      const bounds = browserWindow.getBounds();
      stateStore.setWindowPosition(windowName, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    }, 200);
  };
  browserWindow.on("move", persist);
  browserWindow.on("resize", persist);
}

/** Closes the settings window if open (bounds already tracked on move/resize). */
function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const bounds = settingsWindow.getBounds();
    stateStore.setWindowPosition("settings", {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    });
    settingsWindow.close();
  }
}

/** Opens settings, or focuses it when already open. */
function toggleSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
    return;
  }
  if (settingsWindow.isVisible()) {
    settingsWindow.focus();
  } else {
    settingsWindow.show();
  }
}

/**
 * Applies always-on-top and keeps the float visible on every Space, including
 * other apps' fullscreen Spaces (screen-saver level + fullscreen-auxiliary).
 * @param {boolean} alwaysOnTop
 */
function applyAlwaysOnTop(alwaysOnTop) {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  if (alwaysOnTop) {
    if (process.platform === "darwin") {
      floatWindow.setAlwaysOnTop(true, "screen-saver");
    } else {
      floatWindow.setAlwaysOnTop(true);
    }
  } else {
    floatWindow.setAlwaysOnTop(false);
  }
  // setAlwaysOnTop resets macOS collection behavior, so re-apply it afterwards.
  applyFullScreenVisibility();
}

/** Joins all Spaces and other apps' fullscreen windows without hiding the Dock icon. */
function applyFullScreenVisibility() {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  if (process.platform !== "darwin") {
    return;
  }
  floatWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
}

/** Broadcasts settings to open renderer windows. */
function broadcastSettings(settings) {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("settings:changed", settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("settings:changed", settings);
  }
}

/** Sends the latest track snapshot to the renderer (includes playbackMode). */
function broadcastTrack(track) {
  latestTrack = {
    ...track,
    playbackMode: track.playbackMode || knownPlaybackMode || null
  };
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("media:track", latestTrack);
  }
}

/**
 * Merges a detected/forced playback mode into the current track broadcast.
 * @param {string|null} mode
 */
function publishPlaybackMode(mode) {
  knownPlaybackMode = mode;
  broadcastTrack({
    ...latestTrack,
    playbackMode: mode
  });
}

/**
 * On first NetEase Now Playing: detect mode, optionally force launchPlaybackMode.
 */
async function syncLaunchPlaybackMode() {
  if (launchPlaybackModeSynced) {
    return;
  }
  launchPlaybackModeSynced = true;

  const preferred = stateStore.getSettings().launchPlaybackMode || "keep";
  const detected = await detectPlaybackMode();
  if (detected.mode) {
    publishPlaybackMode(detected.mode);
  }

  if (preferred && preferred !== "keep") {
    const setResult = await setPlaybackMode(preferred, { prompt: false });
    if (setResult.mode) {
      publishPlaybackMode(setResult.mode);
    } else if (setResult.error && floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send("media:mode-error", {
        error: setResult.error,
        accessibility: setResult.accessibility !== false
      });
    }
  }
}

/** Sends spectrum bands to the renderer. */
function broadcastSpectrum(bands, meta) {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("spectrum:bands", {
      bands,
      muted: Boolean(meta?.muted),
      error: meta?.error || null
    });
  }
}

/**
 * Sends the current lyric line (or clears lyric mode) to the float UI.
 * @param {{ line: string, instrumental: boolean, songId: number|null, showLyric: boolean }} payload
 */
function broadcastLyric(payload) {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("media:lyric", payload);
  }
}

/**
 * Forwards auto-update status to open windows.
 * @param {{ state: string, message?: string, version?: string, percent?: number, error?: string }} payload
 */
function broadcastUpdateStatus(payload) {
  latestUpdateStatus = { ...latestUpdateStatus, ...payload };
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send("update:status", latestUpdateStatus);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("update:status", latestUpdateStatus);
  }
}

/**
 * Softens spectrum when NetEase is paused / inactive.
 * Does not start or restart AudioTee — relaunching the binary re-triggers macOS TCC.
 * @param {object} track
 */
function syncAudioCapture(track) {
  if (!audioCapture) {
    return;
  }

  if (!track.isTarget) {
    audioCapture.emitSilence();
    if (silenceTimer) {
      clearInterval(silenceTimer);
      silenceTimer = null;
    }
    return;
  }

  if (!track.playing) {
    if (!silenceTimer) {
      silenceTimer = setInterval(() => audioCapture.emitSilence(), 80);
    }
  } else if (silenceTimer) {
    clearInterval(silenceTimer);
    silenceTimer = null;
  }
}

/** Builds a snapshot of system-audio capture / permission state. */
function getAudioPermissionStatus() {
  if (!PLATFORM_CAPABILITIES.systemAudioCapture) {
    return {
      state: "unsupported",
      running: false,
      consent: false,
      error: null,
      hint: "当前平台暂不支持系统音频频谱。"
    };
  }
  const error = audioCapture?.getLastError?.() || null;
  const running = Boolean(audioCapture?.isRunning?.());
  const consent = Boolean(stateStore?.getSettings?.().systemAudioConsent);
  let state = "unknown";
  if (running && !error) {
    state = "granted";
  } else if (error) {
    state = "denied";
  } else if (!consent || !running) {
    state = "idle";
  }
  return {
    state,
    running,
    consent,
    error,
    hint:
      "系统设置 → 隐私与安全性 → 屏幕与系统音频录制 →「仅系统音频录制」，勾选 NeteaseFloat，必要时也勾选 audiotee。"
  };
}

/**
 * Starts AudioTee only after the user has opted in (avoids launch-time TCC prompts).
 * @returns {Promise<{ ok: boolean, error?: string|null, skipped?: boolean }>}
 */
async function startAudioCaptureIfAllowed() {
  if (!PLATFORM_CAPABILITIES.systemAudioCapture) {
    return { ok: false, skipped: true, unsupported: true };
  }
  if (!audioCapture || !stateStore) {
    return { ok: false, error: "not-ready" };
  }
  if (!stateStore.getSettings().systemAudioConsent) {
    return { ok: false, skipped: true };
  }
  return audioCapture.start();
}

/** Registers IPC handlers for UI controls and settings. */
function registerIpc() {
  ipcMain.handle("settings:get", () => stateStore.getSettings());
  ipcMain.handle("platform:get-capabilities", () => PLATFORM_CAPABILITIES);

  ipcMain.handle("settings:update", (_event, changes) => {
    const previousPlayerId = stateStore.getSettings().targetPlayerId;
    const settings = stateStore.updateSettings(changes || {});
    applyAlwaysOnTop(settings.alwaysOnTop);
    broadcastSettings(settings);
    if (settings.targetPlayerId !== previousPlayerId) {
      launchPlaybackModeSynced = false;
      knownPlaybackMode = null;
      // Force a Now Playing refresh so the float rematches immediately.
      mediaController?.fetchNowPlaying({ noArtwork: true }).then((track) => {
        broadcastTrack({
          ...track,
          playbackMode:
            track.isNetease ? knownPlaybackMode : null
        });
        syncAudioCapture(track);
        lyricsController?.bindTrack(track);
      }).catch(() => {});
    }
    return settings;
  });

  /** Returns catalog music apps installed on this Mac for the Settings picker. */
  ipcMain.handle("players:list-installed", async () => listInstalledPlayers());

  ipcMain.on("settings:toggle-window", () => toggleSettingsWindow());
  ipcMain.on("settings:close-window", () => closeSettingsWindow());
  ipcMain.on("app:quit", () => app.quit());

  ipcMain.on("float:set-expanded", (_event, expanded) => {
    setFloatExpanded(Boolean(expanded));
  });

  /** Returns current system-audio capture status for the settings UI. */
  ipcMain.handle("audio:get-status", () => getAudioPermissionStatus());

  /**
   * User-initiated permission: remember consent, start capture once, open Settings only if needed.
   * Does not restart a healthy capture (restart re-triggers macOS TCC every time).
   */
  ipcMain.handle("audio:request-permission", async () => {
    if (!PLATFORM_CAPABILITIES.systemAudioCapture) {
      return getAudioPermissionStatus();
    }
    stateStore.updateSettings({ systemAudioConsent: true });

    let capture = { ok: false, error: null };
    let openedSettings = false;

    if (audioCapture) {
      const healthy =
        audioCapture.isRunning() && !audioCapture.getLastError();
      if (healthy) {
        capture = { ok: true, error: null };
      } else if (audioCapture.isRunning()) {
        capture = await audioCapture.restart();
        const settingsResult = await openSystemAudioPrivacySettings();
        openedSettings = Boolean(settingsResult?.ok);
      } else {
        capture = await audioCapture.start();
        // First enable (or after failure): open Settings so the user can tick the toggle.
        const settingsResult = await openSystemAudioPrivacySettings();
        openedSettings = Boolean(settingsResult?.ok);
      }
    }

    const status = getAudioPermissionStatus();
    return {
      ...status,
      captureOk: Boolean(capture?.ok),
      captureError: capture?.error || null,
      openedSettings
    };
  });

  ipcMain.handle("media:get-track", () => latestTrack);

  ipcMain.handle("media:toggle", async () => {
    // Do not await the MediaRemote round-trip — UI flips optimistically.
    return invokeMediaCommand("togglePlayPause");
  });
  ipcMain.handle("media:next", async () => invokeMediaCommand("nextTrack"));
  ipcMain.handle("media:previous", async () =>
    invokeMediaCommand("previousTrack")
  );
  ipcMain.handle("media:mode", async () => {
    if (!PLATFORM_CAPABILITIES.accessibilityPlaybackMode) {
      return {
        ok: false,
        mode: null,
        error: "playback-mode-unsupported-platform",
        accessibility: false,
        labels: MODE_LABELS
      };
    }
    if (stateStore.getSettings().targetPlayerId !== "netease") {
      return {
        ok: false,
        mode: null,
        error: "playback-mode-netease-only",
        accessibility: true,
        labels: MODE_LABELS
      };
    }
    const result = await advanceNeteasePlaybackMode(knownPlaybackMode);
    if (result.mode) {
      publishPlaybackMode(result.mode);
    }
    return {
      ok: Boolean(result.ok),
      mode: result.mode || knownPlaybackMode,
      error: result.error || null,
      accessibility: result.accessibility !== false,
      labels: MODE_LABELS
    };
  });

  ipcMain.handle("media:detect-mode", async () => {
    if (!PLATFORM_CAPABILITIES.accessibilityPlaybackMode) {
      return { ok: false, accessibility: false, error: "unsupported-platform" };
    }
    const result = await detectPlaybackMode();
    if (result.mode) {
      publishPlaybackMode(result.mode);
    }
    return result;
  });

  ipcMain.handle("media:set-mode", async (_event, mode) => {
    if (!PLATFORM_CAPABILITIES.accessibilityPlaybackMode) {
      return { ok: false, accessibility: false, error: "unsupported-platform" };
    }
    const result = await setPlaybackMode(String(mode || ""));
    if (result.mode) {
      publishPlaybackMode(result.mode);
    }
    return result;
  });

  ipcMain.handle("accessibility:status", () => ({
    supported: PLATFORM_CAPABILITIES.accessibilityPlaybackMode,
    trusted:
      PLATFORM_CAPABILITIES.accessibilityPlaybackMode &&
      isAccessibilityTrusted(false)
  }));

  ipcMain.handle("accessibility:request", async () => {
    if (!PLATFORM_CAPABILITIES.accessibilityPlaybackMode) {
      return { trusted: false, supported: false, openedSettings: false };
    }
    const trusted = isAccessibilityTrusted(true);
    if (!trusted) {
      await openAccessibilitySettings();
    }
    return { trusted: isAccessibilityTrusted(false), openedSettings: !trusted };
  });

  ipcMain.handle("player:open", async () => {
    const playerId = stateStore.getSettings().targetPlayerId;
    return openOrFocusPlayer(playerId);
  });
  // Legacy alias used by older preload / UI bindings.
  ipcMain.handle("netease:open", async () => {
    const playerId = stateStore.getSettings().targetPlayerId;
    return openOrFocusPlayer(playerId);
  });

  ipcMain.handle("update:get-status", () => ({
    ...latestUpdateStatus,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged
  }));

  ipcMain.handle("update:check", async () =>
    autoUpdaterController?.checkForUpdates({ silent: false })
  );

  ipcMain.handle("update:install", () => {
    autoUpdaterController?.quitAndInstall();
    return { ok: true };
  });

  ipcMain.on("float:drag-start", () => {
    if (!floatWindow) {
      return;
    }
    const bounds = floatWindow.getBounds();
    dragOrigin = { x: bounds.x, y: bounds.y };
  });

  ipcMain.on("float:drag-move", (_event, deltaX, deltaY) => {
    if (!floatWindow || !dragOrigin) {
      return;
    }
    floatWindow.setPosition(
      Math.round(dragOrigin.x + (Number(deltaX) || 0)),
      Math.round(dragOrigin.y + (Number(deltaY) || 0))
    );
  });

  ipcMain.on("float:drag-end", () => {
    if (!floatWindow) {
      return;
    }
    const bounds = floatWindow.getBounds();
    stateStore.setWindowPosition("float", {
      x: bounds.x,
      y: bounds.y,
      width: floatWidth,
      height: floatExpanded ? floatExpandedHeight : FLOAT_HEIGHT_COLLAPSED
    });
    dragOrigin = null;
  });
}

/**
 * Invokes a common playback command and converts platform failures into a
 * stable IPC result instead of an unhandled rejected promise.
 * @param {"togglePlayPause"|"nextTrack"|"previousTrack"} command
 */
async function invokeMediaCommand(command) {
  try {
    await mediaController?.[command]?.();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    app.dock.show();
    const icon = resolveAppIcon();
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  }

  stateStore = createStateStore(
    path.join(app.getPath("userData"), "state.json")
  );

  // If the saved player was uninstalled, fall back to the first local match.
  try {
    const installed = await listInstalledPlayers();
    const selectedId = normalizeTargetPlayerId(
      stateStore.getSettings().targetPlayerId
    );
    if (
      installed.length &&
      !installed.some((player) => player.id === selectedId)
    ) {
      stateStore.updateSettings({ targetPlayerId: installed[0].id });
    }
  } catch {
    // Ignore detection failures; MediaRemote matching still uses the saved id.
  }

  mediaController = createPlatformMediaController({
    pollMs: 900,
    getTargetPlayerId: () => stateStore.getSettings().targetPlayerId,
    onUpdate: (track) => {
      broadcastTrack({
        ...track,
        playbackMode: track.isNetease ? knownPlaybackMode : null
      });
      syncAudioCapture(track);
      lyricsController?.bindTrack(track);
      if (track.isNetease && !launchPlaybackModeSynced) {
        syncLaunchPlaybackMode().catch(() => {});
      }
    },
    onTick: (track) => {
      latestTrack = {
        ...latestTrack,
        elapsed: track.elapsed,
        elapsedSampledAt: track.elapsedSampledAt,
        playing: track.playing
      };
    }
  });

  lyricsController = createLyricsController({
    onLyric: (payload) => broadcastLyric(payload)
  });
  lyricsController.start(() => latestTrack);
  // Capture all system audio once; filtering by NetEase PID required restart and
  // caused repeated「系统音频录制」prompts whenever the reported PID changed.
  if (PLATFORM_CAPABILITIES.systemAudioCapture) {
    audioCapture = createAudioCapture({
      binaryPath: resolveAudioteeBinary(),
      onBands: (bands, meta) => broadcastSpectrum(bands, meta)
    });
  }

  registerIpc();
  createTray();
  createFloatWindow();
  mediaController.start();

  autoUpdaterController = createAutoUpdater({
    onStatus: (payload) => broadcastUpdateStatus(payload)
  });
  if (
    app.isPackaged &&
    stateStore.getSettings().autoCheckUpdates !== false
  ) {
    setTimeout(() => {
      autoUpdaterController?.checkForUpdates({ silent: true });
    }, 8000);
  }

  // Never spawn audiotee until the user has consented once — otherwise every launch
  // re-prompts macOS「系统音频录制」(especially with ad-hoc / helper binaries).
  const startResult = await startAudioCaptureIfAllowed();
  if (startResult.skipped) {
    broadcastSpectrum(new Array(32).fill(0), { muted: true });
  } else if (!startResult.ok) {
    broadcastSpectrum(new Array(32).fill(0), {
      muted: true,
      error: startResult.error || "audio-permission"
    });
  }
});

app.on("window-all-closed", (event) => {
  // Keep running from tray/Dock even if the float window is closed.
  event.preventDefault();
});

app.on("activate", () => {
  if (!floatWindow) {
    createFloatWindow();
  } else {
    floatWindow.show();
  }
  if (process.platform === "darwin") {
    app.dock.show();
  }
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }
  // Electron does not await this handler; preventDefault + app.exit so Windows
  // can shut down the GSMTC backend process instead of leaving it orphaned.
  event.preventDefault();
  isQuitting = true;
  (async () => {
    try {
      await mediaController?.stop();
      lyricsController?.stop();
      if (silenceTimer) {
        clearInterval(silenceTimer);
        silenceTimer = null;
      }
      await audioCapture?.stop();
    } finally {
      app.exit(0);
    }
  })();
});
