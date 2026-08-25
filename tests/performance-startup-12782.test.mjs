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

const ICON = `data:image/png;base64,${Buffer.from("startup-icon".repeat(80)).toString("base64")}`;
const WALLPAPER = `data:image/png;base64,${Buffer.from("startup-wallpaper".repeat(700)).toString("base64")}`;

function shortcut(id, position, image = "") {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image,
    localImageAssetId: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageSourceKind: image ? "upload" : "none", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", builtinIcon: "", colorTag: "", position, createdAt: 10, modifiedAt: 20,
    spaceMoveAt: 0, source: "manual"
  };
}

function seededState() {
  const normalized = model.normalizeState({
    shortcuts: [shortcut("visible", 0, ICON)],
    settings: { ...constants.DEFAULT_SETTINGS, backgroundImage: WALLPAPER, backgroundPreset: "", backgroundSourceKind: "upload" },
    settingsModifiedAt: 20,
    updatedAt: 20
  });
  const projection = localAssets.projectStateToLocalAssets(normalized);
  local.data = {
    [constants.LOCAL_STATE_KEY]: structuredClone(projection.state),
    [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId: "device-perf", onboardingCompleted: true },
    [constants.LOCAL_ACTIVE_SPACE_KEY]: "personal",
    [constants.LOCAL_ASSET_INDEX_KEY]: { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [...projection.referencedIds] }
  };
  for (const [assetId, dataUrl] of projection.assets) local.data[`${constants.LOCAL_ASSET_PREFIX}${assetId}`] = dataUrl;
  local.getCalls = [];
  return { projection, normalized };
}

test("1.27.8.2 startup hydrates shortcut artwork but defers the heavyweight custom wallpaper", async () => {
  const { projection } = seededState();
  const compactShortcut = projection.state.spaces.personal.shortcuts[0];
  const settings = projection.state.spaces.personal.settings;
  const shortcutKey = `${constants.LOCAL_ASSET_PREFIX}${compactShortcut.localImageAssetId}`;
  const backgroundKey = `${constants.LOCAL_ASSET_PREFIX}${settings.backgroundLocalAssetId}`;

  const raw = await storage.readLocalStorageRaw();
  const loaded = await storage.materializeLocalStorage(raw, { withTimings: true, hydrateAssets: "active-no-background" });

  assert.equal(loaded.state.shortcuts[0].image, ICON, "visible shortcut artwork should be available for the authoritative grid");
  assert.equal(loaded.state.settings.backgroundImage, "", "full custom wallpaper bytes should not compete with shortcut startup");
  assert.equal(loaded.state.settings.backgroundImageDeferred, true, "the visual layer must know the trusted wallpaper is intentionally deferred");
  assert.equal(loaded.assetIdMemo.get(ICON), compactShortcut.localImageAssetId, "validated artwork identity should be carried forward for normalization/baseline reuse");

  const assetRead = local.getCalls.find(call => Array.isArray(call) && call.includes(shortcutKey));
  assert.ok(assetRead, "startup should batch-read the shortcut asset");
  assert.ok(!assetRead.includes(backgroundKey), "startup shortcut asset batch must exclude the custom wallpaper");

  const baseline = storage.createWriteBaseline(loaded.state, loaded.assetIdMemo);
  assert.equal(baseline.spaces.personal.shortcuts[0].localImageAssetId, compactShortcut.localImageAssetId);
  assert.equal(baseline.spaces.personal.settings.backgroundLocalAssetId, settings.backgroundLocalAssetId,
    "deferring wallpaper pixels must never drop the authoritative content-addressed reference");
});

test("1.27.8.2 deferred wallpaper hydration reads only the wallpaper asset and restores it without touching shortcut pixels", async () => {
  const { projection } = seededState();
  const raw = await storage.readLocalStorageRaw();
  const loaded = await storage.materializeLocalStorage(raw, { hydrateAssets: "active-no-background" });
  local.getCalls = [];

  const hydrated = await storage.hydrateBackgroundLocalAssetNormalized(loaded.state, "personal");
  const backgroundId = projection.state.spaces.personal.settings.backgroundLocalAssetId;
  const shortcutId = projection.state.spaces.personal.shortcuts[0].localImageAssetId;
  assert.equal(hydrated.settings.backgroundImage, WALLPAPER);
  assert.notEqual(hydrated.settings.backgroundImageDeferred, true);
  const read = local.getCalls.find(call => Array.isArray(call));
  assert.deepEqual(read, [`${constants.LOCAL_ASSET_PREFIX}${backgroundId}`], "post-paint wallpaper upgrade should read exactly one content-addressed asset");
  assert.ok(!read.includes(`${constants.LOCAL_ASSET_PREFIX}${shortcutId}`));
});

test("1.27.8.2 synchronous render manifest keeps only the four folder children that can appear in the closed-folder mosaic", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const manifest = await import(`../dist/firefox/newtab/render-manifest.js?perf12782=${Date.now()}`);
  const children = Array.from({ length: 12 }, (_, index) => shortcut(`child-${index}`, index));
  const state = model.normalizeState({
    shortcuts: [{ type: "folder", id: "folder-a", title: "Folder", position: 0, items: children, createdAt: 10, modifiedAt: 20 }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 20, updatedAt: 20
  });
  assert.equal(manifest.persistRenderManifest(state, { onboardingCompleted: true }), true);
  const saved = JSON.parse(store.get(constants.RENDER_MANIFEST_KEY));
  assert.equal(saved.shortcuts[0].items.length, 4);
  assert.deepEqual(saved.shortcuts[0].items.map(item => item.id), ["child-0", "child-1", "child-2", "child-3"]);
});

for (const browserName of ["firefox", "chrome"]) {
  test(`1.27.8.2 ${browserName} authoritative artwork keeps a matching bootstrap preview until full decode`, () => {
    const src = fs.readFileSync(`dist/${browserName}/newtab/newtab.js`, "utf8");
    assert.match(src, /cached\.imageKey !== currentKey/,
      "preview continuity must be identity-gated so stale artwork cannot survive a changed/cleared icon");
    assert.match(src, /img\.decoding = "async"/);
    assert.match(src, /img\.style\.visibility = "hidden"/);
    assert.match(src, /img\.decode\(\)\.then\(reveal\)/,
      "full artwork should replace the preview only after the browser reports it decodable");
    assert.match(src, /previewImg\?\.remove\(\)/);
    assert.doesNotMatch(src, /!img\.isConnected/,
      "preview-to-full swap must also complete while the tile is still inside a detached DocumentFragment");
  });

  test(`1.27.8.2 ${browserName} first-frame previews request asynchronous image decoding`, () => {
    const src = fs.readFileSync(`dist/${browserName}/newtab/render-bootstrap.js`, "utf8");
    assert.match(src, /image\.decoding = "async"/);
    assert.match(src, /icon\.decoding = "async"/);
  });
}
