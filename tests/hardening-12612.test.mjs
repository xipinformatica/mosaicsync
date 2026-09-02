import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < src.length; index += 1) {
    const char = src[index], next = src[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return src.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function hugePngBytes(width = 20_000, height = 20_000) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
  bytes.set([0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.12 ${browser} rejects oversized raster favicon headers before optimization/raw fallback`, async () => {
    const src = readBackgroundSource(browser);
    const code = [
      extract(src, "imageDimensionsFromBytes"),
      extract(src, "imageDimensionsSafeForRemoteDecode"),
      extract(src, "fetchImageDataUrlDetailed")
    ].join("\n");
    let optimizedCalls = 0;
    let rawFallbackCalls = 0;
    const bytes = hugePngBytes();
    const ctx = {
      console,
      Date,
      REMOTE_IMAGE_MAX_DECODE_DIMENSION: 4096,
      REMOTE_IMAGE_MAX_DECODED_PIXELS: 8_000_000,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      REMOTE_IMAGE_MAX_BYTES: 250_000,
      fetchBoundedResource: async () => ({ ok: true, reason: "", url: "https://evil.test/favicon.png", type: "image/png", bytes }),
      sniffImageMime: () => "image/png",
      optimizedFaviconFromBytes: async () => { optimizedCalls += 1; return null; },
      rasterizeSafeSvg: async () => { throw new Error("not svg"); },
      bytesToBase64: () => { rawFallbackCalls += 1; return "AA=="; }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.fetchImageDataUrlDetailed("https://evil.test/favicon.png");
    assert.equal(result.image, "");
    assert.equal(result.reason, "image-too-large");
    assert.equal(optimizedCalls, 0, "oversized dimensions must be rejected before createImageBitmap/optimization");
    assert.equal(rawFallbackCalls, 0, "oversized bytes must never fall back to the original data URL");
  });

  test(`1.26.12 ${browser} rejects oversized safe SVG geometry before createImageBitmap`, async () => {
    const src = readBackgroundSource(browser);
    const code = [extract(src, "imageDimensionsSafeForRemoteDecode"), extract(src, "rasterizeSafeSvg")].join("\n");
    const svgSafety = await import(`../dist/${browser}/core/svg-safety.js`);
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>');
    let bitmapCalls = 0;
    const ctx = {
      console,
      Blob,
      TextDecoder,
      textDecoder: new TextDecoder(),
      REMOTE_IMAGE_MAX_BYTES: 250_000,
      REMOTE_IMAGE_MAX_DECODE_DIMENSION: 4096,
      REMOTE_IMAGE_MAX_DECODED_PIXELS: 8_000_000,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      FAVICON_LOCAL_MAX_SIDE: 192,
      OffscreenCanvas: function OffscreenCanvas() {},
      createImageBitmap: async () => { bitmapCalls += 1; throw new Error("decoder must not run"); },
      isSafeSelfContainedSvgText: svgSafety.isSafeSelfContainedSvgText,
      svgRasterDimensionsFromText: svgSafety.svgRasterDimensionsFromText,
      encodeOptimizedFaviconBitmap: async () => { throw new Error("encoder must not run"); },
      bytesToBase64: () => ""
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.rasterizeSafeSvg(bytes);
    assert.deepEqual({ image: result.image, width: result.width, height: result.height }, { image: "", width: 0, height: 0 });
    assert.equal(bitmapCalls, 0);
  });
}

test("1.26.12 remote image header parsing covers all standard WebP container variants", () => {
  for (const browser of ["firefox", "chrome"]) {
    const src = readBackgroundSource(browser);
    const code = extract(src, "imageDimensionsFromBytes");
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code, ctx);

    const vp8x = new Uint8Array(30);
    vp8x.set(Buffer.from("RIFF"), 0); vp8x.set(Buffer.from("WEBP"), 8); vp8x.set(Buffer.from("VP8X"), 12);
    // 5000 x 3000 are stored minus one as little-endian 24-bit values.
    const w = 4999, h = 2999;
    vp8x[24] = w & 0xff; vp8x[25] = (w >> 8) & 0xff; vp8x[26] = (w >> 16) & 0xff;
    vp8x[27] = h & 0xff; vp8x[28] = (h >> 8) & 0xff; vp8x[29] = (h >> 16) & 0xff;
    assert.deepEqual({ ...ctx.imageDimensionsFromBytes(vp8x, "image/webp") }, { width: 5000, height: 3000 });

    const vp8 = new Uint8Array(30);
    vp8.set(Buffer.from("RIFF"), 0); vp8.set(Buffer.from("WEBP"), 8); vp8.set(Buffer.from("VP8 "), 12);
    vp8.set([0x9d, 0x01, 0x2a], 23);
    vp8[26] = 0x88; vp8[27] = 0x13; // 5000
    vp8[28] = 0xb8; vp8[29] = 0x0b; // 3000
    assert.deepEqual({ ...ctx.imageDimensionsFromBytes(vp8, "image/webp") }, { width: 5000, height: 3000 });
  }
});

test("1.26.12 SVG intrinsic-size parser rejects pathological roots but keeps ordinary favicon geometry", async () => {
  const { svgRasterDimensionsFromText } = await import("../dist/firefox/core/svg-safety.js");
  const normal = svgRasterDimensionsFromText('<svg width="64" height="64" viewBox="0 0 64 64"></svg>');
  assert.equal(normal.valid, true);
  assert.equal(normal.width, 64);
  assert.equal(normal.height, 64);
  const inferred = svgRasterDimensionsFromText('<svg width="192" viewBox="0 0 1 100000"></svg>');
  assert.equal(inferred.valid, true);
  assert.ok(inferred.height > 4096, "extreme viewBox ratios must remain visible to the pre-decode bound check");
  const unsafePercent = svgRasterDimensionsFromText('<svg width="5000%" height="100%"></svg>');
  assert.equal(unsafePercent.valid, false);
});

class Area {
  constructor() { this.data = {}; this.getCalls = []; this.setCalls = []; }
  async get(keys) {
    this.getCalls.push(structuredClone(keys));
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    const out = { ...(keys || {}) };
    for (const key of Object.keys(keys || {})) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) {
    this.setCalls.push(structuredClone(items));
    for (const [key, value] of Object.entries(items)) this.data[key] = structuredClone(value);
  }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

const local = new Area();
const session = new Area();
globalThis.browser = { storage: { local, session } };
const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");

function stateWithImage(image, modifiedAt = 100) {
  return model.normalizeState({
    shortcuts: [{
      type: "shortcut", id: "asset-test", title: "Asset", url: "https://asset.example/", image,
      imageSyncKind: "device", imageSourceKind: "upload", imageStyle: "contain", position: 0,
      createdAt: 10, modifiedAt, source: "manual"
    }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: modifiedAt, updatedAt: modifiedAt
  });
}

test("1.26.12 persisted asset verification keeps the exact-match fast path read-free", async () => {
  local.data = {}; local.getCalls = []; local.setCalls = [];
  const storage = await import("../dist/firefox/core/storage.js?asset-fast-path=12612");
  const image = `data:image/png;base64,${Buffer.from("verified-asset".repeat(50)).toString("base64")}`;
  const state = stateWithImage(image, 100);
  await storage.writeLocalState(state);
  const assetId = model.assetIdForDataUrl(image);
  const assetKey = `${constants.LOCAL_ASSET_PREFIX}${assetId}`;
  local.getCalls = [];
  await storage.writeLocalState(stateWithImage(image, 101), { baseState: storage.createWriteBaseline(state) });
  assert.equal(local.getCalls.some(keys => Array.isArray(keys) && keys.includes(assetKey)), false,
    "already-verified immutable bytes must not be re-read on routine writes");
});

test("1.26.12 persisted asset verification repairs an indexed missing/corrupt value atomically", async () => {
  local.data = {}; local.getCalls = []; local.setCalls = [];
  const image = `data:image/png;base64,${Buffer.from("repair-asset".repeat(60)).toString("base64")}`;
  const assetId = model.assetIdForDataUrl(image);
  const assetKey = `${constants.LOCAL_ASSET_PREFIX}${assetId}`;
  const compact = (await import("../dist/firefox/core/local-assets.js")).projectStateToLocalAssets(stateWithImage(image, 200)).state;
  local.data[constants.LOCAL_STATE_KEY] = compact;
  local.data[constants.LOCAL_ASSET_INDEX_KEY] = { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [assetId] };
  local.data[assetKey] = "data:image/png;base64,AAAA"; // invalid for the indexed content ID

  const storage = await import("../dist/firefox/core/storage.js?asset-repair=12612");
  await storage.writeLocalState(stateWithImage(image, 201));
  assert.equal(local.data[assetKey], image, "corrupt indexed bytes should be repaired in the same state transaction");
  const repairWrite = local.setCalls.find(call => call[assetKey] === image);
  assert.ok(repairWrite?.[constants.LOCAL_STATE_KEY], "repair bytes and compact references must publish atomically");
});
