/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser-neutral Normal Sync observation/applied-state bookkeeping.
 *
 * Ownership boundary:
 * - interpret live Sync dataset revisions;
 * - record observed remote provenance/receipt metadata;
 * - record which remote revisions/generations have been applied;
 * - select the newest Personal/Work Sync origin descriptor for status UI.
 *
 * This module intentionally owns no browser API, storage, publication,
 * reconciliation, Recovery, timers, queues or mutable module state.
 */

export function remoteCoreUsable(core) {
  return Boolean(core?.settings && core?.records instanceof Map);
}

export function datasetRevision(dataset) {
  if (!dataset || typeof dataset !== "object") return "";
  const commitId = typeof dataset.commitId === "string" ? dataset.commitId : "";
  if (commitId) return `commit:${commitId}`;
  const updatedAt = Number(dataset.updatedAt) || 0;
  const fingerprint = typeof dataset.recordFingerprint === "string" ? dataset.recordFingerprint : "";
  if (!updatedAt && !fingerprint) return "";
  return `legacy:${updatedAt}:${fingerprint}`;
}

export function markAppliedSnapshot(meta, dataset) {
  const revision = datasetRevision(dataset);
  return revision ? { ...meta, lastAppliedSyncRevision: revision } : meta;
}

export function markAppliedWorkSnapshot(meta, dataset) {
  const revision = datasetRevision(dataset);
  return revision ? { ...meta, lastAppliedWorkSyncRevision: revision } : meta;
}

export function observeRemoteCore(meta, core) {
  if (!remoteCoreUsable(core) || !core.revision) return meta;
  const provenanceExact = core.provenanceExact === true;
  const exactOriginDeviceId = provenanceExact && typeof core.originDeviceId === "string"
    ? core.originDeviceId
    : "";
  if (exactOriginDeviceId && exactOriginDeviceId === meta.deviceId) return meta;

  // 1.30.18.41 could persist a device name against a collaborative ledger merely
  // because that device had the newest recovery publication. Clear that stale
  // attribution even when the ledger revision itself has not changed. Do not
  // manufacture a new receipt timestamp for this metadata-only correction.
  if (meta.lastRemoteReceiptRevision === core.revision) {
    if ((meta.lastRemoteReceiptOriginDeviceId || "") === exactOriginDeviceId &&
        meta.lastRemoteReceiptProvenanceExact === provenanceExact) return meta;
    return {
      ...meta,
      lastRemoteReceiptOriginDeviceId: exactOriginDeviceId,
      lastRemoteReceiptProvenanceExact: provenanceExact
    };
  }
  return {
    ...meta,
    lastRemoteReceiptAt: Date.now(),
    lastRemoteReceiptRevision: core.revision,
    lastRemoteReceiptUpdatedAt: Number(core.updatedAt) || 0,
    // Shared ledgers are collaborative merge products. Naming their last writer
    // as the source of the whole received layout is false provenance. Only an
    // atomic device/profile generation has exact source attribution.
    lastRemoteReceiptOriginDeviceId: exactOriginDeviceId,
    lastRemoteReceiptProvenanceExact: provenanceExact
  };
}

export function markAppliedRemoteCore(meta, deviceRevision = "") {
  if (!deviceRevision) return meta;
  return { ...meta, lastAppliedDeviceSnapshotRevision: deviceRevision };
}

export function latestSyncOrigin(core, snapshot, workCore, workSnapshot) {
  const personalUpdatedAt = Number(core?.updatedAt) || (Number.isFinite(snapshot?.dataset?.updatedAt) ? snapshot.dataset.updatedAt : 0);
  const workUpdatedAt = Number(workCore?.updatedAt) || Number(workSnapshot?.dataset?.updatedAt) || 0;
  const useWork = workUpdatedAt > personalUpdatedAt;
  const preferredCore = useWork ? workCore : core;
  const preferredDataset = useWork ? workSnapshot?.dataset : snapshot?.dataset;
  return {
    updatedAt: Math.max(personalUpdatedAt, workUpdatedAt),
    deviceId: preferredCore?.originDeviceId || (typeof preferredDataset?.originDeviceId === "string" ? preferredDataset.originDeviceId : "")
  };
}
