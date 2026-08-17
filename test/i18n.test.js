const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveLocale,
  normalizeLocaleSetting,
  setActiveLocale,
  t,
  MESSAGES
} = require("../src/i18n");

describe("i18n", () => {
  it("normalizes locale preferences", () => {
    assert.equal(normalizeLocaleSetting("en"), "en");
    assert.equal(normalizeLocaleSetting("system"), "system");
    assert.equal(normalizeLocaleSetting("nope"), "system");
  });

  it("resolves system locale from OS tags", () => {
    assert.equal(resolveLocale("system", "ja-JP"), "ja");
    assert.equal(resolveLocale("system", "en-US"), "en");
    assert.equal(resolveLocale("system", "zh-Hans-CN"), "zh-CN");
    assert.equal(resolveLocale("en", "ja-JP"), "en");
  });

  it("substitutes template variables", () => {
    setActiveLocale("en");
    assert.equal(
      t("float.playIn", { name: "Spotify" }),
      "Play a track in Spotify first"
    );
  });

  it("keeps the same keys across built-in locales", () => {
    const zhKeys = Object.keys(MESSAGES["zh-CN"]).sort();
    assert.deepEqual(Object.keys(MESSAGES.en).sort(), zhKeys);
    assert.deepEqual(Object.keys(MESSAGES.ja).sort(), zhKeys);
  });
});
