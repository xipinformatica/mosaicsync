import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TINY_PNG, TINY_JPEG, TINY_WEBP, TINY_GIF, TINY_ICO } from "./harness/raster-fixtures.mjs";

function oversizedPngBytes(width = 20_000, height = 20_000) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
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
  const response = new Promise((resolve, reject) => {
    resolveMessage = resolve;
    rejectMessage = reject;
  });

  class FakeCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.context = {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage() {}
      };
    }
    getContext() { return this.context; }
    async convertToBlob() { return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }); }
  }

  globalThis.self = {
    addEventListener(type, listener) {
      if (type === "message") messageHandler = listener;
    },
    postMessage(message) { resolveMessage(message); }
  };
  globalThis.createImageBitmap = async () => {
    bitmapCalls += 1;
    return { width: bitmapWidth, height: bitmapHeight, close() {} };
  };
  globalThis.OffscreenCanvas = FakeCanvas;

  try {
    const workerUrl = `${pathToFileURL(path.resolve(`dist/${browserName}/core/image-worker.js`)).href}?opt133037=${Date.now()}-${Math.random()}`;
    await import(workerUrl);
    assert.equal(typeof messageHandler, "function", `${browserName} worker must install its message handler`);
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

for (const browser of ["firefox", "chrome"]) {
  test(`1.33.0.37 ${browser} image worker rejects oversized Blob geometry before createImageBitmap`, async () => {
    const source = new Blob([oversizedPngBytes()], { type: "image/png" });
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `blob-${browser}`,
      sourceKind: "blob",
      source,
      options: {}
    }, { bitmapWidth: 20_000, bitmapHeight: 20_000 });
    assert.equal(message.ok, false);
    assert.match(message.error, /too large to process safely/i);
    assert.equal(bitmapCalls, 0, "recognized oversized Blob geometry must be rejected before browser decode");
  });

  test(`1.33.0.37 ${browser} image worker rejects oversized data-URL geometry before createImageBitmap`, async () => {
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `data-${browser}`,
      sourceKind: "data-url",
      source: dataUrlFromBytes(oversizedPngBytes()),
      options: {}
    }, { bitmapWidth: 20_000, bitmapHeight: 20_000 });
    assert.equal(message.ok, false);
    assert.match(message.error, /too large to process safely/i);
    assert.equal(bitmapCalls, 0, "recognized oversized data-URL geometry must be rejected before browser decode");
  });

  test(`1.33.0.37 ${browser} image-worker dimension preflight remains fail-open for unrecognized compressed metadata`, async () => {
    const source = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: "image/png" });
    const { message, bitmapCalls } = await invokeWorker(browser, {
      id: `unknown-${browser}`,
      sourceKind: "blob",
      source,
      options: { targetBytes: 100 }
    });
    assert.equal(message.ok, true, "an unknown preflight must preserve the existing browser-decoder compatibility path");
    assert.equal(bitmapCalls, 1);
  });
}

test("1.33.0.37 shared raster preflight reports dimensions for every supported local raster family", async () => {
  const validationUrl = `${pathToFileURL(path.resolve("dist/firefox/core/raster-validation.js")).href}?opt133037=${Date.now()}-${Math.random()}`;
  const dataUrlModule = await import(`${pathToFileURL(path.resolve("dist/firefox/core/image-data.js")).href}?opt133037=${Date.now()}-${Math.random()}`);
  const validation = await import(validationUrl);
  assert.equal(typeof validation.rasterDimensionsFromBytes, "function", "shared raster validator must expose pre-decode dimension inspection");
  for (const source of [TINY_PNG, TINY_JPEG, TINY_WEBP, TINY_GIF, TINY_ICO]) {
    const decoded = dataUrlModule.decodeImageDataUrlBytes(source);
    const dimensions = validation.rasterDimensionsFromBytes(decoded.bytes, decoded.mimeType);
    assert.deepEqual(dimensions, { width: 16, height: 16 }, decoded.mimeType);
  }
  const huge = validation.rasterDimensionsFromBytes(oversizedPngBytes(), "image/png");
  assert.deepEqual(huge, { width: 20_000, height: 20_000 }, "preflight must expose oversized geometry instead of discarding it");
});

test("1.33.0.37 image-worker predecode protection is owned by security, browser, core and release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["security", "browser", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/optimization-133037.test.mjs"), `${group} must own optimization-133037.test.mjs`);
  }
});
