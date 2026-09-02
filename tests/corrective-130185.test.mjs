import { readBackgroundSource } from "./harness/background-source.mjs";
import { createTestRecoveryLifecycle } from "./harness/recovery-lifecycle.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = source.indexOf("{\n", start);
  if (brace < 0) brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return String(this.owner.className || "").split(/\s+/).filter(Boolean); }
  toggle(name, force) {
    const set = new Set(this.values());
    if (force) set.add(name); else set.delete(name);
    this.owner.className = [...set].join(" ");
  }
  remove(name) { this.owner.className = this.values().filter(value => value !== name).join(" "); }
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.5 ${browser} session-speed paint preserves both personalized Space names`, async () => {
    const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?130185-c=${Date.now()}-${browser}`);
    const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?130185-m=${Date.now()}-${browser}`);
    const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?130185-s=${Date.now()}-${browser}`);
    const personal = { shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Home" }, settingsModifiedAt: 10, updatedAt: 10 };
    const work = { shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Office" }, settingsModifiedAt: 11, updatedAt: 11 };
    const state = model.normalizeState({ activeSpaceId: "personal", spaces: { personal, work } });
    const snapshot = storage.createRenderSnapshot(state);
    assert.equal(snapshot.renderSnapshotVersion, constants.RENDER_SNAPSHOT_SCHEMA_VERSION);
    assert.deepEqual(snapshot.firstPaint.spaceNames, { personal: "Home", work: "Office" });
    assert.equal(snapshot.firstPaint.multipleSpacesEnabled, true);

    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const code = ["isMultipleSpacesEnabled", "normalizedCustomSpaceName", "displaySpaceName", "updateSpaceSwitcher"]
      .map(name => extractFunction(source, name)).join("\n");
    const personalButton = { dataset: { spaceId: "personal" }, textContent: "Home", className: "", classList: null, attrs: {}, setAttribute(k,v){this.attrs[k]=v;} };
    const workButton = { dataset: { spaceId: "work" }, textContent: "Office", className: "", classList: null, attrs: {}, setAttribute(k,v){this.attrs[k]=v;} };
    personalButton.classList = new FakeClassList(personalButton); workButton.classList = new FakeClassList(workButton);
    const switcher = { hidden: false, className: "", classList: { remove() {} } };
    const context = {
      state: snapshot,
      spaceSwitcher: switcher,
      spaceButtons: [personalButton, workButton],
      shortcutDialog: null,
      t: key => key === "work" ? "Work" : "Personal",
      updateShortcutSpaceChoice() {}
    };
    vm.createContext(context);
    vm.runInContext(`${code}; this.update=updateSpaceSwitcher;`, context);
    context.update();
    assert.equal(personalButton.textContent, "Home", "session acceleration must never downgrade Home to Personal");
    assert.equal(workButton.textContent, "Office", "session acceleration must never downgrade Office to Work");
  });

  test(`1.30.18.5 ${browser} remote recovery age is based on local observation passes, not the publisher clock`, async () => {
    const src = readBackgroundSource(browser);
    const fn = extractFunction(src, "maybeGarbageCollectStaleDeviceSnapshots");
    let now = 2_000_000_000_000;
    const remoteRoot = "mosaicsync.sync.device.remote.snapshot.clock-skewed";
    const store = {
      [remoteRoot]: { kind: "root", deviceId: "remote", updatedAt: 100, publishedAt: 1 },
      [`${remoteRoot}.chunk.0`]: { data: "complete" }
    };
    const owner = createTestRecoveryLifecycle({
      compareDeviceSnapshotGenerationRecency: (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0),
      deviceRootDescriptor: (key, value) => value?.kind === "root"
        ? { key, deviceId: value.deviceId, updatedAt: value.updatedAt, publishedAt: value.publishedAt, commitId: "x" }
        : null,
      policy: {
        gcIntervalMs: 1000,
        orphanGraceMs: 5000,
        orphanMinGcPasses: 2,
        maxGenerationsPerDevice: 2,
        maxRecentDevices: 8,
        retentionMs: 2000,
        capMinAgeMs: 1000
      }
    });
    const context = {
      console, PRODUCT_NAME: "MosaicSync", Date: { now: () => now },
      DEVICE_SNAPSHOT_GC_INTERVAL_MS: 1000,
      DEVICE_SNAPSHOT_ORPHAN_GRACE_MS: 5000,
      DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES: 2,
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      DEVICE_SNAPSHOT_MAX_RECENT_DEVICES: 8,
      DEVICE_SNAPSHOT_RETENTION_MS: 2000,
      DEVICE_SNAPSHOT_CAP_MIN_AGE_MS: 1000,
      browser: { storage: { sync: { get: async () => structuredClone(store) } } },
      deviceRootDescriptor: (key, value) => value?.kind === "root" ? { key, deviceId: value.deviceId, updatedAt: value.updatedAt, publishedAt: value.publishedAt, commitId: "x" } : null,
      readDeviceSnapshots: async values => Object.hasOwn(values, remoteRoot)
        ? [{ rootKey: remoteRoot, deviceId: "remote", updatedAt: 100, publishedAt: 1, commitId: "x", profileComplete: true }]
        : [],
      verifiedProfileDeviceSnapshotDescriptors: (values, snapshots, deviceId = "") => snapshots
        .map(snapshot => ({ key: snapshot.rootKey, deviceId: snapshot.deviceId, updatedAt: snapshot.updatedAt, publishedAt: snapshot.publishedAt, commitId: snapshot.commitId }))
        .filter(entry => !deviceId || entry.deviceId === deviceId),
      currentDeviceSnapshotRootHeader: () => false,
      deviceSnapshotKeysForRoot: (values, rootKey) => Object.keys(values).filter(key => key === rootKey || key.startsWith(`${rootKey}.chunk.`)),
      compareDeviceSnapshotGenerationRecency: (a,b) => (b.updatedAt||0)-(a.updatedAt||0),
      compareStableText: (a,b) => String(a).localeCompare(String(b)),
      isDeviceSnapshotChunkKey: key => key.includes(".chunk."),
      planDeviceSnapshotGarbageCollection: owner.planDeviceSnapshotGarbageCollection,
      confirmedDeviceSnapshotGarbageCollectionKeys: owner.confirmedDeviceSnapshotGarbageCollectionKeys,
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      writeLocalMeta: async value => value
    };
    vm.createContext(context); vm.runInContext(`${fn}; this.gc=maybeGarbageCollectStaleDeviceSnapshots;`, context);
    let meta = { syncEnabled: true, deviceId: "local", lastDeviceSnapshotGcAt: 0, deviceSnapshotGcPass: 0, deviceSnapshotRootSeenPass: {}, deviceSnapshotOrphanSeenAt: {}, deviceSnapshotOrphanSeenPass: {} };
    meta = await context.gc(meta, { force: true });
    assert.ok(store[remoteRoot], "a freshly observed recovery must not be deleted because its publisher clock says it is ancient");
    assert.equal(meta.deviceSnapshotRootSeenPass[remoteRoot], 1);
    now += 1000; meta = await context.gc(meta, { force: true });
    assert.ok(store[remoteRoot], "one later local observation is still younger than the configured retention-pass age");
    now += 1000; meta = await context.gc(meta, { force: true });
    assert.equal(store[remoteRoot], undefined, "the recovery can age out only after enough local GC observations");
  });

  test(`1.30.18.5 ${browser} a forward clock jump cannot reclaim a newly observed rootless publication on the next GC pass`, async () => {
    const src = readBackgroundSource(browser);
    const fn = extractFunction(src, "maybeGarbageCollectStaleDeviceSnapshots");
    let now = 10_000;
    const orphanRoot = "mosaicsync.sync.device.remote.snapshot.inflight";
    const chunk = `${orphanRoot}.chunk.0`;
    const store = { [chunk]: { data: "in-flight" } };
    const owner = createTestRecoveryLifecycle({
      policy: {
        gcIntervalMs: 1000,
        orphanGraceMs: 5000,
        orphanMinGcPasses: 2,
        maxGenerationsPerDevice: 2,
        maxRecentDevices: 8,
        retentionMs: 999999999,
        capMinAgeMs: 999999999
      }
    });
    const context = {
      console, PRODUCT_NAME: "MosaicSync", Date: { now: () => now },
      DEVICE_SNAPSHOT_GC_INTERVAL_MS: 1000,
      DEVICE_SNAPSHOT_ORPHAN_GRACE_MS: 5000,
      DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES: 2,
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      DEVICE_SNAPSHOT_MAX_RECENT_DEVICES: 8,
      DEVICE_SNAPSHOT_RETENTION_MS: 999999999,
      DEVICE_SNAPSHOT_CAP_MIN_AGE_MS: 999999999,
      browser: { storage: { sync: { get: async () => structuredClone(store) } } },
      deviceRootDescriptor: () => null,
      readDeviceSnapshots: async () => [],
      verifiedProfileDeviceSnapshotDescriptors: () => [],
      currentDeviceSnapshotRootHeader: () => false,
      deviceSnapshotKeysForRoot: (values, rootKey) => Object.keys(values).filter(key => key === rootKey || key.startsWith(`${rootKey}.chunk.`)),
      compareDeviceSnapshotGenerationRecency: () => 0,
      compareStableText: (a,b) => String(a).localeCompare(String(b)),
      isDeviceSnapshotChunkKey: key => key.includes(".chunk."),
      planDeviceSnapshotGarbageCollection: owner.planDeviceSnapshotGarbageCollection,
      confirmedDeviceSnapshotGarbageCollectionKeys: owner.confirmedDeviceSnapshotGarbageCollectionKeys,
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      writeLocalMeta: async value => value
    };
    vm.createContext(context); vm.runInContext(`${fn}; this.gc=maybeGarbageCollectStaleDeviceSnapshots;`, context);
    let meta = { syncEnabled: true, deviceId: "local", lastDeviceSnapshotGcAt: 0, deviceSnapshotGcPass: 0, deviceSnapshotRootSeenPass: {}, deviceSnapshotOrphanSeenAt: {}, deviceSnapshotOrphanSeenPass: {} };
    meta = await context.gc(meta, { force: true });
    now += 3 * 24 * 60 * 60 * 1000;
    meta = await context.gc(meta, { force: true });
    assert.ok(store[chunk], "one huge local clock jump must not turn the very next observation into deletion");
    now += 1000;
    meta = await context.gc(meta, { force: true });
    assert.equal(store[chunk], undefined, "a fragment that survives two later independent GC observations may be reclaimed");
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.5 ${browser} near-quota pre-retirement plus failed replacement still preserves one verified recovery`, async () => {
    const src = readBackgroundSource(browser);
    const code = ["prepareDeviceSnapshotPublicationCapacity", "publishProfileDeviceSnapshot"]
      .map(name => extractFunction(src, name)).join("\n");
    const pad = size => "x".repeat(size);
    const rootA = "root-a", rootB = "root-b", rootC = "root-c";
    const store = {
      core: { data: pad(120) },
      [rootA]: { data: pad(160) }, [`${rootA}.chunk.0`]: { data: pad(160) },
      [rootB]: { data: pad(160) }, [`${rootB}.chunk.0`]: { data: pad(160) }
    };
    const publication = {
      rootKey: rootC,
      rootValue: { data: pad(140), publishedAt: 30 },
      chunkWrites: { [`${rootC}.chunk.0`]: { data: pad(140) } }
    };
    const decoded = all => [
      all[rootB] && { rootKey: rootB, deviceId: "clone", profileComplete: true, updatedAt: 20, publishedAt: 20, commitId: "b" },
      all[rootA] && { rootKey: rootA, deviceId: "clone", profileComplete: true, updatedAt: 10, publishedAt: 10, commitId: "a" },
      all[rootC] && { rootKey: rootC, deviceId: "clone", profileComplete: true, updatedAt: 30, publishedAt: 30, commitId: "c" }
    ].filter(Boolean);
    const entryBytes = (key, value) => Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value));
    const owner = createTestRecoveryLifecycle({
      compareDeviceSnapshotGenerationRecency: (left, right) => (right.updatedAt || 0) - (left.updatedAt || 0),
      syncEntryBytes: entryBytes,
      policy: { syncQuotaBytes: 1000, syncQuotaMaxItems: 100 }
    });
    const context = {
      console, PRODUCT_NAME: "MosaicSync", PERSONAL_SPACE_ID: "personal", WORK_SPACE_ID: "work",
      SYNC_QUOTA_BYTES: 1000, SYNC_QUOTA_MAX_ITEMS: 100,
      syncEntryBytes: entryBytes,
      compareStableText: (a,b) => String(a).localeCompare(String(b)),
      browser: { storage: { sync: { get: async () => structuredClone(store) } } },
      readOwnDeviceSnapshot: async () => ({ rootKey: rootB, root: store[rootB], decoded: decoded(store)[0] }),
      readSyncSnapshot: async () => ({ records: new Map(), settings: null, dataset: null, assets: new Map() }),
      buildProfileDeviceSnapshotPublication: async () => publication,
      readDeviceSnapshots: async all => decoded(all || {}),
      syncItemsFitInSnapshot: owner.syncItemsFitInSnapshot,
      planDeviceSnapshotPublicationCapacity: owner.planDeviceSnapshotPublicationCapacity,
      writeSyncItems: async items => {
        if (Object.hasOwn(items, rootC)) { const error = new Error("injected root quota failure"); error.name = "QuotaExceededError"; throw error; }
        Object.assign(store, structuredClone(items));
      },
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      commitProfileDeviceSnapshotPublication: async value => {
        Object.assign(store, structuredClone(value.chunkWrites));
        try {
          const error = new Error("injected root quota failure");
          error.name = "QuotaExceededError";
          throw error;
        } catch (error) {
          for (const key of Object.keys(value.chunkWrites)) delete store[key];
          throw error;
        }
      },
      isQuotaError: error => error?.name === "QuotaExceededError",
      pruneSupersededDeviceSnapshotGenerations: async () => 0,
      verifyProfileDeviceSnapshotPublication: async () => ({ snapshots: [], committedSnapshot: null }),
      mergeProfileDeviceSnapshots: () => null,
      profilePublicationTrusted: () => true,
      workspaceStateNormalized: value => value,
      flattenStateNormalized: () => new Map(),
      makeSettingsRecordNormalized: () => null,
      recordFingerprint: () => "",
      settingsRecordEqual: () => true
    };
    vm.createContext(context); vm.runInContext(`${code}; this.publish=publishProfileDeviceSnapshot;`, context);
    const result = await context.publish({ spaces: {} }, { deviceId: "clone" }, { force: true });
    assert.equal(result.written, false);
    assert.equal(result.reason, "quota");
    assert.equal(store[rootA], undefined, "only the oldest verified generation may be retired to create capacity");
    assert.ok(store[rootB], "one verified complete fallback must survive even when the replacement then fails");
    assert.equal(store[`${rootC}.chunk.0`], undefined, "failed replacement fragments are rolled back");
  });
}
