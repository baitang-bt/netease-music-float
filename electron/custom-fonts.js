const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { dialog, app } = require("electron");
const { isCustomFontId } = require("../src/title-fonts");

const ALLOWED_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"]);

/**
 * Returns the per-user directory that stores imported title fonts.
 */
function getCustomFontsDir() {
  const dir = path.join(app.getPath("userData"), "custom-fonts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolves an absolute path for a stored custom font filename.
 * @param {string} fileName
 */
function resolveCustomFontPath(fileName) {
  const fontsDir = getCustomFontsDir();
  const safeName = path.basename(fileName);
  const filePath = path.normalize(path.join(fontsDir, safeName));
  if (!filePath.startsWith(fontsDir + path.sep) && filePath !== fontsDir) {
    return null;
  }
  return filePath;
}

/**
 * Opens a file picker and copies a font into the userData catalog.
 * @param {import('electron').BrowserWindow|null} browserWindow
 * @returns {Promise<{ ok: boolean, font?: object, error?: string, canceled?: boolean }>}
 */
async function importCustomFont(browserWindow) {
  const result = await dialog.showOpenDialog(browserWindow || undefined, {
    title: "导入字体",
    buttonLabel: "导入",
    properties: ["openFile"],
    filters: [
      {
        name: "Fonts",
        extensions: ["ttf", "otf", "ttc", "woff", "woff2"]
      }
    ]
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "unsupported-font-type" };
  }

  let stat;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    return { ok: false, error: "font-unreadable" };
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > 24 * 1024 * 1024) {
    return { ok: false, error: "font-size-invalid" };
  }

  const id = `cf_${crypto.randomBytes(6).toString("hex")}`;
  if (!isCustomFontId(id)) {
    return { ok: false, error: "font-id-invalid" };
  }
  const fileName = `${id}${ext}`;
  const destPath = resolveCustomFontPath(fileName);
  if (!destPath) {
    return { ok: false, error: "font-path-invalid" };
  }

  try {
    fs.copyFileSync(sourcePath, destPath);
  } catch {
    return { ok: false, error: "font-copy-failed" };
  }

  const label = path.basename(sourcePath, ext).slice(0, 64) || "导入字体";
  return {
    ok: true,
    font: {
      id,
      label,
      family: `nf-${id}`,
      fileName
    }
  };
}

/**
 * Deletes an imported font file from disk when present.
 * @param {string} fileName
 */
function removeCustomFontFile(fileName) {
  const filePath = resolveCustomFontPath(fileName);
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup failures; settings can still drop the catalog entry.
  }
}

module.exports = {
  getCustomFontsDir,
  resolveCustomFontPath,
  importCustomFont,
  removeCustomFontFile
};
