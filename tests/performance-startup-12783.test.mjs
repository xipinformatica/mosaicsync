import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.getCalls = []; }
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
  async set(items) { for (const [key, value] of Object.entries(items)) this.data[key] = structuredClone(value); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

const local = new Area();
globalThis.browser = { storage: { local, session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const storage = await import("../dist/firefox/core/storage.js");
const localAssets = await import("../dist/firefox/core/local-assets.js");

function iconData(id) {
  return `data:image/png;base64,${Buffer.from(`folder-${id}-pixels`.repeat(35)).toString("base64")}`;
}
function child(id, position, image) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image,
    localImageAssetId: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageSourceKind: "upload", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", builtinIcon: "", colorTag: "", position, createdAt: 10, modifiedAt: 20,
    spaceMoveAt: 0, source: "manual"
  };
}

function seedFolderState(childCount = 12) {
  const children = Array.from({ length: childCount }, (_, index) => child(`child-${index}`, index, iconData(index)));
  const normalized = model.normalizeState({
    shortcuts: [{ type: "folder", id: "folder-a", title: "Folder A", position: 0, items: children, createdAt: 10, modifiedAt: 20 }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 20, updatedAt: 20
  });
  const projection = localAssets.projectStateToLocalAssets(normalized);
  local.data = {
    [constants.LOCAL_STATE_KEY]: structuredClone(projection.state),
    [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId: "device-perf-12783", onboardingCompleted: true },
    [constants.LOCAL_ACTIVE_SPACE_KEY]: "personal",
    [constants.LOCAL_ASSET_INDEX_KEY]: { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [...projection.referencedIds] }
  };
  for (const [assetId, dataUrl] of projection.assets) local.data[`${constants.LOCAL_ASSET_PREFIX}${assetId}`] = dataUrl;
  local.getCalls = [];
  return { projection, normalized };
}

test("1.27.8.3 cold startup hydrates only the four visible closed-folder artworks while preserving every child record", async () => {
  const { projection } = seedFolderState(12);
  const compactFolder = projection.state.spaces.personal.shortcuts[0];
  const raw = await storage.readLocalStorageRaw();
  local.getCalls = [];
  const loaded = await storage.materializeLocalStorage(raw, {
    withTimings: true,
    hydrateAssets: "active-no-background",
    folderChildLimit: 4
  });
  const folder = loaded.state.shortcuts[0];
  assert.equal(folder.items.length, 12, "lazy pixels must never remove or truncate authoritative child records");
  for (let index = 0; index < 4; index += 1) assert.equal(folder.items[index].image, iconData(index), `visible mosaic child ${index} should be hydrated`);
  for (let index = 4; index < 12; index += 1) {
    assert.equal(folder.items[index].image, "", `hidden child ${index} pixels should be deferred`);
    assert.equal(folder.items[index].localImageAssetId, compactFolder.items[index].localImageAssetId, "deferred child must retain its authoritative asset reference");
    assert.equal(folder.items[index].url, `https://child-${index}.example/`, "deferred artwork must not affect shortcut structure");
  }
  const assetReads = local.getCalls.filter(call => Array.isArray(call) && call.some(key => String(key).startsWith(constants.LOCAL_ASSET_PREFIX)));
  assert.equal(assetReads.length, 1, "visible folder artwork should remain one batched storage.local read");
  assert.equal(assetReads[0].length, 4, "cold startup must read only the four visible child assets");
});

test("1.27.8.3 deferred folder hydration later reads only hidden pixels and restores the complete artwork set", async () => {
  const { projection } = seedFolderState(12);
  const raw = await storage.readLocalStorageRaw();
  const loaded = await storage.materializeLocalStorage(raw, { hydrateAssets: "active-no-background", folderChildLimit: 4 });
  local.getCalls = [];
  const hydrated = await storage.hydrateDeferredFolderLocalAssetsNormalized(loaded.state, "personal", 4);
  const folder = hydrated.shortcuts[0];
  assert.equal(folder.items.length, 12);
  for (let index = 0; index < 12; index += 1) assert.equal(folder.items[index].image, iconData(index));
  const read = local.getCalls.find(call => Array.isArray(call) && call.some(key => String(key).startsWith(constants.LOCAL_ASSET_PREFIX)));
  assert.ok(read);
  assert.equal(read.length, 8, "post-PCP batch should fetch exactly children 5–12");
  const visibleIds = new Set(projection.state.spaces.personal.shortcuts[0].items.slice(0, 4).map(item => `${constants.LOCAL_ASSET_PREFIX}${item.localImageAssetId}`));
  assert.ok(read.every(key => !visibleIds.has(key)), "already-hydrated visible assets must not be reread");
});

test("1.27.8.3 normal startup reuses the exact persisted compact state as the concurrency baseline", async () => {
  const { projection } = seedFolderState(12);
  const persisted = structuredClone(local.data[constants.LOCAL_STATE_KEY]);
  const raw = await storage.readLocalStorageRaw();
  const loaded = await storage.materializeLocalStorage(raw, { hydrateAssets: "active-no-background", folderChildLimit: 4 });
  assert.deepEqual(loaded.compactBaseline, persisted,
    "read-only startup should not project/hash hydrated artwork merely to prepare a future write baseline");
  assert.notStrictEqual(loaded.compactBaseline, local.data[constants.LOCAL_STATE_KEY]);
  assert.equal(loaded.compactBaseline.spaces.personal.shortcuts[0].items[11].localImageAssetId,
    projection.state.spaces.personal.shortcuts[0].items[11].localImageAssetId);
});

for (const browserName of ["firefox", "chrome"]) {
  test(`1.27.8.8 ${browserName} keeps critical CSS blocking and secondary CSS available through a CSP-safe on-demand bootstrap`, () => {
    const html = fs.readFileSync(`dist/${browserName}/newtab/newtab.html`, "utf8");
    const critical = fs.readFileSync(`dist/${browserName}/newtab/newtab-critical.css`, "utf8");
    const full = fs.readFileSync(`src/shared/newtab/newtab.css`, "utf8");
    const secondaryCss = fs.readFileSync(`dist/${browserName}/newtab/newtab-secondary.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browserName}/newtab/secondary-style-bootstrap.js`, "utf8");
    assert.match(html, /<link rel="stylesheet" href="newtab-critical\.css">/);
    assert.doesNotMatch(html, /<link rel="stylesheet" href="newtab\.css">/, "128 KB full sheet must no longer block the bootstrap frame");
    assert.match(html, /<script src="secondary-style-bootstrap\.js"><\/script>/);
    assert.ok(Buffer.byteLength(critical) < Buffer.byteLength(full) * 0.30,
      "critical sheet should cut at least 70% of blocking CSS source bytes");
    assert.ok(Buffer.byteLength(critical) + Buffer.byteLength(secondaryCss) < Buffer.byteLength(full),
      "critical + secondary-only CSS should parse fewer total bytes than the old monolithic sheet");
    for (const selector of [".shortcut-grid", ".shortcut-card", ".tile", ".folder-mosaic", ".frequent-sites", ".sync-pending-state", ".settings-button", ".bookmarks-button"]) {
      assert.ok(critical.includes(selector), `${browserName}: critical CSS must include ${selector}`);
    }
    assert.doesNotMatch(secondary, /onload\s*=/i, "secondary CSS loader must not depend on an inline event-handler CSP exception");
    assert.match(secondary, /document\.createElement\("link"\)/);
    assert.match(secondary, /link\.href = "newtab-secondary\.css"/);
    assert.match(secondary, /__mosaicsyncEnsureSecondaryStyles/,
      "the secondary-only sheet must expose an explicit on-demand loader");
    assert.doesNotMatch(secondary, /requestAnimationFrame|setTimeout/,
      "merely starting New Tab must not schedule a secondary stylesheet insertion");
  });

  test(`1.27.8.5 ${browserName} begins authoritative local storage before the module graph consumes it`, () => {
    const html = fs.readFileSync(`dist/${browserName}/newtab/newtab.html`, "utf8");
    const src = fs.readFileSync(`dist/${browserName}/newtab/newtab.js`, "utf8");
    const bootstrap = fs.readFileSync(`dist/${browserName}/newtab/local-storage-bootstrap.js`, "utf8");
    const bootstrapTag = html.indexOf('<script src="local-storage-bootstrap.js"></script>');
    const moduleTag = html.indexOf('<script type="module" src="newtab.js"></script>');
    assert.ok(bootstrapTag >= 0 && moduleTag >= 0 && bootstrapTag < moduleTag, "storage.local IPC should start before module evaluation");
    assert.match(bootstrap, /globalThis\.browser\?\.storage\?\.local[\s\S]*?storage\.get\(/);
    assert.match(src, /__mosaicsyncEarlyLocalRead[\s\S]*?earlyLocalBootstrap\?\.promise/);
    assert.match(src, /readLocalStorageRaw\(\)/, "module must retain a safe fallback if bootstrap read is unavailable");
    assert.match(src, /materializeLocalStorage\(rawLocal, \{ withTimings: true, hydrateAssets: "active-no-background", folderChildLimit: 4 \}\)/);
  });

  test(`1.27.8.3 ${browserName} cold boot-grid adoption is strict and keeps the full renderer as fallback`, () => {
    const src = fs.readFileSync(`dist/${browserName}/newtab/newtab.js`, "utf8");
    const boot = fs.readFileSync(`dist/${browserName}/newtab/render-bootstrap.js`, "utf8");
    assert.match(src, /function bootGridMatchesState\(currentState\)/);
    assert.match(src, /Number\(manifest\.updatedAt\) !== Number\(currentState\.updatedAt\)/);
    assert.match(src, /Number\(manifest\.settingsModifiedAt\) !== Number\(currentState\.settingsModifiedAt\)/);
    assert.match(src, /cells\[index\]\?\.dataset\?\.id !== expectedChildren\[index\]\?\.id/,
      "folder mosaic child identities must match before DOM adoption");
    assert.match(src, /card\.getAttribute\("href"\) !== expectedUrl/,
      "shortcut navigation target must match before DOM adoption");
    assert.match(src, /if \(adoptBootGrid && adoptBootGridInPlace\(\)\)/);
    assert.match(src, /else \{\s*render\(\);\s*\}/s, "any adoption uncertainty must fall back to the established renderer");
    assert.match(src, /configureShortcutSlotInteractions\(slot, item\)/);
    assert.match(src, /configureFolderSlotInteractions\(slot, item\)/);
    assert.match(boot, /cell\.dataset\.id = child\.id/,
      "bootstrap must expose the minimum structural identity needed for safe folder adoption");
  });

  test(`1.27.8.3 ${browserName} startup timing remains local-only and non-persistent`, () => {
    const src = fs.readFileSync(`dist/${browserName}/newtab/newtab.js`, "utf8");
    const session = fs.readFileSync(`dist/${browserName}/newtab/session-bootstrap.js`, "utf8");
    const bootstrap = fs.readFileSync(`dist/${browserName}/newtab/render-bootstrap.js`, "utf8");
    assert.match(src, /__mosaicsyncStartupTiming/);
    assert.match(session, /criticalCssReady/);
    assert.match(bootstrap, /bootGridReady/);
    assert.match(src, /startupPhase\("authoritativeStateReady"/);
    assert.doesNotMatch(src, /fetch\([^)]*mosaicsyncStartupTiming|sendMessage\([^)]*mosaicsyncStartupTiming/,
      "startup diagnostics must never become telemetry");
  });
}
