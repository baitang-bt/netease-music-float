const fs = require("node:fs");
const path = require("node:path");

/**
 * After pack: ship a stable audiotee binary under Resources and avoid deep-resign.
 * Deep ad-hoc re-signing changes CDHash and makes macOS re-prompt system-audio TCC.
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

  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
};
