/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Immutable Recovery-generation wire-format boundary.
 *
 * This module owns only the browser-neutral representation contract for
 * complete Personal+Work safety generations: key derivation/classification,
 * manifest/chunk validation, bounded gzip decoding, the performance-only
 * decode cache, and legacy previous-generation descriptors.
 *
 * It deliberately does NOT own storage access, publication ordering, quota
 * retirement, GC, catastrophic-loss continuity, or Sync merge policy. The
 * adjacent Recovery store owns storage/publication mechanics, the lifecycle
 * module owns retirement/GC decisions, and the shared core applies effects.
 */
import {
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  PROFILE_SNAPSHOT_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_MAX_CHUNKS,
  DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES,
  DEVICE_SNAPSHOT_MAX_RECENT_DEVICES,
  SYNC_DEVICE_SNAPSHOT_PREFIX
} from "../core/constants.js";

export function createRecoveryGenerationFormat({
  bytesToBase64,
  compareStableText,
  datasetUpdatedAt,
  fnv1a,
  liveRecordCount,
  recordFingerprint
} = {}) {
  for (const [name, fn] of Object.entries({
    bytesToBase64,
    compareStableText,
    datasetUpdatedAt,
    fnv1a,
    liveRecordCount,
    recordFingerprint
  })) {
    if (typeof fn !== "function") throw new TypeError(`Invalid Recovery generation helper: ${name}`);
  }

  // Performance-only cache for complete, currently verifiable device/profile
  // generations. Every lookup still revalidates the manifest, chunk set and
  // compressed-data fingerprint before this cache can bypass gzip/JSON decoding.
  // Losing the map on an MV3 worker restart therefore changes CPU cost only.
  const deviceSnapshotDecodeCache = new Map();
  const DEVICE_SNAPSHOT_DECODE_CACHE_MAX = DEVICE_SNAPSHOT_MAX_RECENT_DEVICES;

  function deviceSnapshotKey(deviceId) {
    // Legacy fixed per-device root. 1.30.18.3 keeps this readable but never uses
    // it for new publications because cloned/restored browser profiles can share
    // the same persistent deviceId.
    return `${SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(String(deviceId || ""))}`;
  }

  function deviceSnapshotGenerationKey(deviceId, snapshotId) {
    return `${deviceSnapshotKey(deviceId)}.snapshot.${encodeURIComponent(String(snapshotId || ""))}`;
  }

  function deviceSnapshotGenerationChunkKey(deviceId, snapshotId, index) {
    return `${deviceSnapshotGenerationKey(deviceId, snapshotId)}.chunk.${index}`;
  }

  function deviceSnapshotChunkKey(deviceId, slot, index) {
    // Legacy v2 a/b chunk namespace retained for backward-compatible reads.
    return `${deviceSnapshotKey(deviceId)}.chunk.${slot}.${index}`;
  }

  function isDeviceSnapshotKey(key) {
    return typeof key === "string" && key.startsWith(SYNC_DEVICE_SNAPSHOT_PREFIX);
  }

  function isDeviceSnapshotChunkKey(key) {
    return isDeviceSnapshotKey(key) && key.includes(".chunk.");
  }

  function isDeviceSnapshotRootKey(key) {
    return isDeviceSnapshotKey(key) && !isDeviceSnapshotChunkKey(key);
  }

  function deviceSnapshotRootMatchesKey(key, value) {
    if (!isDeviceSnapshotRootKey(key) || !value || typeof value.deviceId !== "string" || !value.deviceId) return false;
    if (value.chunkKeyMode === "generation") {
      const snapshotId = typeof value.snapshotId === "string" ? value.snapshotId : "";
      if (!snapshotId || snapshotId !== value.commitId) return false;
      return key === deviceSnapshotGenerationKey(value.deviceId, snapshotId);
    }
    return key === deviceSnapshotKey(value.deviceId);
  }

  function deviceSnapshotSlotKeys(deviceId, slot) {
    if (!["a", "b"].includes(slot)) return [];
    return Array.from({ length: DEVICE_SNAPSHOT_MAX_CHUNKS }, (_, index) => deviceSnapshotChunkKey(deviceId, slot, index));
  }

  function base64ToBytes(value) {
    if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(value);
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function readBoundedStreamBytes(stream, maxBytes) {
    if (!stream?.getReader || !Number.isFinite(maxBytes) || maxBytes < 1) return null;
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        if (total + chunk.byteLength > maxBytes) {
          try { await reader.cancel(); } catch {}
          return null;
        }
        chunks.push(chunk);
        total += chunk.byteLength;
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  async function encodeDeviceSnapshotPayload(payload) {
    if (typeof CompressionStream !== "function") return null;
    const json = JSON.stringify(payload);
    const input = new TextEncoder().encode(json);
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return { data: bytesToBase64(compressed), jsonChars: json.length, compressedBytes: compressed.length };
  }

  function deviceSnapshotMetadata(records, settings, deviceId, commitId, publishedAt, encoded, workRecords = null, workSettings = null) {
    const metadata = {
      schemaVersion: DEVICE_SNAPSHOT_SCHEMA_VERSION,
      deviceId,
      commitId,
      publishedAt,
      updatedAt: datasetUpdatedAt(records, settings, 0),
      liveRecordCount: liveRecordCount(records),
      recordFingerprint: recordFingerprint(records),
      settingsModifiedAt: Number(settings?.modifiedAt) || 0,
      encoding: "gzip-base64",
      compressedBytes: encoded.compressedBytes,
      jsonChars: encoded.jsonChars
    };
    if (workRecords instanceof Map && workSettings?.kind === "settings") {
      metadata.profileSnapshotVersion = PROFILE_SNAPSHOT_SCHEMA_VERSION;
      metadata.profileComplete = true;
      metadata.updatedAt = Math.max(metadata.updatedAt, datasetUpdatedAt(workRecords, workSettings, 0));
      metadata.workLiveRecordCount = liveRecordCount(workRecords);
      metadata.workRecordFingerprint = recordFingerprint(workRecords);
      metadata.workSettingsModifiedAt = Number(workSettings.modifiedAt) || 0;
    }
    return metadata;
  }

  function deviceSnapshotDecodeCacheKey(value) {
    if (!value || value.kind !== "device-snapshot-manifest") return "";
    // Cache only modern complete Personal+Work generations whose compressed and
    // reconstructed record sets are all fingerprint-verifiable. Older compatible
    // manifests remain readable through the normal decoder but are intentionally
    // never trusted as reusable performance state.
    if (value.profileComplete !== true || Number(value.profileSnapshotVersion) !== PROFILE_SNAPSHOT_SCHEMA_VERSION) return "";
    if (typeof value.dataFingerprint !== "string" || !value.dataFingerprint) return "";
    if (typeof value.recordFingerprint !== "string" || !value.recordFingerprint) return "";
    if (typeof value.workRecordFingerprint !== "string" || !value.workRecordFingerprint) return "";
    // Include every manifest field that affects either the returned decoded
    // snapshot or an existing validation decision. If any such metadata changes,
    // a fresh decode/validation is required even when the compressed bytes match.
    return JSON.stringify([
      Number(value.schemaVersion) || 0,
      value.kind,
      Number(value.chunkSchemaVersion) || 0,
      typeof value.deviceId === "string" ? value.deviceId : "",
      typeof value.commitId === "string" ? value.commitId : "",
      typeof value.chunkKeyMode === "string" ? value.chunkKeyMode : "",
      typeof value.snapshotId === "string" ? value.snapshotId : "",
      Number(value.publishedAt) || 0,
      Number(value.updatedAt) || 0,
      Number(value.liveRecordCount) || 0,
      typeof value.recordFingerprint === "string" ? value.recordFingerprint : "",
      Number(value.settingsModifiedAt) || 0,
      typeof value.encoding === "string" ? value.encoding : "",
      Number(value.compressedBytes) || 0,
      Number(value.jsonChars) || 0,
      Number(value.profileSnapshotVersion) || 0,
      value.profileComplete === true,
      Number(value.workLiveRecordCount) || 0,
      typeof value.workRecordFingerprint === "string" ? value.workRecordFingerprint : "",
      Number(value.workSettingsModifiedAt) || 0,
      typeof value.slot === "string" ? value.slot : "",
      Number(value.parts) || 0,
      Number(value.dataChars) || 0,
      typeof value.dataFingerprint === "string" ? value.dataFingerprint : ""
    ]);
  }

  function deviceSnapshotDataFingerprint(data) {
    return fnv1a(String(data || ""));
  }

  function readDeviceSnapshotDecodeCache(value) {
    const key = deviceSnapshotDecodeCacheKey(value);
    if (!key) return null;
    const cached = deviceSnapshotDecodeCache.get(key);
    if (!cached) return null;
    // Refresh insertion order to make the bounded Map an LRU.
    deviceSnapshotDecodeCache.delete(key);
    deviceSnapshotDecodeCache.set(key, cached);
    return cached;
  }

  function rememberDeviceSnapshotDecodeCache(value, decoded) {
    const key = deviceSnapshotDecodeCacheKey(value);
    if (!key || !decoded || decoded.kind !== "device-snapshot") return decoded;
    if (deviceSnapshotDecodeCache.has(key)) deviceSnapshotDecodeCache.delete(key);
    deviceSnapshotDecodeCache.set(key, decoded);
    while (deviceSnapshotDecodeCache.size > DEVICE_SNAPSHOT_DECODE_CACHE_MAX) {
      deviceSnapshotDecodeCache.delete(deviceSnapshotDecodeCache.keys().next().value);
    }
    return decoded;
  }

  function clearDeviceSnapshotDecodeCache() {
    deviceSnapshotDecodeCache.clear();
  }

  async function decodeDeviceSnapshotData(value, data) {
    if (!value || value.schemaVersion !== DEVICE_SNAPSHOT_SCHEMA_VERSION) return null;
    if (value.encoding !== "gzip-base64" || typeof data !== "string" || !data) return null;
    if (typeof DecompressionStream !== "function") return null;
    try {
      const compressed = base64ToBytes(data);
      if (Number(value.compressedBytes) > 0 && compressed.byteLength !== Number(value.compressedBytes)) return null;
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
      // Bound decompressed bytes while streaming rather than allocating the entire
      // payload first. A corrupt/high-ratio snapshot can therefore never turn the
      // post-decode size check itself into an avoidable MV3 worker memory spike.
      const decompressed = await readBoundedStreamBytes(stream, DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES);
      if (!decompressed) return null;
      const payload = JSON.parse(new TextDecoder().decode(decompressed));
      // Keep payload version 2 so MosaicSync 1.27.7 can continue reading the
      // Personal half of a 1.27.8.8 full-profile device snapshot during rollout.
      if (!payload || payload.version !== DEVICE_SNAPSHOT_SCHEMA_VERSION || !Array.isArray(payload.records) || !payload.settings) return null;
      const records = new Map();
      for (const record of payload.records) {
        if (!record?.id || !["shortcut", "folder", "deleted"].includes(record.kind)) continue;
        records.set(record.id, record);
      }
      const settings = payload.settings?.kind === "settings" ? payload.settings : null;
      if (!settings) return null;
      if (Number(value.liveRecordCount) !== liveRecordCount(records)) return null;
      if (value.recordFingerprint && value.recordFingerprint !== recordFingerprint(records)) return null;
      if (Number(value.settingsModifiedAt) !== Number(settings.modifiedAt || 0)) return null;

      let workRecords = null;
      let workSettings = null;
      const profileComplete = value.profileComplete === true &&
        Number(value.profileSnapshotVersion) === PROFILE_SNAPSHOT_SCHEMA_VERSION;
      if (profileComplete) {
        if (!Array.isArray(payload.workRecords) || payload.workSettings?.kind !== "settings") return null;
        workRecords = new Map();
        for (const record of payload.workRecords) {
          if (!record?.id || !["shortcut", "folder", "deleted"].includes(record.kind)) continue;
          workRecords.set(record.id, record);
        }
        workSettings = payload.workSettings;
        if (Number(value.workLiveRecordCount) !== liveRecordCount(workRecords)) return null;
        if (value.workRecordFingerprint && value.workRecordFingerprint !== recordFingerprint(workRecords)) return null;
        if (Number(value.workSettingsModifiedAt) !== Number(workSettings.modifiedAt || 0)) return null;
      }

      return {
        kind: "device-snapshot",
        deviceId: typeof value.deviceId === "string" ? value.deviceId : "",
        commitId: typeof value.commitId === "string" ? value.commitId : "",
        publishedAt: Number(value.publishedAt) || 0,
        updatedAt: Number(value.updatedAt) || 0,
        records,
        settings,
        profileComplete,
        workRecords,
        workSettings,
        usedPreviousGeneration: false
      };
    } catch {
      return null;
    }
  }

  async function decodeDeviceSnapshotCurrentPayload(value, all = null) {
    if (!value || value.schemaVersion !== DEVICE_SNAPSHOT_SCHEMA_VERSION) return null;

    if (value.kind === "device-snapshot") {
      return decodeDeviceSnapshotData(value, value.data);
    }

    if (value.kind !== "device-snapshot-manifest" || value.chunkSchemaVersion !== DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION) return null;
    if (!all || typeof all !== "object") return null;
    if (!value.deviceId || !value.commitId) return null;

    const generationMode = value.chunkKeyMode === "generation";
    const snapshotId = generationMode && typeof value.snapshotId === "string" ? value.snapshotId : "";
    if (generationMode) {
      if (!snapshotId || snapshotId !== value.commitId) return null;
    } else if (!["a", "b"].includes(value.slot)) {
      return null;
    }

    const parts = Number(value.parts);
    if (!Number.isInteger(parts) || parts < 1 || parts > DEVICE_SNAPSHOT_MAX_CHUNKS) return null;

    const chunks = [];
    for (let index = 0; index < parts; index += 1) {
      const key = generationMode
        ? deviceSnapshotGenerationChunkKey(value.deviceId, snapshotId, index)
        : deviceSnapshotChunkKey(value.deviceId, value.slot, index);
      const chunk = all[key];
      if (!chunk || chunk.kind !== "device-snapshot-chunk" || chunk.schemaVersion !== DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION) return null;
      if (chunk.deviceId !== value.deviceId || chunk.commitId !== value.commitId) return null;
      if (generationMode) {
        if (chunk.chunkKeyMode !== "generation" || chunk.snapshotId !== snapshotId) return null;
      } else if (chunk.slot !== value.slot) {
        return null;
      }
      if (Number(chunk.index) !== index || Number(chunk.total) !== parts || typeof chunk.data !== "string") return null;
      chunks.push(chunk.data);
    }
    const data = chunks.join("");
    if (Number(value.dataChars) !== data.length) return null;
    if (value.dataFingerprint && value.dataFingerprint !== deviceSnapshotDataFingerprint(data)) return null;

    // Do not consult the cache until the generation currently visible in
    // storage.sync has independently passed all cheap completeness/chunk/content
    // checks. A torn or changed generation can therefore never be hidden by an
    // older cached decode. Only the expensive Base64/gzip/JSON/Map phase is reused.
    const cached = readDeviceSnapshotDecodeCache(value);
    if (cached) return cached;
    const decoded = await decodeDeviceSnapshotData(value, data);
    return decoded ? rememberDeviceSnapshotDecodeCache(value, decoded) : null;
  }

  async function decodeDeviceSnapshotPayload(value, all = null) {
    const current = await decodeDeviceSnapshotCurrentPayload(value, all);
    if (current) return current;

    // 1.27.8.8 retains the immediately previous complete Personal+Work generation.
    // If Firefox exposes the new root before all of its chunks, the previous slot
    // remains independently verifiable and can be used until delivery completes.
    const previous = value?.previousProfile;
    if (!previous || value?.kind !== "device-snapshot-manifest" || !all) return null;
    const descriptor = {
      ...previous,
      schemaVersion: DEVICE_SNAPSHOT_SCHEMA_VERSION,
      kind: "device-snapshot-manifest",
      chunkSchemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      deviceId: value.deviceId,
      profileSnapshotVersion: PROFILE_SNAPSHOT_SCHEMA_VERSION,
      profileComplete: true
    };
    const fallback = await decodeDeviceSnapshotCurrentPayload(descriptor, all);
    return fallback ? { ...fallback, usedPreviousGeneration: true } : null;
  }

  function previousProfileDescriptor(root) {
    if (!root || root.kind !== "device-snapshot-manifest" || root.profileComplete !== true) return null;
    if (Number(root.profileSnapshotVersion) !== PROFILE_SNAPSHOT_SCHEMA_VERSION) return null;
    if (!["a", "b"].includes(root.slot) || !root.commitId) return null;
    const fields = [
      "commitId", "publishedAt", "updatedAt", "liveRecordCount", "recordFingerprint", "settingsModifiedAt",
      "encoding", "compressedBytes", "jsonChars", "slot", "parts", "dataChars", "dataFingerprint",
      "workLiveRecordCount", "workRecordFingerprint", "workSettingsModifiedAt"
    ];
    const descriptor = {};
    for (const field of fields) descriptor[field] = root[field];
    return descriptor;
  }

  function deviceRootDescriptor(key, value) {
    if (!isDeviceSnapshotRootKey(key) || !value || !["device-snapshot", "device-snapshot-manifest"].includes(value.kind)) return null;
    const deviceId = typeof value.deviceId === "string" ? value.deviceId : "";
    if (!deviceId || !deviceSnapshotRootMatchesKey(key, value)) return null;
    return {
      key,
      deviceId,
      commitId: typeof value.commitId === "string" ? value.commitId : "",
      publishedAt: Number(value.publishedAt) || 0,
      updatedAt: Number(value.updatedAt) || 0
    };
  }

  function compareDeviceSnapshotGenerationRecency(a, b) {
    return (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0) ||
      (Number(b?.publishedAt) || 0) - (Number(a?.publishedAt) || 0) ||
      compareStableText(String(b?.commitId || ""), String(a?.commitId || "")) ||
      compareStableText(String(a?.rootKey || a?.key || ""), String(b?.rootKey || b?.key || ""));
  }

  function deviceSnapshotKeysForRoot(all, rootKey) {
    if (!rootKey) return [];
    return Object.keys(all || {}).filter(key => key === rootKey || key.startsWith(`${rootKey}.chunk.`));
  }

  return Object.freeze({
    clearDeviceSnapshotDecodeCache,
    compareDeviceSnapshotGenerationRecency,
    decodeDeviceSnapshotPayload,
    deviceRootDescriptor,
    deviceSnapshotChunkKey,
    deviceSnapshotDataFingerprint,
    deviceSnapshotGenerationChunkKey,
    deviceSnapshotGenerationKey,
    deviceSnapshotKey,
    deviceSnapshotKeysForRoot,
    deviceSnapshotMetadata,
    deviceSnapshotRootMatchesKey,
    deviceSnapshotSlotKeys,
    encodeDeviceSnapshotPayload,
    isDeviceSnapshotChunkKey,
    isDeviceSnapshotKey,
    isDeviceSnapshotRootKey,
    previousProfileDescriptor
  });
}
