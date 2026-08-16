const api = window.neteaseFloat;
const appRoot = document.querySelector("#app");
const spectrum = window.createSpectrumRenderer(
  document.querySelector("#spectrum")
);

const els = {
  title: document.querySelector("#title"),
  artist: document.querySelector("#artist"),
  artwork: document.querySelector("#artwork"),
  artworkFallback: document.querySelector("#artwork-fallback"),
  statusPill: document.querySelector("#status-pill"),
  audioHint: document.querySelector("#audio-hint"),
  iconToggle: document.querySelector("#icon-toggle"),
  iconMode: document.querySelector("#icon-mode"),
  btnMode: document.querySelector("#btn-mode"),
  controls: document.querySelectorAll(".controls button")
};

let dragActive = false;
let dragMoved = false;
let dragStarted = false;
let dragStartX = 0;
let dragStartY = 0;
let expanded = false;
let collapseTimer = null;
/** Optimistic play state until the next MediaRemote snapshot arrives. */
let optimisticPlaying = null;
/** Last non-lyric title text for the collapsed/expanded title slot. */
let trackTitleText = "未在播放";
/** Whether the title slot is currently showing a lyric line. */
let showingLyric = false;

const DRAG_THRESHOLD_PX = 5;

/**
 * Expands or collapses the float chrome and native window height.
 * @param {boolean} nextExpanded
 */
function setExpanded(nextExpanded) {
  const shouldExpand = Boolean(nextExpanded);
  if (expanded === shouldExpand) {
    return;
  }
  expanded = shouldExpand;
  appRoot.classList.toggle("is-collapsed", !expanded);
  api.setExpanded(expanded);
}

/** Cancels a pending leave-to-collapse timer. */
function cancelCollapse() {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

/** Schedules collapse shortly after the pointer leaves the float. */
function scheduleCollapse() {
  cancelCollapse();
  collapseTimer = setTimeout(() => {
    if (!dragActive) {
      setExpanded(false);
    }
  }, 160);
}

/**
 * Starts collapsed; left-click expands, pointer leave collapses.
 */
function setupClickExpand() {
  appRoot.classList.add("is-collapsed");
  expanded = false;
  api.setExpanded(false);

  appRoot.addEventListener("pointerenter", () => {
    cancelCollapse();
  });
  appRoot.addEventListener("pointerleave", () => {
    if (!dragActive) {
      scheduleCollapse();
    }
  });
}

/**
 * Wires left-drag to move the float, and left-click (no drag) to toggle expand.
 */
function setupDrag() {
  /**
   * Begins a potential drag / click on non-button areas (primary button only).
   * @param {PointerEvent} event
   */
  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest("button")) {
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
   * Moves the window after the pointer travels past the drag threshold.
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
   * Ends a drag, or expands on left-click when collapsed (leave collapses).
   * @param {PointerEvent} event
   */
  function onPointerUp(event) {
    if (!dragActive) {
      return;
    }
    dragActive = false;
    if (dragStarted) {
      api.dragEnd();
    } else if (event.button === 0 && !expanded) {
      cancelCollapse();
      setExpanded(true);
    }
    dragMoved = false;
    dragStarted = false;
    if (expanded && !appRoot.matches(":hover")) {
      scheduleCollapse();
    }
  }

  appRoot.addEventListener("pointerdown", onPointerDown);
  appRoot.addEventListener("pointermove", onPointerMove);
  appRoot.addEventListener("pointerup", onPointerUp);
  appRoot.addEventListener("pointercancel", onPointerUp);
}

/**
 * Applies a Now Playing snapshot to the float UI.
 * @param {object} track
 */
function renderTrack(track) {
  const controlsEnabled = track?.isTarget === true;
  els.controls.forEach((button) => {
    button.disabled = !controlsEnabled;
  });
  const modeButton = document.querySelector("#btn-mode");
  if (modeButton) {
    // NetEase-only: Accessibility-driven playback mode cycle.
    modeButton.hidden = track?.isNetease !== true;
  }

  const targetLabel = track?.targetPlayerLabel || "所选音乐软件";

  if (!track || track.status === "empty") {
    trackTitleText = "未在播放";
    showingLyric = false;
    els.title.textContent = trackTitleText;
    els.title.classList.remove("is-lyric");
    els.artist.textContent = `请先在${targetLabel}播放歌曲`;
    els.statusPill.textContent = "空闲";
    els.statusPill.className = "pill";
    clearArtwork();
    setToggleIcon(false);
    return;
  }

  if (track.status === "error") {
    trackTitleText = "媒体状态不可用";
    showingLyric = false;
    els.title.textContent = trackTitleText;
    els.title.classList.remove("is-lyric");
    els.artist.textContent = track.error || "MediaRemote 读取失败";
    els.statusPill.textContent = "错误";
    els.statusPill.className = "pill is-warn";
    clearArtwork();
    return;
  }

  if (!track.isTarget) {
    trackTitleText = track.title || "其它播放器";
    showingLyric = false;
    els.title.textContent = trackTitleText;
    els.title.classList.remove("is-lyric");
    els.artist.textContent = `当前 Now Playing 不是${targetLabel}`;
    els.statusPill.textContent = "未匹配";
    els.statusPill.className = "pill is-warn";
    setArtwork(track.artworkDataUrl);
    return;
  }

  trackTitleText = track.title || "未知曲目";
  if (!showingLyric) {
    els.title.textContent = trackTitleText;
    els.title.classList.remove("is-lyric");
  }
  els.artist.textContent = [track.artist, track.album].filter(Boolean).join(" · ");
  const playing =
    optimisticPlaying === null ? Boolean(track.playing) : optimisticPlaying;
  if (optimisticPlaying !== null && Boolean(track.playing) === optimisticPlaying) {
    optimisticPlaying = null;
  }
  els.statusPill.textContent = playing ? "播放中" : "已暂停";
  els.statusPill.className = playing ? "pill is-live" : "pill";
  setToggleIcon(playing);
  setArtwork(track.artworkDataUrl);
  renderPlaybackMode(track);
}

/**
 * Updates the combined playback-mode button from NetEase mode / MR fallbacks.
 * @param {{
 *   playbackMode?: string|null,
 *   repeatMode?: number|null,
 *   shuffleMode?: number|null
 * }} track
 */
function renderPlaybackMode(track) {
  let mode = track.playbackMode || null;
  if (!mode) {
    const repeat = Number(track.repeatMode) || 0;
    const shuffle = Number(track.shuffleMode) || 0;
    const shuffleOn = shuffle === 2 || shuffle === 3;
    if (shuffleOn) {
      mode = "shuffle";
    } else if (repeat === 2) {
      mode = "one";
    } else if (repeat === 3) {
      mode = "all";
    } else {
      mode = "sequential";
    }
  }

  const meta = {
    sequential: { icon: "repeat", title: "播放模式：顺序播放", active: false },
    all: { icon: "repeat", title: "播放模式：列表循环", active: true },
    one: { icon: "repeat_one", title: "播放模式：单曲循环", active: true },
    shuffle: { icon: "shuffle", title: "播放模式：随机播放", active: true }
  };
  const view = meta[mode] || meta.sequential;

  els.btnMode.dataset.mode = mode;
  els.btnMode.title = view.title;
  els.btnMode.classList.toggle("is-active", view.active);
  els.iconMode.textContent = view.icon;
  els.iconMode.classList.toggle("filled", view.active);
}

/**
 * Optimistically advances the mode button to the next cycle step.
 * @returns {string} next mode id
 */
function optimisticAdvanceMode() {
  const order = ["sequential", "all", "one", "shuffle"];
  const current = els.btnMode.dataset.mode || "sequential";
  const next = order[(order.indexOf(current) + 1) % order.length];
  renderPlaybackMode({ playbackMode: next });
  return next;
}

/**
 * Switches the play/pause Material icon.
 * @param {boolean} playing
 */
function setToggleIcon(playing) {
  els.iconToggle.textContent = playing ? "pause" : "play_arrow";
  els.iconToggle.classList.toggle("filled", true);
}

/** Shows placeholder artwork glyph. */
function clearArtwork() {
  els.artwork.hidden = true;
  els.artwork.removeAttribute("src");
  els.artworkFallback.hidden = false;
}

/**
 * Shows cover art from a data URL when available.
 * @param {string|null} dataUrl
 */
function setArtwork(dataUrl) {
  if (!dataUrl) {
    clearArtwork();
    return;
  }
  els.artwork.src = dataUrl;
  els.artwork.hidden = false;
  els.artworkFallback.hidden = true;
}

/**
 * Shows or clears the system-audio permission hint.
 * @param {{ muted?: boolean, error?: string|null }} payload
 */
function renderAudioHint(payload) {
  if (payload?.error) {
    els.audioHint.hidden = false;
    els.audioHint.textContent =
      "需要「仅系统音频录制」权限才能显示真实声浪。系统设置 → 隐私与安全性 → 屏幕与系统音频录制。";
    return;
  }
  els.audioHint.hidden = true;
  els.audioHint.textContent = "";
}

/** Binds control buttons to main-process media commands. */
function setupControls() {
  // Prevent macOS focus ring / “selected” chrome on click.
  document.querySelectorAll("button").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  });

  document.querySelector("#btn-prev").addEventListener("click", () => {
    api.previousTrack();
  });
  document.querySelector("#btn-toggle").addEventListener("click", () => {
    const currentlyPlaying = els.iconToggle.textContent === "pause";
    optimisticPlaying = !currentlyPlaying;
    setToggleIcon(optimisticPlaying);
    els.statusPill.textContent = optimisticPlaying ? "播放中" : "已暂停";
    els.statusPill.className = optimisticPlaying ? "pill is-live" : "pill";
    api.togglePlayPause();
  });
  document.querySelector("#btn-next").addEventListener("click", () => {
    api.nextTrack();
  });
  document.querySelector("#btn-mode").addEventListener("click", async () => {
    optimisticAdvanceMode();
    const result = await api.advancePlaybackMode();
    if (result?.mode) {
      renderPlaybackMode({ playbackMode: result.mode });
    }
    if (result && result.ok === false && result.error) {
      els.audioHint.hidden = false;
      els.audioHint.textContent = result.accessibility === false
        ? "切换播放模式需要「辅助功能」权限：系统设置 → 隐私与安全性 → 辅助功能，勾选 NeteaseFloat。"
        : `播放模式未同步到网易云：${result.error}`;
    }
  });
  document.querySelector("#btn-settings").addEventListener("click", () => {
    setExpanded(true);
    api.toggleSettings();
  });

  const open = () => api.openPlayer();
  document.querySelector("#open-app").addEventListener("click", open);
  document.querySelector("#artwork-btn").addEventListener("click", open);
}

setupClickExpand();
setupDrag();
setupControls();
/**
 * Shows a timed lyric in the title slot, or restores the song title.
 * @param {{ line?: string, showLyric?: boolean, instrumental?: boolean }} payload
 */
function renderLyric(payload) {
  if (payload?.showLyric && payload.line) {
    showingLyric = true;
    els.title.textContent = payload.line;
    els.title.classList.add("is-lyric");
    return;
  }
  showingLyric = false;
  els.title.textContent = trackTitleText;
  els.title.classList.remove("is-lyric");
}

api.onTrack(renderTrack);
api.onLyric(renderLyric);
api.onSpectrum((payload) => {
  spectrum.setBands(payload?.bands || []);
  renderAudioHint(payload);
});
api.onModeError?.((payload) => {
  if (!payload?.error) {
    return;
  }
  els.audioHint.hidden = false;
  els.audioHint.textContent =
    payload.accessibility === false
      ? "开机同步播放模式需要「辅助功能」权限。"
      : payload.error;
});
api.getTrack().then(renderTrack);

/**
 * Applies window + spectrum colors, transparent mode, and title typography.
 * @param {{
 *   windowColor?: string,
 *   spectrumColor?: string,
 *   transparentFloat?: boolean,
 *   titleFontId?: string,
 *   titleFontSize?: number
 * }} settings
 */
function applyTheme(settings) {
  const windowColor =
    window.normalizeHexColor(settings?.windowColor) || "#24242a";
  const spectrumColor =
    window.normalizeHexColor(settings?.spectrumColor) || "#e60026";
  const transparent = Boolean(settings?.transparentFloat);
  const contrast = window.contrastTheme(windowColor);
  const visibleSpectrumColor = transparent
    ? spectrumColor
    : window.ensureContrastHex(spectrumColor, windowColor, 2.1);
  const fontId = window.normalizeTitleFontId(settings?.titleFontId);
  const fontSize = window.clampTitleFontSize(settings?.titleFontSize);
  const root = document.documentElement;
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
  root.style.setProperty("--line", contrast.line);
  root.style.setProperty("--surface", contrast.surface);
  root.style.setProperty("--surface-hover", contrast.surfaceHover);
  root.style.setProperty("--contrast-shadow", contrast.shadow);
  root.style.setProperty(
    "--accent-text",
    window.contrastTextColor(visibleSpectrumColor)
  );
  root.style.setProperty("--title-font", window.resolveTitleFontStack(fontId));
  root.style.setProperty("--title-font-size", `${fontSize}px`);
  appRoot.classList.toggle("is-transparent", transparent);
  appRoot.classList.toggle("is-light-theme", contrast.isLight);
  spectrum.setColors({
    bottom: window.hexToRgba(
      visibleSpectrumColor,
      transparent ? 0.4 : 0.36
    ),
    top: window.hexToRgba(
      contrast.isLight && !transparent
        ? visibleSpectrumColor
        : window.lightenHex(visibleSpectrumColor, 0.48),
      transparent ? 0.88 : 0.78
    )
  });
}

api.getSettings().then(applyTheme);
api.onSettingsChanged(applyTheme);
