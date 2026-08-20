const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");

const SEARCH_HOST = "music.163.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
/** Reject API hits that only share fuzzy tokens (e.g. "void" → unrelated "-18°"). */
const MIN_API_MATCH_SCORE = 6;
/** Local sqlite rows need a confident title match before we trust the id. */
const MIN_LOCAL_MATCH_SCORE = 8;

/**
 * Normalizes a title/artist/album string for fuzzy comparison.
 * @param {string|null|undefined} value
 */
function normalizeMatchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Scores a NetEase search hit against Now Playing metadata.
 * @param {{ name?: string, artists?: { name?: string }[], album?: { name?: string } }} song
 * @param {{ title?: string|null, artist?: string|null, album?: string|null }} track
 */
function scoreSongMatch(song, track) {
  const name = normalizeMatchText(song.name);
  const wantTitle = normalizeMatchText(track.title);
  const artists = (song.artists || [])
    .map((artistRow) => normalizeMatchText(artistRow.name))
    .filter(Boolean);
  const wantArtist = normalizeMatchText(track.artist);
  const albumName = normalizeMatchText(song.album?.name);
  const wantAlbum = normalizeMatchText(track.album);
  let score = 0;

  if (!wantTitle) {
    return 0;
  }
  if (name === wantTitle) {
    score += 10;
  } else if (name.includes(wantTitle) || wantTitle.includes(name)) {
    score += 4;
  } else {
    return 0;
  }

  if (wantArtist) {
    const parts = wantArtist
      .split(/[\/,&，、]/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (artists.some((artistName) => artistName.includes(part) || part.includes(artistName))) {
        score += 4;
      }
    }
  }

  if (wantAlbum && albumName) {
    if (albumName === wantAlbum) {
      score += 5;
    } else if (albumName.includes(wantAlbum) || wantAlbum.includes(albumName)) {
      score += 2;
    }
  }

  return score;
}

/**
 * Scores a NetEase local-cache JSON row against Now Playing metadata.
 * @param {object} payload
 * @param {{ title?: string|null, artist?: string|null, album?: string|null }} track
 */
function scoreLocalTrack(payload, track) {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  return scoreSongMatch(
    {
      name: payload.name,
      artists: payload.artists,
      album: payload.album || { name: payload.albumName }
    },
    track
  );
}

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
        res.on("data", (chunk) => chunks.push(chunk));
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
 * Resolves the NetEase desktop client's local sqlite cache path on macOS.
 */
function resolveLocalSqlitePath() {
  if (process.platform !== "darwin") {
    return null;
  }
  const home = os.homedir();
  const candidates = [
    path.join(
      home,
      "Library/Application Support/com.netease.163music/Documents/storage/sqlite_storage.sqlite3"
    ),
    path.join(
      home,
      "Library/Containers/com.netease.163music/Data/Library/Application Support/com.netease.163music/Documents/storage/sqlite_storage.sqlite3"
    )
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Reads recent NetEase desktop rows and returns the best matching song id.
 * @param {{ title?: string|null, artist?: string|null, album?: string|null }} track
 */
function lookupSongIdInLocalDb(track) {
  const dbPath = resolveLocalSqlitePath();
  if (!dbPath || !track?.title) {
    return null;
  }

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    return null;
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }

  try {
    const sources = [
      db
        .prepare(
          "SELECT id, jsonStr FROM historyTracks ORDER BY playtime DESC LIMIT 80"
        )
        .all(),
      db
        .prepare(
          "SELECT id, jsonStr FROM dbTrack WHERE jsonStr LIKE ? LIMIT 40"
        )
        .all(`%"name":${JSON.stringify(String(track.title))}%`)
    ];

    let bestId = null;
    let bestScore = 0;
    for (const rows of sources) {
      for (const row of rows) {
        let payload;
        try {
          payload = JSON.parse(String(row.jsonStr || ""));
        } catch {
          continue;
        }
        const score = scoreLocalTrack(payload, track);
        if (score > bestScore) {
          bestScore = score;
          bestId = Number(row.id || payload.id);
        }
      }
    }

    if (!Number.isFinite(bestId) || bestScore < MIN_LOCAL_MATCH_SCORE) {
      return null;
    }
    return bestId;
  } finally {
    db.close();
  }
}

/**
 * Builds distinct search queries from Now Playing metadata.
 * @param {{ title?: string|null, artist?: string|null, album?: string|null }} track
 */
function buildSearchQueries(track) {
  const title = String(track.title || "").trim();
  const artist = String(track.artist || "").trim();
  const album = String(track.album || "").trim();
  const queries = [];
  if (title && artist && album) {
    queries.push(`${title} ${artist} ${album}`);
  }
  if (title && artist) {
    queries.push(`${title} ${artist}`);
  }
  if (title) {
    queries.push(title);
  }
  return [...new Set(queries)];
}

/**
 * Resolves a NetEase song id via public search, requiring a confident title match.
 * @param {{ title?: string|null, artist?: string|null, album?: string|null }} track
 * @returns {Promise<number|null>}
 */
async function searchSongIdViaApi(track) {
  if (!track?.title) {
    return null;
  }

  let bestId = null;
  let bestScore = 0;
  for (const query of buildSearchQueries(track)) {
    const data = await getJson(
      `/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=10&offset=0`
    );
    const songs = data?.result?.songs;
    if (!Array.isArray(songs) || !songs.length) {
      continue;
    }
    for (const song of songs) {
      const score = scoreSongMatch(song, track);
      if (score > bestScore) {
        bestScore = score;
        bestId = Number(song.id);
      }
    }
    if (bestScore >= MIN_API_MATCH_SCORE) {
      break;
    }
  }

  if (!Number.isFinite(bestId) || bestScore < MIN_API_MATCH_SCORE) {
    return null;
  }
  return bestId;
}

/**
 * Resolves the NetEase song id for Now Playing metadata.
 * Prefers the desktop client's local sqlite cache; falls back to search API.
 * @param {{
 *   title?: string|null,
 *   artist?: string|null,
 *   album?: string|null,
 *   isNetease?: boolean
 * }} track
 * @returns {Promise<number|null>}
 */
async function resolveSongId(track) {
  if (!track?.title) {
    return null;
  }

  if (track.isNetease !== false) {
    const localId = lookupSongIdInLocalDb(track);
    if (localId) {
      return localId;
    }
  }

  return searchSongIdViaApi(track);
}

module.exports = {
  MIN_API_MATCH_SCORE,
  MIN_LOCAL_MATCH_SCORE,
  normalizeMatchText,
  scoreSongMatch,
  scoreLocalTrack,
  buildSearchQueries,
  resolveLocalSqlitePath,
  lookupSongIdInLocalDb,
  searchSongIdViaApi,
  resolveSongId
};
