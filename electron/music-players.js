const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

/**
 * Known desktop music apps we can follow via MediaRemote Now Playing.
 * Only entries found on disk appear in Settings.
 */
const MUSIC_PLAYERS = [
  {
    id: "netease",
    label: "网易云音乐",
    bundleIds: ["com.netease.163music", "com.netease.CloudMusic"],
    namePattern: /网易云|NeteaseMusic|NetEase\s*Cloud\s*Music|CloudMusic(\.exe)?/i,
    appNames: ["NeteaseMusic", "NetEaseMusic", "网易云音乐"],
    appFileNames: ["NeteaseMusic.app", "NetEaseMusic.app", "网易云音乐.app"],
    windowsUri: "orpheus://",
    supportsAxPlaybackMode: true
  },
  {
    id: "apple-music",
    label: "苹果音乐",
    bundleIds: ["com.apple.Music"],
    namePattern: /^(Music|音乐|Apple\s*Music)(\.exe)?$/i,
    appNames: ["Music", "音乐"],
    appFileNames: ["Music.app"],
    windowsUri: "music://",
    supportsAxPlaybackMode: false
  },
  {
    id: "qq-music",
    label: "QQ 音乐",
    bundleIds: ["com.tencent.QQMusicMac", "com.tencent.qqmusicmac"],
    namePattern: /QQ\s*音乐|QQMusic/i,
    appNames: ["QQMusic", "QQ音乐"],
    appFileNames: ["QQMusic.app", "QQ音乐.app"],
    windowsUri: "qqmusic://",
    supportsAxPlaybackMode: false
  },
  {
    id: "spotify",
    label: "Spotify",
    bundleIds: ["com.spotify.client"],
    namePattern: /^Spotify(\.exe)?$/i,
    appNames: ["Spotify"],
    appFileNames: ["Spotify.app"],
    windowsUri: "spotify://",
    supportsAxPlaybackMode: false
  },
  {
    id: "kugou",
    label: "酷狗音乐",
    bundleIds: ["com.kugou.mac", "com.kugou.KugouMac"],
    namePattern: /酷狗|KuGou/i,
    appNames: ["KuGouMusic", "酷狗音乐"],
    appFileNames: ["KuGouMusic.app", "酷狗音乐.app"],
    supportsAxPlaybackMode: false
  },
  {
    id: "kuwo",
    label: "酷我音乐",
    bundleIds: ["cn.kuwo.mac", "com.kuwo.mac"],
    namePattern: /酷我|Kuwo/i,
    appNames: ["KuwoMusic", "酷我音乐"],
    appFileNames: ["KuwoMusic.app", "酷我音乐.app"],
    supportsAxPlaybackMode: false
  },
  {
    id: "soda",
    label: "汽水音乐",
    bundleIds: ["com.bytedance.music", "com.bytedance.sodamusic"],
    namePattern: /汽水音乐|Soda\s*Music/i,
    appNames: ["SodaMusic", "汽水音乐"],
    appFileNames: ["SodaMusic.app", "汽水音乐.app"],
    supportsAxPlaybackMode: false
  }
];

const PLAYER_BY_ID = new Map(MUSIC_PLAYERS.map((player) => [player.id, player]));
const DEFAULT_PLAYER_ID = "netease";

/**
 * Returns the player definition for an id, or null when unknown.
 * @param {string|null|undefined} playerId
 */
function getPlayerById(playerId) {
  if (typeof playerId !== "string" || !playerId) {
    return null;
  }
  return PLAYER_BY_ID.get(playerId) || null;
}

/**
 * Coerces a stored target-player id to a known catalog entry.
 * @param {unknown} value
 */
function normalizeTargetPlayerId(value) {
  if (typeof value === "string" && PLAYER_BY_ID.has(value)) {
    return value;
  }
  return DEFAULT_PLAYER_ID;
}

/**
 * Application directories scanned for installed music clients.
 */
function candidateAppRoots() {
  return [
    "/Applications",
    "/System/Applications",
    path.join(os.homedir(), "Applications")
  ];
}

/**
 * True when a known .app path exists under Applications-style roots.
 * @param {{ appFileNames: string[] }} player
 */
function playerExistsOnDisk(player) {
  for (const root of candidateAppRoots()) {
    for (const fileName of player.appFileNames) {
      if (fs.existsSync(path.join(root, fileName))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Asks Spotlight whether any app with the given bundle id is installed.
 * @param {string} bundleId
 */
async function spotlightHasBundle(bundleId) {
  try {
    const { stdout } = await execFileAsync(
      "mdfind",
      [`kMDItemCFBundleIdentifier == "${bundleId}"`],
      { timeout: 4000, maxBuffer: 1024 * 1024 }
    );
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

/**
 * Resolves whether a catalog player is installed on this Mac.
 * @param {typeof MUSIC_PLAYERS[number]} player
 */
async function isPlayerInstalled(player) {
  if (playerExistsOnDisk(player)) {
    return true;
  }
  for (const bundleId of player.bundleIds) {
    if (await spotlightHasBundle(bundleId)) {
      return true;
    }
  }
  return false;
}

/**
 * Lists catalog players that are present locally (for Settings options).
 * @returns {Promise<{ id: string, label: string, supportsAxPlaybackMode: boolean }[]>}
 */
async function listInstalledPlayers() {
  if (process.platform === "win32") {
    const startApps = await listWindowsStartApps();
    return MUSIC_PLAYERS.filter((player) =>
      startApps.some(
        (entry) =>
          player.namePattern.test(entry.Name || "") ||
          player.namePattern.test(entry.AppID || "")
      )
    ).map((player) => ({
      id: player.id,
      label: player.label,
      supportsAxPlaybackMode: false
    }));
  }

  const installed = [];
  for (const player of MUSIC_PLAYERS) {
    if (await isPlayerInstalled(player)) {
      installed.push({
        id: player.id,
        label: player.label,
        supportsAxPlaybackMode: Boolean(player.supportsAxPlaybackMode)
      });
    }
  }
  return installed;
}

/**
 * True when Now Playing metadata belongs to the given catalog player.
 * @param {{ bundleIdentifier?: string|null, displayName?: string|null, appName?: string|null }} info
 * @param {string} playerId
 */
function isPlayerNowPlaying(info, playerId) {
  const player = getPlayerById(playerId);
  if (!player || !info || typeof info !== "object") {
    return false;
  }

  const bundleId =
    typeof info.bundleIdentifier === "string" ? info.bundleIdentifier : "";
  if (bundleId && player.bundleIds.includes(bundleId)) {
    return true;
  }

  /** True when a display or AUMID-like string matches the catalog pattern. */
  function matchesName(value) {
    return typeof value === "string" && value.length > 0 && player.namePattern.test(value);
  }

  // Test displayName and appName independently: Windows GSMTC often puts the
  // AUMID (e.g. CloudMusic.exe) only in appName while displayName is localized.
  return matchesName(info.displayName) || matchesName(info.appName);
}

/**
 * Opens or focuses a catalog music app by id.
 * @param {string} playerId
 * @returns {Promise<{ ok: boolean, method: string, detail?: string }>}
 */
async function openOrFocusPlayer(playerId) {
  const player = getPlayerById(normalizeTargetPlayerId(playerId));
  if (!player) {
    return { ok: false, method: "failed", detail: "unknown-player" };
  }

  if (process.platform === "win32") {
    return openWindowsPlayer(player);
  }

  for (const root of candidateAppRoots()) {
    for (const fileName of player.appFileNames) {
      const appPath = path.join(root, fileName);
      if (fs.existsSync(appPath)) {
        await execFileAsync("open", ["-a", appPath]);
        return { ok: true, method: "open-path", detail: appPath };
      }
    }
  }

  for (const name of player.appNames) {
    try {
      await execFileAsync("open", ["-a", name]);
      return { ok: true, method: "open-name", detail: name };
    } catch {
      // try next candidate
    }
  }

  for (const bundleId of player.bundleIds) {
    try {
      await execFileAsync("open", ["-b", bundleId]);
      return { ok: true, method: "open-bundle", detail: bundleId };
    } catch {
      // try next bundle
    }
  }

  return {
    ok: false,
    method: "failed",
    detail: `未找到已安装的 ${player.label}`
  };
}

/**
 * Lists Start-menu applications once for Windows installation detection.
 * @returns {Promise<{ Name?: string, AppID?: string }[]>}
 */
async function listWindowsStartApps() {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress"
      ],
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout.trim() || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/**
 * Opens a Windows Start-menu app matching the catalog player, then falls back
 * to its registered URI protocol.
 * @param {typeof MUSIC_PLAYERS[number]} player
 */
async function openWindowsPlayer(player) {
  const script = [
    "$pattern=$env:NETEASE_FLOAT_PLAYER_PATTERN",
    "$app=Get-StartApps | Where-Object { $_.Name -match $pattern -or $_.AppID -match $pattern } | Select-Object -First 1",
    "if (-not $app) { exit 2 }",
    "Start-Process ('shell:AppsFolder\\' + $app.AppID)"
  ].join("; ");
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: {
          ...process.env,
          NETEASE_FLOAT_PLAYER_PATTERN: player.namePattern.source
        },
        timeout: 8000
      }
    );
    return { ok: true, method: "windows-start-app" };
  } catch {
    if (player.windowsUri) {
      try {
        await execFileAsync(
          "cmd.exe",
          ["/d", "/s", "/c", "start", "", player.windowsUri],
          { timeout: 8000 }
        );
        return { ok: true, method: "windows-uri", detail: player.windowsUri };
      } catch {
        // Report the shared not-found result below.
      }
    }
  }

  return {
    ok: false,
    method: "failed",
    detail: `未找到已安装的 ${player.label}`
  };
}

module.exports = {
  MUSIC_PLAYERS,
  DEFAULT_PLAYER_ID,
  getPlayerById,
  normalizeTargetPlayerId,
  listInstalledPlayers,
  isPlayerInstalled,
  isPlayerNowPlaying,
  openOrFocusPlayer,
  playerExistsOnDisk
};
