import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { createRecoveryGenerationStore } from "../src/shared/background/recovery-generation-store.js";

function makeFormat() {
  const prefix = "mosaicsync.sync.device.";
  const generationKey = (deviceId, commitId) =>
    `${prefix}${encodeURIComponent(deviceId)}.snapshot.${encodeURIComponent(commitId)}`;
  return {
    compareDeviceSnapshotGenerationRecency(a, b) {
      return Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0) ||
        String(a?.rootKey || "").localeCompare(String(b?.rootKey || ""));
    },
    async decodeDeviceSnapshotPayload(value) {
      return value?.valid === true ? {
        kind: "device-snapshot",
        deviceId: value.deviceId,
        commitId: value.commitId,
        updatedAt: value.updatedAt,
        profileComplete: value.profileComplete === true,
        records: new Map(),
        settings: { kind: "settings" }
      } : null;
    },
    deviceSnapshotDataFingerprint() {
      return "fixture-fingerprint";
    },
    deviceSnapshotGenerationChunkKey(deviceId, commitId, index) {
      return `${generationKey(deviceId, commitId)}.chunk.${index}`;
    },
    deviceSnapshotGenerationKey: generationKey,
    deviceSnapshotMetadata(_records, _settings, deviceId, commitId, publishedAt, encoded) {
      return {
        schemaVersion: 2,
        deviceId,
        commitId,
        publishedAt,
        updatedAt: publishedAt,
        encoding: "gzip-base64",
        compressedBytes: encoded.compressedBytes,
        jsonChars: encoded.jsonChars,
        profileSnapshotVersion: 1,
        profileComplete: true
      };
    },
    deviceSnapshotRootMatchesKey(key, value) {
      return key === generationKey(value?.deviceId || "", value?.commitId || "");
    },
    async encodeDeviceSnapshotPayload() {
      return { data: "abcdefghijkl", compressedBytes: 9, jsonChars: 30 };
    },
    isDeviceSnapshotRootKey(key) {
      return key.startsWith(prefix) && !key.includes(".chunk.");
    },
    previousProfileDescriptor(root) {
      return root?.profileComplete === true ? { commitId: root.commitId } : null;
    }
  };
}

function makeStore(overrides = {}) {
  const data = new Map(Object.entries(structuredClone(overrides.initial || {})));
  const events = [];
  const store = createRecoveryGenerationStore({
    format: makeFormat(),
    readAllSyncItems: async () => Object.fromEntries([...data].map(([key, value]) => [key, structuredClone(value)])),
    writeSyncItems: async items => {
      const keys = Object.keys(items);
      events.push(["write", keys]);
      if (overrides.failRoot && keys.some(key => !key.includes(".chunk."))) {
        const error = new Error("simulated root quota failure");
        error.name = "QuotaExceededError";
        throw error;
      }
      for (const [key, value] of Object.entries(structuredClone(items))) data.set(key, value);
    },
    removeSyncItems: async keys => {
      events.push(["remove", [...keys]]);
      for (const key of keys) data.delete(key);
    },
    syncEntryBytes: () => 100
  });
  return { data, events, store };
}

function publicationFixture() {
  const rootKey = "mosaicsync.sync.device.dev.snapshot.new";
  return {
    rootKey,
    rootValue: {
      kind: "device-snapshot-manifest",
      chunkKeyMode: "generation",
      snapshotId: "new",
      deviceId: "dev",
      commitId: "new",
      profileComplete: true,
      valid: true,
      updatedAt: 20
    },
    chunkWrites: {
      [`${rootKey}.chunk.0`]: { data: "a" },
      [`${rootKey}.chunk.1`]: { data: "b" }
    }
  };
}

test("1.30.18.21 Recovery store commits immutable chunks before the authoritative root", async () => {
  const previousRoot = "mosaicsync.sync.device.dev.snapshot.old";
  const { data, events, store } = makeStore({
    initial: {
      [previousRoot]: { valid: true, profileComplete: true, deviceId: "dev", commitId: "old", updatedAt: 10 },
      [`${previousRoot}.chunk.0`]: { data: "old" }
    }
  });
  const publication = publicationFixture();

  await store.commitProfileDeviceSnapshotPublication(publication);

  assert.deepEqual(events.map(([kind]) => kind), ["write", "write"]);
  assert.deepEqual(events[0][1], Object.keys(publication.chunkWrites));
  assert.deepEqual(events[1][1], [publication.rootKey]);
  assert.ok(data.has(previousRoot), "the previous complete generation remains available throughout publication");
  assert.ok(data.has(publication.rootKey));
});

test("1.30.18.21 Recovery store rolls back only new chunks when the authoritative root write fails", async () => {
  const previousRoot = "mosaicsync.sync.device.dev.snapshot.old";
  const { data, events, store } = makeStore({
    failRoot: true,
    initial: {
      [previousRoot]: { valid: true, profileComplete: true, deviceId: "dev", commitId: "old", updatedAt: 10 },
      [`${previousRoot}.chunk.0`]: { data: "old" }
    }
  });
  const publication = publicationFixture();

  await assert.rejects(
    store.commitProfileDeviceSnapshotPublication(publication),
    error => error?.name === "QuotaExceededError"
  );

  assert.ok(data.has(previousRoot), "a failed new root must not damage the previous complete fallback");
  assert.ok(data.has(`${previousRoot}.chunk.0`));
  assert.equal(data.has(publication.rootKey), false);
  assert.equal([...data.keys()].some(key => key.startsWith(`${publication.rootKey}.chunk.`)), false);
  assert.deepEqual(events.map(([kind]) => kind), ["write", "write", "remove"]);
});

test("1.30.18.21 Recovery store owns read/selection and post-write verification without merge policy", async () => {
  const older = "mosaicsync.sync.device.dev.snapshot.old";
  const newer = "mosaicsync.sync.device.dev.snapshot.new";
  const other = "mosaicsync.sync.device.other.snapshot.one";
  const { store } = makeStore({ initial: {
    [older]: { valid: true, profileComplete: true, deviceId: "dev", commitId: "old", updatedAt: 10 },
    [newer]: { valid: true, profileComplete: true, deviceId: "dev", commitId: "new", updatedAt: 20 },
    [other]: { valid: true, profileComplete: true, deviceId: "other", commitId: "one", updatedAt: 30 }
  }});

  const own = await store.readOwnDeviceSnapshot("dev");
  assert.equal(own.rootKey, newer);
  assert.equal(own.decoded?.commitId, "new");

  const verification = await store.verifyProfileDeviceSnapshotPublication({ rootKey: newer });
  assert.equal(verification.committedSnapshot?.rootKey, newer);
  assert.equal(verification.snapshots.length, 3);
});

test("1.30.18.21 Recovery store prepares the complete profile wire publication behind the format seam", async () => {
  const { store } = makeStore();
  const publication = await store.prepareProfileDeviceSnapshotPublication({
    deviceId: "device clone/one",
    commitId: "profile-commit:alpha/beta",
    publishedAt: 1234,
    personalRecords: new Map(),
    personalSettings: { kind: "settings" },
    workRecords: new Map(),
    workSettings: { kind: "settings" },
    previousRoot: { profileComplete: true, commitId: "legacy" }
  });

  assert.match(publication.rootKey, /device%20clone%2Fone\.snapshot\.profile-commit%3Aalpha%2Fbeta$/);
  assert.equal(publication.rootValue.previousProfile?.commitId, "legacy");
  assert.equal(publication.rootValue.chunkKeyMode, "generation");
  assert.equal(publication.rootValue.snapshotId, "profile-commit:alpha/beta");
  assert.deepEqual(Object.keys(publication.chunkWrites), [`${publication.rootKey}.chunk.0`]);
});

test("1.30.18.21 Recovery storage module remains browser-neutral across the later lifecycle seam", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const store = fs.readFileSync("src/shared/background/recovery-generation-store.js", "utf8");
  const lifecycle = fs.readFileSync("src/shared/background/recovery-generation-lifecycle.js", "utf8");

  assert.match(core, /import \{ createRecoveryGenerationStore \} from "\.\/recovery-generation-store\.js";/);
  assert.doesNotMatch(core, /async function readDeviceSnapshots\s*\(/);
  assert.doesNotMatch(core, /await writeSyncItems\(publication\.chunkWrites,[\s\S]*?await writeSyncItems\(\{ \[publication\.rootKey\]: publication\.rootValue \}/);
  assert.match(core, /async function prepareDeviceSnapshotPublicationCapacity\s*\(/);
  assert.match(core, /async function pruneSupersededDeviceSnapshotGenerations\s*\(/);
  assert.match(core, /async function maybeGarbageCollectStaleDeviceSnapshots\s*\(/);
  assert.match(core, /async function beginOrContinueCatastrophicSyncRecovery\s*\(/);
  assert.match(lifecycle, /function planDeviceSnapshotPublicationCapacity\s*\(/);
  assert.match(lifecycle, /function planDeviceSnapshotGarbageCollection\s*\(/);

  assert.doesNotMatch(store, /browser\.storage|LOCAL_SYNC_CONTINUITY_KEY|SYNC_RECOVERY_ALARM|beginOrContinueCatastrophicSyncRecovery/);
  assert.doesNotMatch(store, /prepareDeviceSnapshotPublicationCapacity|pruneSupersededDeviceSnapshotGenerations|maybeGarbageCollectStaleDeviceSnapshots/);
});
