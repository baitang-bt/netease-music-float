/**
 * Draws real-time spectrum bars onto a canvas.
 * Targets update from IPC; paint runs on rAF so motion stays display-synced.
 * Canvas bitmap tracks CSS size so bars can fill the layout box.
 * @param {HTMLCanvasElement} canvas
 */
function createSpectrumRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const bandCount = 32;
  let target = new Array(bandCount).fill(0);
  let display = new Array(bandCount).fill(0);
  let rafId = 0;
  let colorBottom = "rgba(230, 0, 38, 0.28)";
  let colorTop = "rgba(255, 180, 190, 0.78)";

  /**
   * Matches the drawing buffer to the visible CSS box (HiDPI-aware).
   * @returns {boolean} True when the buffer size changed.
   */
  function syncCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) {
      return false;
    }
    canvas.width = width;
    canvas.height = height;
    return true;
  }

  /** Clears and paints the current display band heights. */
  function draw() {
    syncCanvasSize();
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const gap = Math.max(1, Math.round(width / 220));
    const barWidth = (width - gap * (bandCount - 1)) / bandCount;
    for (let i = 0; i < bandCount; i += 1) {
      const value = Math.max(0.02, Math.min(1, display[i] || 0));
      const barHeight = Math.max(2, value * (height - 2));
      const x = i * (barWidth + gap);
      const y = height - barHeight;
      // Keep bars slightly translucent so the title behind stays readable.
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, colorBottom);
      gradient.addColorStop(1, colorTop);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, Math.max(1, barWidth), barHeight);
    }
  }

  /**
   * Eases display bands toward targets and redraws once per animation frame.
   */
  function tick() {
    rafId = 0;
    let settling = false;
    for (let i = 0; i < bandCount; i += 1) {
      const goal = target[i] || 0;
      if (goal > display[i]) {
        // Rise with the beat; no lag on attacks.
        display[i] = goal;
      } else {
        display[i] += (goal - display[i]) * 0.42;
      }
      if (Math.abs(display[i] - goal) > 0.004) {
        settling = true;
      }
    }
    draw();
    if (settling) {
      rafId = requestAnimationFrame(tick);
    }
  }

  /** Ensures a paint loop is running after target bands change. */
  function ensureTick() {
    if (!rafId) {
      rafId = requestAnimationFrame(tick);
    }
  }

  /**
   * Updates target band levels; painting is deferred to the next animation frame.
   * @param {number[]} nextBands
   */
  function setBands(nextBands) {
    if (!Array.isArray(nextBands) || !nextBands.length) {
      for (let i = 0; i < bandCount; i += 1) {
        target[i] *= 0.82;
      }
    } else {
      const n = Math.min(bandCount, nextBands.length);
      for (let i = 0; i < n; i += 1) {
        target[i] = nextBands[i] || 0;
      }
      for (let i = n; i < bandCount; i += 1) {
        target[i] = 0;
      }
    }
    ensureTick();
  }

  /**
   * Sets spectrum gradient colors (bottom = quiet base, top = peaks).
   * @param {{ bottom?: string, top?: string }} colors
   */
  function setColors(colors) {
    if (colors?.bottom) {
      colorBottom = colors.bottom;
    }
    if (colors?.top) {
      colorTop = colors.top;
    }
    draw();
  }

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (syncCanvasSize()) {
        draw();
      }
    });
    observer.observe(canvas);
  }

  draw();
  return { setBands, setColors, draw };
}

window.createSpectrumRenderer = createSpectrumRenderer;
