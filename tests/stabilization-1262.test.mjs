import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.setCalls = []; }
  async get(keys) {
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
    this.setCalls.push(Object.keys(items).sort());
    for (const [key, value] of Object.entries(items)) this.data[key] = structuredClone(value);
  }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

globalThis.browser = { storage: { local: new Area(), session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const storage = await import("../dist/firefox/core/storage.js");
const { projectStateToLocalAssets } = await import("../dist/firefox/core/local-assets.js");

function shortcut(id, position, modifiedAt = 100) {
  return {
    type: "shortcut", id, title: id.toUpperCase(), url: `https://${id}.example/`, image: "", localImageAssetId: "",
    imageSyncData: "", imageAssetId: "", imageSyncKind: "none", imageSourceKind: "none", imageSourceUrl: "",
    imageIsFallback: false, imageStyle: "contain", position, createdAt: 10, modifiedAt, spaceMoveAt: 0, source: "manual"
  };
}

function makeState(count = 3) {
  return model.normalizeState({
    shortcuts: Array.from({ length: count }, (_, i) => shortcut(`s${i}`, i)),
    settings: { ...constants.DEFAULT_SETTINGS },
    settingsModifiedAt: 100,
    updatedAt: 100
  });
}

function compact(state) { return projectStateToLocalAssets(state).state; }

function resetStorage(state) {
  browser.storage.local.data = {
    [constants.LOCAL_STATE_KEY]: structuredClone(compact(state)),
    [constants.LOCAL_ASSET_INDEX_KEY]: { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [] }
  };
  browser.storage.local.setCalls = [];
  browser.storage.session.data = {};
}

function withThemeWallpapers(base, { enabled = true, lightPreset = "softLight", darkPreset = "midnight", clock = 220 } = {}) {
  const next = structuredClone(base);
  for (const settings of [next.settings, next.spaces.personal.settings]) {
    settings.themeWallpapersEnabled = enabled;
    settings.lightBackgroundPreset = lightPreset;
    settings.darkBackgroundPreset = darkPreset;
  }
  next.settingsModifiedAt = clock;
  next.updatedAt = clock;
  next.spaces.personal.settingsModifiedAt = clock;
  next.spaces.personal.updatedAt = clock;
  return next;
}

test("1.26.5 theme-wallpaper settings use the ordinary state writer without altering shortcuts", async () => {
  const base = makeState(200);
  resetStorage(base);
  const baseline = storage.createWriteBaseline(base);
  const beforeShortcuts = structuredClone(browser.storage.local.data[constants.LOCAL_STATE_KEY].spaces.personal.shortcuts);

  const written = await storage.writeLocalState(withThemeWallpapers(base), {
    baseState: baseline,
    recordSyncMutation: true
  });

  assert.equal(written.settings.themeWallpapersEnabled, true);
  assert.equal(written.settings.lightBackgroundPreset, "softLight");
  assert.equal(written.settings.darkBackgroundPreset, "midnight");
  const persisted = browser.storage.local.data[constants.LOCAL_STATE_KEY];
  assert.deepEqual(persisted.spaces.personal.shortcuts, beforeShortcuts,
    "ordinary settings persistence must preserve the existing shortcut payload");
  const journal = browser.storage.local.data[constants.LOCAL_PENDING_SYNC_MUTATION_KEY];
  assert.equal(journal.after.spaces.personal.settings.themeWallpapersEnabled, true);
  assert.equal(journal.after.spaces.personal.settings.lightBackgroundPreset, "softLight");
  assert.equal(journal.after.spaces.personal.settings.darkBackgroundPreset, "midnight");
});

test("1.26.5 ordinary state writer rebases theme-wallpaper edits onto unrelated concurrent settings", async () => {
  const base = makeState(4);
  const baseline = storage.createWriteBaseline(base);
  const intended = withThemeWallpapers(base, { clock: 220 });

  const latest = structuredClone(base);
  latest.settings.rows = 7;
  latest.spaces.personal.settings.rows = 7;
  latest.settingsModifiedAt = 180;
  latest.updatedAt = 180;
  latest.spaces.personal.settingsModifiedAt = 180;
  latest.spaces.personal.updatedAt = 180;
  resetStorage(latest);

  const written = await storage.writeLocalState(intended, {
    baseState: baseline,
    recordSyncMutation: true
  });

  assert.equal(written.settings.rows, 7, "unrelated concurrent setting must survive the rebase");
  assert.equal(written.settings.themeWallpapersEnabled, true);
  assert.equal(written.settings.lightBackgroundPreset, "softLight");
  assert.equal(written.settings.darkBackgroundPreset, "midnight");

  const persisted = model.normalizeState(browser.storage.local.data[constants.LOCAL_STATE_KEY]);
  assert.equal(persisted.settings.rows, 7);
  assert.equal(persisted.settings.themeWallpapersEnabled, true);
  assert.equal(persisted.settings.lightBackgroundPreset, "softLight");
  assert.equal(persisted.settings.darkBackgroundPreset, "midnight");
});
