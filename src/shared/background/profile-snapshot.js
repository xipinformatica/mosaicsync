/*
 * MosaicSync 1.27.8 full-profile Sync safety snapshots.
 *
 * This module is deliberately pure with respect to browser.storage. It builds
 * and validates complete Personal + Work generations; the browser background
 * owns quota checks, writes, retries and garbage collection.
 */
import {
  chooseNewerRecord,
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  mergeRecordMaps,
  stableStringify,
  workspaceStateNormalized
} from "../core/model.js";

export const PROFILE_SNAPSHOT_SCHEMA_VERSION = 1;
export const PROFILE_SNAPSHOT_CHUNK_SCHEMA_VERSION = 1;
export const PROFILE_SNAPSHOT_PREFIX = "mosaicsync.sync.profile.";
export const PROFILE_SNAPSHOT_CHUNK_DATA_CHARS = 5600;
export const PROFILE_SNAPSHOT_MAX_PARTS = 96;
export const PROFILE_SNAPSHOT_MAX_DECOMPRESSED_BYTES = 1024 * 1024;

const SPACE_IDS = Object.freeze(["personal", "work"]);

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function compareText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  return a < b ? -1 : (a > b ? 1 : 0);
}

function bytesToBase64(bytes) {
  let binary = "";
  const stride = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + stride)));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readBoundedStreamBytes(stream, maxBytes) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) return null;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(value);
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

async function gzipJson(payload) {
  if (typeof CompressionStream !== "function") return null;
  const json = JSON.stringify(payload);
  const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return {
    data: bytesToBase64(compressed),
    compressedBytes: compressed.byteLength,
    jsonChars: json.length
  };
}

async function gunzipJson(data) {
  if (typeof DecompressionStream !== "function" || typeof data !== "string" || !data) return null;
  try {
    const compressed = base64ToBytes(data);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const bytes = await readBoundedStreamBytes(stream, PROFILE_SNAPSHOT_MAX_DECOMPRESSED_BYTES);
    if (!bytes) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function profileRootKey(deviceId) {
  return `${PROFILE_SNAPSHOT_PREFIX}${encodeURIComponent(String(deviceId || ""))}`;
}

export function profileChunkKey(deviceId, slot, index) {
  return `${profileRootKey(deviceId)}.chunk.${slot}.${index}`;
}

export function isProfileSnapshotKey(key) {
  return typeof key === "string" && key.startsWith(PROFILE_SNAPSHOT_PREFIX);
}

export function isProfileSnapshotRootKey(key) {
  return isProfileSnapshotKey(key) && !key.includes(".chunk.");
}

export function profileSnapshotKeysForDevice(all, deviceId) {
  const root = profileRootKey(deviceId);
  return Object.keys(all || {}).filter(key => key === root || key.startsWith(`${root}.chunk.`));
}

function recordTime(record) {
  if (!record || typeof record !== "object") return 0;
  if (record.kind === "deleted") return Number(record.deletedAt) || Number(record.modifiedAt) || 0;
  return Number(record.modifiedAt) || 0;
}

function semanticRecord(record) {
  if (!record || typeof record !== "object") return record;
  const { deviceId: _deviceId, ...semantic } = record;
  return semantic;
}

function semanticSettings(settings) {
  if (!settings || typeof settings !== "object") return settings;
  const { deviceId: _deviceId, ...semantic } = settings;
  return semantic;
}

export function profileRecordFingerprint(records) {
  const values = [...(records?.values?.() || [])]
    .filter(record => record && ["shortcut", "folder", "deleted"].includes(record.kind))
    .map(semanticRecord)
    .sort((a, b) => compareText(a.id, b.id) || compareText(a.kind, b.kind));
  return fnv1a(stableStringify(values));
}

function liveCount(records) {
  let count = 0;
  for (const record of records?.values?.() || []) {
    if (record?.kind === "shortcut" || record?.kind === "folder") count += 1;
  }
  return count;
}

function spaceSummary(records, settings, workspaceUpdatedAt = 0) {
  let newest = Number(workspaceUpdatedAt) || 0;
  for (const record of records?.values?.() || []) newest = Math.max(newest, recordTime(record));
  newest = Math.max(newest, Number(settings?.modifiedAt) || 0);
  return {
    liveRecordCount: liveCount(records),
    recordFingerprint: profileRecordFingerprint(records),
    settingsModifiedAt: Number(settings?.modifiedAt) || 0,
    settingsFingerprint: fnv1a(stableStringify(semanticSettings(settings))),
    updatedAt: newest
  };
}

function profileFingerprintFromSpaces(spaces) {
  return fnv1a(stableStringify({
    personal: spaces.personal.summary,
    work: spaces.work.summary
  }));
}

function tombstoneMap(value) {
  if (value instanceof Map) return value;
  if (Array.isArray(value)) return new Map(value);
  return new Map();
}

function buildSpace(fullState, spaceId, deviceId, extraTombstones) {
  const workspace = workspaceStateNormalized(fullState, spaceId);
  const records = new Map(flattenStateNormalized(workspace, deviceId));
  for (const [id, record] of tombstoneMap(extraTombstones)) {
    if (records.has(id) || record?.kind !== "deleted") continue;
    records.set(id, record);
  }
  const settings = makeSettingsRecordNormalized(workspace, deviceId);
  return {
    records,
    settings,
    summary: spaceSummary(records, settings, workspace.updatedAt)
  };
}

export async function buildProfilePublication(fullState, deviceId, currentRoot = null, {
  tombstonesBySpace = null,
  force = false,
  commitId = `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  publishedAt = Date.now()
} = {}) {
  if (!deviceId) return null;
  const spaces = {
    personal: buildSpace(fullState, "personal", deviceId, tombstonesBySpace?.personal),
    work: buildSpace(fullState, "work", deviceId, tombstonesBySpace?.work)
  };
  const profileFingerprint = profileFingerprintFromSpaces(spaces);
  if (!force && currentRoot?.active?.profileFingerprint === profileFingerprint) {
    return {
      unchanged: true,
      rootKey: profileRootKey(deviceId),
      rootValue: currentRoot,
      profileFingerprint,
      revision: currentRoot.active?.commitId ? `profile:${deviceId}:${currentRoot.active.commitId}` : "",
      chunkWrites: {}
    };
  }

  const payload = {
    version: PROFILE_SNAPSHOT_SCHEMA_VERSION,
    spaces: {
      personal: { records: [...spaces.personal.records.values()], settings: spaces.personal.settings },
      work: { records: [...spaces.work.records.values()], settings: spaces.work.settings }
    }
  };
  const encoded = await gzipJson(payload);
  if (!encoded) return null;
  const targetSlot = currentRoot?.active?.slot === "a" ? "b" : "a";
  const dataChunks = [];
  for (let offset = 0; offset < encoded.data.length; offset += PROFILE_SNAPSHOT_CHUNK_DATA_CHARS) {
    dataChunks.push(encoded.data.slice(offset, offset + PROFILE_SNAPSHOT_CHUNK_DATA_CHARS));
  }
  if (!dataChunks.length || dataChunks.length > PROFILE_SNAPSHOT_MAX_PARTS) return null;

  const descriptor = {
    commitId,
    slot: targetSlot,
    parts: dataChunks.length,
    dataChars: encoded.data.length,
    dataFingerprint: fnv1a(encoded.data),
    profileFingerprint,
    publishedAt,
    compressedBytes: encoded.compressedBytes,
    jsonChars: encoded.jsonChars,
    spaces: {
      personal: spaces.personal.summary,
      work: spaces.work.summary
    }
  };
  const chunkWrites = {};
  dataChunks.forEach((data, index) => {
    chunkWrites[profileChunkKey(deviceId, targetSlot, index)] = {
      schemaVersion: PROFILE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      kind: "profile-snapshot-chunk",
      deviceId,
      commitId,
      slot: targetSlot,
      index,
      total: dataChunks.length,
      data
    };
  });
  const rootValue = {
    schemaVersion: PROFILE_SNAPSHOT_SCHEMA_VERSION,
    kind: "profile-snapshot-root",
    deviceId,
    active: descriptor,
    previous: currentRoot?.active && currentRoot.active.slot !== targetSlot ? currentRoot.active : null
  };
  return {
    unchanged: false,
    rootKey: profileRootKey(deviceId),
    rootValue,
    descriptor,
    targetSlot,
    chunkWrites,
    profileFingerprint,
    revision: `profile:${deviceId}:${commitId}`
  };
}

function validDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") return false;
  if (typeof descriptor.commitId !== "string" || !descriptor.commitId) return false;
  if (!SPACE_IDS.every(id => descriptor.spaces?.[id] && typeof descriptor.spaces[id] === "object")) return false;
  const parts = Number(descriptor.parts);
  return ["a", "b"].includes(descriptor.slot) && Number.isInteger(parts) && parts >= 1 && parts <= PROFILE_SNAPSHOT_MAX_PARTS;
}

async function decodeDescriptor(root, descriptor, all) {
  if (!validDescriptor(descriptor)) return null;
  const chunks = [];
  for (let index = 0; index < descriptor.parts; index += 1) {
    const value = all[profileChunkKey(root.deviceId, descriptor.slot, index)];
    if (!value || value.schemaVersion !== PROFILE_SNAPSHOT_CHUNK_SCHEMA_VERSION || value.kind !== "profile-snapshot-chunk") return null;
    if (value.deviceId !== root.deviceId || value.commitId !== descriptor.commitId || value.slot !== descriptor.slot) return null;
    if (Number(value.index) !== index || Number(value.total) !== Number(descriptor.parts) || typeof value.data !== "string") return null;
    chunks.push(value.data);
  }
  const data = chunks.join("");
  if (Number(descriptor.dataChars) !== data.length || fnv1a(data) !== descriptor.dataFingerprint) return null;
  const payload = await gunzipJson(data);
  if (!payload || payload.version !== PROFILE_SNAPSHOT_SCHEMA_VERSION || !payload.spaces) return null;

  const decodedSpaces = {};
  const summaries = {};
  for (const spaceId of SPACE_IDS) {
    const raw = payload.spaces[spaceId];
    if (!raw || !Array.isArray(raw.records) || raw.settings?.kind !== "settings") return null;
    const records = new Map();
    for (const record of raw.records) {
      if (!record?.id || !["shortcut", "folder", "deleted"].includes(record.kind)) return null;
      records.set(record.id, record);
    }
    const summary = spaceSummary(records, raw.settings, descriptor.spaces?.[spaceId]?.updatedAt || 0);
    const expected = descriptor.spaces?.[spaceId];
    if (summary.liveRecordCount !== Number(expected?.liveRecordCount)) return null;
    if (summary.recordFingerprint !== expected?.recordFingerprint) return null;
    if (summary.settingsModifiedAt !== Number(expected?.settingsModifiedAt || 0)) return null;
    if (summary.settingsFingerprint !== expected?.settingsFingerprint) return null;
    decodedSpaces[spaceId] = { records, settings: raw.settings, summary };
    summaries[spaceId] = { summary };
  }
  const actualProfileFingerprint = profileFingerprintFromSpaces(summaries);
  if (actualProfileFingerprint !== descriptor.profileFingerprint) return null;
  return {
    deviceId: root.deviceId,
    commitId: descriptor.commitId,
    revision: `profile:${root.deviceId}:${descriptor.commitId}`,
    profileFingerprint: descriptor.profileFingerprint,
    publishedAt: Number(descriptor.publishedAt) || 0,
    spaces: decodedSpaces
  };
}

export async function decodeProfileSnapshots(all) {
  const snapshots = [];
  for (const [key, root] of Object.entries(all || {})) {
    if (!isProfileSnapshotRootKey(key)) continue;
    if (!root || root.schemaVersion !== PROFILE_SNAPSHOT_SCHEMA_VERSION || root.kind !== "profile-snapshot-root") continue;
    if (typeof root.deviceId !== "string" || !root.deviceId || key !== profileRootKey(root.deviceId)) continue;
    let decoded = await decodeDescriptor(root, root.active, all);
    let usedPrevious = false;
    if (!decoded && root.previous) {
      decoded = await decodeDescriptor(root, root.previous, all);
      usedPrevious = Boolean(decoded);
    }
    if (decoded) snapshots.push({ ...decoded, usedPrevious });
  }
  return snapshots;
}

export function mergeProfileSpaceSource(snapshots, spaceId) {
  if (!SPACE_IDS.includes(spaceId) || !Array.isArray(snapshots) || !snapshots.length) return null;
  let records = new Map();
  let settings = null;
  let updatedAt = 0;
  let publishedAt = 0;
  let originDeviceId = "";
  const revisions = [];
  for (const snapshot of snapshots) {
    const space = snapshot?.spaces?.[spaceId];
    if (!space?.settings || !(space.records instanceof Map)) continue;
    records = mergeRecordMaps(records, space.records);
    settings = settings ? chooseNewerRecord(settings, space.settings) : space.settings;
    updatedAt = Math.max(updatedAt, Number(space.summary?.updatedAt) || 0);
    if (Number(snapshot.publishedAt) >= publishedAt) {
      publishedAt = Number(snapshot.publishedAt) || 0;
      originDeviceId = snapshot.deviceId || originDeviceId;
    }
    revisions.push(snapshot.revision);
  }
  if (!settings || !revisions.length) return null;
  revisions.sort(compareText);
  return {
    records,
    settings,
    revision: `profiles:${fnv1a(revisions.join("|"))}:${profileRecordFingerprint(records)}`,
    updatedAt,
    publishedAt,
    originDeviceId,
    sourceKind: "full-profile-snapshots"
  };
}
