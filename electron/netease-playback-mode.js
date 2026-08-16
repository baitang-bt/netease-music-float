const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { shell, systemPreferences } = require("electron");

const execFileAsync = promisify(execFile);

/** Playback modes aligned with NetEase Mac player-bar cycling. */
const PLAYBACK_MODES = ["sequential", "all", "one", "shuffle"];

const MODE_TITLE_MAP = [
  { mode: "one", patterns: ["单曲循环", "Repeat One", "repeat one"] },
  { mode: "shuffle", patterns: ["随机播放", "随机", "Shuffle", "shuffle"] },
  { mode: "all", patterns: ["列表循环", "循环播放", "Repeat", "repeat"] },
  { mode: "sequential", patterns: ["顺序播放", "顺序", "Sequential", "Off"] }
];

const MODE_LABELS = {
  sequential: "顺序播放",
  all: "列表循环",
  one: "单曲循环",
  shuffle: "随机播放"
};

/**
 * Returns whether this process is trusted for Accessibility (optionally prompting).
 * @param {boolean} prompt
 */
function isAccessibilityTrusted(prompt = false) {
  if (process.platform !== "darwin") {
    return false;
  }
  return systemPreferences.isTrustedAccessibilityClient(Boolean(prompt));
}

/** Opens macOS Accessibility privacy settings. */
async function openAccessibilitySettings() {
  const url =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Runs a JXA script and parses JSON stdout.
 * @param {string} source
 */
async function runJxa(source) {
  const { stdout, stderr } = await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", source],
    { maxBuffer: 2 * 1024 * 1024, timeout: 12000 }
  );
  const text = String(stdout || "").trim();
  if (!text) {
    throw new Error(String(stderr || "").trim() || "JXA returned empty output");
  }
  return JSON.parse(text);
}

/**
 * Builds JXA that prepares NetEase for AX reads/clicks.
 * Shared preamble used by detect / click scripts.
 */
function jxaPreamble() {
  return `
ObjC.import("stdlib");
function enableAx(proc) {
  try { proc.attributes.byName("AXManualAccessibility").value = true; } catch (e) {}
  try { proc.attributes.byName("AXEnhancedUserInterface").value = true; } catch (e) {}
}
function processByName(name) {
  var procs = Application("System Events").processes.whose({ name: name })();
  return procs.length ? procs[0] : null;
}
function findNetease() {
  return processByName("NeteaseMusic") || processByName("NetEaseMusic") || processByName("网易云音乐");
}
function modeFromText(text) {
  if (!text) return null;
  var t = String(text);
  if (/单曲循环|Repeat\\s*One/i.test(t)) return "one";
  if (/随机|Shuffle/i.test(t)) return "shuffle";
  if (/列表循环|循环播放|列表循环播放/i.test(t)) return "all";
  if (/顺序播放|顺序(?!循环)|Sequential/i.test(t)) return "sequential";
  return null;
}
function collectButtons(root, out, depth) {
  if (depth > 12 || out.length > 80) return;
  var elems;
  try { elems = root.uiElements(); } catch (e) { return; }
  for (var i = 0; i < elems.length; i++) {
    var el = elems[i];
    var role = "";
    try { role = String(el.role()); } catch (e2) { role = ""; }
    if (role === "AXButton" || role === "AXPopUpButton" || role === "AXCheckBox") {
      var title = "";
      var desc = "";
      var help = "";
      try { title = String(el.title() || ""); } catch (e3) {}
      try { desc = String(el.description() || ""); } catch (e4) {}
      try { help = String(el.help() || ""); } catch (e5) {}
      var blob = (title + " " + desc + " " + help).trim();
      var mode = modeFromText(blob);
      if (mode || /循环|随机|顺序|播放模式|Repeat|Shuffle|Sequential/i.test(blob)) {
        out.push({ title: title, description: desc, help: help, mode: mode, role: role });
      }
    }
    try { collectButtons(el, out, depth + 1); } catch (e6) {}
  }
}
function collectMenuModes(proc) {
  var found = [];
  var bars;
  try { bars = proc.menuBars(); } catch (e) { return found; }
  if (!bars.length) return found;
  var items = bars[0].menuBarItems();
  for (var i = 0; i < items.length; i++) {
    var name = "";
    try { name = String(items[i].title() || items[i].name() || ""); } catch (e2) {}
    if (name !== "控制" && name !== "Controls") continue;
    var menus;
    try { menus = items[i].menus(); } catch (e3) { continue; }
    if (!menus.length) continue;
    var mis;
    try { mis = menus[0].menuItems(); } catch (e4) { continue; }
    for (var j = 0; j < mis.length; j++) {
      var t = "";
      var marked = false;
      try { t = String(mis[j].title() || mis[j].name() || ""); } catch (e5) {}
      try {
        var attr = mis[j].attributes.byName("AXMenuItemMarkChar");
        marked = Boolean(attr && attr.value && String(attr.value).length);
      } catch (e6) {}
      var mode = modeFromText(t);
      if (mode) found.push({ title: t, mode: mode, marked: marked });
    }
  }
  return found;
}
`;
}

/**
 * Detects NetEase playback mode via Accessibility (menu marks / player-bar button).
 * @returns {Promise<{ ok: boolean, mode?: string|null, source?: string, error?: string, accessibility?: boolean }>}
 */
async function detectPlaybackMode() {
  if (!isAccessibilityTrusted(false)) {
    return { ok: false, accessibility: false, error: "需要辅助功能权限才能读取网易云播放模式" };
  }
  try {
    const result = await runJxa(`
${jxaPreamble()}
var proc = findNetease();
if (!proc) {
  JSON.stringify({ ok: false, error: "网易云未运行" });
} else {
  enableAx(proc);
  var menuModes = collectMenuModes(proc);
  var marked = null;
  for (var i = 0; i < menuModes.length; i++) {
    if (menuModes[i].marked) { marked = menuModes[i].mode; break; }
  }
  var buttons = [];
  try {
    var wins = proc.windows();
    for (var w = 0; w < wins.length && buttons.length < 40; w++) {
      collectButtons(wins[w], buttons, 0);
    }
  } catch (e) {}
  var buttonMode = null;
  for (var b = 0; b < buttons.length; b++) {
    if (buttons[b].mode) { buttonMode = buttons[b].mode; break; }
  }
  JSON.stringify({
    ok: true,
    mode: marked || buttonMode || null,
    source: marked ? "menu" : (buttonMode ? "button" : "none"),
    menuModes: menuModes,
    buttons: buttons.slice(0, 12)
  });
}
`);
    return { ...result, accessibility: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/不允许辅助访问|-1719|not allowed/i.test(message)) {
      return { ok: false, accessibility: false, error: "需要辅助功能权限才能读取网易云播放模式" };
    }
    return { ok: false, accessibility: true, error: message };
  }
}

/**
 * Clicks the NetEase player-bar mode button once (cycles 列表→单曲→随机→…).
 * @returns {Promise<{ ok: boolean, error?: string, accessibility?: boolean }>}
 */
async function clickModeCycleButton() {
  if (!isAccessibilityTrusted(false)) {
    return { ok: false, accessibility: false, error: "需要辅助功能权限才能切换网易云播放模式" };
  }
  try {
    const result = await runJxa(`
${jxaPreamble()}
function clickModeButton(proc) {
  var buttons = [];
  var wins = proc.windows();
  for (var w = 0; w < wins.length; w++) collectButtons(wins[w], buttons, 0);
  for (var i = 0; i < buttons.length; i++) {
    if (buttons[i].mode) {
      // Re-find live element by matching title/description and click.
      return clickMatchingButton(proc, buttons[i]);
    }
  }
  // Fallback: any button mentioning 播放模式 / 循环
  for (var j = 0; j < buttons.length; j++) {
    var blob = (buttons[j].title + " " + buttons[j].description + " " + buttons[j].help);
    if (/播放模式|循环|随机|顺序|Repeat|Shuffle/i.test(blob)) {
      return clickMatchingButton(proc, buttons[j]);
    }
  }
  return { ok: false, error: "未找到播放模式按钮，请打开网易云主窗口" };
}
function clickMatchingButton(proc, info) {
  var targetTitle = info.title || "";
  var targetDesc = info.description || "";
  function walk(root, depth) {
    if (depth > 12) return false;
    var elems;
    try { elems = root.uiElements(); } catch (e) { return false; }
    for (var i = 0; i < elems.length; i++) {
      var el = elems[i];
      var role = "";
      try { role = String(el.role()); } catch (e2) {}
      if (role === "AXButton" || role === "AXPopUpButton" || role === "AXCheckBox") {
        var title = ""; var desc = "";
        try { title = String(el.title() || ""); } catch (e3) {}
        try { desc = String(el.description() || ""); } catch (e4) {}
        if ((targetTitle && title === targetTitle) || (targetDesc && desc === targetDesc) ||
            (modeFromText(title + " " + desc) && modeFromText(title + " " + desc) === info.mode)) {
          try { el.click(); return true; } catch (e5) {
            try { el.actions.byName("AXPress").perform(); return true; } catch (e6) {}
          }
        }
      }
      if (walk(el, depth + 1)) return true;
    }
    return false;
  }
  var wins = proc.windows();
  for (var w = 0; w < wins.length; w++) {
    if (walk(wins[w], 0)) return { ok: true, clicked: targetTitle || targetDesc || info.mode };
  }
  return { ok: false, error: "找到模式按钮但点击失败" };
}
var proc = findNetease();
if (!proc) JSON.stringify({ ok: false, error: "网易云未运行" });
else {
  enableAx(proc);
  JSON.stringify(clickModeButton(proc));
}
`);
    return { ...result, accessibility: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/不允许辅助访问|-1719|not allowed/i.test(message)) {
      return { ok: false, accessibility: false, error: "需要辅助功能权限才能切换网易云播放模式" };
    }
    return { ok: false, accessibility: true, error: message };
  }
}

/**
 * Clicks a Control-menu item whose title matches the target mode.
 * @param {string} mode
 */
async function clickModeMenuItem(mode) {
  if (!isAccessibilityTrusted(false)) {
    return { ok: false, accessibility: false, error: "需要辅助功能权限" };
  }
  const label = MODE_LABELS[mode] || mode;
  try {
    const result = await runJxa(`
${jxaPreamble()}
var targetMode = ${JSON.stringify(mode)};
var targetLabel = ${JSON.stringify(label)};
var proc = findNetease();
if (!proc) JSON.stringify({ ok: false, error: "网易云未运行" });
else {
  enableAx(proc);
  var bars = proc.menuBars();
  var ok = false;
  var clicked = null;
  if (bars.length) {
    var items = bars[0].menuBarItems();
    for (var i = 0; i < items.length; i++) {
      var name = "";
      try { name = String(items[i].title() || items[i].name() || ""); } catch (e) {}
      if (name !== "控制" && name !== "Controls") continue;
      var menus = items[i].menus();
      if (!menus.length) continue;
      var mis = menus[0].menuItems();
      for (var j = 0; j < mis.length; j++) {
        var t = "";
        try { t = String(mis[j].title() || mis[j].name() || ""); } catch (e2) {}
        var m = modeFromText(t);
        if (m === targetMode || t.indexOf(targetLabel) >= 0) {
          try { mis[j].click(); ok = true; clicked = t; break; } catch (e3) {
            try { mis[j].actions.byName("AXPress").perform(); ok = true; clicked = t; break; } catch (e4) {}
          }
        }
      }
    }
  }
  JSON.stringify({ ok: ok, clicked: clicked, error: ok ? null : "控制菜单中无对应播放模式项" });
}
`);
    return { ...result, accessibility: true };
  } catch (error) {
    return {
      ok: false,
      accessibility: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Sets NetEase to an absolute playback mode (menu click, else cycle button).
 * `prompt` must stay false for background work such as the launch sync, otherwise
 * macOS shows its Accessibility dialog without the user having asked for anything.
 * @param {string} targetMode
 * @param {{ prompt?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, mode?: string|null, error?: string, accessibility?: boolean }>}
 */
async function setPlaybackMode(targetMode, options = {}) {
  const prompt = options.prompt !== false;
  if (!PLAYBACK_MODES.includes(targetMode)) {
    return { ok: false, error: `未知播放模式: ${targetMode}` };
  }

  if (!isAccessibilityTrusted(prompt)) {
    if (prompt) {
      await openAccessibilitySettings();
    }
    return {
      ok: false,
      accessibility: false,
      error: "请在系统设置中允许本应用使用辅助功能，然后重试"
    };
  }

  // Prefer explicit Control-menu item when present.
  const menuClick = await clickModeMenuItem(targetMode);
  if (menuClick.ok) {
    await sleep(220);
    const after = await detectPlaybackMode();
    return {
      ok: true,
      mode: after.mode || targetMode,
      accessibility: true,
      method: "menu"
    };
  }

  // Otherwise cycle the player-bar button until detection matches (max 4).
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const detected = await detectPlaybackMode();
    if (detected.ok && detected.mode === targetMode) {
      return { ok: true, mode: targetMode, accessibility: true, method: "already" };
    }
    const click = await clickModeCycleButton();
    if (!click.ok) {
      return {
        ok: false,
        accessibility: click.accessibility !== false,
        error: click.error || menuClick.error || "无法切换播放模式"
      };
    }
    await sleep(260);
    const again = await detectPlaybackMode();
    if (again.ok && again.mode === targetMode) {
      return { ok: true, mode: targetMode, accessibility: true, method: "cycle" };
    }
  }

  const finalDetect = await detectPlaybackMode();
  return {
    ok: Boolean(finalDetect.mode),
    mode: finalDetect.mode || null,
    accessibility: true,
    error: finalDetect.mode
      ? null
      : "已尝试切换，但未能确认网易云当前模式（请保持主窗口可见）"
  };
}

/**
 * Advances one step in NetEase's mode cycle and returns the resulting mode.
 * @param {string|null} currentMode
 */
async function advancePlaybackMode(currentMode) {
  const order = PLAYBACK_MODES;
  const idx = order.indexOf(currentMode || "");
  const next = order[(idx >= 0 ? idx + 1 : 1) % order.length];
  const setResult = await setPlaybackMode(next);
  if (setResult.ok && setResult.mode) {
    return setResult;
  }
  // Fallback: single cycle click then detect.
  const click = await clickModeCycleButton();
  if (!click.ok) {
    return click;
  }
  await sleep(260);
  const detected = await detectPlaybackMode();
  return {
    ok: Boolean(detected.mode) || click.ok,
    mode: detected.mode || next,
    accessibility: click.accessibility !== false,
    error: detected.error,
    method: "cycle-click"
  };
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalizes a stored launch-sync mode id.
 * @param {unknown} value
 */
function normalizeLaunchPlaybackMode(value) {
  if (value === "keep" || value === "off") {
    return "keep";
  }
  if (typeof value === "string" && PLAYBACK_MODES.includes(value)) {
    return value;
  }
  return "keep";
}

module.exports = {
  PLAYBACK_MODES,
  MODE_LABELS,
  MODE_TITLE_MAP,
  isAccessibilityTrusted,
  openAccessibilitySettings,
  detectPlaybackMode,
  setPlaybackMode,
  advancePlaybackMode,
  clickModeCycleButton,
  normalizeLaunchPlaybackMode
};
