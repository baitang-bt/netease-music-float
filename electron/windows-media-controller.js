const {
  DEFAULT_PLAYER_ID,
  getPlayerById,
  isPlayerNowPlaying,
  normalizeTargetPlayerId
} = require("./music-players");

/**
 * Creates a Windows GSMTC controller backed by the optional
 * `windows-media-sessions` package.
 * @param {{
 *   getTargetPlayerId?: () => string,
 *   onUpdate: (track: object) => void,
 *   onTick?: (track: object) => void,
 *   sessionsApi?: object,
 *   loadControlApi?: () => Promise<object>
 * }} options
 */
function createWindowsMediaController(options) {
  let sessionsApi = options.sessionsApi || null;
  let unsubscribe = null;
  let lastTrack = null;
  let lastFingerprint = "";

  /** Loads the Windows-only package after platform selection. */
  function loadSessionsApi() {
    if (!sessionsApi) {
      // Optional dependency: absent on macOS by design.
      // eslint-disable-next-line global-require
      sessionsApi = require("windows-media-sessions");
    }
    return sessionsApi;
  }

  /** Returns the currently selected catalog player id. */
  function resolveTargetPlayerId() {
    if (typeof options.getTargetPlayerId === "function") {
      return normalizeTargetPlayerId(options.getTargetPlayerId());
    }
    return DEFAULT_PLAYER_ID;
  }

  /**
   * Picks the selected player's best session, preferring one that is playing.
   * @param {readonly object[]} sessions
   */
  function selectTargetSession(sessions) {
    const targetPlayerId = resolveTargetPlayerId();
    const matching = sessions.filter((session) =>
      isPlayerNowPlaying(
        {
          displayName: session.sourceAppDisplayName,
          appName: session.sourceAppUserModelId
        },
        targetPlayerId
      )
    );
    return (
      matching.find((session) => session.playbackStatus === "playing") ||
      matching[0] ||
      null
    );
  }

  /**
   * Converts a GSMTC session snapshot to the common track contract.
   * @param {readonly object[]} sessions
   */
  function normalizeSessions(sessions) {
    const targetPlayerId = resolveTargetPlayerId();
    const targetPlayer = getPlayerById(targetPlayerId);
    const session = selectTargetSession(sessions);
    if (!session) {
      return {
        status: "empty",
        isTarget: false,
        isNetease: false,
        playerId: null,
        playerLabel: null,
        targetPlayerId,
        targetPlayerLabel: targetPlayer?.label || null,
        playing: false,
        title: null,
        artist: null,
        album: null,
        artworkDataUrl: null,
        duration: null,
        elapsed: null,
        elapsedSampledAt: Date.now(),
        repeatMode: null,
        shuffleMode: null,
        processIdentifier: null,
        bundleIdentifier: null
      };
    }

    const durationMs = numberOrNull(session.timeline?.durationMs);
    const positionMs = numberOrNull(session.timeline?.positionMs);
    return {
      status: "matched",
      isTarget: true,
      isNetease: targetPlayerId === "netease",
      playerId: targetPlayerId,
      playerLabel: targetPlayer?.label || session.sourceAppDisplayName || null,
      targetPlayerId,
      targetPlayerLabel: targetPlayer?.label || null,
      playing: session.playbackStatus === "playing",
      title: session.title || null,
      artist: session.artist || null,
      album: session.albumTitle || null,
      artworkDataUrl: session.thumbnail || null,
      duration: durationMs === null ? null : durationMs / 1000,
      elapsed: positionMs === null ? null : positionMs / 1000,
      elapsedSampledAt: Date.now(),
      repeatMode: null,
      shuffleMode: null,
      processIdentifier: null,
      bundleIdentifier: session.sourceAppUserModelId || null,
      displayName: session.sourceAppDisplayName || null
    };
  }

  /**
   * Emits meaningful session changes while routing timeline-only updates to
   * the lightweight lyric synchronization callback.
   * @param {readonly object[]} sessions
   */
  function publishSessions(sessions) {
    const track = normalizeSessions(Array.isArray(sessions) ? sessions : []);
    lastTrack = track;
    const fingerprint = [
      track.status,
      track.playing,
      track.title,
      track.artist,
      track.album,
      track.targetPlayerId,
      track.artworkDataUrl ? track.artworkDataUrl.length : 0
    ].join("|");
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      options.onUpdate(track);
    } else if (typeof options.onTick === "function") {
      options.onTick(track);
    }
    return track;
  }

  /** Fetches and normalizes the current Windows media sessions. */
  async function fetchNowPlaying() {
    const sessions = await loadSessionsApi().getAllSessions();
    return publishSessions(sessions);
  }

  /** Starts the GSMTC event stream and emits an initial snapshot. */
  function start() {
    if (unsubscribe) {
      return;
    }
    try {
      const api = loadSessionsApi();
      unsubscribe = api.onSessionsChanged((sessions) => {
        publishSessions(sessions);
      });
      fetchNowPlaying().catch((error) => publishError(error));
    } catch (error) {
      publishError(error);
    }
  }

  /** Stops event delivery and releases the bundled GSMTC backend process. */
  async function stop() {
    unsubscribe?.();
    unsubscribe = null;
    if (sessionsApi?.shutdown) {
      await sessionsApi.shutdown();
    }
  }

  /**
   * Loads the ESM control package and invokes a command for the matched app.
   * @param {"togglePlayPause"|"next"|"previous"} command
   */
  async function sendCommand(command) {
    const controls = await (
      options.loadControlApi?.() || import("win-media-control")
    );
    const appName =
      lastTrack?.displayName || lastTrack?.targetPlayerLabel || undefined;
    return controls[command](appName);
  }

  /** Sends play/pause to the selected Windows media session. */
  function togglePlayPause() {
    return sendCommand("togglePlayPause");
  }

  /** Skips to the selected Windows media session's next track. */
  function nextTrack() {
    return sendCommand("next");
  }

  /** Returns to the selected Windows media session's previous track. */
  function previousTrack() {
    return sendCommand("previous");
  }

  /** Emits a common error snapshot instead of throwing through app startup. */
  function publishError(error) {
    const targetPlayerId = resolveTargetPlayerId();
    const targetPlayer = getPlayerById(targetPlayerId);
    const track = {
      status: "error",
      isTarget: false,
      isNetease: false,
      playerId: null,
      targetPlayerId,
      targetPlayerLabel: targetPlayer?.label || null,
      playing: false,
      error: error instanceof Error ? error.message : String(error)
    };
    lastTrack = track;
    options.onUpdate(track);
    return track;
  }

  return {
    start,
    stop,
    fetchNowPlaying,
    togglePlayPause,
    nextTrack,
    previousTrack
  };
}

/** Coerces optional timeline values while preserving missing data as null. */
function numberOrNull(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  createWindowsMediaController
};
