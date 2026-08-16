const {
  isPlayerNowPlaying,
  getPlayerById
} = require("./music-players");

/** @deprecated Prefer music-players; kept for existing tests / call sites. */
const NETEASE_BUNDLE_IDS = new Set(
  getPlayerById("netease")?.bundleIds || ["com.netease.163music"]
);

const NETEASE_NAME_PATTERN =
  getPlayerById("netease")?.namePattern || /网易云|NeteaseMusic/i;

/**
 * Returns true when Now Playing metadata comes from NetEase Cloud Music.
 * @param {{ bundleIdentifier?: string|null, displayName?: string|null }} info
 */
function isNeteaseNowPlaying(info) {
  return isPlayerNowPlaying(info, "netease");
}

module.exports = {
  NETEASE_BUNDLE_IDS,
  NETEASE_NAME_PATTERN,
  isNeteaseNowPlaying
};
