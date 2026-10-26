const api = window.neteaseFloat;
const appRoot = document.querySelector("#app");
const layerEl = document.querySelector("#lyric-layer");

let lastSettings = null;
let lastPayload = null;
/** Line keys currently on screen, ordered oldest-first (a queue). */
let activeKeys = [];
/** Line pool keyed by identity (line time) so re-appearing lines keep pos. */
const linePool = new Map();
/** Minimum ms a line stays on screen before the oldest one fades out. */
let minShowMs = 1200;
/** Maximum ms a line may stay on screen before it fades out (0 = no cap). */
let maxShowMs = 0;
/** Timer that periodically evicts lines that exceeded their max display time. */
let maxEvictTimer = null;
/** Safe-area insets (px) that lyric lines must avoid. */
let safeArea = { top: 60, bottom: 60, left: 60, right: 60, center: 0 };

/** Minimum angular difference between successive lyric angles (degrees). */
const MIN_TILT_DELTA = 6;
/** Tilt is bounded to stay readable and never near vertical. */
const MAX_TILT = 22;
/** Adaptive typewriter target: a line aims to finish revealing within ~5s. */
const ADAPTIVE_TARGET_MS = 5000;
/** Maximum number of scattered lines shown on screen at once. */
const MAX_LINES = 4;

/** Reads a bound page rect for placing text within the visible area. */
function pageBounds() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Returns a readable (never near-vertical) rotation in degrees. */
function randomTilt() {
  const angle = (Math.random() * 2 - 1) * MAX_TILT;
  return Math.abs(angle) < 3 ? (angle < 0 ? -3 : 3) : angle;
}

/** Returns the fixed wrap width (px) for a lyric block. */
function lineWidth(pageWidth) {
  return Math.max(220, Math.min(pageWidth * 0.7, 860));
}

/**
 * Tests whether a point overlaps the centered safe zone.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 */
function inCenterZone(x, y, width) {
  const c = Number(safeArea.center) || 0;
  if (c <= 0) {
    return false;
  }
  const bounds = pageBounds();
  const cx = bounds.width / 2;
  const cy = bounds.height / 2;
  const half = c / 2;
  const right = x + width;
  const bottom = y + 60; // approximate line block height
  const overlapsX = right > cx - half && x < cx + half;
  const overlapsY = bottom > cy - half && y < cy + half;
  return overlapsX && overlapsY;
}

/**
 * Picks a random position that avoids the configured safe areas (insets + the
 * centered zone) and does not overlap lines already on screen.
 * @param {number} width
 * @param {{ x: number, y: number, width: number }[]} occupied
 */
function pickPosition(width, occupied) {
  const bounds = pageBounds();
  const top = Number(safeArea.top) || 0;
  const bottom = Number(safeArea.bottom) || 0;
  const left = Number(safeArea.left) || 0;
  const right = Number(safeArea.right) || 0;
  const usableTop = Math.min(top, bounds.height - 200);
  const usableBottom = Math.max(usableTop + 80, bounds.height * 0.72 - bottom);
  const usableWidth = bounds.width - left - right;
  const across = Math.max(320, usableWidth);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const x = Math.max(
      left + 8,
      Math.round(
        Math.min(
          bounds.width - right - width - 8,
          left + 8 + Math.random() * Math.max(0, across - width - 16)
        )
      )
    );
    const y = Math.max(
      usableTop + 16,
      Math.round(usableTop + Math.random() * Math.max(40, usableBottom - usableTop - 80))
    );
    const overlaps = occupied.some((o) => {
      const dx = Math.abs(x - o.x) < Math.min(width, o.width) * 0.75;
      const dy = Math.abs(y - o.y) < 90;
      return dx && dy;
    });
    if (!overlaps && !inCenterZone(x, y, width)) {
      return { x, y, tilt: randomTilt(), width };
    }
  }
  // Fallback: top-left inside the usable band, outside the center zone.
  return {
    x: Math.max(left + 8, 12),
    y: Math.max(usableTop + 16, 16),
    tilt: randomTilt(),
    width
  };
}

/**
 * Renders the lyric window as a queue: the current line prints, previous lines
 * linger on screen, and the oldest line fades out only after it has stayed for
 * minShowMs. New current lines are printed as they arrive (instead of being
 * dropped the moment the window slides).
 * @param {{
 *   line: string,
 *   translation: string,
 *   lines: { time: number, text: string, translation: string, isCurrent: boolean, index?: number }[],
 *   showLyric: boolean
 * }} payload
 */
function renderLyricWindow(payload) {
  lastPayload = payload || null;
  const visible = Boolean(payload?.showLyric);
  const win = visible && Array.isArray(payload?.lines) ? payload.lines : [];
  const now = Date.now();

  if (!win.length) {
    // Clear all lines with a fade-out.
    for (const key of activeKeys) {
      fadeOutLine(linePool.get(key));
      linePool.delete(key);
    }
    activeKeys = [];
    return;
  }

  const fadeMs = Number(lastSettings?.floatLyricsFadeMs) || 0;
  // Only print the current line on arrival. Neighboring lines that are already
  // on screen stay (they were previous current lines), but we never preview the
  // next line before it becomes current.
  win.forEach((entry, offset) => {
    const key = lineIdentity(entry, offset);
    const existing = linePool.get(key);
    if (existing) {
      const wasCurrent = existing.isCurrent;
      existing.isCurrent = entry.isCurrent;
      existing.rawEntry = entry;
      if (entry.isCurrent) {
        existing.bornAt = now;
        // Restart typewrite if this line just became current (e.g. after a seek).
        if (!wasCurrent) {
          restartTypewrite(existing, entry);
        }
      }
      return;
    }
    // Create a new line only when it is the current lyric; otherwise leave the
    // next line un-rendered so it does not visually "arrive" before its turn.
    if (entry.isCurrent) {
      const line = createLine(key, entry, fadeMs);
      if (line) {
        activeKeys.push(key);
      }
    }
  });

  // Fade out the oldest non-current line once it has stayed at least minShowMs,
  // or when the queue exceeds MAX_LINES (hard cap so fast songs do not pile up).
  while (activeKeys.length > 1) {
    const oldestKey = activeKeys[0];
    const oldest = linePool.get(oldestKey);
    if (oldest?.isCurrent) {
      break;
    }
    const overCap = activeKeys.length > MAX_LINES;
    const oldEnough =
      now - (oldest?.bornAt || now) >= minShowMs;
    if (!overCap && !oldEnough) {
      break;
    }
    activeKeys.shift();
    fadeOutLine(oldest);
    linePool.delete(oldestKey);
  }
}

/**
 * Builds a stable line key from LRC index (preferred) or time+text so two rows
 * that share a timestamp do not collide in the on-screen pool.
 * @param {{ time: number, text?: string, index?: number }} entry
 * @param {number} fallbackOffset
 */
function lineIdentity(entry, fallbackOffset) {
  if (Number.isFinite(entry.index)) {
    return `${entry.index}:${entry.time}:${entry.text || ""}`;
  }
  return `${entry.time}:${fallbackOffset}:${entry.text || ""}`;
}

function currentOccupied() {
  return activeKeys
    .map((key) => linePool.get(key))
    .filter(Boolean)
    .map((line) => ({ x: line.x, y: line.y, width: line.width }));
}

/** Builds a line element and starts the typewriter reveal for the current one. */
function createLine(key, entry, fadeMs) {
  const el = document.createElement("div");
  el.className = `lyric-line ${entry.isCurrent ? "is-current" : "is-near"}`;

  const width = lineWidth(pageBounds().width);
  const pos = pickPosition(width, currentOccupied());
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.width = `${pos.width}px`;
  el.style.setProperty("--line-tilt", `${pos.tilt}deg`);

  const mode = lastSettings?.floatLyricsMode || "both";
  // For the current line, create empty rows and let typewrite reveal them char
  // by char (so it never flashes the full line first). For a stable neighbor,
  // write the full static text.
  if (entry.isCurrent) {
    buildEmptyRows(el, mode);
  } else {
    renderLineText(el, entry, mode);
  }

  layerEl.appendChild(el);
  const line = {
    key,
    el,
    x: pos.x,
    y: pos.y,
    width: pos.width,
    isCurrent: entry.isCurrent,
    bornAt: Date.now(),
    charTimer: null,
    rawEntry: entry
  };
  linePool.set(key, line);

  // Animate entry for all lines; current line reveals char-by-char.
  el.classList.remove("is-entering", "is-leaving");
  void el.offsetWidth;
  el.classList.add("is-entering");
  if (entry.isCurrent) {
    typewrite(el, entry, mode, fadeMs);
  }
  return line;
}

/** Creates empty original/translation rows (no text) for the typewriter. */
function buildEmptyRows(el, mode) {
  el.replaceChildren();
  if (mode === "translation") {
    const row = document.createElement("div");
    row.className = "lyric-line-row is-original";
    el.appendChild(row);
    return;
  }
  const row = document.createElement("div");
  row.className = "lyric-line-row is-original";
  el.appendChild(row);
  if (mode === "both") {
    const t = document.createElement("div");
    t.className = "lyric-line-row is-translation";
    el.appendChild(t);
  }
}

/** Writes one line's text (original + translation depending on mode). */
function renderLineText(el, entry, mode) {
  el.replaceChildren();
  const hasTranslation = mode === "both" && entry.translation;
  if (mode === "translation") {
    // Show translation; fall back to the original when no translation exists.
    const text = entry.translation || entry.text || "";
    el.appendChild(makeRow(text, false));
    return;
  }
  el.appendChild(makeRow(entry.text || "", false));
  if (hasTranslation) {
    el.appendChild(makeRow(entry.translation || "", true));
  }
}

/** Creates a text row span for one lyric line. */
function makeRow(text, isTranslation) {
  const row = document.createElement("div");
  row.className = `lyric-line-row ${isTranslation ? "is-translation" : "is-original"}`;
  row.textContent = text;
  return row;
}

/**
 * Restarts the typewriter reveal for a line that just became current (e.g. after
 * a seek where playback moved onto this line). Clears any prior timers first.
 * @param {{ el: HTMLElement, rawEntry: object }} line
 * @param {object} entry
 */
function restartTypewrite(line, entry) {
  const el = line.el;
  clearTypewriterTimers(el);
  const mode = lastSettings?.floatLyricsMode || "both";
  buildEmptyRows(el, mode);
  const fadeMs = Number(lastSettings?.floatLyricsFadeMs) || 0;
  typewrite(el, entry, mode, fadeMs);
}

/**
 * Typewrites the current line char by char. The translation row reveals too, but
 * keeps its own pacing so original + translation do not interrupt each other.
 * @param {HTMLElement} el
 * @param {{ text: string, translation: string }} entry
 * @param {"both"|"original"|"translation"} mode
 * @param {number} fadeMs
 */
function typewrite(el, entry, mode, fadeMs) {
  let rowEl = el.querySelector(".lyric-line-row.is-original");
  let transEl = el.querySelector(".lyric-line-row.is-translation");
  const source = entry.text || "";
  const freq = Number(lastSettings?.floatLyricsTremorFrequency) || 8;
  const baseInterval = Number(lastSettings?.floatLyricsCharInterval) || 0.1;
  const durationMs = `${1000 / freq}ms`;

  let interval = baseInterval;
  if (lastSettings?.floatLyricsAdaptiveSpeed && source.length > 0) {
    const adaptive = ADAPTIVE_TARGET_MS / 1000 / source.length;
    interval = Math.max(0.01, Math.min(baseInterval, adaptive));
  }

  if (mode === "translation") {
    // Only translation is shown; it occupies the original row slot (or the only
    // row). Reveal it char by char, falling back to the original text.
    const target = rowEl || transEl || el.firstElementChild;
    if (transEl && transEl !== target) {
      transEl.hidden = true;
    }
    const text = entry.translation || entry.text || "";
    typewriteRow(target, text, interval, durationMs, () => {});
    return;
  }

  const rowsToType = [];
  if (rowEl) {
    rowsToType.push({ el: rowEl, text: entry.text || "" });
  }
  if (transEl && mode === "both") {
    rowsToType.push({ el: transEl, text: entry.translation || "" });
  }
  // Fallback: if no is-original row exists (e.g. unusual mode), type the first row.
  if (!rowsToType.length && el.firstElementChild) {
    rowsToType.push({ el: el.firstElementChild, text: entry.text || entry.translation || "" });
  }

  // For "both", reveal rows sequentially so they do not interleave.
  let ri = 0;
  function nextRow() {
    if (ri >= rowsToType.length) {
      return;
    }
    const { el: rxEl, text } = rowsToType[ri];
    ri += 1;
    typewriteRow(rxEl, text, interval, durationMs, nextRow);
  }
  nextRow();
}

/** Clears any typewriter interval still attached to a lyric row. */
function clearTypewriterTimers(el) {
  if (!el) {
    return;
  }
  el.querySelectorAll(".lyric-line-row").forEach((row) => {
    if (row.typewriterTimer) {
      clearInterval(row.typewriterTimer);
      row.typewriterTimer = null;
    }
  });
}

/** Appends chars to a row at the given interval, then runs onDone. */
function typewriteRow(row, text, intervalSec, durationMs, onDone) {
  if (!row || !text) {
    onDone?.();
    return;
  }
  if (row.typewriterTimer) {
    clearInterval(row.typewriterTimer);
    row.typewriterTimer = null;
  }
  const source = String(text);
  let index = 0;
  let finished = false;
  row.textContent = "";
  function finish() {
    if (finished) {
      return;
    }
    finished = true;
    if (row.typewriterTimer) {
      clearInterval(row.typewriterTimer);
      row.typewriterTimer = null;
    }
    onDone?.();
  }
  function pushNext() {
    if (index >= source.length) {
      finish();
      return;
    }
    const char = source[index];
    index += 1;
    const span = document.createElement("span");
    span.className = `char font-seg-${window.classifyScript(char)}`;
    span.textContent = char;
    span.style.animationDelay = `${Math.random() * 100}ms`;
    span.style.animationDuration = durationMs;
    row.appendChild(span);
    if (index >= source.length) {
      finish();
    }
  }
  pushNext();
  if (!finished) {
    const timer = setInterval(pushNext, intervalSec * 1000);
    row.typewriterTimer = timer;
  }
}

/** Fades a line out (right-to-left per char) and removes it. */
function fadeOutLine(line) {
  if (!line) {
    return;
  }
  const el = line.el;
  clearTypewriterTimers(el);
  if (line.charTimer) {
    clearTimeout(line.charTimer);
  }
  const chars = el.querySelectorAll(".char");
  const count = chars.length;
  const fadeMs = Number(lastSettings?.floatLyricsFadeMs) || 0;
  const step = count > 1 ? fadeMs / count : 0;
  chars.forEach((char, index) => {
    // index 0 is leftmost; leftmost should have the smallest delay so the line
    // disappears left-to-right.
    char.style.setProperty("--char-delay", `${index * step}ms`);
    char.classList.add("is-exiting");
  });
  el.classList.remove("is-entering");
  el.classList.add("is-leaving");
  setTimeout(() => {
    el.remove();
  }, fadeMs + (count * step) + 60);
}

/**
 * Applies settings to the overlay and re-renders the current window.
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
  minShowMs = Number(settings?.floatLyricsMinShowMs) || 0;
  maxShowMs = Number(settings?.floatLyricsMaxShowMs) || 0;
  safeArea = {
    top: Number(settings?.floatLyricsSafeArea?.top) || 0,
    bottom: Number(settings?.floatLyricsSafeArea?.bottom) || 0,
    left: Number(settings?.floatLyricsSafeArea?.left) || 0,
    right: Number(settings?.floatLyricsSafeArea?.right) || 0,
    center: Number(settings?.floatLyricsSafeArea?.center) || 0
  };
  root.classList.toggle("is-tremor-off", amp <= 0);
  syncMaxEvictTimer();
  // Keep up to MAX_LINES visible: extend the incoming window if fewer lines.
  if (lastPayload) {
    renderLyricWindow(lastPayload);
  }
}

/** Starts/stops the periodic max-display-time eviction timer. */
function syncMaxEvictTimer() {
  if (maxEvictTimer) {
    clearInterval(maxEvictTimer);
    maxEvictTimer = null;
  }
  if (maxShowMs > 0) {
    maxEvictTimer = setInterval(() => {
      evictOverMaxLines();
    }, Math.min(maxShowMs, 500));
  }
}

/** Fades out and removes any line that has exceeded the max display time. */
function evictOverMaxLines() {
  const now = Date.now();
  const stale = activeKeys.filter((key) => {
    const line = linePool.get(key);
    return line && now - line.bornAt >= maxShowMs;
  });
  for (const key of stale) {
    activeKeys = activeKeys.filter((k) => k !== key);
    fadeOutLine(linePool.get(key));
    linePool.delete(key);
  }
}

api.getSettings().then(applySettings);
api.onSettingsChanged(applySettings);
api.onLyric(renderLyricWindow);
