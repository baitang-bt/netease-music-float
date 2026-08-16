const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("neteaseFloat", {
  /** Returns current settings from the main process. */
  getSettings: () => ipcRenderer.invoke("settings:get"),

  /** Returns platform-specific feature availability for conditional UI. */
  getPlatformCapabilities: () => ipcRenderer.invoke("platform:get-capabilities"),

  /**
   * Updates persisted settings.
   * @param {Record<string, unknown>} changes
   */
  updateSettings: (changes) => ipcRenderer.invoke("settings:update", changes),

  /** Opens or focuses the settings window. */
  toggleSettings: () => ipcRenderer.send("settings:toggle-window"),

  /** Closes the settings window. */
  closeSettings: () => ipcRenderer.send("settings:close-window"),

  /** Quits the application. */
  quit: () => ipcRenderer.send("app:quit"),

  /** Starts dragging the floating window from the renderer. */
  dragStart: () => ipcRenderer.send("float:drag-start"),

  /**
   * Moves the floating window by a delta during drag.
   * @param {number} deltaX
   * @param {number} deltaY
   */
  dragMove: (deltaX, deltaY) =>
    ipcRenderer.send("float:drag-move", deltaX, deltaY),

  /** Ends a drag gesture and persists position. */
  dragEnd: () => ipcRenderer.send("float:drag-end"),

  /**
   * Expands or collapses the float window height.
   * @param {boolean} expanded
   */
  setExpanded: (expanded) =>
    ipcRenderer.send("float:set-expanded", Boolean(expanded)),

  /** Toggles play/pause via MediaRemote. */
  togglePlayPause: () => ipcRenderer.invoke("media:toggle"),

  /** Skips to the next track. */
  nextTrack: () => ipcRenderer.invoke("media:next"),

  /** Goes to the previous track. */
  previousTrack: () => ipcRenderer.invoke("media:previous"),

  /** Cycles combined playback mode on NetEase (requires Accessibility). */
  advancePlaybackMode: () => ipcRenderer.invoke("media:mode"),

  /** Detects current NetEase playback mode via Accessibility. */
  detectPlaybackMode: () => ipcRenderer.invoke("media:detect-mode"),

  /**
   * Forces NetEase to a playback mode.
   * @param {string} mode
   */
  setPlaybackMode: (mode) => ipcRenderer.invoke("media:set-mode", mode),

  /** Returns whether Accessibility is trusted for this app. */
  getAccessibilityStatus: () => ipcRenderer.invoke("accessibility:status"),

  /** Prompts for Accessibility and opens System Settings when needed. */
  requestAccessibility: () => ipcRenderer.invoke("accessibility:request"),

  /**
   * Subscribes to playback-mode control errors (e.g. missing Accessibility).
   * @param {(payload: { error?: string, accessibility?: boolean }) => void} callback
   */
  onModeError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("media:mode-error", listener);
    return () => ipcRenderer.removeListener("media:mode-error", listener);
  },

  /** Opens or focuses the Settings-selected music app. */
  openPlayer: () => ipcRenderer.invoke("player:open"),

  /** @deprecated Prefer openPlayer; opens the selected music app. */
  openNetease: () => ipcRenderer.invoke("player:open"),

  /** Lists locally installed catalog music apps for Settings. */
  listInstalledPlayers: () => ipcRenderer.invoke("players:list-installed"),

  /** Returns system-audio capture / permission status. */
  getAudioStatus: () => ipcRenderer.invoke("audio:get-status"),

  /**
   * Requests system-audio permission by restarting capture and opening Settings.
   */
  requestAudioPermission: () => ipcRenderer.invoke("audio:request-permission"),

  /** Fetches the latest track snapshot once. */
  getTrack: () => ipcRenderer.invoke("media:get-track"),

  /**
   * Subscribes to Now Playing updates.
   * @param {(track: object) => void} callback
   */
  onTrack: (callback) => {
    const listener = (_event, track) => callback(track);
    ipcRenderer.on("media:track", listener);
    return () => ipcRenderer.removeListener("media:track", listener);
  },

  /**
   * Subscribes to timed lyric line updates for the collapsed title slot.
   * @param {(payload: { line: string, showLyric: boolean, instrumental: boolean }) => void} callback
   */
  onLyric: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("media:lyric", listener);
    return () => ipcRenderer.removeListener("media:lyric", listener);
  },

  /**
   * Subscribes to spectrum band updates.
   * @param {(payload: { bands: number[], muted: boolean, error?: string }) => void} callback
   */
  onSpectrum: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("spectrum:bands", listener);
    return () => ipcRenderer.removeListener("spectrum:bands", listener);
  },

  /**
   * Subscribes to settings changes from the main process.
   * @param {(settings: object) => void} callback
   */
  onSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },

  /** Returns the last auto-update status plus app version. */
  getUpdateStatus: () => ipcRenderer.invoke("update:get-status"),

  /** Manually checks GitHub Releases for a newer build. */
  checkForUpdates: () => ipcRenderer.invoke("update:check"),

  /** Quits and installs a downloaded update. */
  installUpdate: () => ipcRenderer.invoke("update:install"),

  /**
   * Subscribes to auto-update status events.
   * @param {(payload: object) => void} callback
   */
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  }
});
