/**
 * Creates the native Now Playing controller for the current operating system.
 * Platform modules are loaded lazily so packaged builds never execute foreign
 * native/runtime assumptions during startup.
 * @param {object} options
 */
function createPlatformMediaController(options) {
  if (process.platform === "win32") {
    // eslint-disable-next-line global-require
    const { createWindowsMediaController } = require("./windows-media-controller");
    return createWindowsMediaController(options);
  }
  if (process.platform === "darwin") {
    // eslint-disable-next-line global-require
    const { createMediaRemoteController } = require("./media-remote");
    return createMediaRemoteController(options);
  }
  return createUnsupportedMediaController(options);
}

/**
 * Keeps unsupported platforms bootable and communicates one stable error
 * snapshot instead of repeatedly attempting unavailable native integrations.
 * @param {{ onUpdate: (track: object) => void }} options
 */
function createUnsupportedMediaController(options) {
  const track = {
    status: "error",
    isTarget: false,
    isNetease: false,
    playerId: null,
    playing: false,
    error: `当前系统暂不支持媒体读取：${process.platform}`
  };
  return {
    start: () => options.onUpdate(track),
    stop: async () => {},
    fetchNowPlaying: async () => track,
    togglePlayPause: async () => ({ ok: false, error: "unsupported-platform" }),
    nextTrack: async () => ({ ok: false, error: "unsupported-platform" }),
    previousTrack: async () => ({ ok: false, error: "unsupported-platform" })
  };
}

module.exports = {
  createPlatformMediaController
};
