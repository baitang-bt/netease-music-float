/**
 * Splits title/lyric text by script and paints each span with its locale font.
 * Plain script shared by the float panel and lyric overlay.
 */

/**
 * Classifies one character into zh / en / ja buckets for font routing.
 * @param {string} char
 */
function classifyScript(char) {
  const code = char.codePointAt(0) || 0;
  if (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xc0 && code <= 0x024f) ||
    (code >= 0x1e00 && code <= 0x1eff)
  ) {
    return "en";
  }
  if (
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0xff66 && code <= 0xff9d)
  ) {
    return "ja";
  }
  return "zh";
}

/**
 * True for whitespace and punctuation that should follow the previous script.
 * @param {string} char
 */
function isNeutralChar(char) {
  return /[\s·・•|/\\\-—–…,.!?;:()[\]{}'"`~@#$%^&*+=<>]/.test(char);
}

/**
 * Splits text into contiguous script runs for multilingual font rendering.
 * @param {string} text
 * @returns {{ script: "zh"|"en"|"ja", text: string }[]}
 */
function segmentTextByScript(text) {
  const source = String(text || "");
  if (!source) {
    return [];
  }

  const segments = [];
  let currentScript = null;
  let buffer = "";

  /** Flushes the buffered characters into the segment list. */
  function flush() {
    if (!buffer) {
      return;
    }
    segments.push({
      script: currentScript || "zh",
      text: buffer
    });
    buffer = "";
  }

  for (const char of source) {
    const script = isNeutralChar(char)
      ? currentScript || "zh"
      : classifyScript(char);
    if (currentScript && script !== currentScript) {
      flush();
    }
    currentScript = script;
    buffer += char;
  }
  flush();
  return segments;
}

/**
 * Replaces a text container's children with script-tagged spans.
 * @param {HTMLElement|null} container
 * @param {string} text
 */
function renderMultilingualText(container, text) {
  if (!container) {
    return;
  }
  container.replaceChildren();
  for (const segment of segmentTextByScript(text)) {
    const span = document.createElement("span");
    span.className = `font-seg font-seg-${segment.script}`;
    span.textContent = segment.text;
    container.appendChild(span);
  }
}

if (typeof window !== "undefined") {
  window.classifyScript = classifyScript;
  window.segmentTextByScript = segmentTextByScript;
  window.renderMultilingualText = renderMultilingualText;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    classifyScript,
    isNeutralChar,
    segmentTextByScript,
    renderMultilingualText
  };
}
