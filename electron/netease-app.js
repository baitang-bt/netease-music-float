const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");

const execFileAsync = promisify(execFile);

const CANDIDATE_APP_NAMES = ["NeteaseMusic", "NetEaseMusic", "网易云音乐"];
const BUNDLE_ID = "com.netease.163music";
const APP_PATH = "/Applications/NeteaseMusic.app";

/**
 * Opens NetEase Cloud Music or brings it to the front if already running.
 * @returns {Promise<{ ok: boolean, method: string, detail?: string }>}
 */
async function openOrFocusNetease() {
  if (fs.existsSync(APP_PATH)) {
    await execFileAsync("open", ["-a", APP_PATH]);
    return { ok: true, method: "open-path" };
  }

  for (const name of CANDIDATE_APP_NAMES) {
    try {
      await execFileAsync("open", ["-a", name]);
      return { ok: true, method: "open-name", detail: name };
    } catch {
      // try next candidate
    }
  }

  try {
    await execFileAsync("open", ["-b", BUNDLE_ID]);
    return { ok: true, method: "open-bundle" };
  } catch (error) {
    return {
      ok: false,
      method: "failed",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Resolves the main NetEase Cloud Music process id when it is running.
 * @returns {Promise<number|null>}
 */
async function findNeteaseProcessId() {
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,comm="], {
      maxBuffer: 2 * 1024 * 1024
    });
    const lines = stdout.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const match = trimmed.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        continue;
      }
      const pid = Number(match[1]);
      const command = match[2];
      if (
        Number.isFinite(pid) &&
        (command.endsWith("/NeteaseMusic") ||
          command.includes("NeteaseMusic.app/Contents/MacOS/NeteaseMusic"))
      ) {
        return pid;
      }
    }
  } catch {
    return null;
  }
  return null;
}

module.exports = {
  BUNDLE_ID,
  CANDIDATE_APP_NAMES,
  openOrFocusNetease,
  findNeteaseProcessId
};
