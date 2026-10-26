const https = require("node:https");
const { resolveSongId } = require("./netease-song-id");
const { buildTrackIdentity } = require("./track-fingerprint");

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
 * Converts a NetEase LRC timestamp match into seconds.
 * Supports [mm:ss], [mm:ss.xx], and [mm:ss:xx] (colon hundredths).
 * @param {RegExpMatchArray} match
 */
function lrcMatchToSeconds(match) {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  const dotted = match[3];
  const colonFrac = match[4];
  let fraction = 0;
  if (dotted) {
    fraction = Number(`0.${dotted}`);
  } else if (colonFrac) {
    fraction = Number(colonFrac) / 10 ** colonFrac.length;
  }
  if (!Number.isFinite(fraction)) {
    return null;
  }
  return minutes * 60 + seconds + fraction;
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
  const re = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3})|:(\d{1,3}))?\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw.replace(re, "").trim();
    re.lastIndex = 0;
    let match = re.exec(raw);
    if (!match) {
      continue;
    }
    while (match) {
      const time = lrcMatchToSeconds(match);
      if (time !== null) {
        lines.push({ time, text });
      }
      match = re.exec(raw);
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * True when a lyric line is only credit / instrumental placeholder text.
 * Credit roles need a separator so real lyrics like "鼓声响起" stay.
 * @param {string} text
 */
function isMetaLyricLine(text) {
  if (!text) {
    return true;
  }
  const trimmed = text.trim();
  if (/^(纯音乐|请欣赏|Instrumental)(?:\b|$|\s)/i.test(trimmed)) {
    return true;
  }
  return /^(作词|作曲|编曲|制作人|出品|录音|混音|母带|原唱|和声|吉他|贝斯|鼓|弦乐|版权|翻唱)(?:\s*[:：]|\s+)/.test(
    trimmed
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
 * Returns the active line plus nearby lines (±radius) around the playback time.
 * Each element marks whether it is the current line, so the renderer can show
 * several lines scattered on screen at once.
 * @param {{ time: number, text: string, translation?: string }[]} lines
 * @param {number} elapsedSec
 * @param {number} [radius]
 * @returns {{ time: number, text: string, translation: string, isCurrent: boolean, index: number }[]}
 */
function lyricWindowAt(lines, elapsedSec, radius = 1) {
  if (!lines || !lines.length) {
    return [];
  }
  const t = Math.max(0, Number(elapsedSec) || 0);
  let idx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= t + 0.05) {
      idx = i;
    } else {
      break;
    }
  }
  // Before the first line's timestamp, no line is current yet. Return empty so
  // the renderer does not show the first lyric early.
  if (idx < 0) {
    return [];
  }
  const safe = idx;
  const start = Math.max(0, safe - radius);
  const end = Math.min(lines.length, safe + radius + 1);
  return lines.slice(start, end).map((line, offset) => ({
    time: line.time,
    text: line.text || "",
    translation: line.translation || "",
    isCurrent: start + offset === safe,
    index: start + offset
  }));
}

/**
 * Pairs each lyric line with the translated line sharing its timestamp.
 * Timestamps may drift slightly between the two LRCs, so nearby lines match.
 * Each translation is consumed at most once (walk both lists in time order).
 * @param {{ time: number, text: string }[]} lines
 * @param {{ time: number, text: string }[]} translationLines
 * @returns {{ time: number, text: string, translation: string }[]}
 */
function attachTranslations(lines, translationLines) {
  if (!Array.isArray(translationLines) || !translationLines.length) {
    return lines.map((line) => ({ ...line, translation: "" }));
  }
  const TOLERANCE_SEC = 0.4;
  const used = new Set();
  return lines.map((line) => {
    let bestIndex = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < translationLines.length; i += 1) {
      if (used.has(i)) {
        continue;
      }
      const candidate = translationLines[i];
      const delta = Math.abs(candidate.time - line.time);
      if (delta < bestDelta) {
        bestIndex = i;
        bestDelta = delta;
      }
    }
    const best = bestIndex >= 0 ? translationLines[bestIndex] : null;
    const translation =
      best && bestDelta <= TOLERANCE_SEC && best.text !== line.text
        ? best.text
        : "";
    if (translation && bestIndex >= 0) {
      used.add(bestIndex);
    }
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
 * @param {{
 *   title?: string|null,
 *   artist?: string|null,
 *   album?: string|null,
 *   isNetease?: boolean
 * }} track
 */
async function loadLyricsForTrack(track) {
  if (!track?.title) {
    return null;
  }
  const songId = await resolveSongId(track);
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
    lines: [],
    instrumental: false,
    songId: null,
    showLyric: false
  };

  /**
   * Remembers and forwards a lyric payload, skipping unchanged repeats.
   * @param {{
   *   line: string,
   *   translation: string,
   *   lines: { time: number, text: string, translation: string, isCurrent: boolean }[],
   *   instrumental: boolean,
   *   songId: number|null,
   *   showLyric: boolean
   * }} payload
   */
  function emit(payload) {
    lastPayload = payload;
    const windowFp = (payload.lines || [])
      .map((l) => `${l.isCurrent ? 1 : 0}:${l.text}`)
      .join("|");
    const fingerprint = `${payload.showLyric}|${windowFp}|${payload.instrumental}`;
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
    const windowLines = showLyric ? lyricWindowAt(cache.lines, elapsed, 1) : [];
    const current = windowLines.find((l) => l.isCurrent) || null;
    const line = current?.text || "";
    emit({
      line,
      translation: line ? current?.translation || "" : "",
      lines: windowLines,
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
        lines: [],
        instrumental: false,
        songId: null,
        showLyric: false
      });
      return;
    }

    const key = buildTrackIdentity(track);
    // Same identity: reuse cache, or keep the in-flight fetch (do not bump
    // loadToken — artwork/play-state rebinds would otherwise drop the response).
    if (key === cacheKey) {
      if (cache) {
        emitForTrack(track);
      }
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
      // Clear the key so the next poll retries this identity after a transient failure.
      cacheKey = "";
      cache = null;
      emit({
        line: "",
        translation: "",
        lines: [],
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
  lyricWindowAt,
  attachTranslations,
  isMetaLyricLine,
  fetchLyricPayload,
  loadLyricsForTrack,
  createLyricsController,
  estimateElapsed
};
