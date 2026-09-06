const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseLrc,
  lyricLineAt,
  lyricEntryAt,
  lyricWindowAt,
  attachTranslations,
  isMetaLyricLine,
  createLyricsController
} = require("../electron/netease-lyrics");

describe("lyrics", () => {
  it("parses timed LRC lines", () => {
    const lines = parseLrc(
      "[00:00.00]作词 : Test\n[00:12.50]第一句歌词\n[00:20.00]第二句歌词\n"
    );
    assert.equal(lines.length, 3);
    assert.ok(Math.abs(lines[1].time - 12.5) < 0.001);
    assert.equal(lines[1].text, "第一句歌词");
  });

  it("parses NetEase colon-hundredths timestamps", () => {
    const lines = parseLrc(
      "[00:11:48]Ah, c'est une belle époque\n[01:13:23]さあ、腕振って\n"
    );
    assert.equal(lines.length, 2);
    assert.ok(Math.abs(lines[0].time - 11.48) < 0.001);
    assert.ok(Math.abs(lines[1].time - 73.23) < 0.001);
    assert.equal(lines[0].text, "Ah, c'est une belle époque");
  });

  it("pairs translations when both LRCs use colon timestamps", () => {
    const lines = parseLrc("[00:11:48]Hello\n[00:15:05]World\n");
    const translated = parseLrc("[00:11:48]你好\n[00:15:05]世界\n");
    const merged = attachTranslations(lines, translated);
    assert.equal(merged[0].translation, "你好");
    assert.equal(merged[1].translation, "世界");
  });

  it("picks the active line by elapsed time", () => {
    const lines = parseLrc("[00:00.00]A\n[00:10.00]B\n[00:20.00]C\n");
    assert.equal(lyricLineAt(lines, 0), "A");
    assert.equal(lyricLineAt(lines, 10), "B");
    assert.equal(lyricLineAt(lines, 19.9), "B");
    assert.equal(lyricLineAt(lines, 20), "C");
  });

  it("detects credit-only lyric lines as meta", () => {
    assert.equal(isMetaLyricLine("作词 : 某人"), true);
    assert.equal(isMetaLyricLine("今天我 寒夜里看雪飘过"), false);
  });

  it("pairs translated lines with the original by timestamp", () => {
    const lines = parseLrc("[00:10.00]Hello world\n[00:20.00]Goodbye\n");
    const translated = parseLrc("[00:10.05]你好世界\n[00:20.00]再见\n");
    const merged = attachTranslations(lines, translated);
    assert.equal(merged[0].translation, "你好世界");
    assert.equal(merged[1].translation, "再见");
    assert.equal(lyricEntryAt(merged, 12).translation, "你好世界");
  });

  it("leaves translation empty when timestamps do not line up", () => {
    const lines = parseLrc("[00:10.00]Hello\n");
    const translated = parseLrc("[00:40.00]毫无关系\n");
    assert.equal(attachTranslations(lines, translated)[0].translation, "");
    assert.equal(attachTranslations(lines, [])[0].translation, "");
  });

  it("resyncs the current line for a renderer that just loaded", () => {
    const emitted = [];
    const controller = createLyricsController({
      onLyric: (payload) => emitted.push(payload)
    });
    controller.resync(null);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].showLyric, false);
    assert.deepEqual(controller.getLastPayload(), {
      line: "",
      translation: "",
      lines: [],
      instrumental: false,
      songId: null,
      showLyric: false
    });
  });

  it("returns current line plus neighbors with isCurrent flag", () => {
    const lines = parseLrc("[00:00.00]A\n[00:10.00]B\n[00:20.00]C\n[00:30.00]D\n");
    const windowLines = lyricWindowAt(lines, 15, 1);
    assert.deepEqual(
      windowLines.map((l) => [l.text, l.isCurrent]),
      [
        ["A", false],
        ["B", true],
        ["C", false]
      ]
    );
  });

  it("clamps the window at the boundaries", () => {
    const lines = parseLrc("[00:00.00]A\n[00:10.00]B\n");
    const atStart = lyricWindowAt(lines, 1, 1);
    assert.deepEqual(
      atStart.map((l) => [l.text, l.isCurrent]),
      [
        ["A", true],
        ["B", false]
      ]
    );
    const atEnd = lyricWindowAt(lines, 40, 1);
    assert.deepEqual(
      atEnd.map((l) => [l.text, l.isCurrent]),
      [
        ["A", false],
        ["B", true]
      ]
    );
  });

  it("returns an empty window before the first lyric timestamp", () => {
    const lines = parseLrc("[00:05.00]A\n[00:10.00]B\n");
    assert.deepEqual(lyricWindowAt(lines, 0, 1), []);
    assert.deepEqual(lyricWindowAt(lines, 4.9, 1), []);
    const atFirst = lyricWindowAt(lines, 5, 1);
    assert.equal(atFirst.find((l) => l.isCurrent).text, "A");
  });

  it("carries translation into window lines", () => {
    const lines = [
      { time: 0, text: "Hello", translation: "你好" },
      { time: 10, text: "World", translation: "世界" }
    ];
    const windowLines = lyricWindowAt(lines, 11, 0);
    assert.equal(windowLines.length, 1);
    assert.equal(windowLines[0].text, "World");
    assert.equal(windowLines[0].translation, "世界");
    assert.equal(windowLines[0].isCurrent, true);
  });
});
