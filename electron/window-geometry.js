"use strict";

/**
 * Converts a value to a finite integer for Electron native window APIs.
 * gin ConvertFromV8 rejects NaN / Infinity / non-numbers with
 * "Error processing argument at index 0, conversion failure from".
 * @param {unknown} value
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
function toScreenInt(value, fallback = null) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return n;
}

/**
 * Builds integer window bounds, or null when any edge is not a finite number.
 * @param {{ x?: unknown, y?: unknown, width?: unknown, height?: unknown }|null|undefined} bounds
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
function toNativeBounds(bounds) {
  const x = toScreenInt(bounds?.x);
  const y = toScreenInt(bounds?.y);
  const width = toScreenInt(bounds?.width);
  const height = toScreenInt(bounds?.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Applies integer bounds via setBounds so panel windows never receive NaN/floats.
 * Swallows Electron conversion TypeErrors so IPC handlers stay uncaught-exception-free.
 * @param {import("electron").BrowserWindow|null|undefined} browserWindow
 * @param {{ x?: unknown, y?: unknown, width?: unknown, height?: unknown }} bounds
 * @param {boolean} [animate=false]
 * @returns {boolean}
 */
function setWindowFrame(browserWindow, bounds, animate = false) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return false;
  }
  const frame = toNativeBounds(bounds);
  if (!frame) {
    return false;
  }
  try {
    browserWindow.setBounds(frame, Boolean(animate));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  toScreenInt,
  toNativeBounds,
  setWindowFrame
};
