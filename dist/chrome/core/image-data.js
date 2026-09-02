/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure image data-URL helpers shared by the UI/model and image worker.
 * Keep this module free of DOM and WebExtension APIs so the exact same
 * canonical representation is used for decoding, byte accounting and
 * content-derived asset identity.
 */

export const MAX_IMAGE_DATA_URL_CHARS = 1_500_000;
export const IMAGE_BASE64_ASCII_WHITESPACE_RE = /[\t\n\f\r ]+/g;
const IMAGE_BASE64_ASCII_WHITESPACE_TEST_RE = /[\t\n\f\r ]/;
const IMAGE_DATA_HEADER_RE = /^data:(image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon));base64,$/i;
const BASE64_PAYLOAD_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function parseImageDataUrl(source) {
  if (typeof source !== "string" || source.length > MAX_IMAGE_DATA_URL_CHARS) return null;

  // Fast path for MosaicSync-generated canonical values: match only the small
  // header, avoid a regex capture spanning the entire image, and do not rebuild
  // megabyte-sized payload strings unless legacy whitespace actually exists.
  const trimmed = source.trim();
  if (trimmed.slice(0, 11).toLowerCase() !== "data:image/") return null;
  const comma = trimmed.indexOf(",");
  if (comma <= 0) return null;
  const header = trimmed.slice(0, comma + 1);
  const headerMatch = IMAGE_DATA_HEADER_RE.exec(header);
  if (!headerMatch) return null;

  let payload = trimmed.slice(comma + 1);
  const hasWhitespace = IMAGE_BASE64_ASCII_WHITESPACE_TEST_RE.test(payload);
  if (hasWhitespace) payload = payload.replace(IMAGE_BASE64_ASCII_WHITESPACE_RE, "");
  if (!payload || !BASE64_PAYLOAD_RE.test(payload)) return null;

  const padding = payload.endsWith("==") ? 2 : (payload.endsWith("=") ? 1 : 0);
  const bodyLength = payload.length - padding;
  // A base64 body whose length is 1 modulo 4 can never represent complete
  // bytes. Padded forms must occupy complete four-character quanta.
  if (bodyLength % 4 === 1 || (padding > 0 && payload.length % 4 !== 0)) return null;

  const mimeType = headerMatch[1].toLowerCase();
  const canonicalHeader = `data:${mimeType};base64,`;
  const canonical = !hasWhitespace && trimmed === source && header === canonicalHeader
    ? source
    : `${canonicalHeader}${payload}`;
  return {
    mimeType,
    payload,
    canonical,
    byteLength: Math.max(0, Math.floor(payload.length * 3 / 4) - padding)
  };
}

export function canonicalizeImageDataUrl(source) {
  return parseImageDataUrl(source)?.canonical || "";
}

export function imageDataUrlByteLength(source) {
  return parseImageDataUrl(source)?.byteLength || 0;
}

export function decodeImageDataUrlBytes(source) {
  const parsed = parseImageDataUrl(source);
  if (!parsed) throw new Error("Unsupported local image.");

  try {
    if (typeof Uint8Array.fromBase64 === "function") {
      return { ...parsed, bytes: Uint8Array.fromBase64(parsed.payload) };
    }
    const binary = atob(parsed.payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { ...parsed, bytes };
  } catch {
    throw new Error("Unsupported local image.");
  }
}
