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
    return {};
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

const local = new Area();
globalThis.browser = { storage: { local, session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const storage = await import("../dist/firefox/core/storage.js");
const localAssets = await import("../dist/firefox/core/local-assets.js");

function iconData(id) {
  return `data:image/png;base64,${Buffer.from(`perf-1284-${id}-pixels`.repeat(30)).toString("base64")}`;
}
function shortcut(id, position) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image: iconData(id),
    localImageAssetId: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageSourceKind: "upload", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", builtinIcon: "", colorTag: "", position, createdAt: 10, modifiedAt: 20,
    spaceMoveAt: 0, source: "manual"
  };
}

function seedFolder(childCount = 20) {
  const children = Array.from({ length: childCount }, (_, index) => shortcut(`child-${index}`, index));
  const state = model.normalizeState({
    shortcuts: [{ type: "folder", id: "folder-a", title: "Folder", position: 0, items: children, createdAt: 10, modifiedAt: 20 }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 20, updatedAt: 20
  });
  const projection = localAssets.projectStateToLocalAssets(state);
  local.data = {
    [constants.LOCAL_STATE_KEY]: structuredClone(projection.state),
    [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId: "device-1284", onboardingCompleted: true },
    [constants.LOCAL_ACTIVE_SPACE_KEY]: "personal",
    [constants.LOCAL_ASSET_INDEX_KEY]: { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [...projection.referencedIds] }
  };
  for (const [id, data] of projection.assets) local.data[`${constants.LOCAL_ASSET_PREFIX}${id}`] = data;
  local.getCalls = [];
  return projection;
}

test("1.27.8.5 deferred folder artwork hydrates in bounded chunks and yields between chunks", async () => {
  seedFolder(20);
  const raw = await storage.readLocalStorageRaw();
  const loaded = await storage.materializeLocalStorage(raw, { hydrateAssets: "active-no-background", folderChildLimit: 4 });
  local.getCalls = [];
  let yields = 0;
  const progress = [];
  const hydrated = await storage.hydrateDeferredFolderLocalAssetsNormalized(loaded.state, "personal", 4, {
    batchSize: 5,
    yieldBetween: async () => { yields += 1; },
    onBatch: async (_state, info) => { progress.push(info.loaded); }
  });
  const reads = local.getCalls.filter(call => Array.isArray(call) && call.some(key => String(key).startsWith(constants.LOCAL_ASSET_PREFIX)));
  assert.deepEqual(reads.map(call => call.length), [5, 5, 5, 1], "16 hidden images should be split into bounded reads");
  assert.equal(yields, 3, "the hydrator should yield between storage/decode chunks");
  assert.deepEqual(progress, [5, 10, 15, 16]);
  assert.ok(hydrated.shortcuts[0].items.every(item => item.image), "all deferred images must eventually hydrate");
});

test("1.27.8.5 Frequently Visited is a profile preference while actual browser data remains local", () => {
  const personalSettings = { ...constants.DEFAULT_SETTINGS, frequentlyVisitedEnabled: true, frequentlyVisitedCount: 8 };
  const workSettings = { ...constants.DEFAULT_SETTINGS, frequentlyVisitedEnabled: false, frequentlyVisitedCount: 3 };
  const normalized = model.normalizeState({
    activeSpaceId: "work",
    spaces: {
      personal: { shortcuts: [], settings: personalSettings, settingsModifiedAt: 100, updatedAt: 100 },
      work: { shortcuts: [], settings: workSettings, settingsModifiedAt: 200, updatedAt: 200 }
    }
  });
  assert.equal(normalized.spaces.personal.settings.frequentlyVisitedEnabled, true);
  assert.equal(normalized.spaces.personal.settings.frequentlyVisitedCount, 8);
  assert.equal(normalized.spaces.work.settings.frequentlyVisitedEnabled, true, "Work must mirror the global display intent");
  assert.equal(normalized.spaces.work.settings.frequentlyVisitedCount, 8, "Work must mirror the global display count");

  const record = model.makeSettingsRecordNormalized(model.workspaceStateNormalized(normalized, "personal"), "device-a");
  assert.equal(record.settings.frequentlyVisitedEnabled, true);
  assert.equal(record.settings.frequentlyVisitedCount, 8);

  const oldRecord = structuredClone(record);
  delete oldRecord.settings.frequentlyVisitedEnabled;
  delete oldRecord.settings.frequentlyVisitedCount;
  const localState = model.normalizeState({ shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS, frequentlyVisitedEnabled: true, frequentlyVisitedCount: 10 } });
  const rebuilt = model.stateFromRecords(new Map(), oldRecord, localState, new Map());
  assert.equal(rebuilt.settings.frequentlyVisitedEnabled, true, "older settings records must not erase a receiving device's migrated preference");
  assert.equal(rebuilt.settings.frequentlyVisitedCount, 10);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.5 ${browser} uses a genuinely secondary-only stylesheet`, () => {
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");
    assert.ok(Buffer.byteLength(critical) < 35_500, "blocking CSS should stay within the reviewed 1.27.8.8 launcher-only budget");
    assert.ok(Buffer.byteLength(critical) + Buffer.byteLength(secondary) < 125_000,
      "runtime CSS must stay within the reviewed post-monolith budget");
    assert.equal(fs.existsSync("src/shared/newtab/newtab.css"), false,
      "the obsolete monolithic source sheet must stay deleted");
    for (const selector of ["shortcut-color-picker", "settings-dialog", "builtin-icon-choice", "shortcut-order-setting-row", "folder-popover"]) {
      assert.equal(critical.includes(selector), false, `${selector} must stay off the first-frame critical sheet`);
      assert.equal(secondary.includes(selector), true, `${selector} must remain available in secondary UI CSS`);
    }
    assert.equal(critical.includes("web-access-prompt"), true,
      "the automatically surfaced Website Access prompt must be critical-styled in final 1.27.8.8");
    assert.equal(secondary.includes("web-access-prompt"), false,
      "permission reconciliation must not require a post-startup secondary CSS insertion");
  });

  test(`1.27.8.5 ${browser} pre-module storage bootstrap uses the frozen authoritative key contract`, () => {
    const js = fs.readFileSync(`dist/${browser}/newtab/local-storage-bootstrap.js`, "utf8");
    for (const key of [constants.LOCAL_STATE_KEY, constants.LOCAL_META_KEY, constants.LOCAL_ACTIVE_SPACE_KEY, constants.LOCAL_ASSET_INDEX_KEY]) {
      assert.ok(js.includes(JSON.stringify(key)), `bootstrap storage key drift: ${key}`);
    }
  });

  test(`1.27.8.5 ${browser} records perceived paint and bounded long-task diagnostics locally only`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const boot = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    assert.match(boot, /firstLauncherPaint/);
    assert.match(src, /schedulePaintPhase\("perceivedCompletePaint"\)/);
    assert.match(src, /PerformanceObserver[\s\S]*?longtask/);
    assert.match(src, /observer\.disconnect\(\)/, "long-task observer must not run for the lifetime of every New Tab");
    assert.match(src, /longTaskWindowEnd/);
    assert.doesNotMatch(src, /storage\.(?:local|sync|session)\.set\([^)]*startupTiming|fetch\([^)]*startupTiming|sendMessage\([^)]*startupTiming/);
  });

  test(`1.30 ${browser} keeps full-viewport wallpaper paint completely frozen while Settings is open`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const css = [fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8"), fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8")].join("\n");
    assert.match(src, /if \(settingsDialog\?\.open\) \{[\s\S]*?deferredAppearanceVisual = true;[\s\S]*?return;/);
    assert.doesNotMatch(src, /paintAppearancePreviewLayer|appearancePreviewLayer|appearancePreviewImage/);
    assert.doesNotMatch(html, /appearancePreviewLayer|appearancePreviewImage/);
    assert.doesNotMatch(css, /appearance-preview-layer|appearance-preview-image/);
  });

  test(`1.27.8.5 ${browser} synchronizes Frequent Show/Count intent but requests Top Sites only from a local user gesture`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(src, /persistFrequentlyVisitedPreference\(\{ enabled: wantsEnabled \}\)/);
    assert.match(src, /const permissionPromise = wantsEnabled \? requestTopSitesPermissionFromGesture\(\) : null/);
    assert.match(src, /publishLegacyIntent = enabled \|\| count !== DEFAULT_STATE\.settings\.frequentlyVisitedCount/,
      "legacy OFF/default devices must not race and overwrite another computer's legacy ON intent");
    assert.match(src, /recordSyncMutation: publishLegacyIntent && loaded\.meta\?\.syncEnabled && loaded\.meta\?\.syncInitialized/);
  });

  test(`1.27.8.5 ${browser} folder-open hydration cannot overwrite a concurrent structural edit`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(src, /const mutationGeneration = stateMutationGeneration;[\s\S]*?hydrateFolderLocalAssetsNormalized[\s\S]*?stateMutationGeneration !== mutationGeneration/);
    assert.match(src, /deferredFolderHydrationGeneration \+= 1;[\s\S]*?state = hydrated;[\s\S]*?scheduleDeferredFolderHydration\(\)/);
  });
}
