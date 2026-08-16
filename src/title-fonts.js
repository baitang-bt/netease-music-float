/**
 * Title font presets with stacks that cover Latin + Chinese + Japanese on macOS.
 * Shared by settings UI and the float window (plain script, no bundler).
 */

const TITLE_FONT_PRESETS = {
  system: {
    id: "system",
    label: "系统无衬线",
    hint: "苹方 / 冬青黑体，中英日通用",
    stack:
      '"PingFang SC", "Hiragino Sans GB", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", "Noto Sans CJK JP", "Microsoft YaHei", sans-serif'
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
  kaku: {
    id: "kaku",
    label: "角ゴシック",
    hint: "日文角ゴ优先，兼顾中英",
    stack:
      '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "PingFang SC", "YuGothic", "Noto Sans CJK JP", "Noto Sans CJK SC", sans-serif'
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
const MAX_TITLE_FONT_SIZE = 22;

/**
 * Returns the CSS font-family stack for a preset id.
 * @param {string} fontId
 */
function resolveTitleFontStack(fontId) {
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
 * Validates a title font preset id.
 * @param {unknown} value
 */
function normalizeTitleFontId(value) {
  if (typeof value === "string" && TITLE_FONT_PRESETS[value]) {
    return value;
  }
  return DEFAULT_TITLE_FONT_ID;
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
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TITLE_FONT_PRESETS,
    DEFAULT_TITLE_FONT_ID,
    DEFAULT_TITLE_FONT_SIZE,
    MIN_TITLE_FONT_SIZE,
    MAX_TITLE_FONT_SIZE,
    resolveTitleFontStack,
    clampTitleFontSize,
    normalizeTitleFontId
  };
}
