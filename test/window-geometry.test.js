"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  toScreenInt,
  toNativeBounds,
  setWindowFrame
} = require("../electron/window-geometry");

test("toScreenInt rounds finite numbers and rejects NaN", () => {
  assert.equal(toScreenInt(10.6), 11);
  assert.equal(toScreenInt("32"), 32);
  assert.equal(toScreenInt(undefined), null);
  assert.equal(toScreenInt(Number.NaN), null);
  assert.equal(toScreenInt(Number.POSITIVE_INFINITY), null);
  assert.equal(toScreenInt(undefined, 0), 0);
});

test("toNativeBounds requires integer edges and positive size", () => {
  assert.deepEqual(toNativeBounds({ x: 1.2, y: 3.8, width: 320.4, height: 64.1 }), {
    x: 1,
    y: 4,
    width: 320,
    height: 64
  });
  assert.equal(toNativeBounds({ x: 0, y: 0, width: 0, height: 64 }), null);
  assert.equal(toNativeBounds({ x: undefined, y: 0, width: 320, height: 64 }), null);
});

test("setWindowFrame skips destroyed windows and swallows conversion throws", () => {
  assert.equal(setWindowFrame(null, { x: 1, y: 2, width: 3, height: 4 }), false);
  assert.equal(
    setWindowFrame(
      { isDestroyed: () => true, setBounds: () => {} },
      { x: 1, y: 2, width: 3, height: 4 }
    ),
    false
  );

  const calls = [];
  const window = {
    isDestroyed: () => false,
    setBounds: (frame, animate) => {
      calls.push({ frame, animate });
    }
  };
  assert.equal(
    setWindowFrame(window, { x: 10.2, y: 20.6, width: 320, height: 64 }),
    true
  );
  assert.deepEqual(calls[0], {
    frame: { x: 10, y: 21, width: 320, height: 64 },
    animate: false
  });

  const throwing = {
    isDestroyed: () => false,
    setBounds: () => {
      throw new TypeError("Error processing argument at index 0, conversion failure from");
    }
  };
  assert.equal(
    setWindowFrame(throwing, { x: 1, y: 2, width: 3, height: 4 }),
    false
  );
});
