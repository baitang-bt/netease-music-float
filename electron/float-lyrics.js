"use strict";

const path = require("node:path");
const { BrowserWindow, screen } = require("electron");
const { applyWindowStackLevel } = require("./lyric-overlay");
const { setWindowFrame, toNativeBounds } = require("./window-geometry");

/** Floating lyrics stay above fullscreen apps, just like the panel lyric overlay. */
const FLOAT_LYRICS_ALWAYS_ON_TOP_LEVEL = "screen-saver";

/**
 * Creates the fullscreen click-through floating lyric window.
 * The window covers the active display, stays on top of every Space, and never
 * receives focus — settings are only reachable from the Dock / tray.
 * @param {{
 *   getSettings: () => { floatLyricsEnabled?: boolean, alwaysOnTop?: boolean },
 *   onLyricsReady?: () => void
 * }} options
 */
function createFloatLyricsController({ getSettings, onLyricsReady }) {
  let window = null;
  let raiseTimer = null;
  let displayListener = null;

  /** Stops the Windows z-order pulse that keeps lyrics on top. */
  function stopRaisePulse() {
    if (!raiseTimer) {
      return;
    }
    clearInterval(raiseTimer);
    raiseTimer = null;
  }

  /** Periodically raises the window on Windows, where levels are ignored. */
  function startRaisePulse() {
    stopRaisePulse();
    if (process.platform === "darwin") {
      return;
    }
    raiseTimer = setInterval(() => {
      if (!window || window.isDestroyed()) {
        stopRaisePulse();
        return;
      }
      window.moveTop();
    }, 480);
  }

  /** Fills the window across the display that currently contains the cursor. */
  function fillDisplay() {
    if (!window || window.isDestroyed()) {
      return;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    setWindowFrame(window, display.bounds);
  }

  /** Refits the window whenever a display is added/removed/resized. */
  function bindDisplayListener() {
    if (displayListener) {
      return;
    }
    displayListener = () => fillDisplay();
    screen.on("display-metrics-changed", displayListener);
    screen.on("display-added", displayListener);
    screen.on("display-removed", displayListener);
  }

  function unbindDisplayListener() {
    if (!displayListener) {
      return;
    }
    screen.removeListener("display-metrics-changed", displayListener);
    screen.removeListener("display-added", displayListener);
    screen.removeListener("display-removed", displayListener);
    displayListener = null;
  }

  /** Forwards an IPC payload to the renderer when it exists. */
  function send(channel, payload) {
    if (!window || window.isDestroyed()) {
      return;
    }
    window.webContents.send(channel, payload);
  }

  /** Tears down the window and unregisters display tracking. */
  function destroy() {
    stopRaisePulse();
    unbindDisplayListener();
    if (window && !window.isDestroyed()) {
      window.removeAllListeners();
      window.close();
    }
    window = null;
  }

  /** Creates the floating lyric window the first time the feature is enabled. */
  function createWindow() {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const frame = toNativeBounds(display.bounds);
    if (!frame) {
      return;
    }
    window = new BrowserWindow({
      ...frame,
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
    window.setIgnoreMouseEvents(true, { forward: true });
    window.loadFile(path.join(__dirname, "..", "src", "float-lyrics.html"));
    window.webContents.on("did-finish-load", () => {
      onLyricsReady?.();
    });
    window.once("ready-to-show", () => {
      if (!window || window.isDestroyed()) {
        return;
      }
      fillDisplay();
      window.showInactive();
      applyWindowStackLevel(
        window,
        Boolean(getSettings().alwaysOnTop),
        FLOAT_LYRICS_ALWAYS_ON_TOP_LEVEL
      );
      if (process.platform !== "darwin") {
        window.moveTop();
      }
    });
    window.on("closed", () => {
      window = null;
      stopRaisePulse();
    });
    bindDisplayListener();
    startRaisePulse();
  }

  /**
   * Shows or hides the floating lyric window to match the setting.
   */
  function ensure() {
    const enabled = Boolean(getSettings().floatLyricsEnabled);
    if (!enabled) {
      destroy();
      return;
    }
    if (!window || window.isDestroyed()) {
      createWindow();
      return;
    }
    fillDisplay();
    applyWindowStackLevel(
      window,
      Boolean(getSettings().alwaysOnTop),
      FLOAT_LYRICS_ALWAYS_ON_TOP_LEVEL
    );
    if (process.platform !== "darwin") {
      window.moveTop();
    }
    startRaisePulse();
  }

  return {
    ensure,
    send,
    destroy
  };
}

module.exports = {
  FLOAT_LYRICS_ALWAYS_ON_TOP_LEVEL,
  createFloatLyricsController
};
