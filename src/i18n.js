/**
 * Lightweight UI i18n shared by float, settings, and the main process.
 * Keys are flat dotted strings; missing keys fall back to zh-CN then the key.
 */

const LOCALE_OPTIONS = [
  { id: "system", nativeLabel: "System / 跟随系统 / システム" },
  { id: "zh-CN", nativeLabel: "简体中文" },
  { id: "en", nativeLabel: "English" },
  { id: "ja", nativeLabel: "日本語" }
];

const DEFAULT_LOCALE_SETTING = "system";

const MESSAGES = {
  "zh-CN": {
    "app.name": "网易云浮窗",
    "app.drag": "拖动浮窗",
    "app.resize": "拖动调整浮窗大小",
    "app.openPlayer": "打开音乐软件",
    "app.settings": "设置",
    "app.prev": "上一首",
    "app.toggle": "播放/暂停",
    "app.next": "下一首",
    "status.waiting": "等待",
    "status.idle": "空闲",
    "status.error": "错误",
    "status.unmatched": "未匹配",
    "status.playing": "播放中",
    "status.paused": "已暂停",
    "float.notPlaying": "未在播放",
    "float.playIn": "请先在{name}播放歌曲",
    "float.selectedPlayer": "所选音乐软件",
    "float.otherPlayer": "其它播放器",
    "float.notTarget": "当前 Now Playing 不是{name}",
    "float.mediaUnavailable": "媒体状态不可用",
    "float.unknownTrack": "未知曲目",
    "float.mediaRemoteError": "MediaRemote 读取失败",
    "float.audioHint":
      "需要「仅系统音频录制」权限才能显示真实声浪。系统设置 → 隐私与安全性 → 屏幕与系统音频录制。",
    "float.modeNeedsAx":
      "切换播放模式需要「辅助功能」权限：系统设置 → 隐私与安全性 → 辅助功能，勾选 NeteaseFloat。",
    "float.modeSyncFailed": "播放模式未同步到网易云：{error}",
    "float.launchModeNeedsAx": "开机同步播放模式需要「辅助功能」权限。",
    "mode.sequential": "顺序播放",
    "mode.all": "列表循环",
    "mode.one": "单曲循环",
    "mode.shuffle": "随机播放",
    "mode.title.sequential": "播放模式：顺序播放",
    "mode.title.all": "播放模式：列表循环",
    "mode.title.one": "播放模式：单曲循环",
    "mode.title.shuffle": "播放模式：随机播放",
    "tray.show": "显示浮窗",
    "tray.hide": "隐藏浮窗",
    "tray.settings": "设置",
    "tray.checkUpdate": "检查更新",
    "tray.openPlayer": "打开当前音乐软件",
    "tray.quit": "退出",
    "settings.title": "设置",
    "settings.nav.general": "常规",
    "settings.panel.general": "常规",
    "settings.quit": "退出",
    "settings.window": "窗口",
    "settings.alwaysOnTop": "始终置顶",
    "settings.language": "语言",
    "settings.language.help": "界面语言；歌词原文与翻译不受影响。",
    "settings.floatWidth": "浮窗宽度",
    "settings.floatHeight": "展开高度",
    "settings.floatSize.help": "也可在浮窗右下角拖动调整；收起时只改宽度。",
    "settings.resetFloatSize": "恢复默认大小",
    "settings.updates": "更新",
    "settings.autoCheckUpdates": "启动时检查更新",
    "settings.checkUpdate": "检查更新",
    "settings.installUpdate": "重启并安装",
    "settings.players": "音乐软件",
    "settings.followPlayer": "跟随播放器",
    "settings.openPlayer": "打开所选音乐软件",
    "settings.openPlayerNamed": "打开{name}",
    "settings.noPlayers": "未检测到已安装的音乐软件",
    "settings.playbackMode": "播放模式",
    "settings.launchMode": "开机自动切换",
    "settings.mode.keep": "保持现状",
    "settings.requestAx": "授权辅助功能",
    "settings.axChecking": "检查中…",
    "settings.axTrusted": "已授权",
    "settings.axDenied": "未授权",
    "settings.appearance": "外观",
    "settings.transparentFloat": "透明小窗",
    "settings.windowColor": "小窗颜色",
    "settings.spectrumColor": "声浪颜色",
    "settings.titleFont": "标题字体",
    "settings.importFont": "导入字体",
    "settings.removeFont": "删除导入字体",
    "settings.titleSize": "标题字号",
    "settings.resetColors": "恢复默认配色",
    "settings.fonts.builtin": "内置字体",
    "settings.fonts.imported": "导入字体",
    "settings.audio": "系统音频录制",
    "settings.audio.hint":
      "仅采集设置里选中的音乐软件进程音频，其它 App 的声音不会进频谱。",
    "settings.audio.status": "采集状态",
    "settings.audio.request": "请求录音权限",
    "audio.state.granted": "已授权",
    "audio.state.denied": "未授权",
    "audio.state.idle": "未开启",
    "audio.state.unsupported": "不支持",
    "audio.state.unknown": "未知",
    "audio.detail.fail": "采集失败：{error}",
    "audio.detail.ok": "系统音频采集正常，频谱应能随播放跳动。",
    "audio.detail.opened":
      "已打开系统设置。请在「仅系统音频录制」中勾选本应用（或 audiotee）。",
    "audio.detail.consent":
      "已记录同意，等待音乐软件进程后开始采集。",
    "audio.detail.need":
      "真实频谱需要「仅系统音频录制」权限。首次点击下方按钮即可。",
    "audio.detail.requesting": "请求中",
    "audio.hint.unsupported": "当前平台暂不支持系统音频频谱。",
    "audio.hint.macos":
      "系统设置 → 隐私与安全性 → 屏幕与系统音频录制 →「仅系统音频录制」，勾选 NeteaseFloat。频谱只采集当前选中音乐软件的进程音频。",
    "update.unknown": "尚未检查"
  },
  en: {
    "app.name": "NeteaseFloat",
    "app.drag": "Drag float",
    "app.resize": "Drag to resize",
    "app.openPlayer": "Open music app",
    "app.settings": "Settings",
    "app.prev": "Previous",
    "app.toggle": "Play/Pause",
    "app.next": "Next",
    "status.waiting": "Idle",
    "status.idle": "Idle",
    "status.error": "Error",
    "status.unmatched": "No match",
    "status.playing": "Playing",
    "status.paused": "Paused",
    "float.notPlaying": "Not playing",
    "float.playIn": "Play a track in {name} first",
    "float.selectedPlayer": "selected music app",
    "float.otherPlayer": "Other player",
    "float.notTarget": "Now Playing is not {name}",
    "float.mediaUnavailable": "Media unavailable",
    "float.unknownTrack": "Unknown track",
    "float.mediaRemoteError": "Failed to read MediaRemote",
    "float.audioHint":
      "System Audio Recording permission is required for the spectrum. System Settings → Privacy & Security → Screen & System Audio Recording.",
    "float.modeNeedsAx":
      "Playback mode needs Accessibility: System Settings → Privacy & Security → Accessibility, enable NeteaseFloat.",
    "float.modeSyncFailed": "Could not sync playback mode: {error}",
    "float.launchModeNeedsAx":
      "Launch playback-mode sync needs Accessibility permission.",
    "mode.sequential": "Sequential",
    "mode.all": "Repeat all",
    "mode.one": "Repeat one",
    "mode.shuffle": "Shuffle",
    "mode.title.sequential": "Mode: Sequential",
    "mode.title.all": "Mode: Repeat all",
    "mode.title.one": "Mode: Repeat one",
    "mode.title.shuffle": "Mode: Shuffle",
    "tray.show": "Show float",
    "tray.hide": "Hide float",
    "tray.settings": "Settings",
    "tray.checkUpdate": "Check for updates",
    "tray.openPlayer": "Open current music app",
    "tray.quit": "Quit",
    "settings.title": "Settings",
    "settings.nav.general": "General",
    "settings.panel.general": "General",
    "settings.quit": "Quit",
    "settings.window": "Window",
    "settings.alwaysOnTop": "Always on top",
    "settings.language": "Language",
    "settings.language.help": "UI language only. Lyrics stay as provided by the player.",
    "settings.floatWidth": "Float width",
    "settings.floatHeight": "Expanded height",
    "settings.floatSize.help": "Or drag the bottom-right corner. Collapsed mode only changes width.",
    "settings.resetFloatSize": "Reset float size",
    "settings.updates": "Updates",
    "settings.autoCheckUpdates": "Check for updates on launch",
    "settings.checkUpdate": "Check for updates",
    "settings.installUpdate": "Restart & install",
    "settings.players": "Music apps",
    "settings.followPlayer": "Follow player",
    "settings.openPlayer": "Open selected music app",
    "settings.openPlayerNamed": "Open {name}",
    "settings.noPlayers": "No installed music apps detected",
    "settings.playbackMode": "Playback mode",
    "settings.launchMode": "On launch",
    "settings.mode.keep": "Keep current",
    "settings.requestAx": "Grant Accessibility",
    "settings.axChecking": "Checking…",
    "settings.axTrusted": "Granted",
    "settings.axDenied": "Not granted",
    "settings.appearance": "Appearance",
    "settings.transparentFloat": "Transparent mini float",
    "settings.windowColor": "Panel color",
    "settings.spectrumColor": "Spectrum color",
    "settings.titleFont": "Title font",
    "settings.importFont": "Import font",
    "settings.removeFont": "Remove imported font",
    "settings.titleSize": "Title size",
    "settings.resetColors": "Reset colors",
    "settings.fonts.builtin": "Built-in",
    "settings.fonts.imported": "Imported",
    "settings.audio": "System audio",
    "settings.audio.hint":
      "Only captures audio from the selected music app’s processes.",
    "settings.audio.status": "Capture status",
    "settings.audio.request": "Request recording permission",
    "audio.state.granted": "Granted",
    "audio.state.denied": "Denied",
    "audio.state.idle": "Off",
    "audio.state.unsupported": "Unsupported",
    "audio.state.unknown": "Unknown",
    "audio.detail.fail": "Capture failed: {error}",
    "audio.detail.ok": "System audio capture is working.",
    "audio.detail.opened":
      "Opened System Settings. Enable this app under System Audio Recording Only.",
    "audio.detail.consent":
      "Consent saved. Capture starts once the music app process is known.",
    "audio.detail.need":
      "Real spectrum needs System Audio Recording. Tap the button below once.",
    "audio.detail.requesting": "Requesting",
    "audio.hint.unsupported": "System audio spectrum is not available on this platform.",
    "audio.hint.macos":
      "System Settings → Privacy & Security → Screen & System Audio Recording → System Audio Recording Only, enable NeteaseFloat. Spectrum follows the selected music app only.",
    "update.unknown": "Not checked yet"
  },
  ja: {
    "app.name": "NeteaseFloat",
    "app.drag": "ウィジェットをドラッグ",
    "app.resize": "ドラッグしてサイズ変更",
    "app.openPlayer": "音楽アプリを開く",
    "app.settings": "設定",
    "app.prev": "前の曲",
    "app.toggle": "再生/一時停止",
    "app.next": "次の曲",
    "status.waiting": "待機",
    "status.idle": "アイドル",
    "status.error": "エラー",
    "status.unmatched": "未一致",
    "status.playing": "再生中",
    "status.paused": "一時停止",
    "float.notPlaying": "再生していません",
    "float.playIn": "先に{name}で曲を再生してください",
    "float.selectedPlayer": "選択中の音楽アプリ",
    "float.otherPlayer": "他のプレーヤー",
    "float.notTarget": "Now Playing は{name}ではありません",
    "float.mediaUnavailable": "メディア状態を取得できません",
    "float.unknownTrack": "不明な曲",
    "float.mediaRemoteError": "MediaRemote の取得に失敗しました",
    "float.audioHint":
      "スペクトラムには「システムオーディオ録音」権限が必要です。システム設定 → プライバシーとセキュリティ → 画面収録とシステムオーディオ録音。",
    "float.modeNeedsAx":
      "再生モード切替にはアクセシビリティ権限が必要です。システム設定で NeteaseFloat を許可してください。",
    "float.modeSyncFailed": "再生モードを同期できませんでした：{error}",
    "float.launchModeNeedsAx":
      "起動時の再生モード同期にはアクセシビリティ権限が必要です。",
    "mode.sequential": "順再生",
    "mode.all": "全曲リピート",
    "mode.one": "1曲リピート",
    "mode.shuffle": "シャッフル",
    "mode.title.sequential": "モード：順再生",
    "mode.title.all": "モード：全曲リピート",
    "mode.title.one": "モード：1曲リピート",
    "mode.title.shuffle": "モード：シャッフル",
    "tray.show": "ウィジェットを表示",
    "tray.hide": "ウィジェットを隠す",
    "tray.settings": "設定",
    "tray.checkUpdate": "更新を確認",
    "tray.openPlayer": "現在の音楽アプリを開く",
    "tray.quit": "終了",
    "settings.title": "設定",
    "settings.nav.general": "一般",
    "settings.panel.general": "一般",
    "settings.quit": "終了",
    "settings.window": "ウィンドウ",
    "settings.alwaysOnTop": "常に最前面",
    "settings.language": "言語",
    "settings.language.help": "UI の言語のみ。歌詞の原文・訳はそのままです。",
    "settings.floatWidth": "ウィジェット幅",
    "settings.floatHeight": "展開時の高さ",
    "settings.floatSize.help": "右下をドラッグしても変更できます。折りたたみ時は幅のみ。",
    "settings.resetFloatSize": "サイズをリセット",
    "settings.updates": "アップデート",
    "settings.autoCheckUpdates": "起動時に更新を確認",
    "settings.checkUpdate": "更新を確認",
    "settings.installUpdate": "再起動してインストール",
    "settings.players": "音楽アプリ",
    "settings.followPlayer": "追従するプレーヤー",
    "settings.openPlayer": "選択した音楽アプリを開く",
    "settings.openPlayerNamed": "{name}を開く",
    "settings.noPlayers": "インストール済みの音楽アプリが見つかりません",
    "settings.playbackMode": "再生モード",
    "settings.launchMode": "起動時",
    "settings.mode.keep": "変更しない",
    "settings.requestAx": "アクセシビリティを許可",
    "settings.axChecking": "確認中…",
    "settings.axTrusted": "許可済み",
    "settings.axDenied": "未許可",
    "settings.appearance": "外観",
    "settings.transparentFloat": "透明ミニウィジェット",
    "settings.windowColor": "パネル色",
    "settings.spectrumColor": "スペクトラム色",
    "settings.titleFont": "タイトルフォント",
    "settings.importFont": "フォントを読み込む",
    "settings.removeFont": "読み込みフォントを削除",
    "settings.titleSize": "タイトルサイズ",
    "settings.resetColors": "色をリセット",
    "settings.fonts.builtin": "内蔵",
    "settings.fonts.imported": "読み込み済み",
    "settings.audio": "システムオーディオ",
    "settings.audio.hint":
      "選択した音楽アプリのプロセス音声のみを取得します。",
    "settings.audio.status": "取得状態",
    "settings.audio.request": "録音権限をリクエスト",
    "audio.state.granted": "許可済み",
    "audio.state.denied": "拒否",
    "audio.state.idle": "オフ",
    "audio.state.unsupported": "非対応",
    "audio.state.unknown": "不明",
    "audio.detail.fail": "取得失敗：{error}",
    "audio.detail.ok": "システムオーディオ取得は正常です。",
    "audio.detail.opened":
      "システム設定を開きました。「システムオーディオ録音のみ」で本アプリを有効にしてください。",
    "audio.detail.consent":
      "同意を保存しました。音楽アプリの PID が分かり次第開始します。",
    "audio.detail.need":
      "本物のスペクトラムにはシステムオーディオ録音が必要です。下のボタンを一度押してください。",
    "audio.detail.requesting": "リクエスト中",
    "audio.hint.unsupported": "このプラットフォームではシステムオーディオに非対応です。",
    "audio.hint.macos":
      "システム設定 → プライバシーとセキュリティ → 画面収録とシステムオーディオ録音 → システムオーディオ録音のみで NeteaseFloat を許可。スペクトラムは選択中の音楽アプリのみです。",
    "update.unknown": "未確認"
  }
};

/** Active resolved locale used by t(). */
let activeLocale = "zh-CN";

/**
 * Maps an OS / BCP-47 tag onto a built-in message pack.
 * @param {string} tag
 */
function mapOsLocale(tag) {
  const lower = String(tag || "").toLowerCase();
  if (lower.startsWith("zh")) {
    return "zh-CN";
  }
  if (lower.startsWith("ja")) {
    return "ja";
  }
  if (lower.startsWith("en")) {
    return "en";
  }
  return "zh-CN";
}

/**
 * Normalizes a stored locale preference.
 * @param {unknown} value
 */
function normalizeLocaleSetting(value) {
  if (value === "system" || value === "zh-CN" || value === "en" || value === "ja") {
    return value;
  }
  return DEFAULT_LOCALE_SETTING;
}

/**
 * Resolves a stored preference to a concrete message-pack id.
 * @param {unknown} setting
 * @param {string} [osTag]
 */
function resolveLocale(setting, osTag) {
  const normalized = normalizeLocaleSetting(setting);
  if (normalized !== "system") {
    return normalized;
  }
  let tag = osTag;
  if (!tag && typeof navigator !== "undefined") {
    tag = navigator.language;
  }
  return mapOsLocale(tag || "zh-CN");
}

/**
 * Sets the active locale for subsequent t() calls.
 * @param {string} locale
 */
function setActiveLocale(locale) {
  activeLocale = MESSAGES[locale] ? locale : "zh-CN";
  return activeLocale;
}

/** Returns the active resolved locale id. */
function getActiveLocale() {
  return activeLocale;
}

/**
 * Looks up a translated string, with optional {var} substitution.
 * @param {string} key
 * @param {Record<string, string|number>|null} [vars]
 */
function t(key, vars) {
  const table = MESSAGES[activeLocale] || MESSAGES["zh-CN"];
  let text = table[key] ?? MESSAGES["zh-CN"][key] ?? key;
  if (vars && typeof vars === "object") {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/**
 * Applies data-i18n / data-i18n-title / data-i18n-aria attributes under a root.
 * @param {ParentNode} [root]
 */
function applyDomI18n(root) {
  if (typeof document === "undefined") {
    return;
  }
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });
  scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) {
      el.setAttribute("title", t(key));
    }
  });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) {
      el.setAttribute("aria-label", t(key));
    }
  });
  if (scope.documentElement) {
    scope.documentElement.lang = activeLocale === "zh-CN" ? "zh-CN" : activeLocale;
  } else if (typeof document !== "undefined") {
    document.documentElement.lang =
      activeLocale === "zh-CN" ? "zh-CN" : activeLocale;
  }
}

if (typeof window !== "undefined") {
  window.I18N_LOCALE_OPTIONS = LOCALE_OPTIONS;
  window.I18N_DEFAULT_LOCALE_SETTING = DEFAULT_LOCALE_SETTING;
  window.normalizeLocaleSetting = normalizeLocaleSetting;
  window.resolveLocale = resolveLocale;
  window.setActiveLocale = setActiveLocale;
  window.getActiveLocale = getActiveLocale;
  window.t = t;
  window.applyDomI18n = applyDomI18n;
  window.mapOsLocale = mapOsLocale;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LOCALE_OPTIONS,
    DEFAULT_LOCALE_SETTING,
    MESSAGES,
    mapOsLocale,
    normalizeLocaleSetting,
    resolveLocale,
    setActiveLocale,
    getActiveLocale,
    t,
    applyDomI18n
  };
}
