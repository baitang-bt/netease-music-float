/**
 * Shared chrome theme for the float panel and the transparent lyric overlay.
 * Plain script (no bundler); writes CSS variables onto the document root.
 */

/**
 * Injects @font-face rules for imported title fonts.
 * @param {{ family: string, fileName: string }[]} fonts
 */
function applyCustomFontFaces(fonts) {
  let style = document.getElementById("custom-font-faces");
  if (!style) {
    style = document.createElement("style");
    style.id = "custom-font-faces";
    document.head.appendChild(style);
  }
  style.textContent = window.buildCustomFontFaceCss(fonts || []);
}

/**
 * Applies window colors, transparent-float classes, and title typography.
 * @param {HTMLElement} root
 * @param {HTMLElement} appRoot
 * @param {{
 *   windowColor?: string,
 *   spectrumColor?: string,
 *   transparentFloat?: boolean,
 *   titleFontId?: string,
 *   titleFontSize?: number,
 *   customFonts?: object[],
 *   locale?: string
 * }} settings
 * @param {{ expanded?: boolean }} [options]
 * @returns {{ transparent: boolean }}
 */
function applyFloatDocumentTheme(root, appRoot, settings, options = {}) {
  const expanded = Boolean(options.expanded);
  const windowColor =
    window.normalizeHexColor(settings?.windowColor) || "#24242a";
  const spectrumColor =
    window.normalizeHexColor(settings?.spectrumColor) || "#e60026";
  const transparentSetting = Boolean(settings?.transparentFloat);
  const transparent = transparentSetting && !expanded;
  const contrast = window.contrastTheme(windowColor);
  const visibleSpectrumColor = transparent
    ? spectrumColor
    : window.ensureContrastHex(spectrumColor, windowColor, 2.1);
  const customFonts = window.normalizeCustomFonts(settings?.customFonts || []);
  applyCustomFontFaces(customFonts);
  const fontIds = window.normalizeTitleFontIds(settings, customFonts);
  const stacks = window.resolveTitleFontStacks(settings, customFonts);
  const fontSize = window.clampTitleFontSize(settings?.titleFontSize);
  const top = windowColor;
  const bottom = window.darkenHex(windowColor, contrast.isLight ? 0.15 : 0.35);
  root.style.setProperty("--accent", visibleSpectrumColor);
  root.style.setProperty("--accent-glow", window.hexToRgba(spectrumColor, 0.22));
  root.style.setProperty("--window-top", window.hexToRgba(top, 0.92));
  root.style.setProperty("--window-bottom", window.hexToRgba(bottom, 0.78));
  root.style.setProperty("--bg", window.hexToRgba(bottom, 0.78));
  root.style.setProperty("--fg", contrast.foreground);
  root.style.setProperty("--muted", contrast.muted);
  root.style.setProperty("--title-color", contrast.title);
  root.style.setProperty("--lyric-color", contrast.lyric);
  root.style.setProperty(
    "--lyric-translation-color",
    contrast.lyricTranslation
  );
  root.style.setProperty("--title-halo", window.hexToRgba(bottom, 0.92));
  root.style.setProperty("--line", contrast.line);
  root.style.setProperty("--surface", contrast.surface);
  root.style.setProperty("--surface-hover", contrast.surfaceHover);
  root.style.setProperty("--contrast-shadow", contrast.shadow);
  root.style.setProperty(
    "--accent-text",
    window.contrastTextColor(visibleSpectrumColor)
  );
  root.style.setProperty(
    "--title-font",
    stacks.zh
  );
  root.style.setProperty("--title-font-zh", stacks.zh);
  root.style.setProperty("--title-font-en", stacks.en);
  root.style.setProperty("--title-font-ja", stacks.ja);
  root.style.setProperty("--title-font-size", `${fontSize}px`);
  appRoot.classList.toggle("is-transparent", transparentSetting);
  appRoot.classList.toggle("is-light-theme", contrast.isLight);
  return { transparent, fontIds, fontSize };
}

window.applyCustomFontFaces = applyCustomFontFaces;
window.applyFloatDocumentTheme = applyFloatDocumentTheme;
