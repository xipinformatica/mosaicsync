/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Stage 2D: fail-closed cooperative repair of a torn Sync dataset marker.
 *
 * A witness is NOT a recovery snapshot and is never used as a merge input.
 * It only attests that a device has observed the same complete live ledger,
 * including tombstones, and that the ledger has not omitted its own changes.
 * A single device must never re-label an incomplete download as complete.
 */
import { chooseNewerRecord, mergeSettingsRecords, stableStringify, syncRecordEqual } from '../core/model.js';

export const REPAIR_WITNESS_VERSION = 1;

function compareId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const ch of String(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function liveLedgerWitnessDigest(snapshot) {
  if (!snapshot?.settings || !snapshot?.dataset || !(snapshot.records instanceof Map)) return '';
  const records = [...snapshot.records].sort(([a], [b]) => compareId(a, b));
  // Unlike the compatibility dataset fingerprint, this includes deletion
  // tombstones. Otherwise two devices could agree while a delete is missing.
  return fnv1a(stableStringify([records, snapshot.settings]));
}

export function witnessKey(prefix, deviceId) {
  return `${prefix}repair-witness.${encodeURIComponent(deviceId)}`;
}

export function witnessFor(snapshot, deviceId, spaceId) {
  return {
    schemaVersion: REPAIR_WITNESS_VERSION,
    kind: 'repair-witness',
    deviceId,
    spaceId,
    datasetCommitId: snapshot.dataset?.commitId || '',
    digest: liveLedgerWitnessDigest(snapshot),
    recordCount: snapshot.records.size
  };
}

export function requiredWitnessDevices(snapshot, localDeviceId) {
  const ids = new Set([localDeviceId]);
  if (snapshot?.dataset?.originDeviceId) ids.add(snapshot.dataset.originDeviceId);
  for (const record of snapshot?.records?.values?.() || []) {
    if (record?.deviceId) ids.add(record.deviceId);
  }
  return [...ids].filter(Boolean).sort(compareId);
}

export function ledgerContainsOwnChanges(snapshot, localRecords, localSettings, deletionEvidence = new Map()) {
  if (!snapshot?.settings || !snapshot?.dataset) return false;
  // A device must not endorse a ledger that omits its own not-yet-delivered
  // shortcut, or a newer local edit. Remote tombstones defeat stale edits.
  for (const [id, local] of localRecords || []) {
    const remote = snapshot.records.get(id);
    if (!remote) return false;
    if (!syncRecordEqual(local, remote) &&
        stableStringify(chooseNewerRecord(local, remote)) !== stableStringify(remote)) return false;
  }
  // A locally recorded deletion is durable across service-worker restarts.
  // An ordinary stale rename must never erase its tombstone.
  for (const [id, deletion] of deletionEvidence || []) {
    const remote = snapshot.records.get(id);
    if (!remote || stableStringify(chooseNewerRecord(deletion, remote)) !== stableStringify(remote)) return false;
  }
  // Settings merge clocks are field-aware; don't endorse a ledger that would
  // silently discard an unsynchronized local settings change.
  const combined = mergeSettingsRecords(localSettings, snapshot.settings);
  return stableStringify(combined.settings) === stableStringify(snapshot.settings.settings) &&
    stableStringify(combined.settingsClock) === stableStringify(snapshot.settings.settingsClock);
}

export function deletionRepairs(snapshot, deletionEvidence) {
  const repairs = new Map();
  for (const [id, tombstone] of deletionEvidence || []) {
    const remote = snapshot.records.get(id);
    if (stableStringify(chooseNewerRecord(tombstone, remote)) === stableStringify(tombstone) &&
        stableStringify(remote) !== stableStringify(tombstone)) repairs.set(id, tombstone);
  }
  return repairs;
}

export function witnessesAgree(snapshot, deviceIds, all, prefix, ownId) {
  if (deviceIds.length < 2 || !deviceIds.includes(ownId)) return false;
  const expected = witnessFor(snapshot, ownId, '').digest;
  const commitId = snapshot.dataset?.commitId || '';
  for (const id of deviceIds) {
    const value = all?.[witnessKey(prefix, id)];
    if (value?.schemaVersion !== REPAIR_WITNESS_VERSION || value.kind !== 'repair-witness' ||
        value.deviceId !== id || value.digest !== expected ||
        value.datasetCommitId !== commitId || value.recordCount !== snapshot.records.size) return false;
  }
  return true;
}
