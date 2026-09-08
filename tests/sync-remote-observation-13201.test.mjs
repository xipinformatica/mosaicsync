import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODULE_REL = "src/shared/background/sync-remote-observation.js";
const MODULE_PATH = path.join(ROOT, MODULE_REL);

async function loadObservationModule() {
  assert.equal(fs.existsSync(MODULE_PATH), true,
    "1.32.0.1 must own remote Sync observation/applied-state policy in a dedicated module");
  return import(`${pathToFileURL(MODULE_PATH).href}?test=${Date.now()}-${Math.random()}`);
}

function settings() {
  return { kind: "settings", modifiedAt: 1 };
}

function remoteCore(overrides = {}) {
  return {
    records: new Map([["a", { id: "a", kind: "shortcut" }]]),
    settings: settings(),
    revision: "commit:remote",
    updatedAt: 120,
    originDeviceId: "device-b",
    provenanceExact: true,
    ...overrides
  };
}

test("1.32.0.1 remote-observation ownership is isolated from browser/storage/scheduling effects", async () => {
  const mod = await loadObservationModule();
  const source = fs.readFileSync(MODULE_PATH, "utf8");
  assert.deepEqual(Object.keys(mod).sort(), [
    "datasetRevision",
    "latestSyncOrigin",
    "markAppliedRemoteCore",
    "markAppliedSnapshot",
    "markAppliedWorkSnapshot",
    "observeRemoteCore",
    "remoteCoreUsable"
  ]);
  assert.doesNotMatch(source, /\bbrowser\s*\.|storage\.|setTimeout|setInterval|queueMicrotask|Promise\.|\basync\s+function\b|\bawait\b/,
    "the extracted owner must remain synchronous/stateless policy and must not grow browser/storage/scheduling work");
});

test("1.32.0.1 dataset revision compatibility is byte-for-byte semantic with the former core helper", async () => {
  const { datasetRevision } = await loadObservationModule();
  assert.equal(datasetRevision(null), "");
  assert.equal(datasetRevision({}), "");
  assert.equal(datasetRevision({ commitId: "abc", updatedAt: 9, recordFingerprint: "ignored" }), "commit:abc");
  assert.equal(datasetRevision({ updatedAt: 42, recordFingerprint: "deadbeef" }), "legacy:42:deadbeef");
  assert.equal(datasetRevision({ updatedAt: 42 }), "legacy:42:");
  assert.equal(datasetRevision({ recordFingerprint: "deadbeef" }), "legacy:0:deadbeef");
});

test("1.32.0.1 applied-state helpers preserve exact fields and no-op identity behavior", async () => {
  const { markAppliedSnapshot, markAppliedWorkSnapshot, markAppliedRemoteCore } = await loadObservationModule();
  const meta = { deviceId: "device-a", keep: 1 };
  assert.equal(markAppliedSnapshot(meta, {}), meta);
  assert.equal(markAppliedWorkSnapshot(meta, null), meta);
  assert.equal(markAppliedRemoteCore(meta, ""), meta);
  assert.deepEqual(markAppliedSnapshot(meta, { commitId: "p" }), { ...meta, lastAppliedSyncRevision: "commit:p" });
  assert.deepEqual(markAppliedWorkSnapshot(meta, { commitId: "w" }), { ...meta, lastAppliedWorkSyncRevision: "commit:w" });
  assert.deepEqual(markAppliedRemoteCore(meta, "device-rev"), { ...meta, lastAppliedDeviceSnapshotRevision: "device-rev" });
});

test("1.32.0.1 observing unusable or exact-self remote cores remains a true no-op", async () => {
  const { observeRemoteCore } = await loadObservationModule();
  const meta = { deviceId: "device-a", lastRemoteReceiptAt: 7 };
  assert.equal(observeRemoteCore(meta, null), meta);
  assert.equal(observeRemoteCore(meta, { records: new Map(), settings: settings(), revision: "" }), meta);
  assert.equal(observeRemoteCore(meta, remoteCore({ originDeviceId: "device-a", provenanceExact: true })), meta);
});

test("1.32.0.1 same-revision provenance correction does not manufacture a receipt timestamp", async () => {
  const { observeRemoteCore } = await loadObservationModule();
  const meta = {
    deviceId: "device-a",
    lastRemoteReceiptAt: 777,
    lastRemoteReceiptRevision: "commit:remote",
    lastRemoteReceiptOriginDeviceId: "stale-device",
    lastRemoteReceiptProvenanceExact: true
  };
  const corrected = observeRemoteCore(meta, remoteCore({ provenanceExact: false, originDeviceId: "device-b" }));
  assert.equal(corrected.lastRemoteReceiptAt, 777);
  assert.equal(corrected.lastRemoteReceiptRevision, "commit:remote");
  assert.equal(corrected.lastRemoteReceiptOriginDeviceId, "");
  assert.equal(corrected.lastRemoteReceiptProvenanceExact, false);
});

test("1.32.0.1 new remote receipt records revision/update time and only exact provenance", async () => {
  const { observeRemoteCore } = await loadObservationModule();
  const meta = { deviceId: "device-a" };
  const before = Date.now();
  const exact = observeRemoteCore(meta, remoteCore());
  const after = Date.now();
  assert.ok(exact.lastRemoteReceiptAt >= before && exact.lastRemoteReceiptAt <= after);
  assert.equal(exact.lastRemoteReceiptRevision, "commit:remote");
  assert.equal(exact.lastRemoteReceiptUpdatedAt, 120);
  assert.equal(exact.lastRemoteReceiptOriginDeviceId, "device-b");
  assert.equal(exact.lastRemoteReceiptProvenanceExact, true);

  const shared = observeRemoteCore(meta, remoteCore({ revision: "commit:shared", provenanceExact: false, originDeviceId: "device-b" }));
  assert.equal(shared.lastRemoteReceiptOriginDeviceId, "",
    "collaborative shared-ledger origin remains deliberately non-attributable");
  assert.equal(shared.lastRemoteReceiptProvenanceExact, false);
});

test("1.32.0.1 latest Sync origin keeps Personal-on-tie and Work-only-when-newer semantics", async () => {
  const { latestSyncOrigin } = await loadObservationModule();
  const personal = { updatedAt: 100, originDeviceId: "personal-core" };
  const work = { updatedAt: 100, originDeviceId: "work-core" };
  assert.deepEqual(latestSyncOrigin(personal, null, work, null), { updatedAt: 100, deviceId: "personal-core" });
  assert.deepEqual(latestSyncOrigin(personal, null, { ...work, updatedAt: 101 }, null), { updatedAt: 101, deviceId: "work-core" });
  assert.deepEqual(latestSyncOrigin(null, { dataset: { updatedAt: 80, originDeviceId: "personal-dataset" } }, null, { dataset: { updatedAt: 90, originDeviceId: "work-dataset" } }), {
    updatedAt: 90,
    deviceId: "work-dataset"
  });
});

test("1.32.0.1 background core consumes the extracted owner without retaining duplicate private implementations", async () => {
  await loadObservationModule();
  const core = fs.readFileSync(path.join(ROOT, "src/shared/background/background-core.js"), "utf8");
  assert.match(core, /from "\.\/sync-remote-observation\.js";/);
  for (const name of ["remoteCoreUsable", "datasetRevision", "markAppliedSnapshot", "markAppliedWorkSnapshot", "observeRemoteCore", "markAppliedRemoteCore", "latestSyncOrigin"]) {
    assert.doesNotMatch(core, new RegExp(`\\bfunction\\s+${name}\\s*\\(`), `${name} must have one production owner`);
  }
  for (const browser of ["firefox", "chrome"]) {
    const generated = path.join(ROOT, `dist/${browser}/background/sync-remote-observation.js`);
    assert.equal(fs.existsSync(generated), true, `${browser} build must contain the extracted shared owner`);
    assert.equal(fs.readFileSync(generated, "utf8"), fs.readFileSync(MODULE_PATH, "utf8"),
      `${browser} generated module must remain byte-identical to canonical shared source`);
  }
});
