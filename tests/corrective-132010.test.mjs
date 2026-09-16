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

function root(deviceId, commitId, updatedAt) {
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
    profileComplete: true
  };
}

function snapshot(deviceId, commitId, updatedAt) {
  return {
    rootKey: rootKey(deviceId, commitId),
    deviceId,
    commitId,
    updatedAt,
    publishedAt: updatedAt,
    profileComplete: true,
    usedPreviousGeneration: false
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

function addGeneration(all, deviceId, commitId, updatedAt) {
  const key = rootKey(deviceId, commitId);
  all[key] = root(deviceId, commitId, updatedAt);
  all[`${key}.chunk.0`] = { kind: "device-snapshot-chunk", data: commitId };
  return key;
}

function lifecycle() {
  return createRecoveryGenerationLifecycle({
    format: {
      compareDeviceSnapshotGenerationRecency: compareRecency,
      deviceRootDescriptor: descriptor,
      deviceSnapshotKeysForRoot: keysForRoot,
      isDeviceSnapshotChunkKey: key => key.includes(".chunk.")
    },
    compareStableText,
    syncEntryBytes: (key, value) => Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value))
  });
}

function fixture() {
  const all = {};
  const localOld = addGeneration(all, "local", "old", 10);
  const localNew = addGeneration(all, "local", "new", 20);
  const remoteOld = addGeneration(all, "remote", "old", 30);
  const remoteNew = addGeneration(all, "remote", "new", 40);
  const otherOnly = addGeneration(all, "other", "only", 50);
  const snapshots = [
    snapshot("local", "new", 20), snapshot("local", "old", 10),
    snapshot("remote", "new", 40), snapshot("remote", "old", 30),
    snapshot("other", "only", 50)
  ];
  return { all, snapshots, localOld, localNew, remoteOld, remoteNew, otherOnly };
}

test("1.32.0.10 Recovery manager safe cleanup retires only superseded complete generations", () => {
  const owner = lifecycle();
  assert.equal(typeof owner.planManualRecoveryCleanup, "function");
  const { all, snapshots, localOld, localNew, remoteOld, remoteNew, otherOnly } = fixture();
  const plan = owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "superseded",
    currentDeviceId: "local"
  });
  assert.deepEqual(new Set(plan.rootKeys), new Set([localOld, remoteOld]));
  assert.equal(plan.rootKeys.includes(localNew), false);
  assert.equal(plan.rootKeys.includes(remoteNew), false);
  assert.equal(plan.rootKeys.includes(otherOnly), false);
});

test("1.32.0.10 Recovery manager protects each device newest generation from one-copy deletion", () => {
  const owner = lifecycle();
  const { all, snapshots, localOld, localNew } = fixture();
  assert.deepEqual(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "generation", rootKey: localOld, currentDeviceId: "local"
  }).rootKeys, [localOld]);
  assert.deepEqual(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "generation", rootKey: localNew, currentDeviceId: "local"
  }).rootKeys, [], "the newest complete generation for a device must remain protected");
});

test("1.32.0.10 Recovery manager can remove an old device only while the current device retains a complete fallback", () => {
  const owner = lifecycle();
  const { all, snapshots, remoteOld, remoteNew } = fixture();
  assert.deepEqual(new Set(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "device", deviceId: "remote", currentDeviceId: "local"
  }).rootKeys), new Set([remoteOld, remoteNew]));
  assert.deepEqual(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "device", deviceId: "local", currentDeviceId: "local"
  }).rootKeys, [], "the current device's complete Recovery set must not be removable as a group");

  const remoteOnly = {};
  const remoteRoot = addGeneration(remoteOnly, "remote", "only", 1);
  assert.deepEqual(owner.planManualRecoveryCleanup(remoteOnly, [snapshot("remote", "only", 1)], {
    mode: "device", deviceId: "remote", currentDeviceId: "local"
  }).rootKeys, [], "old-device cleanup must not proceed without a verified complete current-device fallback");
  assert.ok(remoteOnly[remoteRoot]);
});

test("1.32.0.10 Recovery cleanup revalidates the selected generations immediately before removal", () => {
  const owner = lifecycle();
  const { all, snapshots, localOld } = fixture();
  const plan = owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "generation", rootKey: localOld, currentDeviceId: "local"
  });
  assert.deepEqual(plan.rootKeys, [localOld]);

  const latest = {};
  addGeneration(latest, "local", "old", 10);
  const latestSnapshots = [snapshot("local", "old", 10)];
  assert.deepEqual(owner.confirmedManualRecoveryCleanupKeys(latest, latestSnapshots, plan), [],
    "a generation that became the last/newest verified fallback must no longer be deletable");
});

test("1.32.0.10 Settings exposes managed Recovery cleanup only through the privileged background owner", () => {
  const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(html, /id="recoveryCopiesManageButton"/);
  assert.match(html, /id="recoveryCopiesDialog"/);
  assert.match(html, /id="recoverySafeCleanupButton"/);
  assert.match(newtab, /mosaicsync:get-recovery-copies/);
  assert.match(newtab, /mosaicsync:cleanup-recovery-copies/);
  assert.match(core, /case "mosaicsync:get-recovery-copies"/);
  assert.match(core, /case "mosaicsync:cleanup-recovery-copies"/);
  assert.match(core, /confirmedManualRecoveryCleanupKeys\(/,
    "destructive Recovery cleanup must revalidate against a fresh Sync snapshot before removing keys");
});

test("1.32.0.10 Recovery manager ignores torn/unverified generations and never authorizes their removal", () => {
  const owner = lifecycle();
  const { all, snapshots, localOld } = fixture();
  const torn = rootKey("torn", "partial");
  all[torn] = root("torn", "partial", 60);
  all[`${torn}.chunk.0`] = { kind: "device-snapshot-chunk", data: "partial" };
  const plan = owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "superseded", currentDeviceId: "local"
  });
  assert.equal(plan.rootKeys.includes(torn), false, "unverified/torn generations must never enter manual cleanup eligibility");
  assert.ok(plan.rootKeys.includes(localOld));
});

test("1.32.0.10 old-device group cleanup requires a verified fallback owned by the current device", () => {
  const owner = lifecycle();
  const all = {};
  const target = addGeneration(all, "remote", "target", 20);
  addGeneration(all, "third", "fallback", 30);
  const snapshots = [snapshot("remote", "target", 20), snapshot("third", "fallback", 30)];
  assert.deepEqual(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "device", deviceId: "remote", currentDeviceId: "local"
  }).rootKeys, [], "a third-party fallback is not enough to authorize deleting an old device set");

  const current = addGeneration(all, "local", "current", 40);
  snapshots.push(snapshot("local", "current", 40));
  assert.deepEqual(owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "device", deviceId: "remote", currentDeviceId: "local"
  }).rootKeys, [target]);
  assert.ok(all[current]);
});

test("1.32.0.10 device cleanup revalidation cancels when the current-device fallback disappears", () => {
  const owner = lifecycle();
  const { all, snapshots, remoteOld, remoteNew } = fixture();
  const plan = owner.planManualRecoveryCleanup(all, snapshots, {
    mode: "device", deviceId: "remote", currentDeviceId: "local"
  });
  assert.deepEqual(new Set(plan.rootKeys), new Set([remoteOld, remoteNew]));

  const latest = {};
  addGeneration(latest, "remote", "old", 30);
  addGeneration(latest, "remote", "new", 40);
  // Current device fallback disappeared from the fresh view while the worker yielded.
  const latestSnapshots = [snapshot("remote", "new", 40), snapshot("remote", "old", 30)];
  assert.deepEqual(owner.confirmedManualRecoveryCleanupKeys(latest, latestSnapshots, plan), [],
    "old-device deletion must fail closed if the current device no longer has a verified complete fallback");
});

test("1.32.0.10 Recovery manager UI stays lazy, DOM-safe, and cannot delete Sync keys directly", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const renderStart = newtab.indexOf("function renderRecoveryCopies(");
  const renderEnd = newtab.indexOf("\n  async function loadRecoveryCopies", renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart);
  const renderBody = newtab.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderBody, /innerHTML\s*=/, "device names and Recovery metadata must not be rendered through innerHTML");
  assert.match(renderBody, /textContent/, "manager should render untrusted device metadata as text");

  const cleanupStart = core.indexOf("async function cleanupRecoveryCopies(");
  const cleanupEnd = core.indexOf("\n  async function getSyncStatus", cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart);
  const cleanupBody = core.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBody, /await removeSyncItems\(keys\)/,
    "manual Recovery cleanup must use the expected-change-aware Sync removal helper");
  assert.doesNotMatch(cleanupBody, /browser\.storage\.sync\.remove\(/,
    "manual cleanup must not bypass expected-change suppression with a raw Sync removal");
  assert.doesNotMatch(newtab, /browser\.storage\.sync\.(?:remove|clear)\(/,
    "New Tab must not have direct destructive Sync-storage access");
});


test("1.32.0.10 failed cleanup releases the busy guard before refreshing Recovery eligibility", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = newtab.indexOf("async function performRecoveryCleanup(");
  const end = newtab.indexOf("\n  function shortSyncId", start);
  const body = newtab.slice(start, end);
  assert.match(body, /finally \{[\s\S]*recoveryCopiesCleanupBusy = false;[\s\S]*\}/,
    "failed/revalidated cleanup must release its destructive-operation guard before any refresh");
  assert.match(body, /if \(refreshCurrentSession && recoveryCopiesDialog\?\.open\)[\s\S]*await loadRecoveryCopies\(recoveryCopiesSessionGeneration\)/,
    "failed/revalidated cleanup must refresh eligibility after the cleanup guard has been released");
});
