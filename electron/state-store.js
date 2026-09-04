const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_TITLE_FONT_ID,
  DEFAULT_TITLE_FONT_SIZE,
  normalizeTitleFontIds,
  clampTitleFontSize,
  normalizeCustomFonts
} = require("../src/title-fonts");
const {
  DEFAULT_LOCALE_SETTING,
  normalizeLocaleSetting
} = require("../src/i18n");
const { normalizeLaunchPlaybackMode } = require("./netease-playback-mode");
const { normalizeTargetPlayerId } = require("./music-players");

/** Max px offset for the floating lyric tremor animation. */
const MAX_TREMOR_AMPLITUDE = 12;
/** Max tremor cycles per second for the floating lyric animation. */
const MAX_TREMOR_FREQUENCY = 30;
/** Max floating lyric text size in px. */
const MAX_FLOAT_LYRICS_FONT_SIZE = 56;
/** Max lyric cross-fade duration in ms. */
const MAX_FLOAT_LYRICS_FADE_MS = 3000;
/** Max per-character output interval in seconds. */
const MAX_FLOAT_LYRICS_CHAR_INTERVAL = 1;
/** Max minimum-display time for a lyric line (ms). */
const MAX_FLOAT_LYRICS_MIN_SHOW_MS = 30000;
/** Max maximum-display time for a lyric line (ms). */
const MAX_FLOAT_LYRICS_MAX_SHOW_MS = 60000;

const STATE_VERSION = 2;

const DEFAULT_SETTINGS = {
  alwaysOnTop: true,
  /** User opted into system-audio capture; without this we never spawn audiotee at launch. */
  systemAudioConsent: false,
  /** Float glass / panel base color (#rrggbb). */
  windowColor: "#24242a",
  /** Spectrum bar + accent glow color (#rrggbb). */
  spectrumColor: "#e60026",
  /** Clear float chrome: no panel fill; collapsed shows only title + spectrum. */
  transparentFloat: false,
  /** Collapsed title font preset or imported font id (legacy, mirrors zh). */
  titleFontId: DEFAULT_TITLE_FONT_ID,
  /** Per-locale title font presets or imported font ids. */
  titleFontIdZh: DEFAULT_TITLE_FONT_ID,
  titleFontIdEn: DEFAULT_TITLE_FONT_ID,
  titleFontIdJa: DEFAULT_TITLE_FONT_ID,
  /** Collapsed title font size in px. */
  titleFontSize: DEFAULT_TITLE_FONT_SIZE,
  /** User-imported font catalog (files live under userData/custom-fonts). */
  customFonts: [],
  /** UI language preference: system | zh-CN | en | ja. */
  locale: DEFAULT_LOCALE_SETTING,
  /**
   * On launch, sync NetEase to this mode via Accessibility.
   * `keep` = only detect and mirror UI; otherwise force-switch.
   */
  launchPlaybackMode: "keep",
  /** Catalog player id whose Now Playing the float follows. */
  targetPlayerId: "netease",
  /** Check GitHub Releases for updates shortly after launch. */
  autoCheckUpdates: true,
  /** Fullscreen floating lyric overlay enabled. */
  floatLyricsEnabled: false,
  /** Which lyric content is shown in the floating overlay when translated. */
  floatLyricsMode: "both",
  /** Floating lyric tremor max offset in px. */
  floatLyricsTremorAmplitude: 0,
  /** Floating lyric tremor cycles per second. */
  floatLyricsTremorFrequency: 8,
  /** Floating lyric text color (#rrggbb). */
  floatLyricsColor: "#ffffff",
  /** Floating lyric base text size in px (translation scales with it). */
  floatLyricsFontSize: 26,
  /** Lyric line cross-fade duration in ms when a new line replaces the old. */
  floatLyricsFadeMs: 500,
  /** Per-character typewriter output interval in seconds. */
  floatLyricsCharInterval: 0.1,
  /** Minimum ms a lyric line stays visible before it can be replaced. */
  floatLyricsMinShowMs: 1200,
  /** Maximum ms a lyric line can stay visible before it fades out (0 = no cap). */
  floatLyricsMaxShowMs: 0,
  /** Auto-adjust typewriter speed by line length (long lines reveal faster). */
  floatLyricsAdaptiveSpeed: true
};

const DEFAULT_FLOAT_SIZE = {
  width: 320,
  expandedHeight: 172
};

/**
 * Creates a small JSON state store for window position and settings.
 * @param {string} filePath Absolute path to the state JSON file.
 */
function createStateStore(filePath) {
  let state = readState(filePath);

  /** Writes the in-memory state to disk. */
  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    /** Returns a shallow copy of persisted settings. */
    getSettings() {
      return { ...state.settings };
    },

    /**
     * Merges settings changes and persists them.
     * @param {Record<string, unknown>} changes
     */
    updateSettings(changes) {
      state.settings = validateSettings({ ...state.settings, ...changes });
      save();
      return { ...state.settings };
    },

    /**
     * Returns saved window bounds or null when missing.
     * @param {string} windowName
     */
    getWindowPosition(windowName) {
      const position = state.windows[windowName];
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return null;
      }
      const result = { x: position.x, y: position.y };
      if (Number.isFinite(position.width)) {
        result.width = position.width;
      }
      if (Number.isFinite(position.height)) {
        result.height = position.height;
      }
      return result;
    },

    /**
     * Persists window position and optional size.
     * @param {string} windowName
     * @param {{ x: number, y: number, width?: number, height?: number }} position
     */
    setWindowPosition(windowName, position) {
      const next = {
        x: Math.round(position.x),
        y: Math.round(position.y)
      };
      if (Number.isFinite(position.width)) {
        next.width = Math.round(position.width);
      }
      if (Number.isFinite(position.height)) {
        next.height = Math.round(position.height);
      }
      state.windows[windowName] = {
        ...(state.windows[windowName] || {}),
        ...next
      };
      save();
    },

    /** Returns the remembered float width / expanded height. */
    getFloatSize() {
      return { ...state.floatSize };
    },

    /**
     * Persists float width and expanded height.
     * @param {{ width?: number, expandedHeight?: number }} size
     */
    setFloatSize(size) {
      state.floatSize = {
        width: Number.isFinite(size.width)
          ? Math.round(size.width)
          : state.floatSize.width,
        expandedHeight: Number.isFinite(size.expandedHeight)
          ? Math.round(size.expandedHeight)
          : state.floatSize.expandedHeight
      };
      save();
      return { ...state.floatSize };
    }
  };
}

/**
 * Loads state from disk or returns defaults when the file is missing/invalid.
 * @param {string} filePath
 */
function readState(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      version: STATE_VERSION,
      settings: validateSettings(raw.settings || {}),
      windows:
        raw.windows && typeof raw.windows === "object" ? raw.windows : {},
      floatSize: validateFloatSize(raw.floatSize || {})
    };
  } catch {
    return {
      version: STATE_VERSION,
      settings: { ...DEFAULT_SETTINGS },
      windows: {},
      floatSize: { ...DEFAULT_FLOAT_SIZE }
    };
  }
}

/**
 * Normalizes settings to known keys and types.
 * @param {Record<string, unknown>} settings
 */
function validateSettings(settings) {
  const customFonts = normalizeCustomFonts(settings.customFonts);
  const titleFontIds = normalizeTitleFontIds(settings, customFonts);
  return {
    alwaysOnTop:
      typeof settings.alwaysOnTop === "boolean"
        ? settings.alwaysOnTop
        : DEFAULT_SETTINGS.alwaysOnTop,
    systemAudioConsent:
      typeof settings.systemAudioConsent === "boolean"
        ? settings.systemAudioConsent
        : DEFAULT_SETTINGS.systemAudioConsent,
    windowColor: normalizeHex(
      settings.windowColor,
      DEFAULT_SETTINGS.windowColor
    ),
    spectrumColor: normalizeHex(
      settings.spectrumColor,
      DEFAULT_SETTINGS.spectrumColor
    ),
    transparentFloat:
      typeof settings.transparentFloat === "boolean"
        ? settings.transparentFloat
        : DEFAULT_SETTINGS.transparentFloat,
    customFonts,
    titleFontId: titleFontIds.zh,
    titleFontIdZh: titleFontIds.zh,
    titleFontIdEn: titleFontIds.en,
    titleFontIdJa: titleFontIds.ja,
    titleFontSize: clampTitleFontSize(settings.titleFontSize),
    locale: normalizeLocaleSetting(settings.locale),
    launchPlaybackMode: normalizeLaunchPlaybackMode(settings.launchPlaybackMode),
    targetPlayerId: normalizeTargetPlayerId(settings.targetPlayerId),
    autoCheckUpdates:
      typeof settings.autoCheckUpdates === "boolean"
        ? settings.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates,
    floatLyricsEnabled:
      typeof settings.floatLyricsEnabled === "boolean"
        ? settings.floatLyricsEnabled
        : DEFAULT_SETTINGS.floatLyricsEnabled,
    floatLyricsMode: normalizeFloatLyricsMode(settings.floatLyricsMode),
    floatLyricsTremorAmplitude: clampTremorAmplitude(
      settings.floatLyricsTremorAmplitude
    ),
    floatLyricsTremorFrequency: clampTremorFrequency(
      settings.floatLyricsTremorFrequency
    ),
    floatLyricsColor: normalizeHex(
      settings.floatLyricsColor,
      DEFAULT_SETTINGS.floatLyricsColor
    ),
    floatLyricsFontSize: clampFloatLyricsFontSize(settings.floatLyricsFontSize),
    floatLyricsFadeMs: clampFloatLyricsFadeMs(settings.floatLyricsFadeMs),
    floatLyricsCharInterval: clampFloatLyricsCharInterval(
      settings.floatLyricsCharInterval
    ),
    floatLyricsMinShowMs: clampFloatLyricsMinShowMs(
      settings.floatLyricsMinShowMs
    ),
    floatLyricsMaxShowMs: clampFloatLyricsMaxShowMs(
      settings.floatLyricsMaxShowMs
    ),
    floatLyricsAdaptiveSpeed:
      typeof settings.floatLyricsAdaptiveSpeed === "boolean"
        ? settings.floatLyricsAdaptiveSpeed
        : DEFAULT_SETTINGS.floatLyricsAdaptiveSpeed
  };
}

/**
 * Coerces the floating lyric content mode to a known value.
 * @param {unknown} value
 */
function normalizeFloatLyricsMode(value) {
  if (value === "both" || value === "original" || value === "translation") {
    return value;
  }
  return DEFAULT_SETTINGS.floatLyricsMode;
}

/**
 * Clamps the floating lyric tremor amplitude into a usable range, allowing
 * fractional px steps (e.g. 0.0–12.0).
 * @param {unknown} value
 */
function clampTremorAmplitude(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsTremorAmplitude;
  }
  return Math.min(MAX_TREMOR_AMPLITUDE, Math.max(0, round1(number)));
}

/**
 * Clamps the floating lyric tremor frequency into a usable range, allowing
 * fractional Hz steps (e.g. 1.0–30.0).
 * @param {unknown} value
 */
function clampTremorFrequency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsTremorFrequency;
  }
  return Math.min(MAX_TREMOR_FREQUENCY, Math.max(1, round1(number)));
}

/**
 * Rounds a number to one decimal place (e.g. 2.34 → 2.3, 1.25 → 1.3).
 * @param {number} value
 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Clamps the floating lyric base font size into a readable range.
 * @param {unknown} value
 */
function clampFloatLyricsFontSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsFontSize;
  }
  return Math.min(MAX_FLOAT_LYRICS_FONT_SIZE, Math.max(14, Math.round(number)));
}

/**
 * Clamps the floating lyric cross-fade duration into a usable range.
 * @param {unknown} value
 */
function clampFloatLyricsFadeMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsFadeMs;
  }
  return Math.min(MAX_FLOAT_LYRICS_FADE_MS, Math.max(0, Math.round(number)));
}

/**
 * Clamps the floating lyric per-character output interval into seconds.
 * Minimum 0.01s (fast), default 0.1s, maximum 1s (slow).
 * @param {unknown} value
 */
function clampFloatLyricsCharInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsCharInterval;
  }
  return Math.min(
    MAX_FLOAT_LYRICS_CHAR_INTERVAL,
    Math.max(0.01, Math.round(number * 100) / 100)
  );
}

/**
 * Clamps the minimum lyric display time (ms) into a usable range.
 * @param {unknown} value
 */
function clampFloatLyricsMinShowMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsMinShowMs;
  }
  return Math.min(MAX_FLOAT_LYRICS_MIN_SHOW_MS, Math.max(0, Math.round(number)));
}

/**
 * Clamps the maximum lyric display time (ms) into a usable range (0 = no cap).
 * @param {unknown} value
 */
function clampFloatLyricsMaxShowMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_SETTINGS.floatLyricsMaxShowMs;
  }
  return Math.min(MAX_FLOAT_LYRICS_MAX_SHOW_MS, Math.max(0, Math.round(number)));
}

/**
 * Accepts #rgb / #rrggbb or falls back to the default hex.
 * @param {unknown} value
 * @param {string} fallback
 */
function normalizeHex(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  const short = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = trimmed.match(/^#([0-9a-fA-F]{6})$/);
  return full ? `#${full[1].toLowerCase()}` : fallback;
}

/**
 * Clamps remembered float size into a usable range.
 * @param {Record<string, unknown>} size
 */
function validateFloatSize(size) {
  const width = Number(size.width);
  const expandedHeight = Number(size.expandedHeight);
  return {
    width:
      Number.isFinite(width) && width >= 260 && width <= 720
        ? Math.round(width)
        : DEFAULT_FLOAT_SIZE.width,
    expandedHeight:
      Number.isFinite(expandedHeight) &&
      expandedHeight >= 148 &&
      expandedHeight <= 640
        ? Math.round(expandedHeight)
        : DEFAULT_FLOAT_SIZE.expandedHeight
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_FLOAT_SIZE,
  MAX_TREMOR_AMPLITUDE,
  MAX_TREMOR_FREQUENCY,
  MAX_FLOAT_LYRICS_FONT_SIZE,
  MAX_FLOAT_LYRICS_FADE_MS,
  MAX_FLOAT_LYRICS_CHAR_INTERVAL,
  MAX_FLOAT_LYRICS_MIN_SHOW_MS,
  MAX_FLOAT_LYRICS_MAX_SHOW_MS,
  createStateStore,
  validateSettings,
  validateFloatSize,
  normalizeFloatLyricsMode,
  clampTremorAmplitude,
  clampTremorFrequency,
  clampFloatLyricsFontSize,
  clampFloatLyricsFadeMs,
  clampFloatLyricsCharInterval,
  clampFloatLyricsMinShowMs,
  clampFloatLyricsMaxShowMs
};
