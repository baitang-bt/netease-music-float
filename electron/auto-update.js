const { autoUpdater } = require("electron-updater");
const { app } = require("electron");

/**
 * Creates a GitHub Releases-backed updater for packaged builds.
 * @param {{
 *   onStatus: (payload: {
 *     state: string,
 *     message?: string,
 *     version?: string,
 *     percent?: number,
 *     error?: string
 *   }) => void
 * }} options
 */
function createAutoUpdater(options) {
  let checking = false;
  let updateAvailable = null;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Ad-hoc / unsigned local builds cannot pass Apple signature verification.
  autoUpdater.verifyUpdateCodeSignature = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    options.onStatus({ state: "checking", message: "正在检查更新…" });
  });

  autoUpdater.on("update-available", (info) => {
    updateAvailable = info;
    options.onStatus({
      state: "available",
      message: `发现新版本 ${info.version}，开始下载…`,
      version: info.version
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateAvailable = null;
    options.onStatus({
      state: "idle",
      message: `已是最新版本（${info?.version || app.getVersion()}）`,
      version: info?.version || app.getVersion()
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    options.onStatus({
      state: "downloading",
      message: `正在下载更新… ${Math.round(progress.percent || 0)}%`,
      percent: progress.percent,
      version: updateAvailable?.version
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    options.onStatus({
      state: "ready",
      message: `更新 ${info.version} 已下载，重启后安装`,
      version: info.version
    });
  });

  autoUpdater.on("error", (error) => {
    checking = false;
    options.onStatus({
      state: "error",
      message: error?.message || String(error),
      error: error?.message || String(error)
    });
  });

  /**
   * Checks GitHub Releases for a newer build. No-op while unpackaged.
   * @param {{ silent?: boolean }} [opts]
   */
  async function checkForUpdates(opts = {}) {
    if (!app.isPackaged) {
      options.onStatus({
        state: "idle",
        message: "开发模式不检查更新（请使用打包版）"
      });
      return { ok: false, reason: "dev" };
    }
    if (checking) {
      return { ok: false, reason: "busy" };
    }
    checking = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result?.updateInfo?.version || null
      };
    } catch (error) {
      if (!opts.silent) {
        options.onStatus({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return {
        ok: false,
        reason: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      checking = false;
    }
  }

  /** Quits and installs a downloaded update when one is ready. */
  function quitAndInstall() {
    autoUpdater.quitAndInstall(false, true);
  }

  return {
    checkForUpdates,
    quitAndInstall
  };
}

module.exports = {
  createAutoUpdater
};
