const api = window.neteaseFloat;
const appRoot = document.querySelector("#app");
const blockEl = document.querySelector("#lyric-block");
const originalEl = document.querySelector("#lyric-original");
const translationEl = document.querySelector("#lyric-translation");
const ghostEl = document.querySelector("#ghost-block");

let lastSettings = null;
let lastPayload = null;
/** Current line key so a repeat lyric payload does not re-randomize placement. */
let placedKey = "";
/** Random placement/rotation assigned to the current line key. */
let placedStyle = null;
/** Key currently shown on screen (used to fade-out before swapping). */
let renderedKey = "";
/** Pending fade-out -> swap timer. */
let swapTimer = null;
/** Last used tilt, to guarantee successive lines use noticeably different angles. */
let lastTilt = null;
/** Timestamp when the current lyric line first became visible. */
let lineStartAt = 0;
/** Minimum seconds a lyric line stays visible before it can be replaced. */
let minShowSec = 0;
/** Maximum seconds a lyric line stays visible before it fades out. */
let maxShowSec = 0;
/** Timer used to fade out a line that exceeded its maximum display time. */
let maxHideTimer = null;
/** Snapshot of the currently displayed line (for the ghost fade layer). */
let currentSnapshot = null;

/** Reads a bound page rect for placing text within the visible area. */
function pageBounds() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

/** Minimum angular difference between successive lyric angles (degrees). */
const MIN_TILT_DELTA = 6;
/** Tilt is bounded to stay readable and never near vertical. */
const MAX_TILT = 22;
/** Adaptive typewriter target: a line aims to finish revealing within ~5s. */
const ADAPTIVE_TARGET_MS = 5000;

/**
 * Returns a readable (never near-vertical) rotation in degrees that always
 * differs from the previously used angle by at least MIN_TILT_DELTA.
 * @returns {number}
 */
function randomTilt() {
  const range = MAX_TILT * 2;
  let angle = Math.random() * range - MAX_TILT;
  // Avoid vertical (±90 lookalikes) by keeping within ±22 and nonzero.
  if (Math.abs(angle) < 3) {
    angle = angle < 0 ? -3 : 3;
  }
  if (lastTilt !== null && Math.abs(angle - lastTilt) < MIN_TILT_DELTA) {
    // Push it to the opposite side of the previous angle for a clear difference.
    const direction = lastTilt > 0 ? -1 : 1;
    angle = Math.max(
      -MAX_TILT,
      Math.min(MAX_TILT, lastTilt + direction * MIN_TILT_DELTA * 2)
    );
  }
  lastTilt = angle;
  return angle;
}

/**
 * Returns the fixed wrap width (px) for a lyric block so long lines break into
 * a few readable rows instead of being crushed into a narrow column.
 * @param {number} pageWidth
 */
function lineWidth(pageWidth) {
  return Math.max(220, Math.min(pageWidth * 0.7, 860));
}

/**
 * Picks a stable random position + tilt for a given line key so re-renders of
 * the same line do not cause the text to jump.
 * @param {string} key
 */
function placeFor(key) {
  if (placedKey === key && placedStyle) {
    return placedStyle;
  }
  const bounds = pageBounds();
  const width = lineWidth(bounds.width);
  const maxY = bounds.height * 0.72 - 160;
  const safeX = 8 + width * 0.12;
  const x = safeX + Math.random() * Math.max(0, bounds.width - safeX * 2 - width);
  const y = 24 + Math.random() * Math.max(60, maxY);
  placedStyle = {
    x: Math.max(8, Math.round(Math.min(bounds.width - width - 8, x))),
    y: Math.max(16, Math.round(Math.min(maxY, y))),
    tilt: randomTilt(),
    width
  };
  placedKey = key;
  return placedStyle;
}

/**
 * Renders one line as a typewriter reveal (one char per interval). Left-aligned
 * and wraps to multiple rows inside the fixed-width block when the text is long.
 * Each container keeps its own interval so original + translation can reveal
 * independently without interrupting one another.
 * @param {HTMLElement} container
 * @param {string} text
 */
function renderLine(container, text) {
  const priorTimer = container.typewriterTimer;
  if (priorTimer) {
    clearInterval(priorTimer);
    container.typewriterTimer = null;
  }
  if (!text) {
    container.hidden = true;
    container.replaceChildren();
    return;
  }
  container.hidden = false;
  container.replaceChildren();
  const source = String(text);
  const freq = Number(lastSettings?.floatLyricsTremorFrequency) || 8;
  const baseInterval = Number(lastSettings?.floatLyricsCharInterval) || 0.1;
  const durationMs = `${1000 / freq}ms`;
  let index = 0;

  // Adaptive typewriter: when enabled, a long line reveals faster so it does not
  // drag past a target duration; short lines keep the user's base interval. The
  // interval never steps below the 0.01s floor or above the user's base interval.
  let interval = baseInterval;
  if (lastSettings?.floatLyricsAdaptiveSpeed) {
    const chars = source.length;
    if (chars > 0) {
      const adaptive = ADAPTIVE_TARGET_MS / 1000 / chars;
      interval = Math.max(0.01, Math.min(baseInterval, adaptive));
    }
  }

  /** Appends the next character span to the line container. */
  function pushNext() {
    if (index >= source.length) {
      if (container.typewriterTimer) {
        clearInterval(container.typewriterTimer);
        container.typewriterTimer = null;
      }
      return;
    }
    const char = source[index];
    index += 1;
    const span = document.createElement("span");
    // Whitespace needs to be preserved by wrapping; keep a space glyph inline.
    span.className = `char font-seg-${window.classifyScript(char)}`;
    span.textContent = char;
    span.style.animationDelay = `${Math.random() * 100}ms`;
    span.style.animationDuration = durationMs;
    container.appendChild(span);
  }

  pushNext();
  container.typewriterTimer = setInterval(pushNext, interval * 1000);
}

/**
 * Applies settings (mode, tremor amplitude/frequency, color, size, fade) to overlay.
 * @param {object} settings
 */
function applySettings(settings) {
  lastSettings = settings || {};
  const root = document.documentElement;
  const ampSetting = Number(settings?.floatLyricsTremorAmplitude);
  const amp = Number.isFinite(ampSetting) ? ampSetting : 0;
  const freqSetting = Number(settings?.floatLyricsTremorFrequency);
  const freq = Number.isFinite(freqSetting) && freqSetting > 0 ? freqSetting : 8;
  root.style.setProperty("--tremor-amp", `${amp}px`);
  root.style.setProperty("--tremor-dur", `${1000 / freq}ms`);
  const color = window.normalizeHexColor(settings?.floatLyricsColor) || "#ffffff";
  root.style.setProperty("--lyric-text-color", color);
  const size = Number(settings?.floatLyricsFontSize) || 26;
  root.style.setProperty("--lyric-font-size", `${size}px`);
  const fade = Number(settings?.floatLyricsFadeMs) || 0;
  root.style.setProperty("--lyric-fade-ms", `${fade}ms`);
  minShowSec = (Number(settings?.floatLyricsMinShowMs) || 0) / 1000;
  maxShowSec = (Number(settings?.floatLyricsMaxShowMs) || 0) / 1000;
  // Disable per-char tremor entirely when amplitude is 0 so it costs nothing.
  root.classList.toggle("is-tremor-off", amp <= 0);
  if (lastPayload) {
    renderLines(lastPayload);
  }
}

/**
 * Clones the previous line into a fading ghost layer so it lingers briefly
 * while the next line appears, instead of vanishing instantly.
 * @param {object|null} snapshot
 */
function spawnGhost(snapshot) {
  if (!snapshot) {
    return;
  }
  ghostEl.style.left = `${snapshot.x}px`;
  ghostEl.style.top = `${snapshot.y}px`;
  ghostEl.style.width = `${snapshot.width}px`;
  ghostEl.style.setProperty("--ghost-tilt", `${snapshot.tilt}deg`);
  ghostEl.replaceChildren();
  for (const row of snapshot.rows) {
    const line = document.createElement("div");
    line.className = `lyric-line ${row.isTranslation ? "is-translation" : "is-original"}`;
    if (row.html) {
      line.innerHTML = row.html;
    } else {
      line.hidden = true;
    }
    ghostEl.appendChild(line);
  }
  // Force reflow then restart the fade-out animation.
  ghostEl.classList.remove("is-ghost");
  void ghostEl.offsetWidth;
  ghostEl.classList.add("is-ghost");
}

/**
 * Places and renders a lyric block at a stable random position/tilt.
 * @param {string} key
 * @param {string} line
 * @param {string} translation
 * @param {"both"|"original"|"translation"} mode
 */
function applyLine(key, line, translation, mode) {
  const anchor = placeFor(key);
  // Briefly keep the previous line visible (ghost fade) while the new one enters.
  spawnGhost(renderedKey && renderedKey !== key ? currentSnapshot : null);
  blockEl.style.left = `${anchor.x}px`;
  blockEl.style.top = `${anchor.y}px`;
  blockEl.style.width = `${anchor.width}px`;
  blockEl.style.setProperty("--line-tilt", `${anchor.tilt}deg`);

  if (mode === "both") {
    renderLine(originalEl, line);
    renderLine(translationEl, translation);
  } else if (mode === "original") {
    renderLine(originalEl, line);
    translationEl.replaceChildren();
    translationEl.hidden = true;
  } else {
    renderLine(originalEl, translation);
    translationEl.replaceChildren();
    translationEl.hidden = true;
  }

  const targets = mode === "both" ? [originalEl, translationEl] : [originalEl];
  for (const el of targets) {
    el.classList.remove("is-entering", "is-leaving");
    void el.offsetWidth;
    el.classList.add("is-entering");
  }
  renderedKey = key;

  // Remember the current line (markup + placement) so the next change can clone
  // it into the fading ghost layer with identical typography and wrapping.
  const rows = [];
  if (mode === "translation") {
    rows.push({ html: translationEl.innerHTML || "", isTranslation: true });
  } else {
    rows.push({ html: originalEl.innerHTML || "", isTranslation: false });
    if (mode === "both" && translation) {
      rows.push({ html: translationEl.innerHTML || "", isTranslation: true });
    }
  }
  currentSnapshot = {
    key,
    x: anchor.x,
    y: anchor.y,
    width: anchor.width,
    tilt: anchor.tilt,
    rows
  };

  // Track when this line became visible and schedule a max-time fade-out.
  lineStartAt = Date.now();
  if (maxHideTimer) {
    clearTimeout(maxHideTimer);
    maxHideTimer = null;
  }
  if (maxShowSec > 0) {
    maxHideTimer = setTimeout(() => {
      if (renderedKey === key && Date.now() - lineStartAt >= maxShowSec * 1000) {
        for (const el of [originalEl, translationEl]) {
          if (!el.hidden) {
            el.classList.remove("is-entering");
            el.classList.add("is-leaving");
          }
        }
      }
      maxHideTimer = null;
    }, maxShowSec * 1000);
  }
}

/**
 * Fades out the currently shown line without replacing it (used when a line is
 * hidden or its max display time elapsed).
 * @param {"both"|"original"|"translation"} mode
 */
function fadeOutCurrent(mode) {
  const targets = mode === "both" ? [originalEl, translationEl] : [originalEl];
  for (const el of targets) {
    if (!el.hidden) {
      el.classList.remove("is-entering");
      el.classList.add("is-leaving");
    }
  }
}

/**
 * Renders the lyric payload into the anchored block. Long lines wrap to rows
 * inside a fixed width; original + translation stack and share the same tilt.
 * Respects min/max display time before swapping or hiding a line.
 * @param {{ line?: string, translation?: string, showLyric?: boolean }} payload
 */
function renderLines(payload) {
  lastPayload = payload || null;
  const mode = lastSettings?.floatLyricsMode || "both";
  const line = payload?.line || "";
  const translation = payload?.translation || "";
  const visible = Boolean(payload?.showLyric && (line || translation));
  const key = `${line}|${translation}|${mode}`;

  if (!visible) {
    placedKey = "";
    placedStyle = null;
    renderedKey = "";
    if (swapTimer) {
      clearTimeout(swapTimer);
      swapTimer = null;
    }
    if (originalEl.typewriterTimer) {
      clearInterval(originalEl.typewriterTimer);
      originalEl.typewriterTimer = null;
    }
    if (translationEl.typewriterTimer) {
      clearInterval(translationEl.typewriterTimer);
      translationEl.typewriterTimer = null;
    }
    if (maxHideTimer) {
      clearTimeout(maxHideTimer);
      maxHideTimer = null;
    }
    originalEl.replaceChildren();
    translationEl.replaceChildren();
    originalEl.hidden = true;
    translationEl.hidden = true;
    return;
  }

  // Same line as shown already (e.g. play-state tick): just keep it as-is.
  if (key === renderedKey) {
    return;
  }

  const fade = Number(lastSettings?.floatLyricsFadeMs) || 0;
  const elapsed = Date.now() - lineStartAt;
  // Hold the current line until its minimum display time has elapsed before
  // swapping in the next one, so brief lines do not flash past too quickly.
  const waitMs = Math.max(0, minShowSec * 1000 - elapsed);

  if (swapTimer) {
    clearTimeout(swapTimer);
  }
  swapTimer = setTimeout(() => {
    applyLine(key, line, translation, mode);
    swapTimer = null;
  }, waitMs + fade);
}

api.getSettings().then(applySettings);
api.onSettingsChanged(applySettings);
api.onLyric(renderLines);
