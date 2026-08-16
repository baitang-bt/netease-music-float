const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { shell } = require("electron");

const execFileAsync = promisify(execFile);

/**
 * Opens macOS System Settings at Screen & System Audio Recording privacy.
 * Used so the user can grant「仅系统音频录制」to this app.
 */
async function openSystemAudioPrivacySettings() {
  const candidates = [
    // macOS Ventura+ System Settings deep links
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.Settings.PrivacySecurity.extension?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?path=ScreenCapture"
  ];

  for (const url of candidates) {
    try {
      await shell.openExternal(url);
      return { ok: true, method: "openExternal", detail: url };
    } catch {
      // try next candidate
    }
  }

  try {
    await execFileAsync("open", [
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    ]);
    return { ok: true, method: "open" };
  } catch (error) {
    return {
      ok: false,
      method: "failed",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

module.exports = {
  openSystemAudioPrivacySettings
};
