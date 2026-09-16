import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

class Area {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
    this.writes = [];
  }
  async get(keys = null) {
    const snapshot = structuredClone(this.data);
    if (keys == null) return snapshot;
    if (typeof keys === "string") return Object.hasOwn(snapshot, keys) ? { [keys]: snapshot[keys] } : {};
    const wanted = Array.isArray(keys) ? keys : Object.keys(keys || {});
    const out = Array.isArray(keys) ? {} : structuredClone(keys || {});
    for (const key of wanted) if (Object.hasOwn(snapshot, key)) out[key] = snapshot[key];
    return out;
  }
  async set(items) {
    this.writes.push(structuredClone(items));
    Object.assign(this.data, structuredClone(items));
  }
  async remove(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

class LockManager {
  constructor() { this.tails = new Map(); }
  async request(name, callback) {
    const previous = this.tails.get(name) || Promise.resolve();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => held);
    this.tails.set(name, tail);
    await previous;
    try { return await callback(); }
    finally {
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }
}

async function modulesFor(browser, suffix) {
  const nonce = `${Date.now()}-${Math.random()}-${suffix}`;
  const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?1301811-c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?1301811-m=${nonce}`);
  const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?1301811-s=${nonce}`);
  return { constants, model, storage };
}

function stateFor(constants, model, { activeSpaceId = "personal", modifiedAt = 100 } = {}) {
  return model.normalizeState({
    activeSpaceId,
    spaces: {
      personal: {
        shortcuts: [{ type:"shortcut", id:"p", title:"Personal", url:"https://personal.example/", position:0, createdAt:1, modifiedAt }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:"Personal" },
        settingsModifiedAt:modifiedAt,
        updatedAt:modifiedAt
      },
      work: {
        shortcuts: [{ type:"shortcut", id:"w", title:"Work", url:"https://work.example/", position:0, createdAt:1, modifiedAt:modifiedAt + 1 }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:"Work" },
        settingsModifiedAt:modifiedAt + 1,
        updatedAt:modifiedAt + 1
      }
    }
  });
}

async function withRuntime(fn) {
  const previousBrowser = globalThis.browser;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const local = new Area();
  const session = new Area();
  const locks = new LockManager();
  globalThis.browser = { storage: { local, session } };
  Object.defineProperty(globalThis, "navigator", { configurable:true, value:{ locks } });
  try { return await fn({ local, session }); }
  finally {
    globalThis.browser = previousBrowser;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.11 ${browser} structural persistence cannot write or visually override the dedicated active-Space pointer`, async () => {
    await withRuntime(async ({ local, session }) => {
      const { constants, model, storage } = await modulesFor(browser, "active-owner");
      const initial = stateFor(constants, model, { activeSpaceId:"personal", modifiedAt:100 });
      await storage.writeLocalState(initial);
      await local.set({ [constants.LOCAL_ACTIVE_SPACE_KEY]: "work" });
      local.writes.length = 0;

      const staleStructural = stateFor(constants, model, { activeSpaceId:"personal", modifiedAt:200 });
      await storage.writeLocalState(staleStructural);

      assert.equal(local.data[constants.LOCAL_ACTIVE_SPACE_KEY], "work");
      const structuralWrites = local.writes.filter(items => Object.hasOwn(items, constants.LOCAL_STATE_KEY));
      assert.ok(structuralWrites.length > 0);
      assert.ok(structuralWrites.every(items => !Object.hasOwn(items, constants.LOCAL_ACTIVE_SPACE_KEY)),
        "ordinary profile persistence must not physically own the device active-Space key");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].activeSpaceId, "work",
        "structural session publication must derive active Space from the dedicated pointer");
    });
  });

  test(`1.30.18.11 ${browser} independent meta patches rebase under the persistence lock and preserve both intentions`, async () => {
    await withRuntime(async ({ local }) => {
      const { constants, storage } = await modulesFor(browser, "meta-intent");
      await storage.writeLocalMeta({
        ...constants.DEFAULT_META,
        deviceId:"device-meta",
        onboardingCompleted:true,
        onboardingVersion:"1.30.18.10",
        syncEnabled:true,
        syncStatus:"ready"
      });

      await Promise.all([
        storage.updateLocalMeta({ onboardingCompleted:false, onboardingVersion:"" }),
        storage.updateLocalMeta({ syncStatus:"waiting", lastSyncWarning:"remote pending" })
      ]);

      const finalMeta = local.data[constants.LOCAL_META_KEY];
      assert.equal(finalMeta.deviceId, "device-meta");
      assert.equal(finalMeta.onboardingCompleted, false);
      assert.equal(finalMeta.onboardingVersion, "");
      assert.equal(finalMeta.syncStatus, "waiting");
      assert.equal(finalMeta.lastSyncWarning, "remote pending");
      assert.equal(finalMeta.syncEnabled, true, "unrelated authoritative meta fields must survive field-intent updates");
    });
  });

  test(`1.30.18.11 ${browser} stale startup repair cannot overwrite newer active-Space or meta authority`, async () => {
    await withRuntime(async ({ local }) => {
      const { constants, model, storage } = await modulesFor(browser, "startup-repair");
      await storage.writeLocalState(stateFor(constants, model, { activeSpaceId:"personal", modifiedAt:300 }));
      delete local.data[constants.LOCAL_ACTIVE_SPACE_KEY];
      delete local.data[constants.LOCAL_META_KEY];

      const staleRaw = await storage.readLocalStorageRaw();
      await storage.writeActiveSpace("work");
      await storage.writeLocalMeta({
        ...constants.DEFAULT_META,
        deviceId:"newer-device",
        onboardingCompleted:true,
        onboardingVersion:"newer",
        syncStatus:"ready"
      });

      const loaded = await storage.materializeLocalStorage(staleRaw, { hydrateAssets:"active-no-background" });
      assert.equal(local.data[constants.LOCAL_ACTIVE_SPACE_KEY], "work");
      assert.equal(local.data[constants.LOCAL_META_KEY].deviceId, "newer-device");
      assert.equal(local.data[constants.LOCAL_META_KEY].onboardingVersion, "newer");
      assert.equal(loaded.state.activeSpaceId, "work");
      assert.equal(loaded.meta.deviceId, "newer-device");
      assert.equal(loaded.meta.onboardingVersion, "newer");
    });
  });
}

test("1.30.18.11 structural session warm-up has no Frequently Visited write side door", () => {
  const src = fs.readFileSync("src/shared/core/storage.js", "utf8");
  const warmStart = src.indexOf("export async function warmSessionRenderCache");
  const warmEnd = src.indexOf("export async function updateSessionFrequentlyVisitedSnapshot", warmStart);
  const warmBlock = src.slice(warmStart, warmEnd);
  const publishStart = src.indexOf("async function publishSessionRenderSnapshotBestEffort");
  const publishEnd = src.indexOf("export async function warmSessionRenderCache", publishStart);
  const publishBlock = src.slice(publishStart, publishEnd);
  assert.ok(warmStart >= 0 && warmEnd > warmStart && publishStart >= 0 && publishEnd > publishStart);
  assert.doesNotMatch(warmBlock, /frequentSnapshot|SESSION_FREQUENTLY_VISITED_PROJECTION_KEY/);
  assert.doesNotMatch(publishBlock, /SESSION_FREQUENTLY_VISITED_PROJECTION_KEY/);
  assert.match(publishBlock, /createRenderSnapshot\(state \|\| DEFAULT_STATE, \{ frequentSnapshot: null \}\)/,
    "structural snapshot projection must explicitly strip FV data");
  assert.match(src, /export async function updateSessionFrequentlyVisitedSnapshot/);
});

test("1.30.18.11 FV first-paint artwork is bounded and decoded before atomic DOM commit", () => {
  const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const prepStart = src.indexOf("async function prepareFrequentFaviconForSession");
  const prepEnd = src.indexOf("function projectFrequentRenderSnapshot", prepStart);
  const prep = src.slice(prepStart, prepEnd);
  assert.match(prep, /RENDER_PREVIEW_MAX_CHARS/);
  assert.match(prep, /RENDER_PREVIEW_TARGET_BYTES/);
  assert.match(prep, /RENDER_PREVIEW_DIMENSION/);
  assert.match(prep, /optimizeImageDataUrl/);

  const renderStart = src.indexOf("async function renderFrequentlyVisited");
  const renderEnd = src.indexOf("function setFrequentlyVisitedOptionsVisibility", renderStart);
  const render = src.slice(renderStart, renderEnd);
  const decodeAwait = render.indexOf("await Promise.all(decodeJobs)");
  const commit = render.indexOf("frequentSitesList.replaceChildren(fragment)");
  assert.ok(decodeAwait >= 0 && commit > decodeAwait,
    "the visible strip must not commit until every detached favicon decode has settled");
  assert.match(render, /settleFrequentIconBeforeCommit\(icon\)/);
  assert.match(src, /await icon\.decode\(\)/);
});

test("1.30.18.11 FV browser-history favicons remain session-only presentation data", () => {
  const storage = fs.readFileSync("src/shared/core/storage.js", "utf8");
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const updateStart = newtab.indexOf("function updateFrequentRenderSnapshot");
  const updateEnd = newtab.indexOf("function readDeviceDefaultSpacePreference", updateStart);
  const updateBlock = newtab.slice(updateStart, updateEnd);
  assert.match(updateBlock, /updateSessionFrequentlyVisitedSnapshot/);
  const executableUpdateBlock = updateBlock.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(executableUpdateBlock, /localStorage\.|storage\.local|storage\.sync|writeLocalState/);
  assert.match(storage, /SESSION_FREQUENTLY_VISITED_PROJECTION_KEY/);
  const persistedWrites = storage.match(/\[LOCAL_STATE_KEY\]|\[LOCAL_META_KEY\]|\[LOCAL_ASSET_INDEX_KEY\]/g) || [];
  assert.ok(persistedWrites.length > 0, "persistence layer should still contain its normal local ownership keys");
});

test("1.30.18.11 Settings-open appearance updates canvas text before deferring the full background commit", () => {
  const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = src.indexOf("function applyPageBackgroundVisual");
  const end = src.indexOf("function scheduleAppearanceHintRefresh", start);
  const block = src.slice(start, end > start ? end : start + 7000);
  const settingsBranch = block.indexOf("if (isSettingsOpen())");
  const canvasText = block.indexOf("document.documentElement.dataset.canvasText = effectiveCanvasText()", settingsBranch);
  const deferred = block.indexOf("deferredAppearanceVisual = true", settingsBranch);
  const earlyReturn = block.indexOf("return;", deferred);
  const pageBackground = block.indexOf("document.documentElement.style.setProperty(\"--background-dim\"", earlyReturn);
  assert.ok(settingsBranch >= 0 && canvasText > settingsBranch && deferred > canvasText && earlyReturn > deferred);
  assert.ok(pageBackground > earlyReturn,
    "full-page background painting must remain after the Settings-open early return");
});


test("1.30.18.11 persistence helper naming broadens ownership while the rolling Web Lock identifier stays byte-stable", () => {
  const storage = fs.readFileSync("src/shared/core/storage.js", "utf8");
  const constants = fs.readFileSync("src/shared/core/constants.js", "utf8");
  assert.match(storage, /async function withPersistenceWriteLock\(/);
  assert.doesNotMatch(storage, /withLocalAssetWriteLock/);
  assert.match(constants, /LOCAL_ASSET_WRITE_LOCK_NAME = "mosaicsync\.local-assets\.write\.v1"/);
});

test("1.30.18.11 field-intent meta updates cannot replace device identity or schema ownership", async () => {
  await withRuntime(async ({ local }) => {
    const { constants, storage } = await modulesFor("firefox", "meta-identity");
    await storage.writeLocalMeta({ ...constants.DEFAULT_META, deviceId:"owned-device", onboardingCompleted:true });
    const result = await storage.updateLocalMeta({
      deviceId:"attacker-device",
      schemaVersion:999,
      onboardingCompleted:false
    });
    assert.equal(result.deviceId, "owned-device");
    assert.equal(result.schemaVersion, constants.DEFAULT_META.schemaVersion);
    assert.equal(local.data[constants.LOCAL_META_KEY].deviceId, "owned-device");
    assert.equal(local.data[constants.LOCAL_META_KEY].onboardingCompleted, false);
  });
});
