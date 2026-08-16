const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseLrc,
  lyricLineAt,
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
      instrumental: false,
      songId: null,
      showLyric: false
    });
  });
});
