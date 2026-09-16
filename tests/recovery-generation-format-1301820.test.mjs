import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  PROFILE_SNAPSHOT_SCHEMA_VERSION,
  SYNC_DEVICE_SNAPSHOT_PREFIX
} from "../src/shared/core/constants.js";
import { stableStringify } from "../src/shared/core/model.js";
import { createRecoveryGenerationFormat } from "../src/shared/background/recovery-generation-format.js";

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function compareStableText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function liveRecordCount(records) {
  let count = 0;
  for (const record of records?.values?.() || []) {
    if (record?.kind === "shortcut" || record?.kind === "folder") count += 1;
  }
  return count;
}

function recordFingerprint(records) {
  const live = [];
  for (const record of records?.values?.() || []) {
    if (record?.kind !== "shortcut" && record?.kind !== "folder") continue;
    const { deviceId: _deviceId, ...semantic } = record;
    live.push(semantic);
  }
  live.sort((a, b) => compareStableText(a.id, b.id));
  return fnv1a(stableStringify(live));
}

function datasetUpdatedAt(records, settings, fallback = 0) {
  let newest = Number(fallback) || 0;
  for (const record of records?.values?.() || []) {
    newest = Math.max(newest, Number(record?.modifiedAt) || Number(record?.deletedAt) || 0);
  }
  return Math.max(newest, Number(settings?.modifiedAt) || 0);
}

function makeFormat() {
  return createRecoveryGenerationFormat({
    bytesToBase64: bytes => Buffer.from(bytes).toString("base64"),
    compareStableText,
    datasetUpdatedAt,
    fnv1a,
    liveRecordCount,
    recordFingerprint
  });
}

test("1.30.18.20 Recovery generation format preserves immutable and legacy key contracts", () => {
  const format = makeFormat();
  const deviceId = "device clone/one";
  const commitId = "profile-commit:alpha/beta";
  const fixedRoot = `${SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(deviceId)}`;
  const generationRoot = `${fixedRoot}.snapshot.${encodeURIComponent(commitId)}`;

  assert.equal(format.deviceSnapshotKey(deviceId), fixedRoot);
  assert.equal(format.deviceSnapshotGenerationKey(deviceId, commitId), generationRoot);
  assert.equal(format.deviceSnapshotGenerationChunkKey(deviceId, commitId, 3), `${generationRoot}.chunk.3`);
  assert.equal(format.deviceSnapshotChunkKey(deviceId, "a", 3), `${fixedRoot}.chunk.a.3`);

  assert.equal(format.deviceSnapshotRootMatchesKey(generationRoot, {
    kind: "device-snapshot-manifest",
    deviceId,
    commitId,
    chunkKeyMode: "generation",
    snapshotId: commitId
  }), true);
  assert.equal(format.deviceSnapshotRootMatchesKey(generationRoot, {
    kind: "device-snapshot-manifest",
    deviceId,
    commitId,
    chunkKeyMode: "generation",
    snapshotId: "different"
  }), false, "a modern root must never accept a snapshotId/commitId mismatch");
  assert.equal(format.deviceSnapshotRootMatchesKey(fixedRoot, { kind: "device-snapshot-manifest", deviceId, commitId }), true,
    "legacy fixed per-device roots must remain readable");

  const legacy = {
    kind: "device-snapshot-manifest",
    profileComplete: true,
    profileSnapshotVersion: PROFILE_SNAPSHOT_SCHEMA_VERSION,
    commitId: "legacy-commit",
    slot: "b",
    parts: 2,
    dataChars: 10,
    dataFingerprint: "abc",
    publishedAt: 123,
    updatedAt: 120,
    liveRecordCount: 1,
    recordFingerprint: "personal",
    settingsModifiedAt: 119,
    encoding: "gzip-base64",
    compressedBytes: 8,
    jsonChars: 20,
    workLiveRecordCount: 1,
    workRecordFingerprint: "work",
    workSettingsModifiedAt: 118
  };
  assert.deepEqual(format.previousProfileDescriptor(legacy), {
    commitId: "legacy-commit",
    publishedAt: 123,
    updatedAt: 120,
    liveRecordCount: 1,
    recordFingerprint: "personal",
    settingsModifiedAt: 119,
    encoding: "gzip-base64",
    compressedBytes: 8,
    jsonChars: 20,
    slot: "b",
    parts: 2,
    dataChars: 10,
    dataFingerprint: "abc",
    workLiveRecordCount: 1,
    workRecordFingerprint: "work",
    workSettingsModifiedAt: 118
  });
});

test("1.30.18.20 Recovery generation decoder revalidates chunks before its cache and fails closed on a torn generation", async () => {
  const format = makeFormat();
  const deviceId = "device-a";
  const commitId = "profile-commit-a";
  const publishedAt = 1_800_000_000_000;
  const personalRecords = new Map([["p", {
    id: "p", kind: "shortcut", title: "Personal", url: "https://personal.example/", position: 0,
    createdAt: publishedAt - 20, modifiedAt: publishedAt - 10, deviceId
  }]]);
  const workRecords = new Map([["w", {
    id: "w", kind: "shortcut", title: "Work", url: "https://work.example/", position: 0,
    createdAt: publishedAt - 19, modifiedAt: publishedAt - 9, deviceId
  }]]);
  const personalSettings = { kind: "settings", modifiedAt: publishedAt - 8 };
  const workSettings = { kind: "settings", modifiedAt: publishedAt - 7 };
  const payload = {
    version: DEVICE_SNAPSHOT_SCHEMA_VERSION,
    records: [...personalRecords.values()],
    settings: personalSettings,
    workRecords: [...workRecords.values()],
    workSettings
  };
  const encoded = await format.encodeDeviceSnapshotPayload(payload);
  assert.ok(encoded?.data, "the test runtime must support the production gzip codec");
  const metadata = format.deviceSnapshotMetadata(
    personalRecords, personalSettings, deviceId, commitId, publishedAt, encoded,
    workRecords, workSettings
  );
  const rootKey = format.deviceSnapshotGenerationKey(deviceId, commitId);
  const splitAt = Math.max(1, Math.floor(encoded.data.length / 2));
  const dataChunks = [encoded.data.slice(0, splitAt), encoded.data.slice(splitAt)].filter(Boolean);
  const root = {
    ...metadata,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
    chunkKeyMode: "generation",
    snapshotId: commitId,
    parts: dataChunks.length,
    dataChars: encoded.data.length,
    dataFingerprint: fnv1a(encoded.data),
    previousProfile: null
  };
  const all = { [rootKey]: root };
  dataChunks.forEach((data, index) => {
    all[format.deviceSnapshotGenerationChunkKey(deviceId, commitId, index)] = {
      schemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      kind: "device-snapshot-chunk",
      chunkKeyMode: "generation",
      snapshotId: commitId,
      deviceId,
      commitId,
      publishedAt,
      index,
      total: dataChunks.length,
      data
    };
  });

  const decoded = await format.decodeDeviceSnapshotPayload(root, all);
  assert.equal(decoded?.profileComplete, true);
  assert.deepEqual([...decoded.records.keys()], ["p"]);
  assert.deepEqual([...decoded.workRecords.keys()], ["w"]);

  // Warmed decode-cache state must never hide a torn/changing generation.
  delete all[format.deviceSnapshotGenerationChunkKey(deviceId, commitId, dataChunks.length - 1)];
  assert.equal(await format.decodeDeviceSnapshotPayload(root, all), null);
});

test("1.30.18.20 Recovery format module remains representation-only across the Step-4 storage seam", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const format = fs.readFileSync("src/shared/background/recovery-generation-format.js", "utf8");
  const store = fs.readFileSync("src/shared/background/recovery-generation-store.js", "utf8");
  const builtFirefox = fs.readFileSync("dist/firefox/background/recovery-generation-format.js", "utf8");
  const builtChrome = fs.readFileSync("dist/chrome/background/recovery-generation-format.js", "utf8");

  assert.match(core, /import \{ createRecoveryGenerationFormat \} from "\.\/recovery-generation-format\.js";/);
  assert.doesNotMatch(core, /function decodeDeviceSnapshotData\s*\(/);
  assert.doesNotMatch(core, /const deviceSnapshotDecodeCache\s*=/);
  assert.match(store, /await writeSyncItems\(chunkWrites,[\s\S]*?await writeSyncItems\(\{ \[rootKey\]: rootValue \}/,
    "the next Step-4 seam may own publication mechanics only if chunk-first/root-last ordering remains explicit");
  assert.match(core, /async function beginOrContinueCatastrophicSyncRecovery\s*\(/,
    "catastrophic continuity must remain outside the representation and storage seams");

  assert.doesNotMatch(format, /browser\.storage/);
  assert.doesNotMatch(format, /writeSyncItems|removeSyncItems|LOCAL_SYNC_CONTINUITY_KEY|SYNC_RECOVERY_ALARM/);
  assert.match(format, /DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES/);
  assert.match(format, /if \(cached\) return cached;/);
  assert.equal(builtFirefox, builtChrome, "the Recovery wire-format implementation must be browser-identical");
});
