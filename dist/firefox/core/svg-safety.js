/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure SVG admission check for remote favicon rasterization.
 *
 * MosaicSync never injects remote SVG markup into the DOM. It only lets the
 * browser decoder rasterize a tightly restricted, self-contained subset. Any
 * construct that can execute script, embed another document, resolve an
 * external resource, or define XML entities is rejected before decoding.
 */
const ACTIVE_OR_EMBED_TAG_RE = /<(?:[a-z0-9_-]+:)?(?:script|foreignObject|iframe|object|embed|image|feImage)\b/i;
const EVENT_HANDLER_RE = /(?:^|[\s<])(?:[a-z0-9_-]+:)?on[a-z0-9_-]+\s*=/i;
const SCRIPT_SCHEME_RE = /(?:javascript|vbscript)\s*:/i;
const XML_EXTERNAL_RE = /<!\s*(?:doctype|entity)\b|<\?xml-stylesheet\b/i;
const CSS_IMPORT_RE = /@import\b/i;
const HREF_RE = /\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL_RE = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'"]+))\s*\)/gi;

function isFragmentReference(value) {
  return typeof value === "string" && /^#[A-Za-z0-9_.:-]+$/.test(value.trim());
}

function referencesAreLocalFragments(source, regex) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source))) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    if (!isFragmentReference(value)) return false;
  }
  return true;
}

export function isSafeSelfContainedSvgText(source) {
  if (typeof source !== "string" || !source || source.includes("\0")) return false;
  if (!/<(?:[a-z0-9_-]+:)?svg\b/i.test(source)) return false;
  if (ACTIVE_OR_EMBED_TAG_RE.test(source)) return false;
  if (EVENT_HANDLER_RE.test(source)) return false;
  if (SCRIPT_SCHEME_RE.test(source)) return false;
  if (XML_EXTERNAL_RE.test(source)) return false;
  if (CSS_IMPORT_RE.test(source)) return false;
  if (!referencesAreLocalFragments(source, HREF_RE)) return false;
  if (!referencesAreLocalFragments(source, CSS_URL_RE)) return false;
  return true;
}

const SVG_LENGTH_RE = /^\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|in|cm|mm|q|em|rem|%)?\s*$/i;
const SVG_LENGTH_FACTORS = Object.freeze({
  "": 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  em: 16,
  rem: 16
});

function rootSvgAttribute(openTag, name) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(openTag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
}

function rootSvgStyleLength(openTag, name) {
  const style = rootSvgAttribute(openTag, "style");
  if (!style) return "";
  const pattern = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i");
  return pattern.exec(style)?.[1]?.trim() || "";
}

function parseSvgRasterLength(value) {
  if (!value || /^auto$/i.test(value)) return { kind: "auto", value: 0 };
  const match = SVG_LENGTH_RE.exec(value);
  if (!match) return { kind: "invalid", value: 0 };
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return { kind: "invalid", value: 0 };
  const unit = String(match[2] || "").toLowerCase();
  if (unit === "%") {
    // Percentages are resolved against the decoder's bounded fallback viewport.
    // Values above 100% can inflate that viewport and are not useful for favicons.
    return number <= 100 ? { kind: "relative", value: 0 } : { kind: "invalid", value: 0 };
  }
  const factor = SVG_LENGTH_FACTORS[unit];
  if (!factor) return { kind: "invalid", value: 0 };
  const pixels = number * factor;
  return Number.isFinite(pixels) && pixels > 0
    ? { kind: "absolute", value: pixels }
    : { kind: "invalid", value: 0 };
}

function parseSvgViewBox(value) {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return null;
  const width = parts[2];
  const height = parts[3];
  return width > 0 && height > 0 ? { width, height } : null;
}

function rootSvgOpenTag(source) {
  const match = /<(?:[a-z0-9_-]+:)?svg\b/i.exec(source);
  if (!match) return "";
  let quote = "";
  for (let index = match.index; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return source.slice(match.index, index + 1);
    // A second unquoted '<' cannot occur inside a well-formed opening tag.
    if (char === "<" && index !== match.index) return "";
  }
  return "";
}

/**
 * Return a conservative intrinsic raster size for a remote SVG before any
 * browser decoder sees it. `valid:false` means the root advertises dimensions
 * MosaicSync cannot safely reason about and the SVG should be rejected.
 */
export function svgRasterDimensionsFromText(source) {
  if (typeof source !== "string") return { width: 0, height: 0, valid: false };
  const openTag = rootSvgOpenTag(source);
  if (!openTag) return { width: 0, height: 0, valid: false };

  // Inline style wins over the corresponding presentation attribute.
  const widthRaw = rootSvgStyleLength(openTag, "width") || rootSvgAttribute(openTag, "width");
  const heightRaw = rootSvgStyleLength(openTag, "height") || rootSvgAttribute(openTag, "height");
  const widthLength = parseSvgRasterLength(widthRaw);
  const heightLength = parseSvgRasterLength(heightRaw);
  if (widthLength.kind === "invalid" || heightLength.kind === "invalid") {
    return { width: 0, height: 0, valid: false };
  }

  const viewBox = parseSvgViewBox(rootSvgAttribute(openTag, "viewBox"));
  let width = widthLength.kind === "absolute" ? widthLength.value : 0;
  let height = heightLength.kind === "absolute" ? heightLength.value : 0;

  // An omitted/relative root size uses the SVG image fallback viewport. If one
  // absolute side is known and a viewBox supplies the aspect ratio, infer the
  // other side so an extreme ratio cannot hide a huge decoder allocation.
  if (width && !height && viewBox) height = width * (viewBox.height / viewBox.width);
  if (height && !width && viewBox) width = height * (viewBox.width / viewBox.height);
  if (!width && !height) {
    width = 300;
    height = 150;
  } else {
    if (!width) width = 300;
    if (!height) height = 150;
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, valid: false };
  }
  return { width, height, valid: true };
}
