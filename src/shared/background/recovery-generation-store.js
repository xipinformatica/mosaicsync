/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Recovery-generation storage/publication boundary.
 *
 * This browser-neutral module owns the mechanical lifecycle of immutable
 * complete-profile generations: assembling the format-owned payload into
 * bounded chunks, reading and selecting verified generations, committing
 * chunks before their authoritative root, rolling back failed new chunks, and
 * verifying a committed root against the currently visible Sync snapshot.
 *
 * It deliberately does NOT decide whether publication is trusted, which local
 * or remote records belong in a generation, how quota capacity is created,
 * which generations retire, when garbage collection runs, or how catastrophic
 * Sync loss and mutation journals are reconciled. Those policies remain in the
 * shared background core.
 */
import {
  DEVICE_SNAPSHOT_CHUNK_DATA_CHARS,
  DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_MAX_CHUNKS,
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  SYNC_QUOTA_BYTES_PER_ITEM
} from "../core/constants.js";

export function createRecoveryGenerationStore({
  format,
  readAllSyncItems,
  removeSyncItems,
  syncEntryBytes,
  writeSyncItems
} = {}) {
  if (!format || typeof format !== "object") throw new TypeError("Recovery generation format is required.");
  const requiredFormatFunctions = [
    "compareDeviceSnapshotGenerationRecency",
    "decodeDeviceSnapshotPayload",
    "deviceSnapshotDataFingerprint",
    "deviceSnapshotGenerationChunkKey",
    "deviceSnapshotGenerationKey",
    "deviceSnapshotMetadata",
    "deviceSnapshotRootMatchesKey",
    "encodeDeviceSnapshotPayload",
    "isDeviceSnapshotRootKey",
    "previousProfileDescriptor"
  ];
  for (const name of requiredFormatFunctions) {
    if (typeof format[name] !== "function") throw new TypeError(`Invalid Recovery generation format capability: ${name}`);
  }
  for (const [name, fn] of Object.entries({
    readAllSyncItems,
    removeSyncItems,
    syncEntryBytes,
    writeSyncItems
  })) {
    if (typeof fn !== "function") throw new TypeError(`Invalid Recovery generation store helper: ${name}`);
  }

  const {
    compareDeviceSnapshotGenerationRecency,
    decodeDeviceSnapshotPayload,
    deviceSnapshotDataFingerprint,
    deviceSnapshotGenerationChunkKey,
    deviceSnapshotGenerationKey,
    deviceSnapshotMetadata,
    deviceSnapshotRootMatchesKey,
    encodeDeviceSnapshotPayload,
    isDeviceSnapshotRootKey,
    previousProfileDescriptor
  } = format;

  async function readDeviceSnapshots(all = null) {
    const values = all && typeof all === "object" ? all : await readAllSyncItems();
    const snapshots = [];
    for (const [key, value] of Object.entries(values || {})) {
      if (!isDeviceSnapshotRootKey(key) || !deviceSnapshotRootMatchesKey(key, value)) continue;
      const decoded = await decodeDeviceSnapshotPayload(value, values);
      if (decoded) snapshots.push({ ...decoded, rootKey: key });
    }
    return snapshots;
  }

  async function readOwnDeviceSnapshot(deviceId, all = null) {
    if (!deviceId) return { rootKey: "", root: null, decoded: null };
    const values = all && typeof all === "object" ? all : await readAllSyncItems();
    const snapshots = (await readDeviceSnapshots(values))
      .filter(snapshot => snapshot.deviceId === deviceId)
      .sort(compareDeviceSnapshotGenerationRecency);
    const decoded = snapshots[0] || null;
    const rootKey = decoded?.rootKey || "";
    return { rootKey, root: rootKey ? values[rootKey] || null : null, decoded };
  }

  async function prepareProfileDeviceSnapshotPublication({
    deviceId,
    commitId,
    publishedAt,
    personalRecords,
    personalSettings,
    workRecords,
    workSettings,
    previousRoot = null
  } = {}) {
    if (!deviceId || !commitId || !(personalRecords instanceof Map) || !(workRecords instanceof Map)) return null;
    if (personalSettings?.kind !== "settings" || workSettings?.kind !== "settings") return null;
    const payload = {
      // Keep payload v2 so older compatible MosaicSync versions can continue
      // reading the Personal half while a full-profile generation rolls out.
      version: DEVICE_SNAPSHOT_SCHEMA_VERSION,
      records: [...personalRecords.values()],
      settings: personalSettings,
      workRecords: [...workRecords.values()],
      workSettings
    };
    const encoded = await encodeDeviceSnapshotPayload(payload);
    if (!encoded) return null;
    const metadata = deviceSnapshotMetadata(
      personalRecords,
      personalSettings,
      deviceId,
      commitId,
      publishedAt,
      encoded,
      workRecords,
      workSettings
    );
    const rootKey = deviceSnapshotGenerationKey(deviceId, commitId);
    const dataChunks = [];
    for (let offset = 0; offset < encoded.data.length; offset += DEVICE_SNAPSHOT_CHUNK_DATA_CHARS) {
      dataChunks.push(encoded.data.slice(offset, offset + DEVICE_SNAPSHOT_CHUNK_DATA_CHARS));
    }
    if (!dataChunks.length || dataChunks.length > DEVICE_SNAPSHOT_MAX_CHUNKS) return null;
    const chunkWrites = {};
    dataChunks.forEach((data, index) => {
      const key = deviceSnapshotGenerationChunkKey(deviceId, commitId, index);
      chunkWrites[key] = {
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
    for (const [key, value] of Object.entries(chunkWrites)) {
      if (syncEntryBytes(key, value) > SYNC_QUOTA_BYTES_PER_ITEM) return null;
    }
    const rootValue = {
      ...metadata,
      kind: "device-snapshot-manifest",
      chunkSchemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      chunkKeyMode: "generation",
      snapshotId: commitId,
      parts: dataChunks.length,
      dataChars: encoded.data.length,
      dataFingerprint: deviceSnapshotDataFingerprint(encoded.data),
      // The first immutable publication retains the legacy fixed-root a/b
      // generation as an independently verifiable torn-delivery fallback.
      previousProfile: previousProfileDescriptor(previousRoot)
    };
    if (syncEntryBytes(rootKey, rootValue) > SYNC_QUOTA_BYTES_PER_ITEM) return null;
    return { rootKey, rootValue, chunkWrites, snapshotId: commitId };
  }

  async function commitProfileDeviceSnapshotPublication(publication) {
    const rootKey = typeof publication?.rootKey === "string" ? publication.rootKey : "";
    const rootValue = publication?.rootValue;
    const chunkWrites = publication?.chunkWrites;
    const chunkKeys = chunkWrites && typeof chunkWrites === "object" ? Object.keys(chunkWrites) : [];
    if (!rootKey || !rootValue || !chunkKeys.length) throw new TypeError("Invalid Recovery generation publication.");
    try {
      await writeSyncItems(chunkWrites, { skipPreflight: true });
      await writeSyncItems({ [rootKey]: rootValue }, { skipPreflight: true });
    } catch (error) {
      try { await removeSyncItems(chunkKeys); } catch {}
      throw error;
    }
  }

  async function verifyProfileDeviceSnapshotPublication(publication, all = null) {
    const rootKey = typeof publication?.rootKey === "string" ? publication.rootKey : "";
    if (!rootKey) return { all: all || {}, snapshots: [], committedSnapshot: null };
    const values = all && typeof all === "object" ? all : await readAllSyncItems();
    const snapshots = await readDeviceSnapshots(values);
    const committedSnapshot = snapshots.find(snapshot =>
      snapshot.rootKey === rootKey && snapshot.profileComplete === true
    ) || null;
    return { all: values, snapshots, committedSnapshot };
  }

  return Object.freeze({
    commitProfileDeviceSnapshotPublication,
    prepareProfileDeviceSnapshotPublication,
    readDeviceSnapshots,
    readOwnDeviceSnapshot,
    verifyProfileDeviceSnapshotPublication
  });
}
