/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser-neutral catastrophic-Recovery continuity boundary.
 *
 * This module owns only persisted continuity normalization and deterministic
 * state-transition planning. It has no persistence, alarm, publication,
 * verification, queued-edit, merge, or reset side effects. The shared
 * background orchestrator supplies explicit time and applies every effect.
 */
import {
  SYNC_CONTINUITY_SCHEMA_VERSION,
  SYNC_QUOTA_MAX_ITEMS,
  SYNC_RECOVERY_JITTER_MS,
  SYNC_RECOVERY_MAX_ATTEMPTS,
  SYNC_RECOVERY_QUARANTINE_MS,
  SYNC_RECOVERY_RESTART_GRACE_MS,
  SYNC_RECOVERY_STALE_AFTER_MS,
  SYNC_RECOVERY_STALE_DELAY_MS,
  SYNC_RECOVERY_STARTUP_WARMUP_MS,
  SYNC_RECOVERY_VERY_STALE_AFTER_MS,
  SYNC_RECOVERY_VERY_STALE_DELAY_MS,
  SYNC_SCHEMA_VERSION,
  TOMBSTONE_TTL_MS
} from "../core/constants.js";

const LOSS_STATES = new Set(["none", "quarantine", "recovering", "failed"]);
const DEFAULT_POLICY = Object.freeze({
  continuitySchemaVersion: SYNC_CONTINUITY_SCHEMA_VERSION,
  syncSchemaVersion: SYNC_SCHEMA_VERSION,
  syncQuotaMaxItems: SYNC_QUOTA_MAX_ITEMS,
  tombstoneTtlMs: TOMBSTONE_TTL_MS,
  quarantineMs: SYNC_RECOVERY_QUARANTINE_MS,
  staleAfterMs: SYNC_RECOVERY_STALE_AFTER_MS,
  veryStaleAfterMs: SYNC_RECOVERY_VERY_STALE_AFTER_MS,
  staleDelayMs: SYNC_RECOVERY_STALE_DELAY_MS,
  veryStaleDelayMs: SYNC_RECOVERY_VERY_STALE_DELAY_MS,
  jitterMs: SYNC_RECOVERY_JITTER_MS,
  maxAttempts: SYNC_RECOVERY_MAX_ATTEMPTS,
  restartGraceMs: SYNC_RECOVERY_RESTART_GRACE_MS,
  startupWarmupMs: SYNC_RECOVERY_STARTUP_WARMUP_MS
});

export function createRecoveryContinuity({
  compareStableText,
  fnv1a,
  policy = {}
} = {}) {
  for (const [name, fn] of Object.entries({ compareStableText, fnv1a })) {
    if (typeof fn !== "function") throw new TypeError(`Invalid Recovery continuity helper: ${name}`);
  }
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new TypeError("Invalid Recovery continuity policy");
  }
  const settings = Object.freeze({ ...DEFAULT_POLICY, ...policy });

  function inferredContinuityEstablished(meta) {
    return Boolean(meta?.syncEnabled && meta?.syncInitialized && (
      meta.lastAppliedProfileSnapshotRevision ||
      (meta.lastAppliedSyncRevision && meta.lastAppliedWorkSyncRevision) ||
      meta.lastAppliedDeviceSnapshotRevision ||
      meta.lastRemoteReceiptAt ||
      meta.lastSyncAt
    ));
  }

  function normalizeContinuityTombstones(value, now) {
    if (!Array.isArray(value)) return [];
    const cutoff = Number(now) - settings.tombstoneTtlMs;
    const out = [];
    const seen = new Set();
    for (const raw of value) {
      if (!raw || raw.kind !== "deleted" || typeof raw.id !== "string" || !raw.id || seen.has(raw.id)) continue;
      const deletedAt = Number(raw.deletedAt);
      const modifiedAt = Number(raw.modifiedAt);
      if (!Number.isFinite(deletedAt) || !Number.isFinite(modifiedAt) || deletedAt < cutoff) continue;
      seen.add(raw.id);
      out.push({
        schemaVersion: Number(raw.schemaVersion) || settings.syncSchemaVersion,
        kind: "deleted",
        id: raw.id,
        deletedAt,
        modifiedAt,
        deviceId: typeof raw.deviceId === "string" ? raw.deviceId : ""
      });
    }
    out.sort((a, b) => (b.modifiedAt - a.modifiedAt) || compareStableText(a.id, b.id));
    return out.slice(0, settings.syncQuotaMaxItems);
  }

  function continuityTombstonesFromRecords(records, now) {
    return normalizeContinuityTombstones([...records?.values?.() || []], now);
  }

  function normalizeSyncContinuity(raw, meta = null, now = 0) {
    const source = raw && typeof raw === "object" ? raw : {};
    const established = source.established === true ||
      (source.established !== false && inferredContinuityEstablished(meta));
    return {
      schemaVersion: settings.continuitySchemaVersion,
      established,
      lastHealthyAt: Number.isFinite(Number(source.lastHealthyAt)) ? Number(source.lastHealthyAt) : 0,
      lastCompleteRevision: typeof source.lastCompleteRevision === "string" ? source.lastCompleteRevision : "",
      lastPublisherDeviceId: typeof source.lastPublisherDeviceId === "string" ? source.lastPublisherDeviceId : "",
      lastResetEpoch: Number.isFinite(Number(source.lastResetEpoch)) ? Number(source.lastResetEpoch) : 0,
      personalTombstones: normalizeContinuityTombstones(source.personalTombstones, now),
      workTombstones: normalizeContinuityTombstones(source.workTombstones, now),
      lossState: LOSS_STATES.has(source.lossState) ? source.lossState : "none",
      lossDetectedAt: Number.isFinite(Number(source.lossDetectedAt)) ? Number(source.lossDetectedAt) : 0,
      recoveryEligibleAt: Number.isFinite(Number(source.recoveryEligibleAt)) ? Number(source.recoveryEligibleAt) : 0,
      recoveryAttempts: Math.max(0, Math.min(settings.maxAttempts, Number(source.recoveryAttempts) || 0)),
      lastRecoveredAt: Number.isFinite(Number(source.lastRecoveredAt)) ? Number(source.lastRecoveredAt) : 0
    };
  }

  function recoveryStalePenalty(continuity, now) {
    const healthyAt = Number(continuity?.lastHealthyAt) || 0;
    if (!healthyAt) return settings.veryStaleDelayMs;
    const age = Math.max(0, Number(now) - healthyAt);
    if (age >= settings.veryStaleAfterMs) return settings.veryStaleDelayMs;
    if (age >= settings.staleAfterMs) return settings.staleDelayMs;
    return 0;
  }

  function recoveryDeviceJitter(deviceId) {
    if (!settings.jitterMs) return 0;
    return Number.parseInt(fnv1a(deviceId || "mosaicsync"), 16) % settings.jitterMs;
  }

  function planStartupRecoveryDeferral(continuity, now) {
    if (!continuity?.established || !["quarantine", "recovering"].includes(continuity.lossState)) return null;
    if (Number(continuity.recoveryEligibleAt) > Number(now)) return null;
    const alarmAt = Number(now) + settings.startupWarmupMs;
    return { continuity: { ...continuity, recoveryEligibleAt: alarmAt }, alarmAt };
  }

  function planHealthyContinuity(current, descriptor = {}, now) {
    return {
      ...current,
      established: true,
      lastHealthyAt: Number(now),
      lastCompleteRevision: descriptor.revision || current.lastCompleteRevision || "",
      lastPublisherDeviceId: descriptor.publisherDeviceId || current.lastPublisherDeviceId || "",
      personalTombstones: descriptor.personalTombstones ?? current.personalTombstones,
      workTombstones: descriptor.workTombstones ?? current.workTombstones,
      lossState: "none",
      lossDetectedAt: 0,
      recoveryEligibleAt: 0,
      recoveryAttempts: 0
    };
  }

  function planIntentionalReset(current, epoch) {
    return {
      ...current,
      established: false,
      lastResetEpoch: Math.max(Number(current.lastResetEpoch) || 0, Number(epoch) || 0),
      personalTombstones: [],
      workTombstones: [],
      lossState: "none",
      lossDetectedAt: 0,
      recoveryEligibleAt: 0,
      recoveryAttempts: 0
    };
  }

  function planLossQuarantine(current, deviceId, now) {
    const observedAt = Number(now);
    const alarmAt = observedAt + settings.quarantineMs +
      recoveryStalePenalty(current, observedAt) + recoveryDeviceJitter(deviceId);
    return {
      continuity: {
        ...current,
        lossState: "quarantine",
        lossDetectedAt: observedAt,
        recoveryEligibleAt: alarmAt,
        recoveryAttempts: 0
      },
      alarmAt
    };
  }

  function recoveryReadiness(continuity, now) {
    if (continuity?.lossState === "failed") return "failed";
    if (Number(now) < Number(continuity?.recoveryEligibleAt)) return "wait";
    return "attempt";
  }

  function planRecoveryAttempt(current, now) {
    const attempt = Math.max(0, Number(current?.recoveryAttempts) || 0) + 1;
    return {
      attempt,
      continuity: {
        ...current,
        lossState: "recovering",
        recoveryAttempts: attempt,
        recoveryEligibleAt: Number(now) + settings.restartGraceMs
      }
    };
  }

  function planRecoverySuccess(current, now) {
    return { ...current, lastRecoveredAt: Number(now) };
  }

  function planRecoveryFailure(current, attempt, deviceId, now) {
    if (Number(attempt) >= settings.maxAttempts) {
      return {
        failed: true,
        alarmAt: 0,
        continuity: { ...current, lossState: "failed", recoveryEligibleAt: 0 }
      };
    }
    const alarmAt = Number(now) + settings.quarantineMs + recoveryDeviceJitter(deviceId);
    return {
      failed: false,
      alarmAt,
      continuity: {
        ...current,
        lossState: "quarantine",
        recoveryEligibleAt: alarmAt,
        recoveryAttempts: attempt
      }
    };
  }

  return Object.freeze({
    continuityTombstonesFromRecords,
    normalizeContinuityTombstones,
    normalizeSyncContinuity,
    planHealthyContinuity,
    planIntentionalReset,
    planLossQuarantine,
    planRecoveryAttempt,
    planRecoveryFailure,
    planRecoverySuccess,
    planStartupRecoveryDeferral,
    recoveryDeviceJitter,
    recoveryReadiness,
    recoveryStalePenalty
  });
}
