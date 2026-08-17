/**
 * Title font presets (CJK-capable stacks) plus helpers for imported custom fonts.
 * Shared by settings UI and the float window (plain script, no bundler).
 */

const SYSTEM_FALLBACK_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", "Noto Sans CJK JP", "Microsoft YaHei", sans-serif';

const TITLE_FONT_PRESETS = {
  system: {
    id: "system",
    label: "系统无衬线",
    hint: "苹方 / 冬青黑体，中英日通用",
    stack: SYSTEM_FALLBACK_STACK
  },
  song: {
    id: "song",
    label: "宋体 / 明朝",
    hint: "华文宋体与日文明朝，偏印刷感",
    stack:
      '"Songti SC", "Songti TC", "Hiragino Mincho ProN", "YuMincho", "Noto Serif CJK SC", "Noto Serif CJK JP", "STSong", serif'
  },
  hei: {
    id: "hei",
    label: "黑体",
    hint: "黑体族，标题更醒目",
    stack:
      '"Heiti SC", "STHeiti", "YuGothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", "Noto Sans CJK JP", sans-serif'
  },
  yuan: {
    id: "yuan",
    label: "圆体",
    hint: "圆角字形，偏柔和",
    stack:
      '"Yuanti SC", "Hiragino Maru Gothic ProN", "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Noto Sans CJK JP", sans-serif'
  },
  kai: {
    id: "kai",
    label: "楷体",
    hint: "手写印刷体，偏文艺",
    stack: `"Kaiti SC", "STKaiti", "KaiTi", "BiauKai", ${SYSTEM_FALLBACK_STACK}`
  },
  xingkai: {
    id: "xingkai",
    label: "行楷",
    hint: "行书风格，标题更有笔锋",
    stack: `"Xingkai SC", "STXingkai", "Kaiti SC", ${SYSTEM_FALLBACK_STACK}`
  },
  lishu: {
    id: "lishu",
    label: "隶书",
    hint: "隶变 / 报隶，偏古典海报",
    stack: `"Libian SC", "Baoli SC", "STLiti", "LiSu", ${SYSTEM_FALLBACK_STACK}`
  },
  weibei: {
    id: "weibei",
    label: "魏碑",
    hint: "碑刻感，适合短标题",
    stack: `"Weibei SC", "Libian SC", ${SYSTEM_FALLBACK_STACK}`
  },
  hanzipen: {
    id: "hanzipen",
    label: "手写钢笔",
    hint: "HanziPen，轻松手写感",
    stack: `"HanziPen SC", "Hannotate SC", "Tsukushi A Round Gothic", ${SYSTEM_FALLBACK_STACK}`
  },
  hannotate: {
    id: "hannotate",
    label: "手写标注",
    hint: "Hannotate，笔记风",
    stack: `"Hannotate SC", "HanziPen SC", "Yuanti SC", ${SYSTEM_FALLBACK_STACK}`
  },
  wawati: {
    id: "wawati",
    label: "娃娃体",
    hint: "圆润卡通标题",
    stack: `"Wawati SC", "Yuanti SC", "Hiragino Maru Gothic ProN", ${SYSTEM_FALLBACK_STACK}`
  },
  lanting: {
    id: "lanting",
    label: "兰亭黑",
    hint: "现代标题黑体",
    stack: `"Lantinghei SC", "Heiti SC", "PingFang SC", ${SYSTEM_FALLBACK_STACK}`
  },
  kaku: {
    id: "kaku",
    label: "角ゴシック",
    hint: "日文角ゴ优先，兼顾中英",
    stack:
      '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "PingFang SC", "YuGothic", "Noto Sans CJK JP", "Noto Sans CJK SC", sans-serif'
  },
  maru: {
    id: "maru",
    label: "丸ゴシック",
    hint: "日文圆体优先",
    stack: `"Hiragino Maru Gothic ProN", "Yuanti SC", "Tsukushi A Round Gothic", ${SYSTEM_FALLBACK_STACK}`
  },
  didot: {
    id: "didot",
    label: "Didot 衬线",
    hint: "西文杂志衬线，CJK 回退系统字体",
    stack: `"Didot", "Bodoni 72", "Songti SC", ${SYSTEM_FALLBACK_STACK}`
  },
  optima: {
    id: "optima",
    label: "Optima",
    hint: "西文人文无衬线",
    stack: `"Optima", "Futura", ${SYSTEM_FALLBACK_STACK}`
  },
  typewriter: {
    id: "typewriter",
    label: "打字机",
    hint: "American Typewriter",
    stack: `"American Typewriter", "Courier New", ${SYSTEM_FALLBACK_STACK}`
  },
  marker: {
    id: "marker",
    label: "马克笔",
    hint: "Marker Felt，涂鸦感",
    stack: `"Marker Felt", "Hannotate SC", ${SYSTEM_FALLBACK_STACK}`
  },
  chancery: {
    id: "chancery",
    label: "Apple Chancery",
    hint: "西文花体，偏装饰",
    stack: `"Apple Chancery", "Snell Roundhand", "Xingkai SC", ${SYSTEM_FALLBACK_STACK}`
  },
  zapfino: {
    id: "zapfino",
    label: "Zapfino",
    hint: "极度花体西文（短英文好看）",
    stack: `"Zapfino", "Snell Roundhand", "Apple Chancery", ${SYSTEM_FALLBACK_STACK}`
  },
  copperplate: {
    id: "copperplate",
    label: "Copperplate",
    hint: "铭牌西文大写气质",
    stack: `"Copperplate", "Futura", ${SYSTEM_FALLBACK_STACK}`
  },
  mono: {
    id: "mono",
    label: "等宽",
    hint: "等宽拉丁 + CJK 回退",
    stack:
      '"SF Mono", Menlo, Monaco, "Courier New", "PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", monospace'
  }
};

const DEFAULT_TITLE_FONT_ID = "system";
const DEFAULT_TITLE_FONT_SIZE = 13;
const MIN_TITLE_FONT_SIZE = 10;
const MAX_TITLE_FONT_SIZE = 28;

/**
 * Returns true when the value looks like a safe imported-font id.
 * @param {unknown} value
 */
function isCustomFontId(value) {
  return typeof value === "string" && /^cf_[a-z0-9]+$/i.test(value);
}

/**
 * Normalizes the persisted custom-font catalog.
 * @param {unknown} value
 * @returns {{ id: string, label: string, family: string, fileName: string }[]}
 */
function normalizeCustomFonts(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const fonts = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id : "";
    const fileName = typeof entry.fileName === "string" ? entry.fileName : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const family = typeof entry.family === "string" ? entry.family.trim() : "";
    if (!isCustomFontId(id) || seen.has(id)) {
      continue;
    }
    if (!/^[a-z0-9._-]+\.(ttf|otf|ttc|woff2?)$/i.test(fileName)) {
      continue;
    }
    if (!family || !label) {
      continue;
    }
    seen.add(id);
    fonts.push({ id, label: label.slice(0, 64), family: family.slice(0, 64), fileName });
  }
  return fonts;
}

/**
 * Returns the CSS font-family stack for a preset or imported font id.
 * @param {string} fontId
 * @param {{ id: string, family: string }[]} [customFonts]
 */
function resolveTitleFontStack(fontId, customFonts = []) {
  const custom = normalizeCustomFonts(customFonts).find((font) => font.id === fontId);
  if (custom) {
    return `"${custom.family}", ${SYSTEM_FALLBACK_STACK}`;
  }
  const preset = TITLE_FONT_PRESETS[fontId] || TITLE_FONT_PRESETS[DEFAULT_TITLE_FONT_ID];
  return preset.stack;
}

/**
 * Clamps title font size into the allowed px range.
 * @param {unknown} value
 */
function clampTitleFontSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_TITLE_FONT_SIZE;
  }
  return Math.min(MAX_TITLE_FONT_SIZE, Math.max(MIN_TITLE_FONT_SIZE, Math.round(n)));
}

/**
 * Validates a title font id against presets and imported fonts.
 * @param {unknown} value
 * @param {{ id: string }[]} [customFonts]
 */
function normalizeTitleFontId(value, customFonts = []) {
  if (typeof value === "string" && TITLE_FONT_PRESETS[value]) {
    return value;
  }
  if (
    typeof value === "string" &&
    normalizeCustomFonts(customFonts).some((font) => font.id === value)
  ) {
    return value;
  }
  return DEFAULT_TITLE_FONT_ID;
}

/**
 * Builds @font-face CSS for imported fonts served over the nf-font protocol.
 * @param {{ family: string, fileName: string }[]} customFonts
 */
function buildCustomFontFaceCss(customFonts) {
  return normalizeCustomFonts(customFonts)
    .map((font) => {
      const format = fontFaceFormat(font.fileName);
      const formatSuffix = format ? ` format("${format}")` : "";
      return `@font-face{font-family:"${font.family}";src:url("nf-font://fonts/${encodeURIComponent(font.fileName)}")${formatSuffix};font-display:swap;}`;
    })
    .join("\n");
}

/**
 * Maps a font filename extension to a CSS format() hint.
 * @param {string} fileName
 */
function fontFaceFormat(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "woff2") {
    return "woff2";
  }
  if (ext === "woff") {
    return "woff";
  }
  if (ext === "otf") {
    return "opentype";
  }
  if (ext === "ttf" || ext === "ttc") {
    return "truetype";
  }
  return "";
}

if (typeof window !== "undefined") {
  window.TITLE_FONT_PRESETS = TITLE_FONT_PRESETS;
  window.DEFAULT_TITLE_FONT_ID = DEFAULT_TITLE_FONT_ID;
  window.DEFAULT_TITLE_FONT_SIZE = DEFAULT_TITLE_FONT_SIZE;
  window.MIN_TITLE_FONT_SIZE = MIN_TITLE_FONT_SIZE;
  window.MAX_TITLE_FONT_SIZE = MAX_TITLE_FONT_SIZE;
  window.resolveTitleFontStack = resolveTitleFontStack;
  window.clampTitleFontSize = clampTitleFontSize;
  window.normalizeTitleFontId = normalizeTitleFontId;
  window.normalizeCustomFonts = normalizeCustomFonts;
  window.buildCustomFontFaceCss = buildCustomFontFaceCss;
  window.isCustomFontId = isCustomFontId;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TITLE_FONT_PRESETS,
    DEFAULT_TITLE_FONT_ID,
    DEFAULT_TITLE_FONT_SIZE,
    MIN_TITLE_FONT_SIZE,
    MAX_TITLE_FONT_SIZE,
    SYSTEM_FALLBACK_STACK,
    isCustomFontId,
    normalizeCustomFonts,
    resolveTitleFontStack,
    clampTitleFontSize,
    normalizeTitleFontId,
    buildCustomFontFaceCss,
    fontFaceFormat
  };
}
