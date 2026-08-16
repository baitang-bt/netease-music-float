const { execFile } = require("node:child_process");
const {
  DEFAULT_PLAYER_ID,
  getPlayerById,
  isPlayerNowPlaying,
  normalizeTargetPlayerId
} = require("./music-players");
const { resolveAdapterPaths } = require("./paths");

/** MediaRemote command IDs used by mediaremote-adapter `send`. */
const COMMANDS = {
  play: 0,
  pause: 1,
  toggle: 2,
  stop: 3,
  next: 4,
  previous: 5,
  advanceShuffle: 6,
  advanceRepeat: 7
};

const REPEAT_OFF = 1;
const REPEAT_ONE = 2;
const REPEAT_ALL = 3;
/** MediaRemoteAdapter: 1=off, 2=albums, 3=tracks. */
const SHUFFLE_OFF = 1;
const SHUFFLE_ON = 3;

/**
 * Creates a MediaRemote controller that polls Now Playing via /usr/bin/perl.
 * @param {{
 *   pollMs?: number,
 *   getTargetPlayerId?: () => string,
 *   onUpdate: (track: object) => void,
 *   onTick?: (track: object) => void
 * }} options
 */
function createMediaRemoteController(options) {
  const { scriptPath, frameworkPath } = resolveAdapterPaths();
  const pollMs = options.pollMs ?? 1000;
  let timer = null;
  let lastFingerprint = "";
  let lastArtKey = "";
  let lastTrack = null;
  let lightRefreshTimer = null;
  let artFetchToken = 0;

  /** Reads the Settings-selected music player id for Now Playing matching. */
  function resolveTargetPlayerId() {
    if (typeof options.getTargetPlayerId === "function") {
      return normalizeTargetPlayerId(options.getTargetPlayerId());
    }
    return DEFAULT_PLAYER_ID;
  }

  /** Runs one adapter CLI invocation and returns stdout text. */
  function runAdapter(args) {
    return new Promise((resolve, reject) => {
      execFile(
        "/usr/bin/perl",
        [scriptPath, frameworkPath, ...args],
        { maxBuffer: 8 * 1024 * 1024, timeout: 8000 },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                stderr?.toString()?.trim() ||
                  error.message ||
                  "MediaRemote adapter failed"
              )
            );
            return;
          }
          resolve(stdout.toString());
        }
      );
    });
  }

  /**
   * Fetches a single Now Playing snapshot and normalizes it for the UI.
   * @param {{ noArtwork?: boolean }} [opts]
   */
  async function fetchNowPlaying(opts = {}) {
    const noArtwork = Boolean(opts.noArtwork);
    const args = ["get", "--now"];
    if (noArtwork) {
      args.push("--no-artwork");
    }
    const raw = await runAdapter(args);
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "null") {
      const targetPlayerId = resolveTargetPlayerId();
      const targetPlayer = getPlayerById(targetPlayerId);
      lastTrack = {
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
        repeatMode: null,
        shuffleMode: null,
        processIdentifier: null,
        bundleIdentifier: null
      };
      return lastTrack;
    }

    const payload = JSON.parse(trimmed);
    const targetPlayerId = resolveTargetPlayerId();
    const targetPlayer = getPlayerById(targetPlayerId);
    const isTarget = isPlayerNowPlaying(payload, targetPlayerId);
    const isNetease = isTarget && targetPlayerId === "netease";
    const artworkDataUrl = noArtwork
      ? lastTrack?.artworkDataUrl ?? null
      : artworkToDataUrl(payload);

    lastTrack = {
      status: isTarget ? "matched" : "other",
      isTarget,
      isNetease,
      playerId: isTarget ? targetPlayerId : null,
      playerLabel: isTarget ? targetPlayer?.label || null : null,
      targetPlayerId,
      targetPlayerLabel: targetPlayer?.label || null,
      playing: Boolean(payload.playing),
      title: payload.title ?? null,
      artist: payload.artist ?? null,
      album: payload.album ?? null,
      artworkDataUrl,
      duration: numberOrNull(payload.duration),
      elapsed: numberOrNull(payload.elapsedTimeNow ?? payload.elapsedTime),
      elapsedSampledAt: Date.now(),
      repeatMode: numberOrNull(payload.repeatMode),
      shuffleMode: numberOrNull(payload.shuffleMode),
      processIdentifier: numberOrNull(payload.processIdentifier),
      bundleIdentifier: payload.bundleIdentifier ?? null,
      displayName: payload.displayName ?? null
    };
    return lastTrack;
  }

  /**
   * Emits track updates when the fingerprint changes; optionally refreshes artwork.
   * @param {object} track
   * @param {{ fetchArtwork?: boolean }} [opts]
   */
  function emitIfChanged(track, opts = {}) {
    const fingerprint = [
      track.status,
      track.playing,
      track.title,
      track.artist,
      track.targetPlayerId,
      track.repeatMode,
      track.shuffleMode,
      track.artworkDataUrl ? track.artworkDataUrl.length : 0
    ].join("|");
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      options.onUpdate(track);
    } else if (typeof options.onTick === "function") {
      // Elapsed-only refresh for lyric sync without UI churn.
      options.onTick(track);
    }

    if (!opts.fetchArtwork || !track.isTarget) {
      return;
    }
    const artKey = [track.title, track.artist, track.album].join("|");
    if (artKey === lastArtKey && track.artworkDataUrl) {
      return;
    }
    lastArtKey = artKey;
    const token = (artFetchToken += 1);
    fetchNowPlaying({ noArtwork: false })
      .then((rich) => {
        if (token !== artFetchToken) {
          return;
        }
        lastFingerprint = "";
        emitIfChanged(rich, { fetchArtwork: false });
      })
      .catch(() => {});
  }

  /** Polls Now Playing without artwork so controls stay responsive. */
  async function tick() {
    const track = await fetchNowPlaying({ noArtwork: true });
    emitIfChanged(track, { fetchArtwork: true });
  }

  /** Schedules a lightweight post-command refresh (no artwork payload). */
  function scheduleLightRefresh() {
    clearTimeout(lightRefreshTimer);
    lightRefreshTimer = setTimeout(() => {
      tick().catch(() => {});
    }, 60);
  }

  /** Starts periodic Now Playing polling. */
  function start() {
    if (timer) {
      return;
    }
    tick().catch((error) => {
      options.onUpdate({
        status: "error",
        isTarget: false,
        isNetease: false,
        playerId: null,
        playing: false,
        error: error.message
      });
    });
    timer = setInterval(() => {
      tick().catch((error) => {
        options.onUpdate({
          status: "error",
          isTarget: false,
          isNetease: false,
          playerId: null,
          playing: false,
          error: error.message
        });
      });
    }, pollMs);
  }

  /** Stops polling. */
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    clearTimeout(lightRefreshTimer);
  }

  /**
   * Sends a MediaRemote command without waiting for a full Now Playing round-trip.
   * @param {number} commandId
   */
  function sendCommand(commandId) {
    const pending = runAdapter(["send", String(commandId)]).then(() => {
      scheduleLightRefresh();
    });
    pending.catch(() => {});
    return pending;
  }

  /** Toggles play/pause on the system Now Playing app. */
  function togglePlayPause() {
    return sendCommand(COMMANDS.toggle);
  }

  /** Skips to the next track. */
  function nextTrack() {
    return sendCommand(COMMANDS.next);
  }

  /** Goes to the previous track. */
  function previousTrack() {
    return sendCommand(COMMANDS.previous);
  }

  /** Advances the system repeat mode (off → one → all). */
  function advanceRepeat() {
    return sendCommand(COMMANDS.advanceRepeat);
  }

  /** Advances the system shuffle mode. */
  function advanceShuffle() {
    return sendCommand(COMMANDS.advanceShuffle);
  }

  /**
   * Cycles playback mode via NetEase Accessibility (MediaRemote cannot set this).
   * @param {string|null} [_currentMode]
   */
  async function advancePlaybackMode(_currentMode) {
    return { ok: false, error: "use-netease-ax" };
  }

  /**
   * Sets an absolute repeat mode when supported by the adapter.
   * @param {number} mode
   */
  async function setRepeatMode(mode) {
    await runAdapter(["repeat", String(mode)]);
    scheduleLightRefresh();
  }

  /**
   * Sets an absolute shuffle mode when supported by the adapter.
   * @param {number} mode
   */
  async function setShuffleMode(mode) {
    await runAdapter(["shuffle", String(mode)]);
    scheduleLightRefresh();
  }

  return {
    start,
    stop,
    fetchNowPlaying,
    togglePlayPause,
    nextTrack,
    previousTrack,
    advanceRepeat,
    advanceShuffle,
    advancePlaybackMode,
    setRepeatMode,
    setShuffleMode,
    COMMANDS
  };
}

/**
 * Converts adapter artwork fields into a browser data URL when present.
 * @param {Record<string, unknown>} payload
 */
function artworkToDataUrl(payload) {
  const data = payload.artworkData;
  if (typeof data !== "string" || !data.length) {
    return null;
  }
  const mime =
    typeof payload.artworkMimeType === "string" && payload.artworkMimeType
      ? payload.artworkMimeType
      : "image/jpeg";
  return `data:${mime};base64,${data}`;
}

/**
 * Coerces adapter numeric fields that may arrive as strings.
 * @param {unknown} value
 */
function numberOrNull(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  COMMANDS,
  REPEAT_OFF,
  REPEAT_ONE,
  REPEAT_ALL,
  SHUFFLE_OFF,
  SHUFFLE_ON,
  createMediaRemoteController,
  resolveAdapterPaths
};
