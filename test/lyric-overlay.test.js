"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { shouldSplitLyricOverlay } = require("../electron/lyric-overlay");

describe("lyric overlay split", () => {
  it("splits only when the collapsed float is transparent", () => {
    assert.equal(
      shouldSplitLyricOverlay({ transparentFloat: true }, false),
      true
    );
    assert.equal(
      shouldSplitLyricOverlay({ transparentFloat: true }, true),
      false
    );
    assert.equal(
      shouldSplitLyricOverlay({ transparentFloat: false }, false),
      false
    );
  });
});
