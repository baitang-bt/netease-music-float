"use strict";

const path = require("node:path");
const { BrowserWindow } = require("electron");

/** Spectrum / chrome window sits below the desktop pet (`status`). */
const SPECTRUM_ALWAYS_ON_TOP_LEVEL = "main-menu";
/** Lyrics sit above the pet so the character tucks under the text. */
const LYRIC_ALWAYS_ON_TOP_LEVEL = "screen-saver";
/** Opaque / expanded float keeps covering other apps, including fullscreen. */
const FLOAT_ALWAYS_ON_TOP_LEVEL = "screen-saver";
const OVERLAY_RAISE_MS = 480;

/**
 * True when the collapsed transparent float should split lyrics into a higher window.
 * @param {{ transparentFloat?: boolean }} settings
 * @param {boolean} expanded
 */
function shouldSplitLyricOverlay(settings, expanded) {
  return Boolean(settings?.transparentFloat) && !expanded;
}

/**
 * Applies always-on-top plus macOS Space / fullscreen collection behavior.
 * @param {import("electron").BrowserWindow} browserWindow
 * @param {boolean} alwaysOnTop
 * @param {string} level
 */
function applyWindowStackLevel(browserWindow, alwaysOnTop, level) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return;
  }
  if (alwaysOnTop) {
    if (process.platform === "darwin") {
      browserWindow.setAlwaysOnTop(true, level);
    } else {
      browserWindow.setAlwaysOnTop(true);
    }
  } else {
    browserWindow.setAlwaysOnTop(false);
  }
  if (process.platform !== "darwin") {
    return;
  }
  browserWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
}

/**
 * Creates the lyric overlay that rides above a seated desktop pet.
 * @param {{
 *   getFloatWindow: () => import("electron").BrowserWindow|null,
 *   getSettings: () => { alwaysOnTop?: boolean, transparentFloat?: boolean },
 *   isExpanded: () => boolean
 * }} options
 */
function createLyricOverlayController({
  getFloatWindow,
  getSettings,
  isExpanded,
  onOverlayReady
}) {
  let overlay = null;
  let raiseTimer = null;

  /**
   * Stops the Windows z-order pulse that keeps lyrics above the pet.
   */
  function stopRaisePulse() {
    if (!raiseTimer) {
      return;
    }
    clearInterval(raiseTimer);
    raiseTimer = null;
  }

  /**
   * Periodically raises the overlay on Windows, where always-on-top levels are ignored.
   */
  function startRaisePulse() {
    stopRaisePulse();
    if (process.platform === "darwin") {
      return;
    }
    raiseTimer = setInterval(() => {
      if (!overlay || overlay.isDestroyed()) {
        stopRaisePulse();
        return;
      }
      overlay.moveTop();
    }, OVERLAY_RAISE_MS);
  }

  /**
   * Copies the float frame onto the overlay so the two windows stay aligned.
   */
  function syncBounds() {
    const floatWindow = getFloatWindow();
    if (!overlay || overlay.isDestroyed() || !floatWindow || floatWindow.isDestroyed()) {
      return;
    }
    overlay.setBounds(floatWindow.getBounds(), false);
  }

  /**
   * Restores the main float to its normal covering level, or parks it under the pet.
   */
  function applyFloatLevel() {
    const floatWindow = getFloatWindow();
    const settings = getSettings();
    const split = shouldSplitLyricOverlay(settings, isExpanded());
    applyWindowStackLevel(
      floatWindow,
      Boolean(settings.alwaysOnTop),
      split ? SPECTRUM_ALWAYS_ON_TOP_LEVEL : FLOAT_ALWAYS_ON_TOP_LEVEL
    );
  }

  /**
   * Tears down the overlay and puts the spectrum window back on the topmost band.
   */
  function destroy() {
    stopRaisePulse();
    const floatWindow = getFloatWindow();
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send("float:lyric-overlay", { active: false });
    }
    if (overlay && !overlay.isDestroyed()) {
      overlay.removeAllListeners();
      overlay.close();
    }
    overlay = null;
    applyFloatLevel();
  }

  /**
   * Forwards an IPC payload to the overlay renderer when it exists.
   * @param {string} channel
   * @param {unknown} payload
   */
  function send(channel, payload) {
    if (!overlay || overlay.isDestroyed()) {
      return;
    }
    overlay.webContents.send(channel, payload);
  }

  /**
   * Creates the overlay window the first time the transparent collapsed float is shown.
   */
  function createOverlay() {
    const floatWindow = getFloatWindow();
    if (!floatWindow || floatWindow.isDestroyed()) {
      return;
    }
    const bounds = floatWindow.getBounds();
    overlay = new BrowserWindow({
      ...bounds,
      title: "网易云浮窗歌词",
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      show: false,
      ...(process.platform === "darwin" ? { type: "panel" } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    overlay.setIgnoreMouseEvents(false);
    overlay.loadFile(path.join(__dirname, "..", "src", "lyric-overlay.html"));
    overlay.webContents.on("did-finish-load", () => {
      onOverlayReady?.();
    });
    overlay.once("ready-to-show", () => {
      if (!overlay || overlay.isDestroyed()) {
        return;
      }
      syncBounds();
      overlay.showInactive();
      applyWindowStackLevel(
        overlay,
        Boolean(getSettings().alwaysOnTop),
        LYRIC_ALWAYS_ON_TOP_LEVEL
      );
      if (process.platform !== "darwin") {
        overlay.moveTop();
      }
    });
    overlay.on("closed", () => {
      overlay = null;
      stopRaisePulse();
    });
  }

  /**
   * Shows or hides the lyric overlay to match transparent-collapsed state.
   */
  function ensure() {
    const settings = getSettings();
    if (!shouldSplitLyricOverlay(settings, isExpanded())) {
      destroy();
      return;
    }
    if (!overlay || overlay.isDestroyed()) {
      createOverlay();
    }
    applyFloatLevel();
    applyWindowStackLevel(
      overlay,
      Boolean(settings.alwaysOnTop),
      LYRIC_ALWAYS_ON_TOP_LEVEL
    );
    syncBounds();
    const floatWindow = getFloatWindow();
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send("float:lyric-overlay", { active: true });
    }
    startRaisePulse();
  }

  return {
    destroy,
    ensure,
    send,
    syncBounds
  };
}

module.exports = {
  FLOAT_ALWAYS_ON_TOP_LEVEL,
  LYRIC_ALWAYS_ON_TOP_LEVEL,
  SPECTRUM_ALWAYS_ON_TOP_LEVEL,
  applyWindowStackLevel,
  createLyricOverlayController,
  shouldSplitLyricOverlay
};
