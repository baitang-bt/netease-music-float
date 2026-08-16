const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

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
  const destDir = path.join(context.appOutDir, "NeteaseFloat.app", "Contents", "Resources", "audiotee");
  const dest = path.join(destDir, "audiotee");

  if (fs.existsSync(src)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  }

  const appPath = path.join(context.appOutDir, "NeteaseFloat.app");
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
