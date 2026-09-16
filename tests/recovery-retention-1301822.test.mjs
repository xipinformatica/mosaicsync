import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readBackgroundSource } from "./harness/background-source.mjs";
import { createTestRecoveryLifecycle } from "./harness/recovery-lifecycle.mjs";
import { stableStringify } from "../src/shared/core/model.js";
import { createRecoveryGenerationStore } from "../src/shared/background/recovery-generation-store.js";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = source.indexOf("{\n", start);
  if (brace < 0) brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (line) { if (char === "\n") line = false; continue; }
    if (block) { if (char === "*" && next === "/") { block = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { line = true; index += 1; continue; }
    if (char === "/" && next === "*") { block = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function generationRoot(commitId, updatedAt) {
  const key = `mosaicsync.sync.device.dev.snapshot.${commitId}`;
  return [key, {
    schemaVersion: 2,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: 1,
    chunkKeyMode: "generation",
    snapshotId: commitId,
    deviceId: "dev",
    commitId,
    publishedAt: updatedAt,
    updatedAt,
    profileSnapshotVersion: 1,
    profileComplete: true,
    parts: 1
  }];
}

function rootDescriptor(key, value) {
  return value?.kind === "device-snapshot-manifest"
    ? { key, deviceId: value.deviceId, commitId: value.commitId, publishedAt: value.publishedAt, updatedAt: value.updatedAt }
    : null;
}

function verifiedDescriptors(all, snapshots, deviceId = "") {
  return (snapshots || [])
    .filter(snapshot => snapshot?.profileComplete === true && snapshot.usedPreviousGeneration !== true && snapshot.rootKey)
    .map(snapshot => rootDescriptor(snapshot.rootKey, all?.[snapshot.rootKey]))
    .filter(entry => entry && (!deviceId || entry.deviceId === deviceId));
}

function testLifecycle(policy = {}) {
  return createTestRecoveryLifecycle({
    compareDeviceSnapshotGenerationRecency: (left, right) => Number(right.updatedAt) - Number(left.updatedAt),
    deviceRootDescriptor: rootDescriptor,
    policy
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.22 ${browser} immediate Recovery pruning cannot let torn roots displace the last verified fallback`, async () => {
    const source = readBackgroundSource(browser);
    const code = extractFunction(source, "pruneSupersededDeviceSnapshotGenerations");
    const [validKey, validRoot] = generationRoot("old-valid", 100);
    const [tornOneKey, tornOneRoot] = generationRoot("newer-torn-one", 300);
    const [tornTwoKey, tornTwoRoot] = generationRoot("newer-torn-two", 200);
    const all = {
      [validKey]: validRoot,
      [`${validKey}.chunk.0`]: { data: "verified" },
      [tornOneKey]: tornOneRoot,
      [tornTwoKey]: tornTwoRoot
    };
    const snapshots = [{ rootKey: validKey, deviceId: "dev", commitId: "old-valid", publishedAt: 100, updatedAt: 100, profileComplete: true }];
    const removed = [];
    const owner = testLifecycle({ maxGenerationsPerDevice: 2 });
    const context = {
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      compareStableText: (left, right) => String(left).localeCompare(String(right)),
      deviceRootDescriptor: rootDescriptor,
      verifiedProfileDeviceSnapshotDescriptors: (values, decoded, deviceId) => verifiedDescriptors(values, decoded, deviceId),
      readDeviceSnapshots: async () => snapshots,
      supersededDeviceSnapshotRootKeys: owner.supersededDeviceSnapshotRootKeys,
      confirmedSupersededDeviceSnapshotKeys: owner.confirmedSupersededDeviceSnapshotKeys,
      browser: { storage: { sync: { get: async () => structuredClone(all) } } },
      removeSyncItems: async keys => { removed.push(...keys); for (const key of keys) delete all[key]; }
    };
    vm.createContext(context);
    vm.runInContext(`${code}; this.prune = pruneSupersededDeviceSnapshotGenerations;`, context);

    await context.prune(all, "dev");

    assert.ok(all[validKey], "the only verified complete generation must survive");
    assert.ok(all[`${validKey}.chunk.0`]);
    assert.equal(removed.includes(validKey), false);
  });

  test(`1.30.18.22 ${browser} a torn root decoded through its previous-generation fallback does not consume a verified retention slot`, async () => {
    const source = readBackgroundSource(browser);
    const code = extractFunction(source, "pruneSupersededDeviceSnapshotGenerations");
    const [validKey, validRoot] = generationRoot("old-valid", 100);
    const [tornOneKey, tornOneRoot] = generationRoot("newer-torn-one", 300);
    const [tornTwoKey, tornTwoRoot] = generationRoot("newer-torn-two", 200);
    const all = {
      [validKey]: validRoot,
      [`${validKey}.chunk.0`]: { data: "verified" },
      [tornOneKey]: tornOneRoot,
      [tornTwoKey]: tornTwoRoot
    };
    const snapshots = [
      { rootKey: validKey, deviceId: "dev", commitId: "old-valid", publishedAt: 100, updatedAt: 100, profileComplete: true, usedPreviousGeneration: false },
      { rootKey: tornOneKey, deviceId: "dev", commitId: "old-valid", publishedAt: 100, updatedAt: 100, profileComplete: true, usedPreviousGeneration: true },
      { rootKey: tornTwoKey, deviceId: "dev", commitId: "old-valid", publishedAt: 100, updatedAt: 100, profileComplete: true, usedPreviousGeneration: true }
    ];
    const removed = [];
    const owner = testLifecycle({ maxGenerationsPerDevice: 2 });
    const context = {
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      compareStableText: (left, right) => String(left).localeCompare(String(right)),
      deviceRootDescriptor: rootDescriptor,
      verifiedProfileDeviceSnapshotDescriptors: (values, decoded, deviceId) => verifiedDescriptors(values, decoded, deviceId),
      readDeviceSnapshots: async () => snapshots,
      supersededDeviceSnapshotRootKeys: owner.supersededDeviceSnapshotRootKeys,
      confirmedSupersededDeviceSnapshotKeys: owner.confirmedSupersededDeviceSnapshotKeys,
      browser: { storage: { sync: { get: async () => structuredClone(all) } } },
      removeSyncItems: async keys => { removed.push(...keys); for (const key of keys) delete all[key]; }
    };
    vm.createContext(context);
    vm.runInContext(`${code}; this.prune = pruneSupersededDeviceSnapshotGenerations;`, context);

    await context.prune(all, "dev");

    assert.deepEqual(removed, []);
    assert.ok(all[validKey], "a fallback decode must not displace the independently verified root that supplied it");
  });

  test(`1.30.18.22 ${browser} Recovery cleanup classifies only known current-schema unreadable roots`, () => {
    const source = readBackgroundSource(browser);
    const fn = extractFunction(source, "currentDeviceSnapshotRootHeader");
    const context = {
      DEVICE_SNAPSHOT_SCHEMA_VERSION: 2,
      DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION: 1
    };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.currentHeader = currentDeviceSnapshotRootHeader;`, context);

    assert.equal(context.currentHeader({ schemaVersion: 2, kind: "device-snapshot-manifest", chunkSchemaVersion: 1 }), true);
    assert.equal(context.currentHeader({ schemaVersion: 3, kind: "device-snapshot-manifest", chunkSchemaVersion: 1 }), false);
    assert.equal(context.currentHeader({ schemaVersion: 2, kind: "device-snapshot-manifest", chunkSchemaVersion: 2 }), false);
    assert.equal(context.currentHeader({ schemaVersion: 999, kind: "future-recovery-root" }), false);
  });

  test(`1.30.18.22 ${browser} Recovery GC observes torn roots safely and reclaims them without deleting the verified generation`, async () => {
    const source = readBackgroundSource(browser);
    const fn = extractFunction(source, "maybeGarbageCollectStaleDeviceSnapshots");
    const [validKey, validRoot] = generationRoot("old-valid", 100);
    const [tornOneKey, tornOneRoot] = generationRoot("newer-torn-one", 300);
    const [tornTwoKey, tornTwoRoot] = generationRoot("newer-torn-two", 200);
    const store = {
      [validKey]: validRoot,
      [`${validKey}.chunk.0`]: { data: "verified" },
      [tornOneKey]: tornOneRoot,
      [tornTwoKey]: tornTwoRoot
    };
    const snapshots = [{ rootKey: validKey, deviceId: "dev", commitId: "old-valid", publishedAt: 100, updatedAt: 100, profileComplete: true }];
    let now = 10_000_000;
    const owner = testLifecycle({
      gcIntervalMs: 1000,
      orphanGraceMs: 5000,
      orphanMinGcPasses: 2,
      maxGenerationsPerDevice: 2,
      maxRecentDevices: 8,
      retentionMs: 999_999_999,
      capMinAgeMs: 999_999_999
    });
    const context = {
      console,
      PRODUCT_NAME: "MosaicSync",
      Date: { now: () => now },
      DEVICE_SNAPSHOT_SCHEMA_VERSION: 2,
      DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION: 1,
      DEVICE_SNAPSHOT_GC_INTERVAL_MS: 1000,
      DEVICE_SNAPSHOT_ORPHAN_GRACE_MS: 5000,
      DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES: 2,
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      DEVICE_SNAPSHOT_MAX_RECENT_DEVICES: 8,
      DEVICE_SNAPSHOT_RETENTION_MS: 999_999_999,
      DEVICE_SNAPSHOT_CAP_MIN_AGE_MS: 999_999_999,
      compareStableText: (left, right) => String(left).localeCompare(String(right)),
      compareDeviceSnapshotGenerationRecency: (left, right) => Number(right.updatedAt) - Number(left.updatedAt),
      deviceRootDescriptor: rootDescriptor,
      deviceSnapshotKeysForRoot: (values, rootKey) => Object.keys(values).filter(key => key === rootKey || key.startsWith(`${rootKey}.chunk.`)),
      currentDeviceSnapshotRootHeader: value => Number(value?.schemaVersion) === 2 &&
        (value?.kind === "device-snapshot" || (value?.kind === "device-snapshot-manifest" && Number(value?.chunkSchemaVersion) === 1)),
      verifiedProfileDeviceSnapshotDescriptors: (values, decoded, deviceId) => verifiedDescriptors(values, decoded, deviceId),
      readDeviceSnapshots: async () => snapshots.filter(snapshot => Object.hasOwn(store, snapshot.rootKey)),
      isDeviceSnapshotChunkKey: key => key.includes(".chunk."),
      planDeviceSnapshotGarbageCollection: owner.planDeviceSnapshotGarbageCollection,
      confirmedDeviceSnapshotGarbageCollectionKeys: owner.confirmedDeviceSnapshotGarbageCollectionKeys,
      browser: { storage: { sync: { get: async () => structuredClone(store) } } },
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      writeLocalMeta: async value => value
    };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.gc = maybeGarbageCollectStaleDeviceSnapshots;`, context);
    let meta = {
      syncEnabled: true,
      deviceId: "dev",
      deviceSnapshotGcPass: 0,
      deviceSnapshotRootSeenPass: {},
      deviceSnapshotOrphanSeenAt: {},
      deviceSnapshotOrphanSeenPass: {}
    };

    meta = await context.gc(meta, { force: true });
    assert.ok(store[validKey], "GC must not delete the only verified generation");
    assert.ok(meta.deviceSnapshotOrphanSeenAt[tornOneKey], "a torn root must enter the conservative observation ledger");
    assert.ok(meta.deviceSnapshotOrphanSeenAt[tornTwoKey]);

    now += 6000;
    meta = await context.gc(meta, { force: true });
    assert.ok(store[tornOneKey], "one later observation is not enough to reclaim a torn root");
    now += 1000;
    meta = await context.gc(meta, { force: true });
    assert.equal(store[tornOneKey], undefined);
    assert.equal(store[tornTwoKey], undefined);
    assert.ok(store[validKey]);
    assert.ok(store[`${validKey}.chunk.0`]);
  });

  test(`1.30.18.22 ${browser} verifies a newly committed Recovery generation before pruning fallbacks`, async () => {
    const source = readBackgroundSource(browser);
    const publish = extractFunction(source, "publishProfileDeviceSnapshot");
    const events = [];
    const publication = {
      rootKey: "mosaicsync.sync.device.dev.snapshot.new",
      rootValue: { publishedAt: 200 },
      chunkWrites: { "mosaicsync.sync.device.dev.snapshot.new.chunk.0": { data: "new" } }
    };
    const committed = { rootKey: publication.rootKey, profileComplete: true, deviceId: "dev", commitId: "new" };
    const context = {
      Date,
      WORK_SPACE_ID: "work",
      profilePublicationTrusted: () => true,
      browser: { storage: { sync: { get: async () => ({}) } } },
      readOwnDeviceSnapshot: async () => ({ rootKey: "", root: null, decoded: null }),
      readSyncSnapshot: async () => ({ records: new Map(), settings: null }),
      buildProfileDeviceSnapshotPublication: async () => publication,
      prepareDeviceSnapshotPublicationCapacity: async all => all,
      commitProfileDeviceSnapshotPublication: async () => { events.push("commit"); },
      isQuotaError: () => false,
      verifyProfileDeviceSnapshotPublication: async () => {
        events.push("verify");
        return { snapshots: [committed], committedSnapshot: committed };
      },
      pruneSupersededDeviceSnapshotGenerations: async () => { events.push("prune"); return 0; },
      mergeProfileDeviceSnapshots: () => ({ revision: "profiles:verified" })
    };
    vm.createContext(context);
    vm.runInContext(`${publish}; this.publish = publishProfileDeviceSnapshot;`, context);

    const result = await context.publish({}, { deviceId: "dev" }, { force: true });

    assert.equal(result.written, true);
    assert.ok(events.indexOf("verify") < events.indexOf("prune"), "verification must precede every fallback-retirement decision");
  });

  test(`1.30.18.22 ${browser} a failed post-write verification cannot prune a known-good fallback`, async () => {
    const source = readBackgroundSource(browser);
    const publish = extractFunction(source, "publishProfileDeviceSnapshot");
    const events = [];
    const publication = {
      rootKey: "mosaicsync.sync.device.dev.snapshot.torn",
      rootValue: { publishedAt: 200 },
      chunkWrites: { "mosaicsync.sync.device.dev.snapshot.torn.chunk.0": { data: "torn" } }
    };
    const context = {
      Date,
      WORK_SPACE_ID: "work",
      profilePublicationTrusted: () => true,
      browser: { storage: { sync: { get: async () => ({}) } } },
      readOwnDeviceSnapshot: async () => ({ rootKey: "old", root: {}, decoded: null }),
      readSyncSnapshot: async () => ({ records: new Map(), settings: null }),
      buildProfileDeviceSnapshotPublication: async () => publication,
      prepareDeviceSnapshotPublicationCapacity: async all => all,
      commitProfileDeviceSnapshotPublication: async () => { events.push("commit"); },
      isQuotaError: () => false,
      verifyProfileDeviceSnapshotPublication: async () => {
        events.push("verify");
        return { snapshots: [], committedSnapshot: null };
      },
      pruneSupersededDeviceSnapshotGenerations: async () => { events.push("prune"); return 0; },
      mergeProfileDeviceSnapshots: () => null
    };
    vm.createContext(context);
    vm.runInContext(`${publish}; this.publish = publishProfileDeviceSnapshot;`, context);

    const result = await context.publish({}, { deviceId: "dev" }, { force: true });

    assert.equal(result.written, false);
    assert.equal(result.reason, "verification");
    assert.deepEqual(events, ["commit", "verify"]);
  });

  test(`1.30.18.22 ${browser} Recovery GC revalidation preserves a torn root that becomes complete before deletion`, async () => {
    const source = readBackgroundSource(browser);
    const fn = extractFunction(source, "maybeGarbageCollectStaleDeviceSnapshots");
    const [rootKey, rootValue] = generationRoot("arriving", 300);
    const store = { [rootKey]: rootValue, [`${rootKey}.chunk.0`]: { data: "arriving" } };
    let reads = 0;
    const snapshotsFor = values => values[rootKey]?.arrived === true
      ? [{ rootKey, deviceId: "dev", commitId: "arriving", publishedAt: 300, updatedAt: 300, profileComplete: true }]
      : [];
    const removed = [];
    const owner = testLifecycle({
      gcIntervalMs: 1000,
      orphanGraceMs: 5000,
      orphanMinGcPasses: 2,
      maxGenerationsPerDevice: 2,
      maxRecentDevices: 8,
      retentionMs: 999_999_999,
      capMinAgeMs: 999_999_999
    });
    const context = {
      console,
      PRODUCT_NAME: "MosaicSync",
      Date: { now: () => 10_000 },
      DEVICE_SNAPSHOT_SCHEMA_VERSION: 2,
      DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION: 1,
      DEVICE_SNAPSHOT_GC_INTERVAL_MS: 1000,
      DEVICE_SNAPSHOT_ORPHAN_GRACE_MS: 5000,
      DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES: 2,
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      DEVICE_SNAPSHOT_MAX_RECENT_DEVICES: 8,
      DEVICE_SNAPSHOT_RETENTION_MS: 999_999_999,
      DEVICE_SNAPSHOT_CAP_MIN_AGE_MS: 999_999_999,
      compareStableText: (left, right) => String(left).localeCompare(String(right)),
      compareDeviceSnapshotGenerationRecency: (left, right) => Number(right.updatedAt) - Number(left.updatedAt),
      deviceRootDescriptor: rootDescriptor,
      deviceSnapshotKeysForRoot: (values, key) => Object.keys(values).filter(entry => entry === key || entry.startsWith(`${key}.chunk.`)),
      currentDeviceSnapshotRootHeader: value => Number(value?.schemaVersion) === 2 && value?.kind === "device-snapshot-manifest" && Number(value?.chunkSchemaVersion) === 1,
      verifiedProfileDeviceSnapshotDescriptors: (values, decoded, deviceId) => verifiedDescriptors(values, decoded, deviceId),
      readDeviceSnapshots: async values => snapshotsFor(values),
      isDeviceSnapshotChunkKey: key => key.includes(".chunk."),
      planDeviceSnapshotGarbageCollection: owner.planDeviceSnapshotGarbageCollection,
      confirmedDeviceSnapshotGarbageCollectionKeys: owner.confirmedDeviceSnapshotGarbageCollectionKeys,
      browser: { storage: { sync: { get: async () => {
        reads += 1;
        if (reads === 2) store[rootKey] = { ...store[rootKey], arrived: true };
        return structuredClone(store);
      } } } },
      removeSyncItems: async keys => { removed.push(...keys); for (const key of keys) delete store[key]; },
      writeLocalMeta: async value => value
    };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.gc = maybeGarbageCollectStaleDeviceSnapshots;`, context);

    await context.gc({
      syncEnabled: true,
      deviceId: "dev",
      deviceSnapshotGcPass: 2,
      deviceSnapshotRootSeenPass: {},
      deviceSnapshotOrphanSeenAt: { [rootKey]: 1 },
      deviceSnapshotOrphanSeenPass: { [rootKey]: 1 }
    }, { force: true });

    assert.equal(reads, 2, "eligible destructive cleanup must take a fresh Sync snapshot");
    assert.deepEqual(removed, []);
    assert.ok(store[rootKey]);
    assert.ok(store[`${rootKey}.chunk.0`]);
  });
}

test("1.30.18.22 Recovery store cleans a partially written chunk batch while preserving immutable-root ordering", async () => {
  const data = new Map();
  const noop = () => null;
  const format = {
    compareDeviceSnapshotGenerationRecency: noop,
    decodeDeviceSnapshotPayload: noop,
    deviceSnapshotDataFingerprint: noop,
    deviceSnapshotGenerationChunkKey: noop,
    deviceSnapshotGenerationKey: noop,
    deviceSnapshotMetadata: noop,
    deviceSnapshotRootMatchesKey: noop,
    encodeDeviceSnapshotPayload: noop,
    isDeviceSnapshotRootKey: noop,
    previousProfileDescriptor: noop
  };
  const rootKey = "mosaicsync.sync.device.dev.snapshot.partial";
  const chunkWrites = Object.fromEntries(Array.from({ length: 41 }, (_, index) => [`${rootKey}.chunk.${index}`, { index }]));
  const store = createRecoveryGenerationStore({
    format,
    readAllSyncItems: async () => Object.fromEntries(data),
    writeSyncItems: async items => {
      const entries = Object.entries(items);
      for (const [key, value] of entries.slice(0, 40)) data.set(key, value);
      throw new Error("simulated interruption after the first storage.sync batch");
    },
    removeSyncItems: async keys => { for (const key of keys) data.delete(key); },
    syncEntryBytes: () => 1
  });

  await assert.rejects(store.commitProfileDeviceSnapshotPublication({ rootKey, rootValue: { kind: "root" }, chunkWrites }));
  assert.equal(data.size, 0, "rollback must remove every chunk key, including keys not yet written by the failed helper");
});

test("1.30.18.22 Recovery publication verification rejects a torn root decoded only through its previous-generation fallback", async () => {
  const rootKey = "mosaicsync.sync.device.dev.snapshot.new";
  const fallback = {
    rootKey,
    deviceId: "dev",
    commitId: "old",
    profileComplete: true,
    usedPreviousGeneration: true
  };
  const noop = () => null;
  const store = createRecoveryGenerationStore({
    format: {
      compareDeviceSnapshotGenerationRecency: noop,
      decodeDeviceSnapshotPayload: async () => fallback,
      deviceSnapshotDataFingerprint: noop,
      deviceSnapshotGenerationChunkKey: noop,
      deviceSnapshotGenerationKey: noop,
      deviceSnapshotMetadata: noop,
      deviceSnapshotRootMatchesKey: () => true,
      encodeDeviceSnapshotPayload: noop,
      isDeviceSnapshotRootKey: key => key === rootKey,
      previousProfileDescriptor: noop
    },
    readAllSyncItems: async () => ({ [rootKey]: { kind: "device-snapshot-manifest" } }),
    writeSyncItems: async () => {},
    removeSyncItems: async () => {},
    syncEntryBytes: () => 1
  });

  const verification = await store.verifyProfileDeviceSnapshotPublication({ rootKey });

  assert.equal(verification.committedSnapshot, null);
  assert.equal(verification.snapshots[0].usedPreviousGeneration, true, "the fallback stays readable for recovery merging");
});

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function compareStableText(left, right) {
  const a = String(left ?? ""), b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function liveRecordCount(records) {
  return [...(records?.values?.() || [])].filter(record => ["shortcut", "folder"].includes(record?.kind)).length;
}

function recordFingerprint(records) {
  const values = [...(records?.values?.() || [])]
    .filter(record => ["shortcut", "folder"].includes(record?.kind))
    .map(({ deviceId: _deviceId, ...record }) => record)
    .sort((left, right) => compareStableText(left.id, right.id));
  return fnv1a(stableStringify(values));
}

function datasetUpdatedAt(records, settings, fallback = 0) {
  let newest = Number(fallback) || 0;
  for (const record of records?.values?.() || []) {
    newest = Math.max(newest, Number(record?.modifiedAt) || Number(record?.deletedAt) || 0);
  }
  return Math.max(newest, Number(settings?.modifiedAt) || 0);
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.22 ${browser} real Recovery format/store survives a worker restart between chunks and root`, async () => {
    const nonce = `${browser}-${Date.now()}-${Math.random()}`;
    const formatModule = await import(`${pathToFileURL(resolve(`dist/${browser}/background/recovery-generation-format.js`)).href}?format=${nonce}`);
    const storeModule = await import(`${pathToFileURL(resolve(`dist/${browser}/background/recovery-generation-store.js`)).href}?store=${nonce}`);
    const data = new Map();
    const createFormat = () => formatModule.createRecoveryGenerationFormat({
      bytesToBase64: bytes => Buffer.from(bytes).toString("base64"),
      compareStableText,
      datasetUpdatedAt,
      fnv1a,
      liveRecordCount,
      recordFingerprint
    });
    const createStore = format => storeModule.createRecoveryGenerationStore({
      format,
      readAllSyncItems: async () => Object.fromEntries(data),
      writeSyncItems: async items => { for (const [key, value] of Object.entries(structuredClone(items))) data.set(key, value); },
      removeSyncItems: async keys => { for (const key of keys) data.delete(key); },
      syncEntryBytes: (key, value) => Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value))
    });
    const settings = modifiedAt => ({ kind: "settings", modifiedAt });
    const records = (id, modifiedAt) => new Map([[id, {
      id,
      kind: "shortcut",
      title: id,
      url: `https://${id}.example/`,
      position: 0,
      createdAt: modifiedAt,
      modifiedAt,
      deviceId: "dev"
    }]]);
    let format = createFormat(), store = createStore(format);
    const oldPublication = await store.prepareProfileDeviceSnapshotPublication({
      deviceId: "dev",
      commitId: "old",
      publishedAt: 100,
      personalRecords: records("personal-old", 90),
      personalSettings: settings(91),
      workRecords: records("work-old", 92),
      workSettings: settings(93)
    });
    await store.commitProfileDeviceSnapshotPublication(oldPublication);
    assert.ok((await store.verifyProfileDeviceSnapshotPublication(oldPublication)).committedSnapshot);

    const nextPublication = await store.prepareProfileDeviceSnapshotPublication({
      deviceId: "dev",
      commitId: "new",
      publishedAt: 200,
      personalRecords: records("personal-new", 190),
      personalSettings: settings(191),
      workRecords: records("work-new", 192),
      workSettings: settings(193),
      previousRoot: oldPublication.rootValue
    });
    for (const [key, value] of Object.entries(nextPublication.chunkWrites)) data.set(key, structuredClone(value));

    // A replacement MV3 worker has no in-memory decode cache or publication state.
    format = createFormat();
    store = createStore(format);
    const duringInterruption = await store.readOwnDeviceSnapshot("dev");
    assert.equal(duringInterruption.decoded?.commitId, "old", "orphaned new chunks cannot displace the complete old root");

    data.set(nextPublication.rootKey, structuredClone(nextPublication.rootValue));
    format = createFormat();
    store = createStore(format);
    const afterRoot = await store.verifyProfileDeviceSnapshotPublication(nextPublication);
    assert.equal(afterRoot.committedSnapshot?.commitId, "new");
    assert.equal(afterRoot.committedSnapshot?.profileComplete, true);
  });
}
