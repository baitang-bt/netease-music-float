/**
 * Custom font picker for Settings: each option renders in its own typeface.
 * Plain script; one open menu at a time.
 */

/** @type {HTMLElement|null} */
let openPickerRoot = null;

/**
 * Closes any open font picker menu.
 */
function closeOpenFontPicker() {
  if (!openPickerRoot) {
    return;
  }
  const menu = openPickerRoot.querySelector(".font-picker-menu");
  const trigger = openPickerRoot.querySelector(".font-picker-trigger");
  if (menu) {
    menu.hidden = true;
  }
  if (trigger) {
    trigger.setAttribute("aria-expanded", "false");
  }
  openPickerRoot = null;
}

/**
 * Creates a font picker bound to one locale-specific settings key.
 * @param {HTMLElement} root
 * @param {{
 *   locale: "zh"|"en"|"ja",
 *   selectedId: string,
 *   customFonts?: object[],
 *   onChange: (fontId: string) => void
 * }} options
 */
function mountTitleFontPicker(root, options) {
  const customFonts = window.normalizeCustomFonts(options.customFonts || []);
  const presets = window.TITLE_FONT_PRESETS || {};
  root.classList.add("font-picker");
  root.dataset.locale = options.locale;
  root.replaceChildren();

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "font-picker-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const triggerLabel = document.createElement("span");
  triggerLabel.className = "font-picker-label";
  trigger.appendChild(triggerLabel);

  const menu = document.createElement("div");
  menu.className = "font-picker-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");

  /**
   * Updates the closed trigger to mirror the active font choice.
   * @param {string} fontId
   */
  function syncTrigger(fontId) {
    triggerLabel.textContent = window.resolveTitleFontLabel(fontId, customFonts);
    triggerLabel.style.fontFamily = window.resolveTitleFontPreviewFamily(
      fontId,
      customFonts
    );
    trigger.dataset.fontId = fontId;
  }

  /**
   * Appends one selectable font row to a menu group.
   * @param {HTMLElement} group
   * @param {string} fontId
   */
  function appendOption(group, fontId) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "font-picker-option";
    option.dataset.fontId = fontId;
    option.setAttribute("role", "option");
    option.textContent = window.resolveTitleFontLabel(fontId, customFonts);
    option.style.fontFamily = window.resolveTitleFontPreviewFamily(
      fontId,
      customFonts
    );
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      syncTrigger(fontId);
      closeOpenFontPicker();
      options.onChange(fontId);
    });
    group.appendChild(option);
  }

  const presetGroup = document.createElement("div");
  presetGroup.className = "font-picker-group";
  const presetHeading = document.createElement("div");
  presetHeading.className = "font-picker-group-label";
  presetHeading.textContent = window.t("settings.fonts.builtin");
  presetGroup.appendChild(presetHeading);
  Object.values(presets).forEach((preset) => {
    appendOption(presetGroup, preset.id);
  });
  menu.appendChild(presetGroup);

  if (customFonts.length) {
    const customGroup = document.createElement("div");
    customGroup.className = "font-picker-group";
    const customHeading = document.createElement("div");
    customHeading.className = "font-picker-group-label";
    customHeading.textContent = window.t("settings.fonts.imported");
    customGroup.appendChild(customHeading);
    customFonts.forEach((font) => {
      appendOption(customGroup, font.id);
    });
    menu.appendChild(customGroup);
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    closeOpenFontPicker();
    if (willOpen) {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      openPickerRoot = root;
    }
  });

  root.appendChild(trigger);
  root.appendChild(menu);
  syncTrigger(options.selectedId || window.DEFAULT_TITLE_FONT_ID);

  return {
    /** Returns the currently selected font id. */
    getValue() {
      return trigger.dataset.fontId || window.DEFAULT_TITLE_FONT_ID;
    }
  };
}

if (!window.__titleFontPickerBound) {
  document.addEventListener("click", closeOpenFontPicker);
  window.__titleFontPickerBound = true;
}

window.mountTitleFontPicker = mountTitleFontPicker;
window.closeOpenFontPicker = closeOpenFontPicker;
