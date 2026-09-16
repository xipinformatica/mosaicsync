/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* Browser-neutral structural validation for untrusted raster data URLs. */
import { decodeImageDataUrlBytes } from "./image-data.js";
import { MAX_DECODED_PIXELS, MAX_SOURCE_DIMENSION } from "./image-limits.js";

function dimensionsAllowed(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= MAX_SOURCE_DIMENSION && height <= MAX_SOURCE_DIMENSION &&
    width * height <= MAX_DECODED_PIXELS;
}

function u16le(b, o) { return b[o] | (b[o + 1] << 8); }
function u16be(b, o) { return (b[o] << 8) | b[o + 1]; }
function u24le(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); }
function u32le(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function u32be(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

function validPng(bytes) {
  if (bytes.length < 33) return null;
  const sig = [137,80,78,71,13,10,26,10];
  if (!sig.every((v, i) => bytes[i] === v)) return null;
  if (u32be(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12,16)) !== "IHDR") return null;
  const width = u32be(bytes, 16), height = u32be(bytes, 20);
  if (!dimensionsAllowed(width, height)) return null;
  const bitDepth = bytes[24], colorType = bytes[25], compression = bytes[26], filter = bytes[27], interlace = bytes[28];
  const validDepths = new Set([1,2,4,8,16]);
  if (!validDepths.has(bitDepth) || ![0,2,3,4,6].includes(colorType) || compression !== 0 || filter !== 0 || ![0,1].includes(interlace)) return null;
  // Require a complete IEND chunk and reject impossible chunk lengths.
  let offset = 8, sawIdat = false, sawIend = false;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    if (length > bytes.length - offset - 12) return null;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") { if (length !== 0) return null; sawIend = true; break; }
    offset += 12 + length;
  }
  return sawIdat && sawIend ? { width, height } : null;
}

function validJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2, dimensions = null, sawEoi = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9) { sawEoi = true; break; }
    if (marker === 0xda) {
      // Scan entropy-coded data for EOI, honoring byte stuffing/restart markers.
      while (offset + 1 < bytes.length) {
        if (bytes[offset] === 0xff) {
          const next = bytes[offset + 1];
          if (next === 0xd9) { sawEoi = true; offset += 2; break; }
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        }
        offset += 1;
      }
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (sof) {
      if (length < 7) return null;
      const height = u16be(bytes, offset + 3), width = u16be(bytes, offset + 5);
      if (!dimensionsAllowed(width, height)) return null;
      dimensions = { width, height };
    }
    offset += length;
  }
  return dimensions && sawEoi ? dimensions : null;
}

function validGif(bytes) {
  if (bytes.length < 14) return null;
  const header = String.fromCharCode(...bytes.slice(0,6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const width = u16le(bytes, 6), height = u16le(bytes, 8);
  return dimensionsAllowed(width, height) && bytes[bytes.length - 1] === 0x3b ? { width, height } : null;
}

function validIco(bytes) {
  if (bytes.length < 22 || u16le(bytes,0) !== 0 || u16le(bytes,2) !== 1) return null;
  const count = u16le(bytes,4);
  if (!count || count > 256 || bytes.length < 6 + count * 16) return null;
  let maxWidth = 0, maxHeight = 0;
  for (let i=0;i<count;i++) {
    const o=6+i*16, width=bytes[o] || 256, height=bytes[o+1] || 256;
    const size=u32le(bytes,o+8), dataOffset=u32le(bytes,o+12);
    if (!size || dataOffset < 6 + count*16 || dataOffset + size > bytes.length) return null;
    if (!dimensionsAllowed(width,height)) return null;
    maxWidth=Math.max(maxWidth,width); maxHeight=Math.max(maxHeight,height);
  }
  return { width:maxWidth, height:maxHeight };
}

function validWebp(bytes) {
  if (bytes.length < 20 || String.fromCharCode(...bytes.slice(0,4)) !== "RIFF" ||
      String.fromCharCode(...bytes.slice(8,12)) !== "WEBP") return null;
  const riffSize = u32le(bytes,4);
  if (riffSize + 8 > bytes.length || riffSize < 12) return null;
  const type = String.fromCharCode(...bytes.slice(12,16));
  const chunkSize = u32le(bytes,16);
  if (20 + chunkSize > bytes.length) return null;
  let width=0,height=0;
  if (type === "VP8X") {
    if (chunkSize < 10 || bytes.length < 30) return null;
    width = 1 + u24le(bytes,24); height = 1 + u24le(bytes,27);
  } else if (type === "VP8L") {
    if (chunkSize < 5 || bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = u32le(bytes,21);
    width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
  } else if (type === "VP8 ") {
    if (chunkSize < 10 || bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    width = u16le(bytes,26) & 0x3fff; height = u16le(bytes,28) & 0x3fff;
  } else return null;
  return dimensionsAllowed(width,height) ? { width,height } : null;
}

export function validateRasterDataUrl(source, { allowedMimeTypes = null } = {}) {
  let decoded;
  try { decoded = decodeImageDataUrlBytes(source); } catch { return null; }
  if (allowedMimeTypes && !allowedMimeTypes.includes(decoded.mimeType)) return null;
  const bytes = decoded.bytes;
  let dimensions = null;
  if (decoded.mimeType === "image/png") dimensions = validPng(bytes);
  else if (decoded.mimeType === "image/jpeg") dimensions = validJpeg(bytes);
  else if (decoded.mimeType === "image/webp") dimensions = validWebp(bytes);
  else if (decoded.mimeType === "image/gif") dimensions = validGif(bytes);
  else if (decoded.mimeType === "image/x-icon" || decoded.mimeType === "image/vnd.microsoft.icon") dimensions = validIco(bytes);
  return dimensions ? { ...decoded, ...dimensions } : null;
}
