const api = window.neteaseFloat;

const audioStatusEl = document.querySelector("#audio-status");
const audioDetailEl = document.querySelector("#audio-status-detail");
const audioPermissionBtn = document.querySelector("#btn-audio-permission");
const windowColorInput = document.querySelector("#window-color");
const spectrumColorInput = document.querySelector("#spectrum-color");
const transparentFloatInput = document.querySelector("#transparent-float");
const titleFontSelect = document.querySelector("#title-font");
const titleFontSizeInput = document.querySelector("#title-font-size");
const titleFontSizeLabel = document.querySelector("#title-font-size-label");
const titleFontPreview = document.querySelector("#title-font-preview");
const importFontBtn = document.querySelector("#btn-import-font");
const removeFontBtn = document.querySelector("#btn-remove-font");
const launchPlaybackModeSelect = document.querySelector("#launch-playback-mode");
const accessibilityStatusEl = document.querySelector("#accessibility-status");
const targetPlayerSelect = document.querySelector("#target-player");
const openPlayerLabel = document.querySelector("#open-player-label");
const playbackModeCard = document.querySelector("#playback-mode-card");
const audioCaptureCard = document.querySelector("#audio-capture-card");
const autoCheckUpdatesInput = document.querySelector("#auto-check-updates");
const updateStatusEl = document.querySelector("#update-status");
const checkUpdateBtn = document.querySelector("#btn-check-update");
const installUpdateBtn = document.querySelector("#btn-install-update");
const localeSelect = document.querySelector("#ui-locale");
const floatWidthInput = document.querySelector("#float-width");
const floatHeightInput = document.querySelector("#float-height");
const floatWidthLabel = document.querySelector("#float-width-label");
const floatHeightLabel = document.querySelector("#float-height-label");
const resetFloatSizeBtn = document.querySelector("#btn-reset-float-size");

const DEFAULT_WINDOW_COLOR = "#24242a";
const DEFAULT_SPECTRUM_COLOR = "#e60026";
const DEFAULT_FLOAT_WIDTH = 320;
const DEFAULT_FLOAT_HEIGHT = 220;

/** Cache of installed players from the main process. */
let installedPlayers = [];
/** Latest imported-font catalog from settings. */
let customFonts = [];
/** Feature flags supplied by the main process for the current operating system. */
let platformCapabilities = {
  systemAudioCapture: false,
  accessibilityPlaybackMode: false
};
/** Cached update status so locale switches can re-render the message. */
let lastUpdateStatus = null;
/** Cached audio status for locale-aware re-render. */
let lastAudioStatus = null;
/** Avoid feedback loops while applying float size from IPC. */
let applyingFloatSize = false;

/**
 * Updates float size slider ranges, values, and labels.
 * @param {{
 *   width?: number,
 *   expandedHeight?: number,
 *   minWidth?: number,
 *   maxWidth?: number,
 *   minExpandedHeight?: number,
 *   maxExpandedHeight?: number
 * }} size
 */
function renderFloatSize(size) {
  if (!size) {
    return;
  }
  applyingFloatSize = true;
  if (Number.isFinite(size.minWidth) && Number.isFinite(size.maxWidth)) {
    floatWidthInput.min = String(size.minWidth);
    floatWidthInput.max = String(size.maxWidth);
  }
  if (
    Number.isFinite(size.minExpandedHeight) &&
    Number.isFinite(size.maxExpandedHeight)
  ) {
    floatHeightInput.min = String(size.minExpandedHeight);
    floatHeightInput.max = String(size.maxExpandedHeight);
  }
  if (Number.isFinite(size.width)) {
    floatWidthInput.value = String(size.width);
    floatWidthLabel.textContent = `${size.width}px`;
  }
  if (Number.isFinite(size.expandedHeight)) {
    floatHeightInput.value = String(size.expandedHeight);
    floatHeightLabel.textContent = `${size.expandedHeight}px`;
  }
  applyingFloatSize = false;
}

/**
 * Fills the language <select> with system + built-in locale options.
 * @param {string} selected
 */
function populateLocaleOptions(selected) {
  const options = window.I18N_LOCALE_OPTIONS || [];
  localeSelect.innerHTML = "";
  options.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.nativeLabel;
    localeSelect.appendChild(option);
  });
  const preferred =
    window.normalizeLocaleSetting(selected) ||
    window.I18N_DEFAULT_LOCALE_SETTING;
  localeSelect.value = preferred;
  if (localeSelect.value !== preferred) {
    localeSelect.value = window.I18N_DEFAULT_LOCALE_SETTING;
  }
}

/**
 * Applies the settings locale preference and refreshes static DOM strings.
 * @param {{ locale?: string }} settings
 */
function applyUiLocale(settings) {
  const resolved = window.resolveLocale(settings?.locale);
  window.setActiveLocale(resolved);
  window.applyDomI18n();
  document.title = window.t("settings.title");
}

/**
 * Fills the target-player <select> with locally installed catalog apps.
 * @param {string} selectedId
 */
function populateTargetPlayerOptions(selectedId) {
  targetPlayerSelect.innerHTML = "";
  if (!installedPlayers.length) {
    const option = document.createElement("option");
    option.value = selectedId || "netease";
    option.textContent = window.t("settings.noPlayers");
    targetPlayerSelect.appendChild(option);
    targetPlayerSelect.disabled = true;
    return;
  }
  targetPlayerSelect.disabled = false;
  installedPlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.label;
    targetPlayerSelect.appendChild(option);
  });
  const hasSelected = installedPlayers.some((player) => player.id === selectedId);
  targetPlayerSelect.value = hasSelected
    ? selectedId
    : installedPlayers[0].id;
}

/**
 * Shows NetEase-only playback-mode settings when that player is selected.
 * @param {string} playerId
 */
function updatePlayerDependentUi(playerId) {
  const player =
    installedPlayers.find((entry) => entry.id === playerId) || null;
  const showsPlaybackMode =
    playerId === "netease" &&
    platformCapabilities.accessibilityPlaybackMode === true;
  playbackModeCard.hidden = !showsPlaybackMode;
  openPlayerLabel.textContent = player
    ? window.t("settings.openPlayerNamed", { name: player.label })
    : window.t("settings.openPlayer");
}

/**
 * Renders auto-update status text and the install button.
 * @param {{
 *   state?: string,
 *   message?: string,
 *   currentVersion?: string,
 *   packaged?: boolean
 * }} status
 */
function renderUpdateStatus(status) {
  lastUpdateStatus = status || null;
  const version = status?.currentVersion
    ? `v${status.currentVersion}`
    : "";
  const message = status?.message || window.t("update.unknown");
  updateStatusEl.textContent = version ? `${message}（${version}）` : message;
  installUpdateBtn.hidden = status?.state !== "ready";
}

/** Loads installed players then paints settings. */
async function refreshInstalledPlayers(settings) {
  installedPlayers = (await api.listInstalledPlayers()) || [];
  const selectedId = settings?.targetPlayerId || "netease";
  populateTargetPlayerOptions(selectedId);
  updatePlayerDependentUi(targetPlayerSelect.value || selectedId);
}

/**
 * Hides settings whose native implementation is unavailable on this platform.
 * @param {{ systemAudioCapture?: boolean, accessibilityPlaybackMode?: boolean }} capabilities
 */
function applyPlatformCapabilities(capabilities) {
  platformCapabilities = {
    ...platformCapabilities,
    ...(capabilities || {})
  };
  document.documentElement.dataset.platform =
    capabilities?.platform || "unknown";
  audioCaptureCard.hidden = !platformCapabilities.systemAudioCapture;
  updatePlayerDependentUi(targetPlayerSelect.value || "netease");
}

/** Refreshes Accessibility trust status for playback-mode control. */
async function refreshAccessibilityStatus() {
  if (!platformCapabilities.accessibilityPlaybackMode) {
    return;
  }
  const status = await api.getAccessibilityStatus();
  accessibilityStatusEl.textContent = status?.trusted
    ? window.t("settings.axTrusted")
    : window.t("settings.axDenied");
  accessibilityStatusEl.removeAttribute("data-i18n");
}

/** Fills the title-font <select> from presets plus imported fonts. */
function populateTitleFontOptions(selectedId, importedFonts = []) {
  const presets = window.TITLE_FONT_PRESETS || {};
  titleFontSelect.innerHTML = "";

  const presetGroup = document.createElement("optgroup");
  presetGroup.label = window.t("settings.fonts.builtin");
  Object.values(presets).forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetGroup.appendChild(option);
  });
  titleFontSelect.appendChild(presetGroup);

  if (importedFonts.length) {
    const customGroup = document.createElement("optgroup");
    customGroup.label = window.t("settings.fonts.imported");
    importedFonts.forEach((font) => {
      const option = document.createElement("option");
      option.value = font.id;
      option.textContent = font.label;
      customGroup.appendChild(option);
    });
    titleFontSelect.appendChild(customGroup);
  }

  const preferred = selectedId || "system";
  titleFontSelect.value = preferred;
  if (titleFontSelect.value !== preferred) {
    titleFontSelect.value = "system";
  }
  syncRemoveFontButton();
}

/** Shows the delete button only while an imported font is selected. */
function syncRemoveFontButton() {
  const selected = titleFontSelect.value;
  removeFontBtn.hidden = !customFonts.some((font) => font.id === selected);
}

/**
 * Injects @font-face rules for imported fonts into this document.
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
 * Updates the live title font preview label and sample text.
 * @param {string} fontId
 * @param {number} fontSize
 */
function renderTitleFontPreview(fontId, fontSize) {
  titleFontSizeLabel.textContent = `${fontSize}px`;
  titleFontPreview.style.fontFamily = window.resolveTitleFontStack(
    fontId,
    customFonts
  );
  titleFontPreview.style.fontSize = `${fontSize}px`;
}

/**
 * Mirrors the float's custom colors into Settings and keeps text WCAG-readable.
 * @param {{ windowColor?: string, spectrumColor?: string }} settings
 */
function applySettingsTheme(settings) {
  const windowColor =
    window.normalizeHexColor(settings?.windowColor) || DEFAULT_WINDOW_COLOR;
  const spectrumColor =
    window.normalizeHexColor(settings?.spectrumColor) || DEFAULT_SPECTRUM_COLOR;
  const contrast = window.contrastTheme(windowColor);
  const visibleAccent = window.ensureContrastHex(
    spectrumColor,
    windowColor,
    2.1
  );
  const root = document.documentElement;
  const paper = window.darkenHex(
    windowColor,
    contrast.isLight ? 0.06 : 0.22
  );
  const sidebar = window.darkenHex(
    windowColor,
    contrast.isLight ? 0.12 : 0.3
  );
  const accentIsLight = window.relativeLuminance(visibleAccent) > 0.44;

  root.style.setProperty("--ink", contrast.foreground);
  root.style.setProperty("--ink-soft", contrast.muted);
  root.style.setProperty("--paper", paper);
  root.style.setProperty("--sidebar", sidebar);
  root.style.setProperty("--surface", contrast.surface);
  root.style.setProperty("--surface-hover", contrast.surfaceHover);
  root.style.setProperty("--line", contrast.line);
  root.style.setProperty("--accent", visibleAccent);
  root.style.setProperty("--accent-text", window.contrastTextColor(visibleAccent));
  root.style.setProperty("--accent-soft", window.hexToRgba(visibleAccent, 0.18));
  root.style.setProperty(
    "--accent-hover",
    accentIsLight
      ? window.darkenHex(visibleAccent, 0.12)
      : window.lightenHex(visibleAccent, 0.16)
  );
}

/**
 * Loads settings into controls and synchronizes the Settings theme.
 * @param {{
 *   alwaysOnTop?: boolean,
 *   windowColor?: string,
 *   spectrumColor?: string,
 *   transparentFloat?: boolean,
 *   titleFontId?: string,
 *   titleFontSize?: number,
 *   launchPlaybackMode?: string,
 *   targetPlayerId?: string,
 *   autoCheckUpdates?: boolean,
 *   locale?: string
 * }} settings
 */
function renderSettings(settings) {
  applyUiLocale(settings);
  applySettingsTheme(settings);
  document.querySelector("#always-on-top").checked = Boolean(settings.alwaysOnTop);
  autoCheckUpdatesInput.checked = settings.autoCheckUpdates !== false;
  transparentFloatInput.checked = Boolean(settings.transparentFloat);
  windowColorInput.value = settings.windowColor || DEFAULT_WINDOW_COLOR;
  spectrumColorInput.value = settings.spectrumColor || DEFAULT_SPECTRUM_COLOR;
  windowColorInput.disabled = Boolean(settings.transparentFloat);
  launchPlaybackModeSelect.value = settings.launchPlaybackMode || "keep";
  populateLocaleOptions(settings.locale);

  customFonts = window.normalizeCustomFonts(settings.customFonts || []);
  applyCustomFontFaces(customFonts);
  const fontId = window.normalizeTitleFontId(settings.titleFontId, customFonts);
  const fontSize = window.clampTitleFontSize(settings.titleFontSize);
  populateTitleFontOptions(fontId, customFonts);
  titleFontSizeInput.value = String(fontSize);
  titleFontSizeInput.max = String(window.MAX_TITLE_FONT_SIZE || 28);
  renderTitleFontPreview(fontId, fontSize);

  const selectedId = settings.targetPlayerId || "netease";
  if (targetPlayerSelect.options.length) {
    const hasSelected = [...targetPlayerSelect.options].some(
      (option) => option.value === selectedId
    );
    if (hasSelected) {
      targetPlayerSelect.value = selectedId;
    }
  }
  updatePlayerDependentUi(targetPlayerSelect.value || selectedId);

  if (lastUpdateStatus) {
    renderUpdateStatus(lastUpdateStatus);
  }
  if (lastAudioStatus) {
    renderAudioStatus(lastAudioStatus);
  }
  if (platformCapabilities.accessibilityPlaybackMode) {
    refreshAccessibilityStatus();
  }
}

/**
 * Renders system-audio permission / capture status in the settings card.
 * @param {{
 *   state?: string,
 *   running?: boolean,
 *   consent?: boolean,
 *   error?: string|null,
 *   hint?: string,
 *   openedSettings?: boolean
 * }} status
 */
function renderAudioStatus(status) {
  lastAudioStatus = status || null;
  const state = status?.state || "unknown";
  const labelKey = {
    granted: "audio.state.granted",
    denied: "audio.state.denied",
    idle: "audio.state.idle",
    unsupported: "audio.state.unsupported",
    unknown: "audio.state.unknown"
  }[state] || "audio.state.unknown";
  audioStatusEl.textContent = window.t(labelKey);
  audioStatusEl.className = `status-chip is-${state}`;

  if (status?.error) {
    audioDetailEl.textContent = window.t("audio.detail.fail", {
      error: status.error
    });
  } else if (state === "granted") {
    audioDetailEl.textContent = window.t("audio.detail.ok");
  } else if (status?.openedSettings) {
    audioDetailEl.textContent = window.t("audio.detail.opened");
  } else if (status?.consent && !status?.running) {
    audioDetailEl.textContent = window.t("audio.detail.consent");
  } else {
    audioDetailEl.textContent =
      status?.hint || window.t("audio.detail.need");
  }
}

/** Refreshes audio permission status from the main process. */
async function refreshAudioStatus() {
  const status = await api.getAudioStatus();
  renderAudioStatus(status);
}

document.querySelector("#always-on-top").addEventListener("change", (event) => {
  api.updateSettings({ alwaysOnTop: event.target.checked });
});

autoCheckUpdatesInput.addEventListener("change", (event) => {
  api.updateSettings({ autoCheckUpdates: event.target.checked });
});

localeSelect.addEventListener("change", (event) => {
  api.updateSettings({
    locale: window.normalizeLocaleSetting(event.target.value)
  });
});

floatWidthInput.addEventListener("input", (event) => {
  if (applyingFloatSize) {
    return;
  }
  const width = Number(event.target.value);
  floatWidthLabel.textContent = `${width}px`;
  api.setFloatSize({ width });
});

floatHeightInput.addEventListener("input", (event) => {
  if (applyingFloatSize) {
    return;
  }
  const expandedHeight = Number(event.target.value);
  floatHeightLabel.textContent = `${expandedHeight}px`;
  api.setFloatSize({ expandedHeight });
});

resetFloatSizeBtn.addEventListener("click", () => {
  api.setFloatSize({
    width: DEFAULT_FLOAT_WIDTH,
    expandedHeight: DEFAULT_FLOAT_HEIGHT
  });
});

checkUpdateBtn.addEventListener("click", async () => {
  checkUpdateBtn.disabled = true;
  try {
    await api.checkForUpdates();
  } finally {
    checkUpdateBtn.disabled = false;
  }
});

installUpdateBtn.addEventListener("click", () => {
  api.installUpdate();
});

api.onUpdateStatus((payload) => {
  api.getUpdateStatus().then(renderUpdateStatus);
  renderUpdateStatus(payload);
});

transparentFloatInput.addEventListener("change", (event) => {
  api.updateSettings({ transparentFloat: event.target.checked });
});

windowColorInput.addEventListener("input", (event) => {
  api.updateSettings({ windowColor: event.target.value });
});

spectrumColorInput.addEventListener("input", (event) => {
  api.updateSettings({ spectrumColor: event.target.value });
});

titleFontSelect.addEventListener("change", (event) => {
  syncRemoveFontButton();
  renderTitleFontPreview(
    event.target.value,
    window.clampTitleFontSize(titleFontSizeInput.value)
  );
  api.updateSettings({ titleFontId: event.target.value });
});

titleFontSizeInput.addEventListener("input", (event) => {
  const fontSize = window.clampTitleFontSize(event.target.value);
  titleFontSizeLabel.textContent = `${fontSize}px`;
  renderTitleFontPreview(titleFontSelect.value, fontSize);
  api.updateSettings({ titleFontSize: fontSize });
});

importFontBtn.addEventListener("click", async () => {
  importFontBtn.disabled = true;
  try {
    const result = await api.importFont();
    if (result?.settings) {
      renderSettings(result.settings);
    }
  } finally {
    importFontBtn.disabled = false;
  }
});

removeFontBtn.addEventListener("click", async () => {
  const fontId = titleFontSelect.value;
  if (!customFonts.some((font) => font.id === fontId)) {
    return;
  }
  removeFontBtn.disabled = true;
  try {
    const result = await api.removeFont(fontId);
    if (result?.settings) {
      renderSettings(result.settings);
    }
  } finally {
    removeFontBtn.disabled = false;
  }
});

launchPlaybackModeSelect.addEventListener("change", (event) => {
  api.updateSettings({ launchPlaybackMode: event.target.value });
});

targetPlayerSelect.addEventListener("change", (event) => {
  const playerId = event.target.value;
  updatePlayerDependentUi(playerId);
  api.updateSettings({ targetPlayerId: playerId });
});

document.querySelector("#btn-accessibility").addEventListener("click", async () => {
  await api.requestAccessibility();
  refreshAccessibilityStatus();
});

document.querySelector("#btn-reset-colors").addEventListener("click", () => {
  api.updateSettings({
    windowColor: DEFAULT_WINDOW_COLOR,
    spectrumColor: DEFAULT_SPECTRUM_COLOR,
    transparentFloat: false,
    titleFontId: window.DEFAULT_TITLE_FONT_ID,
    titleFontSize: window.DEFAULT_TITLE_FONT_SIZE
  });
});

document.querySelector("#btn-open-player").addEventListener("click", () => {
  api.openPlayer();
});

document.querySelector("#btn-quit").addEventListener("click", () => {
  api.quit();
});

audioPermissionBtn.addEventListener("click", async () => {
  audioPermissionBtn.disabled = true;
  audioStatusEl.textContent = window.t("audio.detail.requesting");
  audioStatusEl.className = "status-chip";
  try {
    const result = await api.requestAudioPermission();
    renderAudioStatus(result);
  } finally {
    audioPermissionBtn.disabled = false;
  }
});

Promise.all([
  api.getSettings(),
  api.getPlatformCapabilities(),
  api.getFloatSize()
]).then(async ([settings, capabilities, floatSize]) => {
  applyPlatformCapabilities(capabilities);
  await refreshInstalledPlayers(settings);
  renderSettings(settings);
  renderFloatSize(floatSize);
  if (platformCapabilities.systemAudioCapture) {
    refreshAudioStatus();
  }
  if (platformCapabilities.accessibilityPlaybackMode) {
    refreshAccessibilityStatus();
  }
});
api.onSettingsChanged(renderSettings);
api.onFloatSizeChanged(renderFloatSize);
api.getUpdateStatus().then(renderUpdateStatus);
