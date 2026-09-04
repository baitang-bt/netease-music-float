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
const {
  createWindowsMediaController
} = require("../electron/windows-media-controller");
const {
  buildTrackFingerprint,
  isElapsedRegression
} = require("../electron/track-fingerprint");
const {
  validateFloatSize,
  validateSettings,
  normalizeFloatLyricsMode,
  clampTremorAmplitude,
  clampTremorFrequency,
  clampFloatLyricsFontSize,
  clampFloatLyricsFadeMs,
  clampFloatLyricsCharInterval,
  clampFloatLyricsMinShowMs,
  clampFloatLyricsMaxShowMs,
  MAX_TREMOR_AMPLITUDE,
  MAX_TREMOR_FREQUENCY,
  MAX_FLOAT_LYRICS_FONT_SIZE,
  MAX_FLOAT_LYRICS_FADE_MS,
  MAX_FLOAT_LYRICS_CHAR_INTERVAL,
  MAX_FLOAT_LYRICS_MIN_SHOW_MS,
  MAX_FLOAT_LYRICS_MAX_SHOW_MS
} = require("../electron/state-store");

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

  it("matches Windows AUMID-only Now Playing metadata", () => {
    assert.equal(
      isPlayerNowPlaying({ appName: "CloudMusic.exe" }, "netease"),
      true
    );
    assert.equal(
      isPlayerNowPlaying({ appName: "Spotify.exe" }, "spotify"),
      true
    );
    assert.equal(
      isPlayerNowPlaying(
        { displayName: "Other", appName: "CloudMusic.exe" },
        "netease"
      ),
      true
    );
  });

  it("matches Windows Start-menu Name and AppID separately", () => {
    const spotify = getPlayerById("spotify");
    const apple = getPlayerById("apple-music");
    assert.ok(spotify.namePattern.test("Spotify"));
    assert.equal(spotify.namePattern.test("Spotify Spotify.exe"), false);
    assert.ok(spotify.namePattern.test("Spotify.exe"));
    assert.ok(apple.namePattern.test("Apple Music"));
    assert.equal(apple.namePattern.test("Apple Music Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), false);
  });

  it("matches parent application bundle ids for helper processes", () => {
    assert.equal(
      isPlayerNowPlaying(
        {
          bundleIdentifier: "com.example.helper",
          parentApplicationBundleIdentifier: "com.netease.163music"
        },
        "netease"
      ),
      true
    );
  });

  it("matches NetEase Music display name with a space", () => {
    assert.equal(
      isPlayerNowPlaying({ displayName: "NetEase Music" }, "netease"),
      true
    );
  });
});

describe("track fingerprint", () => {
  it("distinguishes tracks that share title and artist", () => {
    const base = {
      status: "matched",
      playing: true,
      title: "Song",
      artist: "Artist",
      targetPlayerId: "netease",
      repeatMode: null,
      shuffleMode: null,
      artworkDataUrl: null
    };
    const a = buildTrackFingerprint({ ...base, album: "Album A" });
    const b = buildTrackFingerprint({ ...base, album: "Album B" });
    assert.notEqual(a, b);
  });

  it("detects elapsed regression for same metadata", () => {
    const identity = {
      status: "matched",
      title: "Song",
      artist: "Artist",
      album: "Album"
    };
    assert.equal(
      isElapsedRegression(
        { ...identity, elapsed: 120 },
        { ...identity, elapsed: 0.5 }
      ),
      true
    );
    assert.equal(
      isElapsedRegression(
        { ...identity, elapsed: 30 },
        { ...identity, elapsed: 28 }
      ),
      false
    );
  });
});

describe("music player process matching", () => {
  it("matches only the player's main MacOS executable for AudioTee taps", () => {
    const {
      commandMatchesPlayer,
      getPlayerById
    } = require("../electron/music-players");
    const netease = getPlayerById("netease");
    assert.equal(
      commandMatchesPlayer(
        "/Applications/NeteaseMusic.app/Contents/MacOS/NeteaseMusic",
        netease
      ),
      true
    );
    assert.equal(
      commandMatchesPlayer(
        "/Applications/NeteaseMusic.app/Contents/Frameworks/NeteaseMusic Helper.app/Contents/MacOS/NeteaseMusic Helper",
        netease
      ),
      false
    );
    assert.equal(
      commandMatchesPlayer(
        "/Applications/NeteaseMusic.app/Contents/Frameworks/NeteaseMusic Helper (GPU).app/Contents/MacOS/NeteaseMusic Helper (GPU)",
        netease
      ),
      false
    );
    assert.equal(
      commandMatchesPlayer(
        "/Applications/Spotify.app/Contents/MacOS/Spotify",
        netease
      ),
      false
    );
    assert.equal(
      commandMatchesPlayer(
        "/System/Applications/Music.app/Contents/MacOS/Music",
        getPlayerById("apple-music")
      ),
      true
    );
  });

  it("exposes disk-detectable catalog entries", () => {
    assert.ok(MUSIC_PLAYERS.length >= 3);
    assert.ok(getPlayerById("spotify"));
    assert.equal(typeof playerExistsOnDisk(getPlayerById("apple-music")), "boolean");
  });
});

describe("title fonts", () => {
  const {
    TITLE_FONT_PRESETS,
    normalizeCustomFonts,
    normalizeTitleFontId,
    resolveTitleFontStack,
    buildCustomFontFaceCss,
    clampTitleFontSize,
    MAX_TITLE_FONT_SIZE
  } = require("../src/title-fonts");

  it("ships artistic presets beyond the original six", () => {
    assert.ok(Object.keys(TITLE_FONT_PRESETS).length >= 16);
    assert.ok(TITLE_FONT_PRESETS.xingkai);
    assert.ok(TITLE_FONT_PRESETS.zapfino);
  });

  it("accepts imported fonts when resolving stacks and ids", () => {
    const custom = normalizeCustomFonts([
      {
        id: "cf_ab12cd34ef56",
        label: "Demo",
        family: "nf-cf_ab12cd34ef56",
        fileName: "cf_ab12cd34ef56.ttf"
      }
    ]);
    assert.equal(custom.length, 1);
    assert.equal(normalizeTitleFontId("cf_ab12cd34ef56", custom), "cf_ab12cd34ef56");
    assert.match(
      resolveTitleFontStack("cf_ab12cd34ef56", custom),
      /^"nf-cf_ab12cd34ef56"/
    );
    assert.match(
      buildCustomFontFaceCss(custom),
      /nf-font:\/\/fonts\/cf_ab12cd34ef56\.ttf/
    );
  });

  it("clamps title size up to the artistic-font maximum", () => {
    assert.equal(clampTitleFontSize(99), MAX_TITLE_FONT_SIZE);
    assert.equal(clampTitleFontSize(8), 10);
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

describe("Windows media controller", () => {
  it("normalizes a selected GSMTC session into the common track shape", async () => {
    const updates = [];
    const controller = createWindowsMediaController({
      getTargetPlayerId: () => "netease",
      onUpdate: (track) => updates.push(track),
      sessionsApi: {
        getAllSessions: async () => [
          {
            sourceAppUserModelId: "CloudMusic.exe",
            sourceAppDisplayName: "网易云音乐",
            title: "测试歌曲",
            artist: "测试歌手",
            albumTitle: "测试专辑",
            playbackStatus: "playing",
            timeline: { positionMs: 12000, durationMs: 180000 },
            thumbnail: "data:image/png;base64,AA=="
          }
        ]
      }
    });

    const track = await controller.fetchNowPlaying();
    assert.equal(track.status, "matched");
    assert.equal(track.isTarget, true);
    assert.equal(track.playing, true);
    assert.equal(track.elapsed, 12);
    assert.equal(track.duration, 180);
    assert.equal(updates.length, 1);
  });
});

describe("float size", () => {
  it("accepts stretched float dimensions within the new limits", () => {
    assert.deepEqual(
      validateFloatSize({ width: 700, expandedHeight: 600 }),
      { width: 700, expandedHeight: 600 }
    );
  });

  it("falls back when values are outside the supported range", () => {
    assert.deepEqual(
      validateFloatSize({ width: 900, expandedHeight: 50 }),
      { width: 320, expandedHeight: 172 }
    );
  });
});

describe("float lyrics settings", () => {
  it("defaults to disabled with translation+original both shown", () => {
    const settings = validateSettings({});
    assert.equal(settings.floatLyricsEnabled, false);
    assert.equal(settings.floatLyricsMode, "both");
    assert.equal(settings.floatLyricsTremorAmplitude, 0);
    assert.equal(settings.floatLyricsTremorFrequency, 8);
    assert.equal(settings.floatLyricsColor, "#ffffff");
    assert.equal(settings.floatLyricsFontSize, 26);
    assert.equal(settings.floatLyricsFadeMs, 500);
    assert.equal(settings.floatLyricsCharInterval, 0.1);
    assert.equal(settings.floatLyricsMinShowMs, 1200);
    assert.equal(settings.floatLyricsMaxShowMs, 0);
    assert.equal(settings.floatLyricsAdaptiveSpeed, true);
  });

  it("clamps tremor amplitude and frequency into supported ranges", () => {
    assert.equal(clampTremorAmplitude(99), MAX_TREMOR_AMPLITUDE);
    assert.equal(clampTremorAmplitude(2.6), 2.6);
    assert.equal(clampTremorAmplitude(7.25), 7.3);
    assert.equal(clampTremorAmplitude(-5), 0);
    assert.equal(clampTremorFrequency(999), MAX_TREMOR_FREQUENCY);
    assert.equal(clampTremorFrequency(0), 1);
    assert.equal(clampTremorFrequency(12.5), 12.5);
  });

  it("clamps float lyric font size and fade duration", () => {
    assert.equal(clampFloatLyricsFontSize(999), MAX_FLOAT_LYRICS_FONT_SIZE);
    assert.equal(clampFloatLyricsFontSize(8), 14);
    assert.equal(clampFloatLyricsFontSize(30), 30);
    assert.equal(clampFloatLyricsFadeMs(9999), MAX_FLOAT_LYRICS_FADE_MS);
    assert.equal(clampFloatLyricsFadeMs(-10), 0);
    assert.equal(clampFloatLyricsFadeMs(700), 700);
  });

  it("clamps per-character output interval between 0.01s and 1s", () => {
    assert.equal(clampFloatLyricsCharInterval(9), MAX_FLOAT_LYRICS_CHAR_INTERVAL);
    assert.equal(clampFloatLyricsCharInterval(0.001), 0.01);
    assert.equal(clampFloatLyricsCharInterval(0.25), 0.25);
    assert.equal(clampFloatLyricsCharInterval(0.5), 0.5);
  });

  it("clamps min/max lyric display times", () => {
    assert.equal(clampFloatLyricsMinShowMs(999999), MAX_FLOAT_LYRICS_MIN_SHOW_MS);
    assert.equal(clampFloatLyricsMinShowMs(-5), 0);
    assert.equal(clampFloatLyricsMinShowMs(1500), 1500);
    assert.equal(clampFloatLyricsMaxShowMs(999999), MAX_FLOAT_LYRICS_MAX_SHOW_MS);
    assert.equal(clampFloatLyricsMaxShowMs(-5), 0);
    assert.equal(clampFloatLyricsMaxShowMs(8000), 8000);
  });

  it("falls back from invalid mode and color", () => {
    assert.equal(normalizeFloatLyricsMode("weird"), "both");
    const settings = validateSettings({
      floatLyricsMode: "original",
      floatLyricsColor: "not-a-color"
    });
    assert.equal(settings.floatLyricsMode, "original");
    assert.equal(settings.floatLyricsColor, "#ffffff");
  });
});
