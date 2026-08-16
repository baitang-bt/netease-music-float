const api = window.neteaseFloat;

const audioStatusEl = document.querySelector("#audio-status");
const audioDetailEl = document.querySelector("#audio-status-detail");
const audioPermissionBtn = document.querySelector("#btn-audio-permission");
const windowColorInput = document.querySelector("#window-color");
const spectrumColorInput = document.querySelector("#spectrum-color");
const transparentFloatInput = document.querySelector("#transparent-float");
const titleFontSelect = document.querySelector("#title-font");
const titleFontSizeInput = document.querySelector("#title-font-size");
const titleFontSizeLabel = document.querySelector("#title-font-size-label");
const titleFontPreview = document.querySelector("#title-font-preview");
const launchPlaybackModeSelect = document.querySelector("#launch-playback-mode");
const accessibilityStatusEl = document.querySelector("#accessibility-status");
const targetPlayerSelect = document.querySelector("#target-player");
const openPlayerLabel = document.querySelector("#open-player-label");
const playbackModeCard = document.querySelector("#playback-mode-card");
const audioCaptureCard = document.querySelector("#audio-capture-card");
const autoCheckUpdatesInput = document.querySelector("#auto-check-updates");
const updateStatusEl = document.querySelector("#update-status");
const checkUpdateBtn = document.querySelector("#btn-check-update");
const installUpdateBtn = document.querySelector("#btn-install-update");

const DEFAULT_WINDOW_COLOR = "#24242a";
const DEFAULT_SPECTRUM_COLOR = "#e60026";

/** Cache of installed players from the main process. */
let installedPlayers = [];
/** Feature flags supplied by the main process for the current operating system. */
let platformCapabilities = {
  systemAudioCapture: false,
  accessibilityPlaybackMode: false
};

/**
 * Fills the target-player <select> with locally installed catalog apps.
 * @param {string} selectedId
 */
function populateTargetPlayerOptions(selectedId) {
  targetPlayerSelect.innerHTML = "";
  if (!installedPlayers.length) {
    const option = document.createElement("option");
    option.value = selectedId || "netease";
    option.textContent = "未检测到已安装的音乐软件";
    targetPlayerSelect.appendChild(option);
    targetPlayerSelect.disabled = true;
    return;
  }
  targetPlayerSelect.disabled = false;
  installedPlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.label;
    targetPlayerSelect.appendChild(option);
  });
  const hasSelected = installedPlayers.some((player) => player.id === selectedId);
  targetPlayerSelect.value = hasSelected
    ? selectedId
    : installedPlayers[0].id;
}

/**
 * Shows NetEase-only playback-mode settings when that player is selected.
 * @param {string} playerId
 */
function updatePlayerDependentUi(playerId) {
  const player =
    installedPlayers.find((entry) => entry.id === playerId) || null;
  const showsPlaybackMode =
    playerId === "netease" &&
    platformCapabilities.accessibilityPlaybackMode === true;
  playbackModeCard.hidden = !showsPlaybackMode;
  openPlayerLabel.textContent = player
    ? `打开${player.label}`
    : "打开所选音乐软件";
}

/**
 * Renders auto-update status text and the install button.
 * @param {{
 *   state?: string,
 *   message?: string,
 *   currentVersion?: string,
 *   packaged?: boolean
 * }} status
 */
function renderUpdateStatus(status) {
  const version = status?.currentVersion
    ? `v${status.currentVersion}`
    : "";
  const message = status?.message || "尚未检查";
  updateStatusEl.textContent = version ? `${message}（${version}）` : message;
  installUpdateBtn.hidden = status?.state !== "ready";
}

/** Loads installed players then paints settings. */
async function refreshInstalledPlayers(settings) {
  installedPlayers = (await api.listInstalledPlayers()) || [];
  const selectedId = settings?.targetPlayerId || "netease";
  populateTargetPlayerOptions(selectedId);
  updatePlayerDependentUi(targetPlayerSelect.value || selectedId);
}

/**
 * Hides settings whose native implementation is unavailable on this platform.
 * @param {{ systemAudioCapture?: boolean, accessibilityPlaybackMode?: boolean }} capabilities
 */
function applyPlatformCapabilities(capabilities) {
  platformCapabilities = {
    ...platformCapabilities,
    ...(capabilities || {})
  };
  document.documentElement.dataset.platform =
    capabilities?.platform || "unknown";
  audioCaptureCard.hidden = !platformCapabilities.systemAudioCapture;
  updatePlayerDependentUi(targetPlayerSelect.value || "netease");
}

/** Refreshes Accessibility trust status for playback-mode control. */
async function refreshAccessibilityStatus() {
  if (!platformCapabilities.accessibilityPlaybackMode) {
    return;
  }
  const status = await api.getAccessibilityStatus();
  accessibilityStatusEl.textContent = status?.trusted ? "已授权" : "未授权";
}

/** Fills the title-font <select> from shared CJK-capable presets. */
function populateTitleFontOptions() {
  const presets = window.TITLE_FONT_PRESETS || {};
  titleFontSelect.innerHTML = "";
  Object.values(presets).forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    titleFontSelect.appendChild(option);
  });
}

/**
 * Updates the live title font preview label and sample text.
 * @param {string} fontId
 * @param {number} fontSize
 */
function renderTitleFontPreview(fontId, fontSize) {
  titleFontSizeLabel.textContent = `${fontSize}px`;
  titleFontPreview.style.fontFamily = window.resolveTitleFontStack(fontId);
  titleFontPreview.style.fontSize = `${fontSize}px`;
}

/**
 * Mirrors the float's custom colors into Settings and keeps text WCAG-readable.
 * @param {{ windowColor?: string, spectrumColor?: string }} settings
 */
function applySettingsTheme(settings) {
  const windowColor =
    window.normalizeHexColor(settings?.windowColor) || DEFAULT_WINDOW_COLOR;
  const spectrumColor =
    window.normalizeHexColor(settings?.spectrumColor) || DEFAULT_SPECTRUM_COLOR;
  const contrast = window.contrastTheme(windowColor);
  const visibleAccent = window.ensureContrastHex(
    spectrumColor,
    windowColor,
    2.1
  );
  const root = document.documentElement;
  const paper = window.darkenHex(
    windowColor,
    contrast.isLight ? 0.06 : 0.22
  );
  const sidebar = window.darkenHex(
    windowColor,
    contrast.isLight ? 0.12 : 0.3
  );
  const accentIsLight = window.relativeLuminance(visibleAccent) > 0.44;

  root.style.setProperty("--ink", contrast.foreground);
  root.style.setProperty("--ink-soft", contrast.muted);
  root.style.setProperty("--paper", paper);
  root.style.setProperty("--sidebar", sidebar);
  root.style.setProperty("--surface", contrast.surface);
  root.style.setProperty("--surface-hover", contrast.surfaceHover);
  root.style.setProperty("--line", contrast.line);
  root.style.setProperty("--accent", visibleAccent);
  root.style.setProperty("--accent-text", window.contrastTextColor(visibleAccent));
  root.style.setProperty("--accent-soft", window.hexToRgba(visibleAccent, 0.18));
  root.style.setProperty(
    "--accent-hover",
    accentIsLight
      ? window.darkenHex(visibleAccent, 0.12)
      : window.lightenHex(visibleAccent, 0.16)
  );
}

/**
 * Loads settings into controls and synchronizes the Settings theme.
 * @param {{
 *   alwaysOnTop?: boolean,
 *   windowColor?: string,
 *   spectrumColor?: string,
 *   transparentFloat?: boolean,
 *   titleFontId?: string,
 *   titleFontSize?: number,
 *   launchPlaybackMode?: string,
 *   targetPlayerId?: string,
 *   autoCheckUpdates?: boolean
 * }} settings
 */
function renderSettings(settings) {
  applySettingsTheme(settings);
  document.querySelector("#always-on-top").checked = Boolean(settings.alwaysOnTop);
  autoCheckUpdatesInput.checked = settings.autoCheckUpdates !== false;
  transparentFloatInput.checked = Boolean(settings.transparentFloat);
  windowColorInput.value = settings.windowColor || DEFAULT_WINDOW_COLOR;
  spectrumColorInput.value = settings.spectrumColor || DEFAULT_SPECTRUM_COLOR;
  windowColorInput.disabled = Boolean(settings.transparentFloat);
  launchPlaybackModeSelect.value = settings.launchPlaybackMode || "keep";

  const fontId = window.normalizeTitleFontId(settings.titleFontId);
  const fontSize = window.clampTitleFontSize(settings.titleFontSize);
  titleFontSelect.value = fontId;
  titleFontSizeInput.value = String(fontSize);
  renderTitleFontPreview(fontId, fontSize);

  const selectedId = settings.targetPlayerId || "netease";
  if (targetPlayerSelect.options.length) {
    const hasSelected = [...targetPlayerSelect.options].some(
      (option) => option.value === selectedId
    );
    if (hasSelected) {
      targetPlayerSelect.value = selectedId;
    }
  }
  updatePlayerDependentUi(targetPlayerSelect.value || selectedId);
}

/**
 * Renders system-audio permission / capture status in the settings card.
 * @param {{
 *   state?: string,
 *   running?: boolean,
 *   consent?: boolean,
 *   error?: string|null,
 *   hint?: string,
 *   openedSettings?: boolean
 * }} status
 */
function renderAudioStatus(status) {
  const state = status?.state || "unknown";
  const labels = {
    granted: "已授权",
    denied: "未授权",
    idle: "未采集",
    unknown: "未知"
  };
  audioStatusEl.textContent = labels[state] || labels.unknown;
  audioStatusEl.className = `status-chip is-${state}`;

  if (status?.error) {
    audioDetailEl.textContent = `采集失败：${status.error}`;
  } else if (state === "granted") {
    audioDetailEl.textContent = "系统音频采集正常，频谱应能随播放跳动。";
  } else if (status?.openedSettings) {
    audioDetailEl.textContent =
      "已打开系统设置。请在「仅系统音频录制」中勾选本应用（或 audiotee）。";
  } else if (status?.consent && !status?.running) {
    audioDetailEl.textContent =
      "已记住授权意向，但采集未在运行。可再点一次启动。";
  } else {
    audioDetailEl.textContent =
      status?.hint ||
      "真实频谱需要「仅系统音频录制」权限。首次点击下方按钮即可。";
  }
}

/** Refreshes audio permission status from the main process. */
async function refreshAudioStatus() {
  const status = await api.getAudioStatus();
  renderAudioStatus(status);
}

populateTitleFontOptions();

document.querySelector("#always-on-top").addEventListener("change", (event) => {
  api.updateSettings({ alwaysOnTop: event.target.checked });
});

autoCheckUpdatesInput.addEventListener("change", (event) => {
  api.updateSettings({ autoCheckUpdates: event.target.checked });
});

checkUpdateBtn.addEventListener("click", async () => {
  checkUpdateBtn.disabled = true;
  try {
    await api.checkForUpdates();
  } finally {
    checkUpdateBtn.disabled = false;
  }
});

installUpdateBtn.addEventListener("click", () => {
  api.installUpdate();
});

api.onUpdateStatus((payload) => {
  api.getUpdateStatus().then(renderUpdateStatus);
  renderUpdateStatus(payload);
});

transparentFloatInput.addEventListener("change", (event) => {
  api.updateSettings({ transparentFloat: event.target.checked });
});

windowColorInput.addEventListener("input", (event) => {
  api.updateSettings({ windowColor: event.target.value });
});

spectrumColorInput.addEventListener("input", (event) => {
  api.updateSettings({ spectrumColor: event.target.value });
});

titleFontSelect.addEventListener("change", (event) => {
  api.updateSettings({ titleFontId: event.target.value });
});

titleFontSizeInput.addEventListener("input", (event) => {
  const fontSize = window.clampTitleFontSize(event.target.value);
  titleFontSizeLabel.textContent = `${fontSize}px`;
  renderTitleFontPreview(titleFontSelect.value, fontSize);
  api.updateSettings({ titleFontSize: fontSize });
});

launchPlaybackModeSelect.addEventListener("change", (event) => {
  api.updateSettings({ launchPlaybackMode: event.target.value });
});

targetPlayerSelect.addEventListener("change", (event) => {
  const playerId = event.target.value;
  updatePlayerDependentUi(playerId);
  api.updateSettings({ targetPlayerId: playerId });
});

document.querySelector("#btn-accessibility").addEventListener("click", async () => {
  await api.requestAccessibility();
  refreshAccessibilityStatus();
});

document.querySelector("#btn-reset-colors").addEventListener("click", () => {
  api.updateSettings({
    windowColor: DEFAULT_WINDOW_COLOR,
    spectrumColor: DEFAULT_SPECTRUM_COLOR,
    transparentFloat: false,
    titleFontId: window.DEFAULT_TITLE_FONT_ID,
    titleFontSize: window.DEFAULT_TITLE_FONT_SIZE
  });
});

document.querySelector("#btn-open-player").addEventListener("click", () => {
  api.openPlayer();
});

document.querySelector("#btn-quit").addEventListener("click", () => {
  api.quit();
});

audioPermissionBtn.addEventListener("click", async () => {
  audioPermissionBtn.disabled = true;
  audioStatusEl.textContent = "请求中";
  audioStatusEl.className = "status-chip";
  try {
    const result = await api.requestAudioPermission();
    renderAudioStatus(result);
  } finally {
    audioPermissionBtn.disabled = false;
  }
});

Promise.all([api.getSettings(), api.getPlatformCapabilities()]).then(
  async ([settings, capabilities]) => {
    applyPlatformCapabilities(capabilities);
    await refreshInstalledPlayers(settings);
    renderSettings(settings);
    if (platformCapabilities.systemAudioCapture) {
      refreshAudioStatus();
    }
    if (platformCapabilities.accessibilityPlaybackMode) {
      refreshAccessibilityStatus();
    }
  }
);
api.onSettingsChanged(renderSettings);
api.getUpdateStatus().then(renderUpdateStatus);
