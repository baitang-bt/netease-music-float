const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

/**
 * Rewrites ElectronAsarIntegrity hashes in Info.plist to match on-disk asar files.
 * A stale hash makes Electron exit immediately with code 0 and no UI.
 * @param {string} appPath
 */
function syncAsarIntegrity(appPath) {
  const contents = path.join(appPath, "Contents");
  const plistPath = path.join(contents, "Info.plist");
  if (!fs.existsSync(plistPath)) {
    return;
  }
  const raw = execFileSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", plistPath],
    { encoding: "utf8" }
  );
  const plist = JSON.parse(raw);
  const integrity = plist.ElectronAsarIntegrity;
  if (!integrity || typeof integrity !== "object") {
    return;
  }
  let changed = false;
  for (const relative of Object.keys(integrity)) {
    const asarPath = path.join(contents, relative);
    if (!fs.existsSync(asarPath)) {
      continue;
    }
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(asarPath))
      .digest("hex");
    if (integrity[relative]?.hash !== hash) {
      integrity[relative] = { algorithm: "SHA256", hash };
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  const tmpJson = `${plistPath}.integrity.json`;
  fs.writeFileSync(tmpJson, `${JSON.stringify(plist)}\n`);
  execFileSync("/usr/bin/plutil", ["-convert", "xml1", tmpJson, "-o", plistPath]);
  fs.unlinkSync(tmpJson);
}

/**
 * Ships AudioTee, then seals all Electron nested code before DMG/zip creation.
 * Local builds pass a stable identity; CI falls back to a valid ad-hoc seal.
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const src = path.join(
    context.packager.projectDir,
    "node_modules",
    "audiotee",
    "bin",
    "audiotee"
  );
  const destDir = path.join(
    context.appOutDir,
    "NeteaseFloat.app",
    "Contents",
    "Resources",
    "audiotee"
  );
  const dest = path.join(destDir, "audiotee");

  if (fs.existsSync(src)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  }

  const appPath = path.join(context.appOutDir, "NeteaseFloat.app");
  syncAsarIntegrity(appPath);
  const identity = process.env.NETEASEFLOAT_SIGN_IDENTITY || "-";
  execFileSync(
    "/usr/bin/codesign",
    [
      "--force",
      "--deep",
      "--sign",
      identity,
      "--preserve-metadata=entitlements",
      appPath
    ],
    { stdio: "inherit" }
  );
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { stdio: "inherit" }
  );
};
