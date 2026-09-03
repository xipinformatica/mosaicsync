import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readBackgroundSource } from "./harness/background-source.mjs";
import {
  consumeExactExpectation,
  consumeExactSessionExpectations
} from "../dist/firefox/background/runtime-utils.js";
import { selectAtomicRecoverySnapshot } from "../dist/firefox/background/sync-source-policy.js";
import { normalizeMeta } from "../dist/firefox/core/model.js";

function settings(deviceId, modifiedAt = 1) {
  return { schemaVersion: 1, kind: "settings", settings: {}, modifiedAt, deviceId };
}

function snapshot(deviceId, commitId, publishedAt, { work = true, previous = false, ids = [] } = {}) {
  return {
    deviceId,
    commitId,
    publishedAt,
    updatedAt: publishedAt - 10,
    records: new Map(ids.map(id => [id, { kind: "shortcut", id }])),
    settings: settings(deviceId),
    profileComplete: work,
    workRecords: work ? new Map([[`work-${deviceId}`, { kind: "shortcut", id: `work-${deviceId}` }]]) : null,
    workSettings: work ? settings(deviceId) : null,
    usedPreviousGeneration: previous
  };
}

const newestFirst = (left, right) => Number(right.publishedAt) - Number(left.publishedAt);

test("1.30.18.42 exact own-write suppression survives a forward wall-clock jump", () => {
  const expectations = new Map([
    ["mosaicsync.sync.item.a", { signature: "same-value", expiresAt: 1 }]
  ]);
  assert.equal(consumeExactExpectation(expectations, "mosaicsync.sync.item.a", "same-value"), true,
    "an exact delayed echo stays suppressible even if its legacy wall-clock expiry is far in the past");
  assert.equal(expectations.size, 0, "the capability is consumed exactly once");
  assert.equal(consumeExactExpectation(expectations, "mosaicsync.sync.item.a", "same-value"), false);
});

test("1.30.18.42 mismatched own-write suppression is external and cannot hide a real remote change", () => {
  const expectations = new Map([
    ["mosaicsync.sync.item.a", { signature: "ours", expiresAt: Number.MAX_SAFE_INTEGER }]
  ]);
  assert.equal(consumeExactExpectation(expectations, "mosaicsync.sync.item.a", "remote"), false);
  assert.equal(expectations.size, 0, "a mismatch consumes the stale token rather than poisoning a later event");

  const durable = consumeExactSessionExpectations({
    "mosaicsync.sync.item.a": { signature: "ours", expiresAt: 1 },
    "mosaicsync.sync.item.b": { signature: "same", expiresAt: 1 }
  }, [
    ["mosaicsync.sync.item.a", "remote"],
    ["mosaicsync.sync.item.b", "same"]
  ]);
  assert.equal(durable.hasExternalChange, true);
  assert.deepEqual(durable.expectations, {});
});

test("1.30.18.42 Recovery chooses one complete device generation and never synthesizes a multi-device profile", () => {
  const a = snapshot("device-a", "commit-a", 100, { ids: ["a"] });
  const b = snapshot("device-b", "commit-b", 300, { ids: ["b"] });
  const c = snapshot("device-c", "commit-c", 500, { ids: ["c"], previous: true });
  const selected = selectAtomicRecoverySnapshot([a, b, c], { compareRecency: newestFirst, requireCompleteProfile: true });
  assert.equal(selected, b, "a current verified generation outranks a newer previous-generation fallback");
  assert.deepEqual([...selected.records.keys()], ["b"]);
  assert.deepEqual([...selected.workRecords.keys()], ["work-device-b"],
    "Personal and Work come from the same selected generation");
  assert.equal(selected.records.has("a") || selected.records.has("c"), false,
    "records from non-selected devices are never unioned into the safety copy");
});

test("1.30.18.42 live reconciliation ignores Recovery-only generation churn", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("async function reconcileIfNewCommit");
    const end = source.indexOf("function latestSyncOrigin", start);
    const block = source.slice(start, end);
    assert.match(block, /const liveRevisionChanged = Boolean\([\s\S]*?sharedRevision[\s\S]*?lastAppliedSyncRevision[\s\S]*?workRevision[\s\S]*?lastAppliedWorkSyncRevision/);
    assert.doesNotMatch(block.slice(block.indexOf("const liveRevisionChanged"), block.indexOf("let contentUnchanged")), /deviceRevision|profileRevision/,
      "Recovery publication churn must not be a live automatic-reconcile trigger");
  }
});

test("1.30.18.42 old receipt metadata is not trusted as exact device provenance", () => {
  const meta = normalizeMeta({
    syncEnabled: true,
    syncInitialized: true,
    lastRemoteReceiptRevision: "commit:legacy",
    lastRemoteReceiptOriginDeviceId: "old-device-from-1.30.18.41"
  });
  assert.equal(meta.lastRemoteReceiptProvenanceExact, false,
    "1.30.18.41 metadata migrates to generic provenance until .42 observes an atomic source");
});

test("1.30.18.42 production Sync core enforces atomic Recovery and coalesced storage-event reconciliation", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    assert.doesNotMatch(source, /function mergeDeviceSnapshots\s*\(/);
    assert.doesNotMatch(source, /function mergeProfileDeviceSnapshots\s*\(/);
    assert.match(source, /selectAtomicRecoverySnapshot\(snapshots,[\s\S]*?requireCompleteProfile:\s*true/);

    const personalStart = source.indexOf("function combinedRemoteCore");
    const workStart = source.indexOf("function combinedWorkRemoteCore", personalStart);
    const usableStart = source.indexOf("function remoteCoreUsable", workStart);
    const personalBlock = source.slice(personalStart, workStart);
    const workBlock = source.slice(workStart, usableStart);
    assert.doesNotMatch(personalBlock, /mergeRecordMaps/);
    assert.doesNotMatch(workBlock, /mergeRecordMaps/);
    assert.match(personalBlock, /sourceKind:\s*"shared-ledger"[\s\S]*?provenanceExact:\s*false/);
    assert.match(personalBlock, /sourceKind:\s*"device-snapshot"[\s\S]*?provenanceExact:\s*true/);
    assert.match(workBlock, /sourceKind:\s*"shared-work-ledger"[\s\S]*?provenanceExact:\s*false/);

    const reconcilePersonalStart = source.indexOf("async function reconcilePersonal");
    const reconcileWorkStart = source.indexOf("async function reconcileWork", reconcilePersonalStart);
    const personalReconcile = source.slice(reconcilePersonalStart, reconcileWorkStart);
    assert.match(personalReconcile, /strategy === "merge" && !isSnapshotUsable\(snapshot\)[\s\S]*?reason:\s*"shared-ledger-pending"/);
    assert.match(personalReconcile, /if \(strategy === "remote"\) \{[\s\S]*?await markSyncing\(meta\)/,
      "background merge checks must not flash the Sync UI as an active explicit operation");

    assert.match(source, /const pendingSyncStorageChanges = new Map\(\)/);
    assert.match(source, /let syncStorageReconcileScheduled = false/);
    assert.match(source, /function scheduleSyncStorageReconciliation\(\)[\s\S]*?while \(pendingSyncStorageChanges\.size \|\| pendingSyncStorageOverwrittenEvidence\)/);
    assert.match(source, /pendingSyncStorageChanges\.set\(key, signature\)[\s\S]*?scheduleSyncStorageReconciliation\(\)/);
  }
});

test("1.30.18.42 Settings only names a receipt source when provenance is exact", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = source.indexOf("function syncReceiptSourceLabel");
  const end = source.indexOf("function syncCopyDescription", start);
  const block = source.slice(start, end);
  assert.match(block, /lastRemoteReceiptProvenanceExact !== true\) return t\("received"\)/);
});
