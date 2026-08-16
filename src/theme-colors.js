/**
 * Shared hex color helpers for float theme + spectrum bars.
 * Exposed on window for plain script pages (no bundler).
 */

/**
 * Normalizes a CSS hex color to #rrggbb, or returns null when invalid.
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const short = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = trimmed.match(/^#([0-9a-fA-F]{6})$/);
  return full ? `#${full[1].toLowerCase()}` : null;
}

/**
 * Parses #rrggbb into 0–255 RGB components.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }|null}
 */
function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

/**
 * Builds an rgba() string from a hex color and alpha.
 * @param {string} hex
 * @param {number} alpha
 */
function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Mixes a hex color toward white (amount 0–1) for spectrum highlights.
 * @param {string} hex
 * @param {number} amount
 */
function lightenHex(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#ffffff";
  }
  const t = Math.max(0, Math.min(1, amount));
  const mix = (channel) => Math.round(channel + (255 - channel) * t);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(rgb.r))}${toHex(mix(rgb.g))}${toHex(mix(rgb.b))}`;
}

/**
 * Mixes a hex color toward black (amount 0–1) for window depth.
 * @param {string} hex
 * @param {number} amount
 */
function darkenHex(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#000000";
  }
  const t = Math.max(0, Math.min(1, amount));
  const mix = (channel) => Math.round(channel * (1 - t));
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(rgb.r))}${toHex(mix(rgb.g))}${toHex(mix(rgb.b))}`;
}

/**
 * Calculates WCAG relative luminance (0=black, 1=white).
 * @param {string} hex
 * @returns {number}
 */
function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return 0;
  }
  const linearize = (channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return (
    linearize(rgb.r) * 0.2126 +
    linearize(rgb.g) * 0.7152 +
    linearize(rgb.b) * 0.0722
  );
}

/**
 * Returns readable foreground/surface colors for a custom background.
 * @param {string} backgroundHex
 */
function contrastTheme(backgroundHex) {
  const isLight = relativeLuminance(backgroundHex) > 0.42;
  return isLight
    ? {
        isLight: true,
        foreground: "#17171b",
        muted: "rgba(23, 23, 27, 0.62)",
        title: "rgba(23, 23, 27, 0.58)",
        lyric: "rgba(23, 23, 27, 0.86)",
        line: "rgba(0, 0, 0, 0.13)",
        surface: "rgba(0, 0, 0, 0.055)",
        surfaceHover: "rgba(0, 0, 0, 0.1)",
        shadow: "rgba(255, 255, 255, 0.45)"
      }
    : {
        isLight: false,
        foreground: "#f4f1ec",
        muted: "rgba(244, 241, 236, 0.62)",
        title: "rgba(244, 241, 236, 0.48)",
        lyric: "rgba(244, 241, 236, 0.82)",
        line: "rgba(255, 255, 255, 0.1)",
        surface: "rgba(255, 255, 255, 0.055)",
        surfaceHover: "rgba(255, 255, 255, 0.11)",
        shadow: "rgba(0, 0, 0, 0.45)"
      };
}

/**
 * Chooses black or white text for a solid custom accent.
 * @param {string} backgroundHex
 */
function contrastTextColor(backgroundHex) {
  return relativeLuminance(backgroundHex) > 0.44 ? "#17171b" : "#ffffff";
}

/**
 * Calculates WCAG contrast ratio between two opaque hex colors.
 * @param {string} firstHex
 * @param {string} secondHex
 */
function contrastRatio(firstHex, secondHex) {
  const first = relativeLuminance(firstHex);
  const second = relativeLuminance(secondHex);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Nudges a custom color toward black/white until it contrasts with the background.
 * @param {string} colorHex
 * @param {string} backgroundHex
 * @param {number} [minimumRatio]
 */
function ensureContrastHex(colorHex, backgroundHex, minimumRatio = 2.4) {
  const color = normalizeHexColor(colorHex) || "#000000";
  const background = normalizeHexColor(backgroundHex) || "#ffffff";
  if (contrastRatio(color, background) >= minimumRatio) {
    return color;
  }
  const moveTowardBlack = relativeLuminance(background) > 0.42;
  for (let step = 1; step <= 10; step += 1) {
    const amount = step / 10;
    const candidate = moveTowardBlack
      ? darkenHex(color, amount)
      : lightenHex(color, amount);
    if (contrastRatio(candidate, background) >= minimumRatio) {
      return candidate;
    }
  }
  return moveTowardBlack ? "#17171b" : "#ffffff";
}

window.normalizeHexColor = normalizeHexColor;
window.hexToRgb = hexToRgb;
window.hexToRgba = hexToRgba;
window.lightenHex = lightenHex;
window.darkenHex = darkenHex;
window.relativeLuminance = relativeLuminance;
window.contrastTheme = contrastTheme;
window.contrastTextColor = contrastTextColor;
window.contrastRatio = contrastRatio;
window.ensureContrastHex = ensureContrastHex;
