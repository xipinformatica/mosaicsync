import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TINY_PNG } from "./harness/raster-fixtures.mjs";

function pngHeader(width, height) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function vp8xHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8); // WEBPVP8X
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff; bytes[25] = (w >>> 8) & 0xff; bytes[26] = (w >>> 16) & 0xff;
  bytes[27] = h & 0xff; bytes[28] = (h >>> 8) & 0xff; bytes[29] = (h >>> 16) & 0xff;
  return bytes;
}

function icoWithPng(width, height) {
  const png = pngHeader(width, height);
  const bytes = new Uint8Array(22 + png.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  bytes[6] = 0; // advertised 256; embedded PNG must still win
  bytes[7] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  bytes.set(png, 22);
  return bytes;
}

function dataUrlFromBytes(bytes, type = "image/png") {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function invokeWorker(browserName, request, { bitmapWidth = 16, bitmapHeight = 16 } = {}) {
  const previousSelf = globalThis.self;
  const previousCreateImageBitmap = globalThis.createImageBitmap;
  const previousOffscreenCanvas = globalThis.OffscreenCanvas;
  let messageHandler = null;
  let resolveMessage;
  let rejectMessage;
  let bitmapCalls = 0;
  const response = new Promise((resolve, reject) => { resolveMessage = resolve; rejectMessage = reject; });

  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.context = { imageSmoothingEnabled: false, imageSmoothingQuality: "low", drawImage() {} };
    }
    getContext() { return this.context; }
    async convertToBlob() { return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }); }
  }

  globalThis.self = {
    addEventListener(type, listener) { if (type === "message") messageHandler = listener; },
    postMessage(message) { resolveMessage(message); }
  };
  globalThis.createImageBitmap = async () => {
    bitmapCalls += 1;
    return { width: bitmapWidth, height: bitmapHeight, close() {} };
  };
  globalThis.OffscreenCanvas = FakeCanvas;

  try {
    const workerUrl = `${pathToFileURL(path.resolve(`dist/${browserName}/core/image-worker.js`)).href}?opt133038=${Date.now()}-${Math.random()}`;
    await import(workerUrl);
    assert.equal(typeof messageHandler, "function");
    messageHandler({ data: request });
    const timer = setTimeout(() => rejectMessage(new Error("worker response timed out")), 2_000);
    const message = await response.finally(() => clearTimeout(timer));
    return { message, bitmapCalls };
  } finally {
    globalThis.self = previousSelf;
    globalThis.createImageBitmap = previousCreateImageBitmap;
    globalThis.OffscreenCanvas = previousOffscreenCanvas;
  }
}


function extractAsyncFunction(source, name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{\n", start);
  assert.ok(brace >= 0, `missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const c = source[index];
    const n = source[index + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; index += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; index += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

async function runNewTabNativeHydration(shortcut, { duringLookup } = {}) {
  const policy = await import(`${pathToFileURL(path.resolve("dist/firefox/core/artwork-policy.js")).href}?opt133038policy=${Date.now()}-${Math.random()}`);
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const normalizeBody = extractAsyncFunction(source, "normalizeDeviceFavicon");
  const hydrateBody = extractAsyncFunction(source, "hydrateDeviceFavicons");
  const state = { shortcuts: [shortcut] };
  let saves = 0;
  let nativeReads = 0;
  const context = {
    state,
    URL,
    Map,
    Set,
    browserNativeFaviconFallbackNeeded: policy.browserNativeFaviconFallbackNeeded,
    isAcceptedRasterArtworkDataUrl: policy.isAcceptedRasterArtworkDataUrl,
    learnedArtworkDisposition: policy.learnedArtworkDisposition,
    learnedArtworkMayReplace: policy.learnedArtworkMayReplace,
    hasTopSitesPermission: async () => true,
    getNativeTopSites: async () => {
      nativeReads += 1;
      if (duringLookup) duringLookup(shortcut);
      return [{ title: "Example", url: shortcut.url, favicon: TINY_PNG }];
    },
    findShortcutRecord: () => ({ parentFolder: null }),
    saveState: async () => { saves += 1; },
    patchVisibleShortcutArtwork: () => {},
    requestMissingSiteIcons: () => {},
    FAVICON_LOCAL_MAX_SIDE: 96,
    FAVICON_LOCAL_TARGET_BYTES: 12_000,
    REMOTE_IMAGE_INPUT_MAX_BYTES: 2_000_000,
    optimizeImageDataUrl: async value => value
  };
  vm.createContext(context);
  vm.runInContext(`${normalizeBody}\n${hydrateBody}\nthis.runHydration = hydrateDeviceFavicons;`, context);
  await context.runHydration();
  return { shortcut, saves, nativeReads };
}

async function runBackgroundLearnedRefresh(shortcut) {
  const policy = await import(`${pathToFileURL(path.resolve("dist/firefox/core/artwork-policy.js")).href}?opt133038bg=${Date.now()}-${Math.random()}`);
  const source = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const applyBody = extractAsyncFunction(source, "applyLearnedFavicon");
  let writes = 0;
  const context = {
    learnedArtworkMayReplace: policy.learnedArtworkMayReplace,
    learnedArtworkDisposition: policy.learnedArtworkDisposition,
    normalizeLocalFaviconDataUrl: async value => value,
    writeLocalState: async () => { writes += 1; }
  };
  vm.createContext(context);
  vm.runInContext(`${applyBody}\nthis.applyLearned = applyLearnedFavicon;`, context);
  const changed = await context.applyLearned(
    { state: { shortcuts: [shortcut] }, compactBaseline: null },
    [shortcut],
    { image: TINY_PNG, sourceKind: "firefox", sourceUrl: "" }
  );
  return { shortcut, changed, writes };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.33.0.38 ${browser} preflight detects a PNG bomb even when the Blob MIME says JPEG`, async () => {
    const source = new Blob([pngHeader(12_000, 12_000)], { type: "image/jpeg" });
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `mislabeled-${browser}`, sourceKind: "blob", source, options: {}
    }, { bitmapWidth: 12_000, bitmapHeight: 12_000 });
    assert.equal(message.ok, false);
    assert.match(message.error, /too large to process safely/i);
    assert.equal(bitmapCalls, 0, "leading-byte recognition must reject a mislabeled bomb before pixel decode");
  });

  test(`1.33.0.38 ${browser} preflight detects a mislabeled PNG data URL from its bytes`, async () => {
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `mislabeled-data-${browser}`,
      sourceKind: "data-url",
      source: dataUrlFromBytes(pngHeader(12_000, 12_000), "image/jpeg"),
      options: {}
    }, { bitmapWidth: 12_000, bitmapHeight: 12_000 });
    assert.equal(message.ok, false);
    assert.match(message.error, /too large to process safely/i);
    assert.equal(bitmapCalls, 0);
  });

  test(`1.33.0.38 ${browser} preflight enforces total decoded pixels independently of side length`, async () => {
    const source = new Blob([pngHeader(6_000, 6_000)], { type: "image/png" });
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `pixels-${browser}`, sourceKind: "blob", source, options: {}
    }, { bitmapWidth: 6_000, bitmapHeight: 6_000 });
    assert.equal(message.ok, false);
    assert.match(message.error, /too large to process safely/i);
    assert.equal(bitmapCalls, 0, "36 MP must be rejected by the total-pixel limit before decode");
  });
}

test("1.33.0.38 compressed-byte dimension inspection covers VP8X and PNG-backed ICO bombs", async () => {
  const validation = await import(`${pathToFileURL(path.resolve("dist/firefox/core/raster-validation.js")).href}?opt133038=${Date.now()}-${Math.random()}`);
  assert.deepEqual(validation.rasterDimensionsFromBytes(vp8xHeader(6_000, 6_000), "image/webp"), { width: 6_000, height: 6_000 });
  assert.deepEqual(validation.rasterDimensionsFromBytes(icoWithPng(12_000, 12_000), "image/x-icon"), { width: 12_000, height: 12_000 });
  assert.deepEqual(validation.rasterDimensionsFromBytes(pngHeader(12_000, 12_000), "image/jpeg"), { width: 12_000, height: 12_000 }, "actual byte signature must outrank a misleading MIME hint");
});

test("1.33.0.38 shared artwork policy owns raster acceptance and source/provenance decisions", async () => {
  const policy = await import(`${pathToFileURL(path.resolve("dist/firefox/core/artwork-policy.js")).href}?opt133038=${Date.now()}-${Math.random()}`);
  assert.equal(policy.isAcceptedRasterArtworkDataUrl(TINY_PNG), true);
  assert.equal(policy.isAcceptedRasterArtworkDataUrl("data:image/svg+xml;base64,PHN2Zy8+"), false);
  assert.equal(policy.isAutomaticArtworkSourceKind("favicon"), true);
  assert.equal(policy.isAutomaticArtworkSourceKind("firefox"), true);
  assert.equal(policy.isAutomaticArtworkSourceKind("upload"), false);

  const site = { type: "shortcut", url: "https://site.test/", image: TINY_PNG, imageSyncKind: "device", imageSourceKind: "favicon", imageSourceUrl: "https://site.test/icon.png" };
  assert.equal(policy.browserNativeFaviconFallbackNeeded(site), false, "browser-native fallback must never downgrade site-discovered artwork");
  assert.equal(policy.shortcutNeedsProactiveFavicon(site), false, "complete site-discovered artwork does not need ordinary proactive recovery");
  assert.equal(policy.learnedArtworkMayReplace(site, { sourceKind: "firefox" }), false, "late browser-native work must not replace stronger site-discovered artwork");
  assert.equal(policy.learnedArtworkMayReplace(site, { sourceKind: "favicon" }), true, "site discovery may refresh site-discovered artwork");

  const browserCached = { ...site, imageSourceKind: "firefox" };
  assert.equal(policy.browserNativeFaviconFallbackNeeded(browserCached), false);
  assert.equal(policy.shortcutNeedsProactiveFavicon(browserCached), true, "browser-native artwork remains refreshable by site discovery");

  const missing = { type: "shortcut", url: "https://missing.test/", image: "", imageSyncKind: "none", imageSourceKind: "none" };
  assert.equal(policy.browserNativeFaviconFallbackNeeded(missing), true);
  assert.equal(policy.shortcutNeedsProactiveFavicon(missing), true);

  const customFallback = { type: "shortcut", url: "https://custom.test/", image: "", imageSyncKind: "device", imageSourceKind: "upload", imageSourceUrl: "manual" };
  assert.equal(policy.browserNativeFaviconFallbackNeeded(customFallback), true);
  const disposition = policy.learnedArtworkDisposition(customFallback, { sourceKind: "firefox", sourceUrl: "https://browser.test/icon" });
  assert.deepEqual(disposition, {
    imageSourceKind: "upload",
    imageSourceUrl: "manual",
    imageIsFallback: true,
    preservesUserProvenance: true
  });
});



test("1.33.0.38 Firefox history fallback never replaces a built-in shortcut glyph", async () => {
  const shortcut = {
    type: "shortcut", id: "builtin", title: "Built in", url: "https://example.test/",
    image: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageIsFallback: false, imageSourceKind: "none", imageSourceUrl: "", builtinIcon: "home"
  };
  const result = await runNewTabNativeHydration(shortcut);
  assert.equal(result.nativeReads, 0, "built-in artwork must make native favicon hydration unnecessary");
  assert.equal(result.saves, 0);
  assert.equal(shortcut.image, "");
  assert.equal(shortcut.builtinIcon, "home");
});

test("1.33.0.38 late Firefox history lookup cannot overwrite artwork that appeared while it was in flight", async () => {
  const shortcut = {
    type: "shortcut", id: "late", title: "Late", url: "https://example.test/",
    image: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageIsFallback: false, imageSourceKind: "none", imageSourceUrl: "", builtinIcon: ""
  };
  const stronger = "data:image/png;base64,U1RST05HRVI=";
  const result = await runNewTabNativeHydration(shortcut, {
    duringLookup(current) {
      current.image = stronger;
      current.imageSyncKind = "device";
      current.imageSourceKind = "favicon";
      current.imageSourceUrl = "https://example.test/site-icon.png";
    }
  });
  assert.equal(result.nativeReads, 1);
  assert.equal(result.saves, 0, "commit-time policy must reject a stale native fallback after stronger artwork arrives");
  assert.equal(shortcut.image, stronger);
  assert.equal(shortcut.imageSourceKind, "favicon");
});

test("1.33.0.38 a tab visit can refresh an existing browser-native learned favicon", async () => {
  const shortcut = {
    type: "shortcut", id: "refresh", title: "Refresh", url: "https://example.test/",
    image: "data:image/png;base64,T0xE", imageSyncData: "", imageAssetId: "", imageSyncKind: "device",
    imageIsFallback: false, imageSourceKind: "firefox", imageSourceUrl: "", builtinIcon: ""
  };
  const result = await runBackgroundLearnedRefresh(shortcut);
  assert.equal(result.changed, true, "browser-native learned artwork must remain refreshable by later browser-native artwork");
  assert.equal(result.writes, 1);
  assert.equal(shortcut.image, TINY_PNG);
  assert.equal(shortcut.imageSourceKind, "firefox");
});

test("1.33.0.38 New Tab, background and browser adapters consume the shared artwork policy instead of private copies", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const background = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const firefoxAdapter = fs.readFileSync("src/firefox/background/background-adapter.js", "utf8");
  const chromeAdapter = fs.readFileSync("src/chrome/background/background-adapter.js", "utf8");
  assert.match(newtab, /from "\.\.\/core\/artwork-policy\.js"/);
  assert.match(newtab, /browserNativeFaviconFallbackNeeded/);
  assert.match(background, /from "\.\.\/core\/artwork-policy\.js"/);
  assert.match(background, /shortcutNeedsProactiveFaviconPolicy/);
  assert.match(firefoxAdapter, /artwork-policy\.js/);
  assert.match(chromeAdapter, /artwork-policy\.js/);
  assert.doesNotMatch(firefoxAdapter, /data:image\\\/\(\?:png\|jpeg\|webp\|gif/);
  assert.doesNotMatch(chromeAdapter, /data:image\\\/\(\?:png\|jpeg\|webp\|gif/);
});

test("1.33.0.38 optimization tests are owned by New Tab, Security, Browser, Core and Release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["newtab", "security", "browser", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/optimization-133038.test.mjs"), `${group} must own optimization-133038.test.mjs`);
  }
});
