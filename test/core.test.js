const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeSpectrumMagnitudes,
  magnitudesToBands
} = require("../electron/fft");
const { isNeteaseNowPlaying } = require("../electron/netease-identity");
const {
  isPlayerNowPlaying,
  normalizeTargetPlayerId,
  getPlayerById,
  playerExistsOnDisk,
  MUSIC_PLAYERS
} = require("../electron/music-players");
const { COMMANDS } = require("../electron/media-remote");

describe("fft", () => {
  it("rejects non power-of-two lengths", () => {
    assert.throws(() => computeSpectrumMagnitudes(new Float32Array(10)));
  });

  it("returns half-spectrum magnitudes for a sine-like buffer", () => {
    const n = 256;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 8 * i) / n);
    }
    const magnitudes = computeSpectrumMagnitudes(samples);
    assert.equal(magnitudes.length, n / 2);
    const peakIndex = magnitudes.indexOf(Math.max(...magnitudes));
    assert.ok(peakIndex >= 6 && peakIndex <= 10);
  });

  it("maps magnitudes into a fixed band count", () => {
    const magnitudes = new Float32Array(64);
    magnitudes[2] = 1;
    const bands = magnitudesToBands(magnitudes, 8);
    assert.equal(bands.length, 8);
    assert.ok(bands.some((v) => v > 0));
  });

  it("adaptively normalizes quiet and loud frames", () => {
    const { createBandNormalizer } = require("../electron/fft");
    const normalize = createBandNormalizer();
    const quiet = normalize([0.01, 0.008, 0.012, 0.009]);
    const loud = normalize([0.4, 0.35, 0.5, 0.3]);
    assert.equal(quiet.length, 4);
    assert.ok(Math.max(...quiet) > 0.5);
    assert.ok(Math.max(...loud) <= 1);
    assert.ok(Math.max(...loud) > 0.5);
  });
});

describe("netease identity", () => {
  it("matches known NetEase bundle ids", () => {
    assert.equal(
      isNeteaseNowPlaying({ bundleIdentifier: "com.netease.163music" }),
      true
    );
  });

  it("matches Chinese display name", () => {
    assert.equal(
      isNeteaseNowPlaying({ displayName: "网易云音乐" }),
      true
    );
  });

  it("rejects unrelated players", () => {
    assert.equal(
      isNeteaseNowPlaying({
        bundleIdentifier: "com.spotify.client",
        displayName: "Spotify"
      }),
      false
    );
  });
});

describe("music players", () => {
  it("normalizes unknown target ids to netease", () => {
    assert.equal(normalizeTargetPlayerId("nope"), "netease");
    assert.equal(normalizeTargetPlayerId("apple-music"), "apple-music");
  });

  it("matches Apple Music and QQ Music bundle ids", () => {
    assert.equal(
      isPlayerNowPlaying(
        { bundleIdentifier: "com.apple.Music" },
        "apple-music"
      ),
      true
    );
    assert.equal(
      isPlayerNowPlaying(
        { bundleIdentifier: "com.tencent.QQMusicMac" },
        "qq-music"
      ),
      true
    );
    assert.equal(
      isPlayerNowPlaying(
        { bundleIdentifier: "com.apple.Music" },
        "netease"
      ),
      false
    );
  });

  it("exposes disk-detectable catalog entries", () => {
    assert.ok(MUSIC_PLAYERS.length >= 3);
    assert.ok(getPlayerById("spotify"));
    assert.equal(typeof playerExistsOnDisk(getPlayerById("apple-music")), "boolean");
  });
});

describe("media commands", () => {
  it("exposes expected MediaRemote command ids", () => {
    assert.equal(COMMANDS.toggle, 2);
    assert.equal(COMMANDS.next, 4);
    assert.equal(COMMANDS.previous, 5);
    assert.equal(COMMANDS.advanceShuffle, 6);
    assert.equal(COMMANDS.advanceRepeat, 7);
  });
});
