const { computeSpectrumMagnitudes, magnitudesToBands, createBandNormalizer } = require("./fft");

const FFT_SIZE = 512;
/** Hop between FFT frames; overlap keeps bars closer to "now" than non-overlapping windows. */
const HOP_SIZE = 256;
const BAND_COUNT = 32;
const SAMPLE_RATE = 16000;
/** Cap IPC/draw rate near display refresh while still computing on each hop. */
const EMIT_INTERVAL_MS = 16;

/**
 * Creates a system-audio capturer that emits FFT band levels via callback.
 * Uses AudioTee (Core Audio Tap). Requires macOS 14.2+ and audio permission.
 * @param {{
 *   onBands: (bands: number[], meta: { muted: boolean, error?: string }) => void,
 *   includeProcessIds?: () => (number[]|null),
 *   binaryPath?: string|null
 * }} options
 */
function createAudioCapture(options) {
  let audiotee = null;
  let sampleBuffer = new Float32Array(0);
  let running = false;
  let lastError = null;
  let decayBands = new Array(BAND_COUNT).fill(0);
  let AudioTeeClass = null;
  let emitTimer = null;
  let lastEmitAt = 0;
  let pendingMeta = { muted: false };
  const normalizeBands = createBandNormalizer();

  /**
   * Pushes the latest band frame to the UI, coalesced to ~60 Hz.
   * @param {{ muted: boolean, error?: string }} meta
   */
  function scheduleEmit(meta) {
    pendingMeta = meta;
    const now = Date.now();
    const wait = EMIT_INTERVAL_MS - (now - lastEmitAt);
    if (wait <= 0) {
      lastEmitAt = now;
      options.onBands(decayBands, pendingMeta);
      return;
    }
    if (emitTimer) {
      return;
    }
    emitTimer = setTimeout(() => {
      emitTimer = null;
      lastEmitAt = Date.now();
      options.onBands(decayBands, pendingMeta);
    }, wait);
  }

  /** Lazily loads the audiotee package (native binary). */
  function loadAudioTee() {
    if (AudioTeeClass) {
      return AudioTeeClass;
    }
    // eslint-disable-next-line global-require
    ({ AudioTee: AudioTeeClass } = require("audiotee"));
    return AudioTeeClass;
  }

  /**
   * Converts PCM chunk bytes into Float32 mono samples for the FFT buffer.
   * AudioTee with an explicit sampleRate emits 16-bit signed PCM.
   * @param {Buffer} data
   */
  function appendPcm(data) {
    const sampleCount = Math.floor(data.length / 2);
    const incoming = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) {
      incoming[i] = data.readInt16LE(i * 2) / 32768;
    }

    const merged = new Float32Array(sampleBuffer.length + incoming.length);
    merged.set(sampleBuffer);
    merged.set(incoming, sampleBuffer.length);
    sampleBuffer = merged;

    while (sampleBuffer.length >= FFT_SIZE) {
      const slice = sampleBuffer.subarray(0, FFT_SIZE);
      // Overlapping hop: keep the newest samples in the window sooner.
      sampleBuffer = sampleBuffer.subarray(HOP_SIZE);
      const magnitudes = computeSpectrumMagnitudes(slice);
      const rawBands = magnitudesToBands(magnitudes, BAND_COUNT);
      const bands = normalizeBands(rawBands);
      for (let i = 0; i < BAND_COUNT; i += 1) {
        // Snap up immediately; light hold only reduces single-frame flicker.
        decayBands[i] = Math.max(bands[i], decayBands[i] * 0.22);
      }
      scheduleEmit({ muted: false });
    }
  }

  /** Starts capturing system audio (optionally filtered to NetEase PIDs). */
  async function start() {
    if (running) {
      return { ok: true };
    }

    const AudioTee = loadAudioTee();
    const includeProcesses = options.includeProcessIds
      ? options.includeProcessIds()
      : null;

    const teeOptions = {
      sampleRate: SAMPLE_RATE,
      // Smaller chunks cut capture→FFT wait (audiotee default is 200ms).
      chunkDurationMs: 10
    };
    if (options.binaryPath) {
      teeOptions.binaryPath = options.binaryPath;
    }
    if (Array.isArray(includeProcesses) && includeProcesses.length > 0) {
      teeOptions.includeProcesses = includeProcesses;
    }

    audiotee = new AudioTee(teeOptions);
    audiotee.on("data", (chunk) => {
      if (chunk?.data) {
        appendPcm(Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data));
      }
    });
    audiotee.on("error", (error) => {
      lastError = error instanceof Error ? error.message : String(error);
      options.onBands(new Array(BAND_COUNT).fill(0), {
        muted: true,
        error: lastError
      });
    });

    try {
      await audiotee.start();
      running = true;
      lastError = null;
      return { ok: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      running = false;
      audiotee = null;
      options.onBands(new Array(BAND_COUNT).fill(0), {
        muted: true,
        error: lastError
      });
      return { ok: false, error: lastError };
    }
  }

  /** Stops capture and clears buffers. */
  async function stop() {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    if (!audiotee) {
      running = false;
      return;
    }
    try {
      await audiotee.stop();
    } catch {
      // ignore stop errors during shutdown
    }
    audiotee = null;
    running = false;
    sampleBuffer = new Float32Array(0);
  }

  /**
   * Restarts capture so includeProcesses can be refreshed for a new PID.
   */
  async function restart() {
    await stop();
    return start();
  }

  /** Returns the last capture error message, if any. */
  function getLastError() {
    return lastError;
  }

  /** Emits decaying silence bands (used when playback is paused). */
  function emitSilence() {
    for (let i = 0; i < BAND_COUNT; i += 1) {
      decayBands[i] *= 0.72;
    }
    scheduleEmit({ muted: true });
  }

  /** Returns whether capture is currently running. */
  function isRunning() {
    return running;
  }

  return {
    start,
    stop,
    restart,
    getLastError,
    emitSilence,
    isRunning,
    BAND_COUNT
  };
}

module.exports = {
  BAND_COUNT,
  FFT_SIZE,
  HOP_SIZE,
  SAMPLE_RATE,
  createAudioCapture
};
