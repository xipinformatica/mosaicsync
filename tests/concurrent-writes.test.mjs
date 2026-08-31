import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.failNextSet = false; }
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
    if (this.failNextSet) {
      this.failNextSet = false;
      const error = new Error("simulated local storage quota failure");
      error.name = "QuotaExceededError";
      throw error;
    }
    for (const [key, value] of Object.entries(items)) this.data[key] = structuredClone(value);
  }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

globalThis.browser = { storage: { local: new Area(), session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const { rebaseConcurrentState } = await import("../dist/firefox/core/concurrency.js");
const storage = await import("../dist/firefox/core/storage.js");
const { projectStateToLocalAssets } = await import("../dist/firefox/core/local-assets.js");

function shortcut(id, title, position, modifiedAt = 100) {
  return {
    type: "shortcut", id, title, url: `https://${id}.example/`, image: "", localImageAssetId: "",
    imageSyncData: "", imageAssetId: "", imageSyncKind: "none", imageSourceKind: "none",
    imageSourceUrl: "", imageIsFallback: false, imageStyle: "contain", position,
    createdAt: 10, modifiedAt, spaceMoveAt: 0, source: "manual"
  };
}

function baseState() {
  return model.normalizeState({
    shortcuts: [shortcut("a", "A", 0), shortcut("b", "B", 1)],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 100, updatedAt: 100
  });
}

function replacePersonal(state, shortcuts, updatedAt) {
  const next = structuredClone(state);
  next.activeSpaceId = "personal";
  next.shortcuts = shortcuts;
  next.updatedAt = updatedAt;
  next.spaces.personal = {
    ...next.spaces.personal,
    shortcuts,
    updatedAt
  };
  return model.normalizeState(next);
}

test("concurrent edits to different shortcuts are rebased instead of lost", () => {
  const base = baseState();
  const intendedA = base.shortcuts.map(item => ({ ...item }));
  intendedA[0].title = "A edited";
  intendedA[0].modifiedAt = 200;
  const intended = replacePersonal(base, intendedA, 200);

  const latestB = base.shortcuts.map(item => ({ ...item }));
  latestB[1].title = "B edited";
  latestB[1].modifiedAt = 201;
  const latest = replacePersonal(base, latestB, 201);

  const merged = rebaseConcurrentState(base, intended, latest);
  assert.equal(merged.shortcuts.find(item => item.id === "a")?.title, "A edited");
  assert.equal(merged.shortcuts.find(item => item.id === "b")?.title, "B edited");
});


test("concurrent edits to the same shortcut converge deterministically", () => {
  const base = baseState();

  const tabOneItems = base.shortcuts.map(item => ({ ...item }));
  tabOneItems[0].title = "Alpha edit";
  tabOneItems[0].modifiedAt = 260;
  const tabOne = replacePersonal(base, tabOneItems, 260);

  const tabTwoItems = base.shortcuts.map(item => ({ ...item }));
  tabTwoItems[0].title = "Zulu edit";
  tabTwoItems[0].modifiedAt = 260;
  const tabTwo = replacePersonal(base, tabTwoItems, 260);

  const mergedOneOntoTwo = rebaseConcurrentState(base, tabOne, tabTwo);
  const mergedTwoOntoOne = rebaseConcurrentState(base, tabTwo, tabOne);
  const first = mergedOneOntoTwo.shortcuts.find(item => item.id === "a");
  const second = mergedTwoOntoOne.shortcuts.find(item => item.id === "a");

  assert.equal(first?.title, second?.title, "same-record tie must converge regardless of arrival order");
  assert.equal(first?.modifiedAt, 260);
});

test("a local deletion does not erase an unrelated concurrent addition", () => {
  const base = baseState();
  const intended = replacePersonal(base, [{ ...base.shortcuts[1], position: 0 }], 220);
  const concurrent = [...base.shortcuts.map(item => ({ ...item })), shortcut("c", "C added", 2, 230)];
  const latest = replacePersonal(base, concurrent, 230);

  const merged = rebaseConcurrentState(base, intended, latest);
  assert.equal(merged.shortcuts.some(item => item.id === "a"), false);
  assert.equal(merged.shortcuts.some(item => item.id === "b"), true);
  assert.equal(merged.shortcuts.some(item => item.id === "c"), true);
});

test("concurrent device-local favicon hydration survives an unrelated core edit", () => {
  const base = baseState();
  const intendedItems = base.shortcuts.map(item => ({ ...item }));
  intendedItems[0].title = "A renamed";
  intendedItems[0].modifiedAt = 240;
  const intended = replacePersonal(base, intendedItems, 240);

  const icon = `data:image/png;base64,${Buffer.from("favicon-bytes".repeat(40)).toString("base64")}`;
  const iconId = model.assetIdForDataUrl(icon);
  const latestItems = base.shortcuts.map(item => ({ ...item }));
  latestItems[0] = {
    ...latestItems[0], image: "", localImageAssetId: iconId, imageSyncKind: "device",
    imageSourceKind: "favicon", imageSourceUrl: "https://a.example/favicon.ico"
  };
  const latest = replacePersonal(base, latestItems, 100); // local cache: core clock deliberately unchanged

  const merged = rebaseConcurrentState(base, intended, latest);
  const a = merged.shortcuts.find(item => item.id === "a");
  assert.equal(a.title, "A renamed");
  assert.equal(a.localImageAssetId, iconId);
  assert.equal(a.imageSourceKind, "favicon");
});

test("writeLocalState rebases against a newer persisted tab inside the write transaction", async () => {
  browser.storage.local.data = {};
  browser.storage.session.data = {};
  const base = baseState();

  const intendedItems = base.shortcuts.map(item => ({ ...item }));
  intendedItems[0].title = "A from tab one";
  intendedItems[0].modifiedAt = 300;
  const intended = replacePersonal(base, intendedItems, 300);

  const latestItems = base.shortcuts.map(item => ({ ...item }));
  latestItems[1].title = "B from tab two";
  latestItems[1].modifiedAt = 301;
  const latest = replacePersonal(base, latestItems, 301);
  browser.storage.local.data[constants.LOCAL_STATE_KEY] = projectStateToLocalAssets(latest).state;
  browser.storage.local.data[constants.LOCAL_ASSET_INDEX_KEY] = { schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION, ids: [] };

  const written = await storage.writeLocalState(intended, { baseState: storage.createWriteBaseline(base) });
  assert.equal(written.shortcuts.find(item => item.id === "a")?.title, "A from tab one");
  assert.equal(written.shortcuts.find(item => item.id === "b")?.title, "B from tab two");

  const persisted = model.normalizeState(browser.storage.local.data[constants.LOCAL_STATE_KEY]);
  assert.equal(persisted.shortcuts.find(item => item.id === "a")?.title, "A from tab one");
  assert.equal(persisted.shortcuts.find(item => item.id === "b")?.title, "B from tab two");
});

test("concurrent edits to different settings fields are both preserved", () => {
  const base = baseState();
  const intended = structuredClone(base);
  intended.spaces.personal.settings.theme = "light";
  intended.spaces.personal.settingsModifiedAt = 400;
  intended.spaces.personal.updatedAt = 400;
  intended.settings = intended.spaces.personal.settings;
  intended.settingsModifiedAt = 400;
  intended.updatedAt = 400;

  const latest = structuredClone(base);
  latest.spaces.personal.settings.tileSize = 92;
  latest.spaces.personal.settingsModifiedAt = 401;
  latest.spaces.personal.updatedAt = 401;
  latest.settings = latest.spaces.personal.settings;
  latest.settingsModifiedAt = 401;
  latest.updatedAt = 401;

  const merged = rebaseConcurrentState(base, intended, latest);
  assert.equal(merged.settings.theme, "light");
  assert.equal(merged.settings.tileSize, 92);
});

test("cross-space move preserves an unrelated concurrent addition", () => {
  const base = baseState();
  const intended = model.moveShortcutBetweenSpaces(base, {
    shortcutId: "a", fromSpaceId: "personal", toSpaceId: "work"
  });

  const latestItems = [...base.shortcuts.map(item => ({ ...item })), shortcut("c", "C concurrent", 2, 450)];
  const latest = replacePersonal(base, latestItems, 450);
  const merged = rebaseConcurrentState(base, intended, latest);

  assert.equal(merged.spaces.personal.shortcuts.some(item => item.id === "a"), false);
  assert.equal(merged.spaces.work.shortcuts.some(item => item.id === "a"), true);
  assert.equal(merged.spaces.personal.shortcuts.some(item => item.id === "c"), true);
});


test("failed atomic local-state writes preserve the previous compact state and asset set", async () => {
  browser.storage.local.data = {};
  browser.storage.local.failNextSet = false;
  browser.storage.session.data = {};

  const oldImage = `data:image/png;base64,${Buffer.from("old-local-asset".repeat(80)).toString("base64")}`;
  const newImage = `data:image/png;base64,${Buffer.from("new-local-asset".repeat(80)).toString("base64")}`;
  const initialItems = baseState().shortcuts.map(item => ({ ...item }));
  initialItems[0] = {
    ...initialItems[0], image: oldImage, imageSyncKind: "device", imageSourceKind: "upload", modifiedAt: 500
  };
  const initial = replacePersonal(baseState(), initialItems, 500);
  const persistedInitial = await storage.writeLocalState(initial);
  const oldAssetId = model.assetIdForDataUrl(oldImage);
  const newAssetId = model.assetIdForDataUrl(newImage);
  const beforeFailure = structuredClone(browser.storage.local.data);

  const changedItems = persistedInitial.shortcuts.map(item => ({ ...item }));
  changedItems[0] = {
    ...changedItems[0], image: newImage, imageSyncKind: "device", imageSourceKind: "upload", modifiedAt: 501
  };
  const intended = replacePersonal(persistedInitial, changedItems, 501);

  browser.storage.local.failNextSet = true;
  await assert.rejects(
    () => storage.writeLocalState(intended, { baseState: storage.createWriteBaseline(persistedInitial) }),
    error => error?.code === "STORAGE_LOCAL_WRITE_FAILED" && error?.cause?.name === "QuotaExceededError"
  );

  assert.deepEqual(browser.storage.local.data, beforeFailure);
  assert.equal(typeof browser.storage.local.data[`${constants.LOCAL_ASSET_PREFIX}${oldAssetId}`], "string");
  assert.equal(browser.storage.local.data[`${constants.LOCAL_ASSET_PREFIX}${newAssetId}`], undefined);
});

test("concurrent edits to the same settings field with equal clocks converge deterministically", () => {
  const base = baseState();

  const first = structuredClone(base);
  first.spaces.personal.settings.theme = "light";
  first.spaces.personal.settingsModifiedAt = 500;
  first.spaces.personal.updatedAt = 500;
  first.settings = first.spaces.personal.settings;
  first.settingsModifiedAt = 500;
  first.updatedAt = 500;

  const second = structuredClone(base);
  second.spaces.personal.settings.theme = "dark";
  second.spaces.personal.settingsModifiedAt = 500;
  second.spaces.personal.updatedAt = 500;
  second.settings = second.spaces.personal.settings;
  second.settingsModifiedAt = 500;
  second.updatedAt = 500;

  const firstOntoSecond = rebaseConcurrentState(base, first, second);
  const secondOntoFirst = rebaseConcurrentState(base, second, first);
  assert.equal(firstOntoSecond.settings.theme, secondOntoFirst.settings.theme, "same-field ties must converge regardless of arrival order");
  assert.ok(["light", "dark"].includes(firstOntoSecond.settings.theme));
  assert.equal(firstOntoSecond.settingsModifiedAt, 500);
});


test("1.26.17.4 inactive-Space concurrent core edit survives an active-Space write", () => {
  const base = baseState();
  const seeded = structuredClone(base);
  seeded.spaces.work.shortcuts = [shortcut("w", "Work", 0, 100)];
  seeded.spaces.work.updatedAt = 100;
  const starting = model.normalizeState(seeded);

  const intendedItems = starting.spaces.personal.shortcuts.map(item => ({ ...item }));
  intendedItems[0].title = "A active-space edit";
  intendedItems[0].modifiedAt = 610;
  const intended = replacePersonal(starting, intendedItems, 610);

  const latest = structuredClone(starting);
  latest.spaces.work.shortcuts[0].title = "Work concurrent edit";
  latest.spaces.work.shortcuts[0].modifiedAt = 611;
  latest.spaces.work.updatedAt = 611;
  // The active Personal Space clock deliberately remains unchanged in this
  // external state, matching the edge case behind the storage-event audit.
  const merged = rebaseConcurrentState(starting, intended, model.normalizeState(latest));
  assert.equal(merged.spaces.personal.shortcuts.find(item => item.id === "a")?.title, "A active-space edit");
  assert.equal(merged.spaces.work.shortcuts.find(item => item.id === "w")?.title, "Work concurrent edit");
});

test("1.26.17.4 same-shortcut core edit and device-local favicon interleave without losing either", () => {
  const base = baseState();
  const icon = `data:image/png;base64,${Buffer.from("reciprocal-favicon".repeat(40)).toString("base64")}`;
  const iconId = model.assetIdForDataUrl(icon);

  const intendedItems = base.shortcuts.map(item => ({ ...item }));
  intendedItems[0] = {
    ...intendedItems[0], image:"", localImageAssetId:iconId, imageSyncKind:"device",
    imageSourceKind:"favicon", imageSourceUrl:"https://a.example/favicon.ico"
  };
  const intendedCache = replacePersonal(base, intendedItems, 100); // cache-only: no core clock change

  const latestItems = base.shortcuts.map(item => ({ ...item }));
  latestItems[0].title = "A concurrent rename";
  latestItems[0].modifiedAt = 620;
  const latestCore = replacePersonal(base, latestItems, 620);

  const merged = rebaseConcurrentState(base, intendedCache, latestCore);
  const a = merged.shortcuts.find(item => item.id === "a");
  assert.equal(a.title, "A concurrent rename");
  assert.equal(a.localImageAssetId, iconId);
  assert.equal(a.imageSourceKind, "favicon");
});
