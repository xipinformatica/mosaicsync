import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRecoveryGenerationLifecycle } from "../src/shared/background/recovery-generation-lifecycle.js";

function compareStableText(left, right) {
  const a = String(left ?? ""), b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareRecency(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0) ||
    (Number(right?.publishedAt) || 0) - (Number(left?.publishedAt) || 0) ||
    compareStableText(String(right?.commitId || ""), String(left?.commitId || "")) ||
    compareStableText(String(left?.rootKey || left?.key || ""), String(right?.rootKey || right?.key || ""));
}

function rootKey(deviceId, commitId) {
  return `recovery.${deviceId}.snapshot.${commitId}`;
}

function root(deviceId, commitId, updatedAt, overrides = {}) {
  return {
    schemaVersion: 2,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: 1,
    chunkKeyMode: "generation",
    snapshotId: commitId,
    deviceId,
    commitId,
    updatedAt,
    publishedAt: updatedAt,
    profileComplete: true,
    ...overrides
  };
}

function snapshot(deviceId, commitId, updatedAt, overrides = {}) {
  return {
    rootKey: rootKey(deviceId, commitId),
    deviceId,
    commitId,
    updatedAt,
    publishedAt: updatedAt,
    profileComplete: true,
    usedPreviousGeneration: false,
    ...overrides
  };
}

function keysForRoot(all, key) {
  return Object.keys(all || {}).filter(candidate => candidate === key || candidate.startsWith(`${key}.chunk.`));
}

function descriptor(key, value) {
  if (!value || !["device-snapshot", "device-snapshot-manifest"].includes(value.kind)) return null;
  if (!value.deviceId || key !== rootKey(value.deviceId, value.snapshotId || value.commitId)) return null;
  return {
    key,
    deviceId: value.deviceId,
    commitId: value.commitId || "",
    publishedAt: Number(value.publishedAt) || 0,
    updatedAt: Number(value.updatedAt) || 0
  };
}

function entryBytes(key, value) {
  return Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value));
}

function lifecycle(policy = {}) {
  return createRecoveryGenerationLifecycle({
    format: {
      compareDeviceSnapshotGenerationRecency: compareRecency,
      deviceRootDescriptor: descriptor,
      deviceSnapshotKeysForRoot: keysForRoot,
      isDeviceSnapshotChunkKey: key => key.includes(".chunk.")
    },
    compareStableText,
    syncEntryBytes: entryBytes,
    policy
  });
}

function addGeneration(all, deviceId, commitId, updatedAt, bytes = 40, overrides = {}) {
  const key = rootKey(deviceId, commitId);
  all[key] = root(deviceId, commitId, updatedAt, { data: "x".repeat(bytes), ...overrides });
  all[`${key}.chunk.0`] = { data: "x".repeat(bytes) };
  return key;
}

test("1.30.18.23 Recovery lifecycle owns verified-generation and current-schema classification", () => {
  const owner = lifecycle();
  const validKey = rootKey("dev", "valid");
  const fallbackKey = rootKey("dev", "fallback-carrier");
  const incompleteKey = rootKey("dev", "incomplete");
  const all = {
    [validKey]: root("dev", "valid", 30),
    [fallbackKey]: root("dev", "fallback-carrier", 20),
    [incompleteKey]: root("dev", "incomplete", 10)
  };
  const snapshots = [
    snapshot("dev", "valid", 30),
    snapshot("dev", "fallback-carrier", 20, { usedPreviousGeneration: true }),
    snapshot("dev", "incomplete", 10, { profileComplete: false }),
    snapshot("other", "missing-root", 40)
  ];

  assert.deepEqual(owner.verifiedProfileDeviceSnapshotDescriptors(all, snapshots).map(entry => entry.key), [validKey]);
  assert.deepEqual(owner.verifiedProfileDeviceSnapshotDescriptors(all, snapshots, "other"), []);
  assert.equal(owner.currentDeviceSnapshotRootHeader(root("dev", "valid", 30)), true);
  assert.equal(owner.currentDeviceSnapshotRootHeader({ ...root("dev", "valid", 30), schemaVersion: 3 }), false);
  assert.equal(owner.currentDeviceSnapshotRootHeader({ ...root("dev", "valid", 30), chunkSchemaVersion: 2 }), false);
});

test("1.30.18.23 Recovery capacity planner is .22-equivalent without performing writes", () => {
  const owner = lifecycle({ syncQuotaBytes: 1300, syncQuotaMaxItems: 100 });
  const all = { core: { data: "x".repeat(120) } };
  const oldKey = addGeneration(all, "clone", "old", 10, 160);
  const currentKey = addGeneration(all, "clone", "current", 20, 160);
  const publicationKey = rootKey("clone", "new");
  const publication = {
    rootKey: publicationKey,
    rootValue: { data: "x".repeat(140) },
    chunkWrites: { [`${publicationKey}.chunk.0`]: { data: "x".repeat(140) } }
  };
  const snapshots = [snapshot("clone", "current", 20), snapshot("clone", "old", 10)];
  const before = structuredClone(all);

  const plan = owner.planDeviceSnapshotPublicationCapacity(all, "clone", publication, snapshots);

  assert.deepEqual(all, before, "pure planning must not mutate the observed Sync view");
  assert.deepEqual(new Set(plan.removeKeys), new Set([oldKey, `${oldKey}.chunk.0`]));
  assert.equal(Object.hasOwn(plan.all, oldKey), false);
  assert.ok(plan.all[currentKey], "one complete fallback remains before the new generation is staged");
  assert.equal(owner.syncItemsFitInSnapshot(plan.all, { ...publication.chunkWrites, [publication.rootKey]: publication.rootValue }), true);
});

test("1.30.18.23 Recovery capacity planner cannot retire the only complete fallback", () => {
  const owner = lifecycle({ syncQuotaBytes: 300, syncQuotaMaxItems: 100 });
  const all = {};
  const onlyKey = addGeneration(all, "dev", "only", 10, 120);
  const publicationKey = rootKey("dev", "new");
  const publication = {
    rootKey: publicationKey,
    rootValue: { data: "x".repeat(120) },
    chunkWrites: { [`${publicationKey}.chunk.0`]: { data: "x".repeat(120) } }
  };

  const plan = owner.planDeviceSnapshotPublicationCapacity(all, "dev", publication, [snapshot("dev", "only", 10)]);

  assert.deepEqual(plan.removeKeys, []);
  assert.equal(plan.all, all);
  assert.ok(plan.all[onlyKey]);
});

test("1.30.18.23 superseded-generation retirement requires the same stale proof in two Sync views", () => {
  const owner = lifecycle({ maxGenerationsPerDevice: 2 });
  const initial = {};
  const oldKey = addGeneration(initial, "dev", "old", 10);
  addGeneration(initial, "dev", "middle", 20);
  const newKey = addGeneration(initial, "dev", "new", 30);
  const initialSnapshots = [snapshot("dev", "new", 30), snapshot("dev", "middle", 20), snapshot("dev", "old", 10)];
  const candidates = owner.supersededDeviceSnapshotRootKeys(initial, initialSnapshots, "dev", { protectRootKey: newKey });

  assert.deepEqual(candidates, [oldKey]);
  assert.deepEqual(new Set(owner.confirmedSupersededDeviceSnapshotKeys(
    initial, initialSnapshots, candidates, "dev", { protectRootKey: newKey }
  )), new Set([oldKey, `${oldKey}.chunk.0`]));

  const changed = structuredClone(initial);
  delete changed[rootKey("dev", "middle")];
  delete changed[`${rootKey("dev", "middle")}.chunk.0`];
  const changedSnapshots = [snapshot("dev", "new", 30), snapshot("dev", "old", 10)];
  assert.deepEqual(owner.confirmedSupersededDeviceSnapshotKeys(
    changed, changedSnapshots, candidates, "dev", { protectRootKey: newKey }
  ), [], "an MV3 yield that changes retention proof must cancel deletion");
  assert.deepEqual(owner.supersededDeviceSnapshotRootKeys(initial, initialSnapshots, "dev", { protectRootKey: "missing" }), []);
});

test("1.30.18.23 GC observation planning is .22-equivalent for local-pass age and orphan grace", () => {
  const owner = lifecycle({
    gcIntervalMs: 1000,
    orphanGraceMs: 5000,
    orphanMinGcPasses: 2,
    retentionMs: 2000,
    capMinAgeMs: 999_999,
    maxRecentDevices: 8,
    maxGenerationsPerDevice: 2
  });
  const all = {};
  const remoteKey = addGeneration(all, "remote", "complete", 1);
  const tornKey = rootKey("remote", "torn");
  all[tornKey] = root("remote", "torn", 50);
  const orphanKey = rootKey("remote", "rootless");
  all[`${orphanKey}.chunk.0`] = { data: "in-flight" };
  const futureKey = rootKey("remote", "future");
  all[futureKey] = root("remote", "future", 60, { schemaVersion: 3 });
  const snapshots = [snapshot("remote", "complete", 1)];
  const baseMeta = {
    deviceId: "local",
    deviceSnapshotGcPass: 0,
    deviceSnapshotRootSeenPass: {},
    deviceSnapshotOrphanSeenAt: {},
    deviceSnapshotOrphanSeenPass: {}
  };

  const first = owner.planDeviceSnapshotGarbageCollection(all, snapshots, baseMeta, 10_000);
  assert.deepEqual(first.staleRootKeys, []);
  assert.ok(first.deviceSnapshotOrphanSeenAt[tornKey]);
  assert.ok(first.deviceSnapshotOrphanSeenAt[orphanKey]);
  assert.equal(Object.hasOwn(first.deviceSnapshotOrphanSeenAt, futureKey), false, "future schemas are not cleanup candidates");
  assert.equal(first.deviceSnapshotRootSeenPass[remoteKey], 1);

  const secondMeta = {
    ...baseMeta,
    deviceSnapshotGcPass: first.gcPass,
    deviceSnapshotRootSeenPass: first.deviceSnapshotRootSeenPass,
    deviceSnapshotOrphanSeenAt: first.deviceSnapshotOrphanSeenAt,
    deviceSnapshotOrphanSeenPass: first.deviceSnapshotOrphanSeenPass
  };
  const second = owner.planDeviceSnapshotGarbageCollection(all, snapshots, secondMeta, 16_000);
  assert.deepEqual(second.eligibleOrphanRoots, [], "one later observation remains insufficient despite elapsed time");
  const third = owner.planDeviceSnapshotGarbageCollection(all, snapshots, {
    ...secondMeta,
    deviceSnapshotGcPass: second.gcPass,
    deviceSnapshotRootSeenPass: second.deviceSnapshotRootSeenPass,
    deviceSnapshotOrphanSeenAt: second.deviceSnapshotOrphanSeenAt,
    deviceSnapshotOrphanSeenPass: second.deviceSnapshotOrphanSeenPass
  }, 17_000);
  assert.deepEqual(new Set(third.eligibleOrphanRoots), new Set([tornKey, orphanKey]));
  assert.deepEqual(third.staleRootKeys, [remoteKey], "remote age is derived from local GC observations, not publisher time");
});

test("1.30.18.23 GC deletion planning revalidates stale and orphan candidates against the latest view", () => {
  const owner = lifecycle({
    gcIntervalMs: 1000,
    orphanGraceMs: 5000,
    orphanMinGcPasses: 2,
    retentionMs: 999_999,
    capMinAgeMs: 999_999,
    maxRecentDevices: 8,
    maxGenerationsPerDevice: 3
  });
  const oldKey = rootKey("local", "old");
  const middleKey = rootKey("local", "middle");
  const newKey = rootKey("local", "new");
  const tornKey = rootKey("local", "arriving");
  const rootlessKey = rootKey("local", "future-arrival");
  const latest = {};
  for (const [key, id, age] of [[oldKey, "old", 10], [newKey, "new", 30]]) {
    latest[key] = root("local", id, age);
    latest[`${key}.chunk.0`] = { data: id };
  }
  latest[tornKey] = root("local", "arriving", 40);
  latest[`${tornKey}.chunk.0`] = { data: "now-complete" };
  latest[rootlessKey] = root("local", "future-arrival", 50, { schemaVersion: 3 });
  latest[`${rootlessKey}.chunk.0`] = { data: "future" };
  const latestSnapshots = [snapshot("local", "new", 30), snapshot("local", "old", 10), snapshot("local", "arriving", 40)];
  const observation = {
    staleRootKeys: [oldKey],
    eligibleOrphanRoots: [tornKey, rootlessKey],
    gcPass: 3,
    rootSeenPass: { [oldKey]: 1, [middleKey]: 1, [newKey]: 1 },
    deviceId: "local"
  };

  assert.deepEqual(owner.confirmedDeviceSnapshotGarbageCollectionKeys(latest, latestSnapshots, observation), [],
    "completion, changed retention proof and future schema arrival must each cancel deletion");
});

test("1.30.18.23 lifecycle decisions survive an MV3 worker restart without hidden memory", () => {
  const policy = { maxGenerationsPerDevice: 2 };
  const all = {};
  addGeneration(all, "dev", "old", 10);
  addGeneration(all, "dev", "middle", 20);
  const newKey = addGeneration(all, "dev", "new", 30);
  const snapshots = [snapshot("dev", "new", 30), snapshot("dev", "middle", 20), snapshot("dev", "old", 10)];
  const beforeRestart = lifecycle(policy).supersededDeviceSnapshotRootKeys(all, snapshots, "dev", { protectRootKey: newKey });
  const afterRestart = lifecycle(policy).supersededDeviceSnapshotRootKeys(structuredClone(all), structuredClone(snapshots), "dev", { protectRootKey: newKey });
  assert.deepEqual(afterRestart, beforeRestart);
});

test("1.30.18.23 lifecycle boundary is pure and leaves browser writes plus catastrophic continuity in the core", () => {
  const module = fs.readFileSync("src/shared/background/recovery-generation-lifecycle.js", "utf8");
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.doesNotMatch(module, /browser\.storage|storage\.sync|removeSyncItems|writeSyncItems|writeLocalMeta|Date\.now|setTimeout|alarms\./);
  assert.doesNotMatch(module, /beginOrContinueCatastrophicSyncRecovery|pending.*mutation|reset.*intent/i);
  assert.match(core, /import \{ createRecoveryGenerationLifecycle \} from "\.\/recovery-generation-lifecycle\.js";/);
  assert.match(core, /await browser\.storage\.sync\.get\(null\)/);
  assert.match(core, /await removeSyncItems\(/);
  assert.match(core, /planDeviceSnapshotGarbageCollection\([\s\S]*?await browser\.storage\.sync\.get\(null\)[\s\S]*?confirmedDeviceSnapshotGarbageCollectionKeys\([\s\S]*?await removeSyncItems\(/,
    "the orchestrator must plan, take a fresh Sync view, confirm, then remove");
  assert.match(core, /async function beginOrContinueCatastrophicSyncRecovery\s*\(/);
});

test("1.30.18.23 generated Firefox and Chromium Recovery lifecycle owners are byte-identical", () => {
  const firefox = fs.readFileSync("dist/firefox/background/recovery-generation-lifecycle.js");
  const chrome = fs.readFileSync("dist/chrome/background/recovery-generation-lifecycle.js");
  assert.deepEqual(chrome, firefox);
});
