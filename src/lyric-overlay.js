const api = window.neteaseFloat;
const appRoot = document.querySelector("#app");
const titleEl = document.querySelector("#title");
const titleText = document.querySelector("#title-text");
const titleTranslation = document.querySelector("#title-translation");

let lastSettings = null;
let lastTrack = null;
let showingLyric = false;
let trackTitleText = "";
let dragActive = false;
let dragMoved = false;
let dragStarted = false;
let dragStartX = 0;
let dragStartY = 0;

const DRAG_THRESHOLD_PX = 5;

/**
 * Shows or hides the translated lyric next to the original line.
 * @param {string|null|undefined} translation
 */
function setTitleTranslation(translation) {
  const text = typeof translation === "string" ? translation.trim() : "";
  window.renderMultilingualText(titleTranslation, text);
  titleTranslation.hidden = !text;
  titleEl.classList.toggle("has-translation", Boolean(text));
}

/**
 * Writes plain (non-lyric) text into the overlay title slot.
 * @param {string} text
 */
function showTitleText(text) {
  window.renderMultilingualText(titleText, text);
  titleEl.classList.remove("is-lyric");
  setTitleTranslation("");
}

/**
 * Applies locale plus chrome theme for the transparent overlay.
 * @param {object} settings
 */
function applyTheme(settings) {
  lastSettings = settings;
  const resolved = window.resolveLocale(settings?.locale);
  if (resolved !== window.getActiveLocale()) {
    window.setActiveLocale(resolved);
  }
  window.applyFloatDocumentTheme(document.documentElement, appRoot, settings, {
    expanded: false
  });
  appRoot.classList.add("is-collapsed", "is-transparent", "is-lyric-overlay");
}

/**
 * Updates the fallback title from a Now Playing snapshot.
 * @param {object} track
 */
function renderTrack(track) {
  lastTrack = track || null;
  if (!track || track.status === "empty") {
    trackTitleText = window.t("float.notPlaying");
  } else if (track.status === "error") {
    trackTitleText = window.t("float.mediaUnavailable");
  } else if (!track.isTarget) {
    trackTitleText = track.title || window.t("float.otherPlayer");
  } else {
    trackTitleText = track.title || window.t("float.unknownTrack");
  }
  if (!showingLyric) {
    showTitleText(trackTitleText);
  }
}

/**
 * Shows a timed lyric line, or falls back to the track title.
 * @param {{ line?: string, translation?: string, showLyric?: boolean }} payload
 */
function renderLyric(payload) {
  if (payload?.showLyric && payload.line) {
    showingLyric = true;
    window.renderMultilingualText(titleText, payload.line);
    titleEl.classList.add("is-lyric");
    setTitleTranslation(payload.translation);
    return;
  }
  showingLyric = false;
  showTitleText(trackTitleText);
}

/**
 * Drags the spectrum window via the overlay, or expands on a click with no drag.
 */
function setupDrag() {
  /**
   * Begins a potential drag / click (primary button only).
   * @param {PointerEvent} event
   */
  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    dragActive = true;
    dragMoved = false;
    dragStarted = false;
    dragStartX = event.screenX;
    dragStartY = event.screenY;
    appRoot.setPointerCapture(event.pointerId);
  }

  /**
   * Moves the float after the pointer travels past the drag threshold.
   * @param {PointerEvent} event
   */
  function onPointerMove(event) {
    if (!dragActive) {
      return;
    }
    const deltaX = event.screenX - dragStartX;
    const deltaY = event.screenY - dragStartY;
    if (!dragMoved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      dragMoved = true;
      dragStarted = true;
      api.dragStart();
    }
    if (dragStarted) {
      api.dragMove(deltaX, deltaY);
    }
  }

  /**
   * Ends a drag, or expands the float when the gesture was only a click.
   * @param {PointerEvent} event
   */
  function onPointerUp(event) {
    if (!dragActive) {
      return;
    }
    dragActive = false;
    if (dragStarted) {
      api.dragEnd();
    } else if (event.button === 0) {
      api.setExpanded(true);
    }
    dragMoved = false;
    dragStarted = false;
  }

  appRoot.addEventListener("pointerdown", onPointerDown);
  appRoot.addEventListener("pointermove", onPointerMove);
  appRoot.addEventListener("pointerup", onPointerUp);
  appRoot.addEventListener("pointercancel", onPointerUp);
}

setupDrag();
api.getSettings().then(applyTheme);
api.onSettingsChanged(applyTheme);
api.onTrack(renderTrack);
api.onLyric(renderLyric);
api.getTrack().then(renderTrack);
