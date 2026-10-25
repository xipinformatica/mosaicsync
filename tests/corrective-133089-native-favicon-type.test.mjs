// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = process.cwd();
// A real 1x1 PNG. Chromium's _favicon endpoint returns PNG bytes like these but
// labels the blob "image/bmp" (observed in Chromium 141).
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const GLOBE = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

async function readWithLabel(label, payload = PNG) {
  const previous = { browser: globalThis.browser, chrome: globalThis.chrome, fetch: globalThis.fetch };
  try {
    const api = { runtime: { id: 'bmp-extension', getURL: path => `chrome-extension://bmp-extension/${path}` }, topSites: { get: async () => [] } };
    globalThis.browser = api; globalThis.chrome = api;
    globalThis.fetch = async url => {
      const bytes = String(url).includes('mosaicsync-placeholder-bmp-extension.invalid') ? GLOBE : payload;
      return { ok: true, blob: async () => ({ size: bytes.length, type: label, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) };
    };
    const mod = await import(`${pathToFileURL(resolve(root, 'dist/chrome/core/platform.js')).href}?bmp=${label}-${Math.random()}`);
    return await mod.readNativeFaviconDataUrl('https://blocked.example/', 128);
  } finally {
    globalThis.browser = previous.browser; globalThis.chrome = previous.chrome; globalThis.fetch = previous.fetch;
  }
}

test('1.33.0.89 Chrome browser icon labelled image/bmp is stored as PNG and survives the profile model', async () => {
  const image = await readWithLabel('image/bmp');
  assert.match(image, /^data:image\/png;base64,iVBORw0KGgo/, 'PNG bytes must be named image/png whatever Chromium labels them');
  const { normalizeState } = await import(pathToFileURL(resolve(root, 'src/shared/core/model.js')).href);
  const state = normalizeState({ schemaVersion: 19, activeSpaceId: 'personal', spaces: { personal: { settings: {}, shortcuts: [
    { id: 'a', type: 'shortcut', url: 'https://blocked.example/', title: 'Blocked', image, imageSourceKind: 'firefox', imageSyncKind: 'device' }
  ] } } });
  const shortcut = (state.spaces?.personal?.shortcuts || state.shortcuts)[0];
  assert.equal(shortcut.image, image, 'the learned browser icon must not be silently dropped');
  assert.ok(shortcut.localImageAssetId, 'the learned browser icon must become a local asset');
});

test('1.33.0.89 the browser placeholder is still rejected after relabelling', async () => {
  const previous = { browser: globalThis.browser, chrome: globalThis.chrome, fetch: globalThis.fetch };
  try {
    const api = { runtime: { id: 'globe-extension', getURL: path => `chrome-extension://globe-extension/${path}` }, topSites: { get: async () => [] } };
    globalThis.browser = api; globalThis.chrome = api;
    globalThis.fetch = async () => ({ ok: true, blob: async () => ({ size: GLOBE.length, type: 'image/bmp', arrayBuffer: async () => GLOBE.buffer.slice(GLOBE.byteOffset, GLOBE.byteOffset + GLOBE.byteLength) }) });
    const mod = await import(`${pathToFileURL(resolve(root, 'dist/chrome/core/platform.js')).href}?globe=${Date.now()}`);
    assert.equal(await mod.readNativeFaviconDataUrl('https://never-visited.example/', 128), '');
  } finally {
    globalThis.browser = previous.browser; globalThis.chrome = previous.chrome; globalThis.fetch = previous.fetch;
  }
});

test('1.33.0.89 invalid PNG signature prefix is not reclassified as PNG', async () => {
  const faux = Uint8Array.from(PNG);
  faux[4] = 0; // Valid PNG bytes 4..7 are CR LF SUB LF.
  const image = await readWithLabel('image/bmp', faux);
  assert.match(image, /^data:image\/bmp;base64,/, 'a four-byte-only prefix must not qualify as a PNG signature');
});
