import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createTestRecoveryLifecycle } from "./harness/recovery-lifecycle.mjs";
import { testFilesForGroup } from "../tools/test-groups.mjs";

function rootKey(deviceId, commitId) {
  return `recovery.${deviceId}.snapshot.${commitId}`;
}

function root(deviceId, commitId, updatedAt, bytes = 120) {
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
    data: "x".repeat(bytes)
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

function addGeneration(all, deviceId, commitId, updatedAt, bytes = 120) {
  const key = rootKey(deviceId, commitId);
  all[key] = root(deviceId, commitId, updatedAt, bytes);
  all[`${key}.chunk.0`] = { data: "x".repeat(bytes) };
  return key;
}

function compareRecency(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0) ||
    (Number(right?.publishedAt) || 0) - (Number(left?.publishedAt) || 0) ||
    String(right?.commitId || "").localeCompare(String(left?.commitId || ""));
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
  return createTestRecoveryLifecycle({
    compareDeviceSnapshotGenerationRecency: compareRecency,
    deviceRootDescriptor: descriptor,
    syncEntryBytes: entryBytes,
    policy: { syncQuotaBytes: 1300, syncQuotaMaxItems: 100, ...policy }
  });
}

function publication(deviceId = "A", commitId = "4", bytes = 140) {
  const key = rootKey(deviceId, commitId);
  return {
    rootKey: key,
    rootValue: { kind: "pending-root", data: "z".repeat(bytes) },
    chunkWrites: { [`${key}.chunk.0`]: { data: "z".repeat(bytes) } }
  };
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

test("1.33.0.28 routine Recovery capacity planning cannot retire the only independently verified fallback", () => {
  const owner = lifecycle({ syncQuotaBytes: 1050 });
  const all = { core: { data: "c".repeat(80) } };
  const a1 = addGeneration(all, "A", "1", 10, 120);
  const a2 = addGeneration(all, "A", "2", 20, 120);
  const plan = owner.planDeviceSnapshotPublicationCapacity(all, "A", publication("A", "3", 130), [
    snapshot("A", "2", 20, { usedPreviousGeneration: true }),
    snapshot("A", "1", 10)
  ]);

  assert.deepEqual(plan.removeKeys, [], "torn A2 must not authorize retirement of independently valid A1");
  assert.ok(plan.all[a1]);
  assert.ok(plan.all[a2]);
});

test("1.33.0.28 routine Recovery capacity planning may still retire an older root when another independent fallback survives", () => {
  const owner = lifecycle({ syncQuotaBytes: 1500 });
  const all = { core: { data: "c".repeat(80) } };
  const a1 = addGeneration(all, "A", "1", 10, 120);
  const a2 = addGeneration(all, "A", "2", 20, 120);
  const a3 = addGeneration(all, "A", "3", 30, 120);
  const plan = owner.planDeviceSnapshotPublicationCapacity(all, "A", publication("A", "4", 130), [
    snapshot("A", "3", 30, { usedPreviousGeneration: true }),
    snapshot("A", "2", 20),
    snapshot("A", "1", 10)
  ]);

  assert.ok(plan.removeKeys.includes(a1), "A1 remains safely retirable because independently valid A2 survives");
  assert.ok(plan.all[a2]);
  assert.ok(plan.all[a3], "torn A3 is readable state but never deletion authority");
  assert.ok(plan.removeKeys.every(key => key === a1 || key.startsWith(`${a1}.chunk.`)));
});

test("1.33.0.28 routine and emergency retirement authority share the same verified-generation classifier", () => {
  const source = fs.readFileSync("src/shared/background/recovery-generation-lifecycle.js", "utf8");
  const routine = functionSource(source, "planDeviceSnapshotPublicationCapacity");
  const emergency = functionSource(source, "planDeviceSnapshotEmergencyQuotaReclaim");
  assert.match(routine, /verifiedProfileDeviceSnapshotDescriptors\(values, snapshots, deviceId\)/);
  assert.match(emergency, /verifiedProfileDeviceSnapshotDescriptors\(values, snapshots, deviceId\)/);
  assert.doesNotMatch(routine, /snapshot\.profileComplete/, "routine planner must not hand-roll retirement authority again");
});

test("1.33.0.28 readable Recovery and destructive Recovery authority intentionally use different predicates", () => {
  const source = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const start = source.indexOf("const hasCurrentRecovery = Boolean");
  assert.ok(start >= 0, "missing current-device Recovery readability gate");
  const block = source.slice(start, source.indexOf("if (completeLiveDescriptor", start));
  assert.match(block, /snapshot\?\.profileComplete === true/);
  assert.doesNotMatch(block, /usedPreviousGeneration/, "fallback-assisted Recovery may remain readable for self-heal gating");

  const guide = fs.readFileSync("DEVELOPER-GUIDE.md", "utf8");
  assert.match(guide, /fallback-assisted/i);
  assert.match(guide, /retire|retirement/i);
});

test("1.33.0.28 Recovery retirement corrective stays in Sync, Recovery, security and release certification groups", () => {
  for (const group of ["sync", "recovery", "security", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133028.test.mjs"), `${group} must include corrective-133028.test.mjs`);
  }
});
