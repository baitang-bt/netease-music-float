/**
 * Builds the stable identity portion of a Now Playing snapshot.
 * Prefer MediaRemote unique ids; fall back to title/artist/album text.
 * @param {object|null|undefined} track
 */
function buildTrackIdentity(track) {
  if (!track) {
    return "";
  }
  return [
    track.contentItemIdentifier || "",
    track.uniqueIdentifier || "",
    track.title || "",
    track.artist || "",
    track.album || ""
  ].join("|");
}

/**
 * Builds the fingerprint used to decide full UI / lyric rebroadcasts.
 * @param {object|null|undefined} track
 */
function buildTrackFingerprint(track) {
  if (!track) {
    return "";
  }
  return [
    track.status,
    track.playing,
    buildTrackIdentity(track),
    track.targetPlayerId || "",
    track.bundleIdentifier || "",
    track.processIdentifier ?? "",
    track.repeatMode ?? "",
    track.shuffleMode ?? "",
    track.artworkDataUrl ? track.artworkDataUrl.length : 0
  ].join("|");
}

/**
 * True when elapsed time jumped backward enough to imply a new playback session
 * (next track, replay, or seek) while textual metadata stayed the same.
 * @param {object|null|undefined} previous
 * @param {object|null|undefined} next
 */
function isElapsedRegression(previous, next) {
  if (!previous || !next) {
    return false;
  }
  if (previous.status !== "matched" || next.status !== "matched") {
    return false;
  }
  if (buildTrackIdentity(previous) !== buildTrackIdentity(next)) {
    return false;
  }
  const prevElapsed = Number(previous.elapsed);
  const nextElapsed = Number(next.elapsed);
  if (!Number.isFinite(prevElapsed) || !Number.isFinite(nextElapsed)) {
    return false;
  }
  if (nextElapsed <= 1.5 && prevElapsed > 4) {
    return true;
  }
  return prevElapsed - nextElapsed > 2.5;
}

module.exports = {
  buildTrackIdentity,
  buildTrackFingerprint,
  isElapsedRegression
};
