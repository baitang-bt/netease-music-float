const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

/**
 * Resolves the project/resources root that contains `native/` (dev vs packaged).
 * Packaged builds place `native` under Extra Resources to keep framework symlinks intact.
 */
function getNativeRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "native");
  }
  return path.join(app.getAppPath(), "native");
}

/**
 * Resolves MediaRemote adapter script and framework absolute paths.
 */
function resolveAdapterPaths() {
  const nativeRoot = getNativeRoot();
  return {
    nativeRoot,
    scriptPath: path.join(nativeRoot, "mediaremote-adapter.pl"),
    frameworkPath: path.join(nativeRoot, "MediaRemoteAdapter.framework")
  };
}

/**
 * Resolves the AudioTee helper binary outside asar so spawn() works when packaged.
 * Prefer Extra Resources copy — its code signature stays stable (do not deep-resign it).
 */
function resolveAudioteeBinary() {
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath, "audiotee", "audiotee"),
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "audiotee",
        "bin",
        "audiotee"
      )
    );
  } else {
    candidates.push(
      path.join(app.getAppPath(), "node_modules", "audiotee", "bin", "audiotee")
    );
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  getNativeRoot,
  resolveAdapterPaths,
  resolveAudioteeBinary
};
