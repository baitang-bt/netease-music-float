const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeTitleFontIds,
  resolveTitleFontStacks,
  resolveTitleFontPreviewFamily
} = require("../src/title-fonts");
const { segmentTextByScript } = require("../src/title-font-apply");

describe("title font locales", () => {
  it("migrates legacy titleFontId into all locale slots", () => {
    assert.deepEqual(
      normalizeTitleFontIds({ titleFontId: "zapfino" }, []),
      { zh: "zapfino", en: "zapfino", ja: "zapfino" }
    );
  });

  it("keeps independent locale font ids", () => {
    assert.deepEqual(
      normalizeTitleFontIds(
        {
          titleFontIdZh: "hei",
          titleFontIdEn: "zapfino",
          titleFontIdJa: "kaku"
        },
        []
      ),
      { zh: "hei", en: "zapfino", ja: "kaku" }
    );
  });

  it("resolves per-locale font stacks", () => {
    const stacks = resolveTitleFontStacks(
      {
        titleFontIdZh: "hei",
        titleFontIdEn: "zapfino",
        titleFontIdJa: "kaku"
      },
      []
    );
    assert.match(stacks.zh, /Heiti SC/);
    assert.match(stacks.en, /Zapfino/);
    assert.match(stacks.ja, /Hiragino Kaku Gothic ProN/);
  });

  it("uses the primary family for preview labels", () => {
    assert.equal(resolveTitleFontPreviewFamily("zapfino", []), '"Zapfino"');
  });
});

describe("title font apply", () => {
  it("segments mixed zh / en / ja preview text", () => {
    const segments = segmentTextByScript("网易云 · NetEase · こんにちは");
    assert.deepEqual(
      segments.map((segment) => segment.script),
      ["zh", "en", "ja"]
    );
    assert.equal(segments[0].text, "网易云 · ");
    assert.equal(segments[1].text, "NetEase · ");
    assert.equal(segments[2].text, "こんにちは");
  });
});
