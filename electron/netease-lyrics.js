const https = require("node:https");

const SEARCH_HOST = "music.163.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * GETs a music.163.com JSON API path and parses the body.
 * @param {string} pathWithQuery
 */
function getJson(pathWithQuery) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: SEARCH_HOST,
        path: pathWithQuery,
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Referer: "https://music.163.com/",
          Accept: "*/*"
        },
        timeout: 10000
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(
              new Error(
                `Invalid JSON from NetEase (${res.statusCode}): ${text.slice(0, 120)}`
              )
            );
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("NetEase request timed out"));
    });
    req.end();
  });
}

/**
 * Parses LRC text into timed lines (seconds + lyric text).
 * @param {string} lrc
 * @returns {{ time: number, text: string }[]}
 */
function parseLrc(lrc) {
  if (typeof lrc !== "string" || !lrc.trim()) {
    return [];
  }
  const lines = [];
  const re = /\[(\d{1,3}):(\d{1,2}(?:\.\d+)?)\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(re, "").trim();
    re.lastIndex = 0;
    let match = re.exec(raw);
    if (!match) {
      continue;
    }
    while (match) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        lines.push({ time: minutes * 60 + seconds, text });
      }
      match = re.exec(raw);
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * True when a lyric line is only credit / instrumental placeholder text.
 * @param {string} text
 */
function isMetaLyricLine(text) {
  if (!text) {
    return true;
  }
  return /^(作词|作曲|编曲|制作人|出品|录音|混音|母带|原唱|和声|吉他|贝斯|鼓|弦乐|版权|翻唱|纯音乐|请欣赏|Instrumental)/i.test(
    text.trim()
  );
}

/**
 * Picks the active lyric entry (text + translation) for a playback position.
 * @param {{ time: number, text: string, translation?: string }[]} lines
 * @param {number} elapsedSec
 * @returns {{ time: number, text: string, translation?: string }|null}
 */
function lyricEntryAt(lines, elapsedSec) {
  if (!lines.length) {
    return null;
  }
  const t = Math.max(0, Number(elapsedSec) || 0);
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= t + 0.05) {
      if (lines[i].text) {
        current = lines[i];
      }
    } else {
      break;
    }
  }
  return current;
}

/**
 * Picks the active lyric text for a playback position (seconds).
 * @param {{ time: number, text: string }[]} lines
 * @param {number} elapsedSec
 */
function lyricLineAt(lines, elapsedSec) {
  return lyricEntryAt(lines, elapsedSec)?.text || "";
}

/**
 * Scores a search hit against Now Playing title/artist.
 * @param {{ name?: string, artists?: { name?: string }[] }} song
 * @param {string} title
 * @param {string} artist
 */
function scoreSongMatch(song, title, artist) {
  const name = String(song.name || "").toLowerCase();
  const wantTitle = String(title || "").toLowerCase();
  const artists = (song.artists || [])
    .map((a) => String(a.name || "").toLowerCase())
    .join(" / ");
  const wantArtist = String(artist || "").toLowerCase();
  let score = 0;
  if (name === wantTitle) {
    score += 8;
  } else if (name.includes(wantTitle) || wantTitle.includes(name)) {
    score += 4;
  }
  if (wantArtist) {
    const parts = wantArtist.split(/[\/,&，、]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (artists.includes(part)) {
        score += 3;
      }
    }
  }
  return score;
}

/**
 * Resolves a NetEase song id for a title/artist pair via public search API.
 * @param {string} title
 * @param {string} artist
 * @returns {Promise<number|null>}
 */
async function searchSongId(title, artist) {
  if (!title) {
    return null;
  }
  const query = encodeURIComponent(`${title} ${artist || ""}`.trim());
  const data = await getJson(
    `/api/search/get?s=${query}&type=1&limit=10&offset=0`
  );
  const songs = data?.result?.songs;
  if (!Array.isArray(songs) || !songs.length) {
    return null;
  }
  let best = songs[0];
  let bestScore = -1;
  for (const song of songs) {
    const score = scoreSongMatch(song, title, artist);
    if (score > bestScore) {
      best = song;
      bestScore = score;
    }
  }
  const id = Number(best?.id);
  return Number.isFinite(id) ? id : null;
}

/**
 * Pairs each lyric line with the translated line sharing its timestamp.
 * Timestamps may drift slightly between the two LRCs, so nearby lines match.
 * @param {{ time: number, text: string }[]} lines
 * @param {{ time: number, text: string }[]} translationLines
 * @returns {{ time: number, text: string, translation: string }[]}
 */
function attachTranslations(lines, translationLines) {
  if (!Array.isArray(translationLines) || !translationLines.length) {
    return lines.map((line) => ({ ...line, translation: "" }));
  }
  const TOLERANCE_SEC = 0.4;
  return lines.map((line) => {
    let best = null;
    let bestDelta = Infinity;
    for (const candidate of translationLines) {
      const delta = Math.abs(candidate.time - line.time);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }
    const translation =
      best && bestDelta <= TOLERANCE_SEC && best.text !== line.text
        ? best.text
        : "";
    return { ...line, translation };
  });
}

/**
 * Fetches and normalizes lyrics (plus translation) for a NetEase song id.
 * @param {number} songId
 */
async function fetchLyricPayload(songId) {
  const data = await getJson(
    `/api/song/lyric?id=${encodeURIComponent(String(songId))}&lv=1&kv=1&tv=-1`
  );
  const lrcText = data?.lrc?.lyric || "";
  const translationText = data?.tlyric?.lyric || "";
  const lines = parseLrc(lrcText);
  const vocalLines = lines.filter((line) => !isMetaLyricLine(line.text));
  const translationLines = parseLrc(translationText).filter(
    (line) => line.text && !isMetaLyricLine(line.text)
  );
  const blob = vocalLines.map((l) => l.text).join("\n");
  const instrumental = Boolean(
    data?.nolyric ||
      data?.pureMusic ||
      /纯音乐|请欣赏|Instrumental/i.test(blob) ||
      vocalLines.length === 0
  );
  return {
    songId,
    instrumental,
    lines: instrumental ? [] : attachTranslations(vocalLines, translationLines),
    hasTranslation: !instrumental && translationLines.length > 0,
    raw: lrcText
  };
}

/**
 * Loads timed lyrics for a Now Playing title/artist (null when unavailable).
 * @param {{ title?: string|null, artist?: string|null }} track
 */
async function loadLyricsForTrack(track) {
  const title = track?.title;
  const artist = track?.artist;
  if (!title) {
    return null;
  }
  const songId = await searchSongId(title, artist || "");
  if (!songId) {
    return null;
  }
  return fetchLyricPayload(songId);
}

/**
 * Creates a lyric syncer that emits the current line while a track plays.
 * @param {{
 *   onLyric: (payload: {
 *     line: string,
 *     translation: string,
 *     instrumental: boolean,
 *     songId: number|null,
 *     showLyric: boolean
 *   }) => void
 * }} options
 */
function createLyricsController(options) {
  let cacheKey = "";
  let cache = null;
  let loadToken = 0;
  let timer = null;
  let lastEmitted = "";
  let lastPayload = {
    line: "",
    translation: "",
    instrumental: false,
    songId: null,
    showLyric: false
  };

  /**
   * Remembers and forwards a lyric payload, skipping unchanged repeats.
   * @param {{
   *   line: string,
   *   translation: string,
   *   instrumental: boolean,
   *   songId: number|null,
   *   showLyric: boolean
   * }} payload
   */
  function emit(payload) {
    lastPayload = payload;
    const fingerprint = `${payload.showLyric}|${payload.line}|${payload.translation}|${payload.instrumental}`;
    if (fingerprint === lastEmitted) {
      return;
    }
    lastEmitted = fingerprint;
    options.onLyric(payload);
  }

  /**
   * Emits the lyric/title decision for the current playback position.
   * @param {object} track
   */
  function emitForTrack(track) {
    const instrumental = Boolean(cache?.instrumental);
    const showLyric = Boolean(
      track?.isTarget &&
        track?.playing &&
        cache &&
        !instrumental &&
        cache.lines?.length
    );
    const elapsed = estimateElapsed(track);
    const entry = showLyric ? lyricEntryAt(cache.lines, elapsed) : null;
    const line = entry?.text || "";
    emit({
      line,
      translation: line ? entry?.translation || "" : "",
      instrumental,
      songId: cache?.songId || null,
      showLyric: showLyric && Boolean(line)
    });
  }

  /**
   * Loads lyrics when the NetEase track identity changes.
   * @param {object} track
   */
  async function bindTrack(track) {
    if (!track?.isTarget || !track.title) {
      cacheKey = "";
      cache = null;
      lastEmitted = "";
      emit({
        line: "",
        translation: "",
        instrumental: false,
        songId: null,
        showLyric: false
      });
      return;
    }

    const key = `${track.title}|${track.artist || ""}`;
    if (key === cacheKey && cache) {
      emitForTrack(track);
      return;
    }

    cacheKey = key;
    const token = (loadToken += 1);
    try {
      const payload = await loadLyricsForTrack(track);
      if (token !== loadToken) {
        return;
      }
      cache = payload;
      emitForTrack(track);
    } catch {
      if (token !== loadToken) {
        return;
      }
      cache = null;
      emit({
        line: "",
        translation: "",
        instrumental: false,
        songId: null,
        showLyric: false
      });
    }
  }

  /**
   * Starts a short interval so lyrics advance with playback time.
   * @param {() => object|null} getTrack
   */
  function start(getTrack) {
    stop();
    timer = setInterval(() => {
      const track = getTrack();
      if (track) {
        emitForTrack(track);
      }
    }, 280);
  }

  /** Stops the lyric tick timer. */
  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Returns the latest lyric payload, e.g. for a renderer that just loaded. */
  function getLastPayload() {
    return lastPayload;
  }

  /**
   * Re-emits the line for the current playback position, bypassing dedupe.
   * Used at launch / window reload so the float starts at the right lyric.
   * @param {object|null} track
   */
  function resync(track) {
    lastEmitted = "";
    if (track) {
      emitForTrack(track);
      return;
    }
    options.onLyric(lastPayload);
  }

  return { bindTrack, start, stop, emitForTrack, getLastPayload, resync };
}

/**
 * Estimates current elapsed seconds from the last MediaRemote sample.
 * @param {object} track
 */
function estimateElapsed(track) {
  const base = Number(track?.elapsed);
  if (!Number.isFinite(base)) {
    return 0;
  }
  if (!track.playing) {
    return base;
  }
  const sampledAt = Number(track.elapsedSampledAt);
  if (!Number.isFinite(sampledAt)) {
    return base;
  }
  return Math.max(0, base + (Date.now() - sampledAt) / 1000);
}

module.exports = {
  parseLrc,
  lyricLineAt,
  lyricEntryAt,
  attachTranslations,
  isMetaLyricLine,
  searchSongId,
  fetchLyricPayload,
  loadLyricsForTrack,
  createLyricsController,
  estimateElapsed
};
