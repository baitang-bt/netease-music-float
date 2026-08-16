const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_TITLE_FONT_ID,
  DEFAULT_TITLE_FONT_SIZE,
  normalizeTitleFontId,
  clampTitleFontSize
} = require("../src/title-fonts");
const { normalizeLaunchPlaybackMode } = require("./netease-playback-mode");
const { normalizeTargetPlayerId } = require("./music-players");

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
  /** Collapsed title font preset id (CJK-capable stacks). */
  titleFontId: DEFAULT_TITLE_FONT_ID,
  /** Collapsed title font size in px. */
  titleFontSize: DEFAULT_TITLE_FONT_SIZE,
  /**
   * On launch, sync NetEase to this mode via Accessibility.
   * `keep` = only detect and mirror UI; otherwise force-switch.
   */
  launchPlaybackMode: "keep",
  /** Catalog player id whose Now Playing the float follows. */
  targetPlayerId: "netease",
  /** Check GitHub Releases for updates shortly after launch. */
  autoCheckUpdates: true
};

const DEFAULT_FLOAT_SIZE = {
  width: 320,
  expandedHeight: 220
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
    titleFontId: normalizeTitleFontId(settings.titleFontId),
    titleFontSize: clampTitleFontSize(settings.titleFontSize),
    launchPlaybackMode: normalizeLaunchPlaybackMode(settings.launchPlaybackMode),
    targetPlayerId: normalizeTargetPlayerId(settings.targetPlayerId),
    autoCheckUpdates:
      typeof settings.autoCheckUpdates === "boolean"
        ? settings.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates
  };
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
      Number.isFinite(width) && width >= 260 && width <= 560
        ? Math.round(width)
        : DEFAULT_FLOAT_SIZE.width,
    expandedHeight:
      Number.isFinite(expandedHeight) &&
      expandedHeight >= 180 &&
      expandedHeight <= 480
        ? Math.round(expandedHeight)
        : DEFAULT_FLOAT_SIZE.expandedHeight
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_FLOAT_SIZE,
  createStateStore,
  validateSettings,
  validateFloatSize
};
