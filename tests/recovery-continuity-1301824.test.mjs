import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRecoveryContinuity } from "../src/shared/background/recovery-continuity.js";

function compareStableText(left, right) {
  const a = String(left ?? ""), b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const POLICY = Object.freeze({
  continuitySchemaVersion: 3,
  syncSchemaVersion: 9,
  syncQuotaMaxItems: 3,
  tombstoneTtlMs: 1_000,
  quarantineMs: 200,
  staleAfterMs: 1_000,
  veryStaleAfterMs: 2_000,
  staleDelayMs: 300,
  veryStaleDelayMs: 600,
  jitterMs: 97,
  maxAttempts: 3,
  restartGraceMs: 400,
  startupWarmupMs: 500
});

function continuity(policy = {}) {
  return createRecoveryContinuity({
    compareStableText,
    fnv1a,
    policy: { ...POLICY, ...policy }
  });
}

function healthy(overrides = {}) {
  return {
    schemaVersion: 3,
    established: true,
    lastHealthyAt: 9_500,
    lastCompleteRevision: "rev-old",
    lastPublisherDeviceId: "publisher-old",
    lastResetEpoch: 0,
    personalTombstones: [],
    workTombstones: [],
    lossState: "none",
    lossDetectedAt: 0,
    recoveryEligibleAt: 0,
    recoveryAttempts: 0,
    lastRecoveredAt: 0,
    ...overrides
  };
}

test("1.30.18.24 continuity normalization is .23-equivalent", () => {
  const owner = continuity();
  const now = 10_000;
  const raw = {
    established: "not-explicit",
    lastHealthyAt: "9500",
    lastCompleteRevision: 17,
    lastPublisherDeviceId: "publisher",
    lastResetEpoch: "8",
    personalTombstones: [
      { schemaVersion: 0, kind: "deleted", id: "b", deletedAt: 9_200, modifiedAt: 4, deviceId: 7 },
      { schemaVersion: 4, kind: "deleted", id: "a", deletedAt: 9_100, modifiedAt: 4, deviceId: "dev" },
      { schemaVersion: 4, kind: "deleted", id: "b", deletedAt: 9_900, modifiedAt: 99, deviceId: "duplicate" },
      { schemaVersion: 4, kind: "deleted", id: "expired", deletedAt: 8_999, modifiedAt: 100, deviceId: "dev" },
      { schemaVersion: 4, kind: "live", id: "live", deletedAt: 9_900, modifiedAt: 100, deviceId: "dev" }
    ],
    workTombstones: [],
    lossState: "unknown",
    lossDetectedAt: "12",
    recoveryEligibleAt: Infinity,
    recoveryAttempts: 99,
    lastRecoveredAt: "15"
  };
  const meta = { syncEnabled: true, syncInitialized: true, lastSyncAt: 1 };

  assert.deepEqual(owner.normalizeSyncContinuity(raw, meta, now), {
    schemaVersion: 3,
    established: true,
    lastHealthyAt: 9_500,
    lastCompleteRevision: "",
    lastPublisherDeviceId: "publisher",
    lastResetEpoch: 8,
    personalTombstones: [
      { schemaVersion: 4, kind: "deleted", id: "a", deletedAt: 9_100, modifiedAt: 4, deviceId: "dev" },
      { schemaVersion: 9, kind: "deleted", id: "b", deletedAt: 9_200, modifiedAt: 4, deviceId: "" }
    ],
    workTombstones: [],
    lossState: "none",
    lossDetectedAt: 12,
    recoveryEligibleAt: 0,
    recoveryAttempts: 3,
    lastRecoveredAt: 15
  });
  assert.equal(owner.normalizeSyncContinuity({ established: false }, meta, now).established, false,
    "an explicit false remains authoritative over inferred continuity");
});

test("1.30.18.24 tombstone retention stays bounded, deterministic, and record-map compatible", () => {
  const owner = continuity();
  const records = new Map([
    ["z", { kind: "deleted", id: "z", deletedAt: 9_900, modifiedAt: 2, deviceId: "d" }],
    ["a", { kind: "deleted", id: "a", deletedAt: 9_900, modifiedAt: 5, deviceId: "d" }],
    ["b", { kind: "deleted", id: "b", deletedAt: 9_900, modifiedAt: 4, deviceId: "d" }],
    ["c", { kind: "deleted", id: "c", deletedAt: 9_900, modifiedAt: 3, deviceId: "d" }]
  ]);
  assert.deepEqual(owner.continuityTombstonesFromRecords(records, 10_000).map(entry => entry.id), ["a", "b", "c"]);
});

test("1.30.18.24 stale penalty and device jitter remain deterministic", () => {
  const owner = continuity();
  assert.equal(owner.recoveryStalePenalty({ lastHealthyAt: 0 }, 10_000), 600);
  assert.equal(owner.recoveryStalePenalty({ lastHealthyAt: 7_999 }, 10_000), 600);
  assert.equal(owner.recoveryStalePenalty({ lastHealthyAt: 8_500 }, 10_000), 300);
  assert.equal(owner.recoveryStalePenalty({ lastHealthyAt: 9_001 }, 10_000), 0);
  assert.equal(owner.recoveryDeviceJitter("device-a"), Number.parseInt(fnv1a("device-a"), 16) % 97);
  assert.equal(owner.recoveryDeviceJitter(""), Number.parseInt(fnv1a("mosaicsync"), 16) % 97);
  assert.equal(continuity({ jitterMs: 0 }).recoveryDeviceJitter("device-a"), 0);
});

test("1.30.18.24 loss quarantine planning preserves .23 timing and state", () => {
  const owner = continuity();
  const current = healthy({ lastHealthyAt: 8_500 });
  const plan = owner.planLossQuarantine(current, "device-a", 10_000);
  const expectedAt = 10_000 + 200 + 300 + owner.recoveryDeviceJitter("device-a");
  assert.equal(plan.alarmAt, expectedAt);
  assert.deepEqual(plan.continuity, {
    ...current,
    lossState: "quarantine",
    lossDetectedAt: 10_000,
    recoveryEligibleAt: expectedAt,
    recoveryAttempts: 0
  });
});

test("1.30.18.24 persisted startup warmup is applied only to due active loss states", () => {
  const owner = continuity();
  const due = healthy({ lossState: "recovering", recoveryEligibleAt: 9_999, recoveryAttempts: 1 });
  assert.deepEqual(owner.planStartupRecoveryDeferral(due, 10_000), {
    continuity: { ...due, recoveryEligibleAt: 10_500 },
    alarmAt: 10_500
  });
  assert.equal(owner.planStartupRecoveryDeferral({ ...due, recoveryEligibleAt: 10_001 }, 10_000), null);
  assert.equal(owner.planStartupRecoveryDeferral({ ...due, lossState: "failed" }, 10_000), null);
  assert.equal(owner.planStartupRecoveryDeferral({ ...due, established: false }, 10_000), null);
});

test("1.30.18.24 healthy and intentional-reset transitions preserve .23 field ownership", () => {
  const owner = continuity();
  const current = healthy({
    lossState: "recovering",
    lossDetectedAt: 8_000,
    recoveryEligibleAt: 10_000,
    recoveryAttempts: 2,
    personalTombstones: [{ id: "p" }],
    workTombstones: [{ id: "w" }],
    lastResetEpoch: 7
  });
  assert.deepEqual(owner.planHealthyContinuity(current, {
    revision: "rev-new",
    publisherDeviceId: "publisher-new",
    personalTombstones: []
  }, 11_000), {
    ...current,
    established: true,
    lastHealthyAt: 11_000,
    lastCompleteRevision: "rev-new",
    lastPublisherDeviceId: "publisher-new",
    personalTombstones: [],
    lossState: "none",
    lossDetectedAt: 0,
    recoveryEligibleAt: 0,
    recoveryAttempts: 0
  });
  assert.deepEqual(owner.planIntentionalReset(current, 6), {
    ...current,
    established: false,
    lastResetEpoch: 7,
    personalTombstones: [],
    workTombstones: [],
    lossState: "none",
    lossDetectedAt: 0,
    recoveryEligibleAt: 0,
    recoveryAttempts: 0
  });
});

test("1.30.18.24 attempt, retry, exhaustion, and recovered transitions are .23-equivalent", () => {
  const owner = continuity();
  const current = healthy({ lossState: "quarantine", recoveryEligibleAt: 10_000, recoveryAttempts: 1 });
  assert.equal(owner.recoveryReadiness({ ...current, lossState: "failed" }, 10_000), "failed");
  assert.equal(owner.recoveryReadiness({ ...current, recoveryEligibleAt: 10_001 }, 10_000), "wait");
  assert.equal(owner.recoveryReadiness(current, 10_000), "attempt");

  const attempt = owner.planRecoveryAttempt(current, 10_000);
  assert.deepEqual(attempt, {
    attempt: 2,
    continuity: { ...current, lossState: "recovering", recoveryAttempts: 2, recoveryEligibleAt: 10_400 }
  });
  const retry = owner.planRecoveryFailure(attempt.continuity, attempt.attempt, "device-a", 11_000);
  assert.equal(retry.failed, false);
  assert.equal(retry.alarmAt, 11_000 + 200 + owner.recoveryDeviceJitter("device-a"));
  assert.deepEqual(retry.continuity, {
    ...attempt.continuity,
    lossState: "quarantine",
    recoveryEligibleAt: retry.alarmAt,
    recoveryAttempts: 2
  });

  const exhausted = owner.planRecoveryFailure({ ...attempt.continuity, recoveryAttempts: 3 }, 3, "device-a", 12_000);
  assert.deepEqual(exhausted, {
    failed: true,
    alarmAt: 0,
    continuity: { ...attempt.continuity, recoveryAttempts: 3, lossState: "failed", recoveryEligibleAt: 0 }
  });
  assert.deepEqual(owner.planRecoverySuccess(healthy(), 12_000), { ...healthy(), lastRecoveredAt: 12_000 });
});

test("1.30.18.24 recovery transition decisions survive an MV3 worker restart", () => {
  const beforeRestart = continuity().planRecoveryAttempt(
    healthy({ lossState: "quarantine", recoveryEligibleAt: 10_000, recoveryAttempts: 0 }),
    10_000
  );
  const persisted = JSON.parse(JSON.stringify(beforeRestart.continuity));
  const afterRestart = continuity();
  assert.equal(afterRestart.recoveryReadiness(persisted, 10_399), "wait");
  assert.equal(afterRestart.recoveryReadiness(persisted, 10_400), "attempt");
  assert.deepEqual(afterRestart.planRecoveryAttempt(persisted, 10_400), {
    attempt: 2,
    continuity: { ...persisted, lossState: "recovering", recoveryAttempts: 2, recoveryEligibleAt: 10_800 }
  });
});

test("1.30.18.24 continuity boundary is pure and browser effects remain orchestrated", () => {
  const module = fs.readFileSync("src/shared/background/recovery-continuity.js", "utf8");
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.doesNotMatch(module, /browser\.|storage\.|Date\.now|setTimeout|alarms\.|bootstrapLocal|writeLocalMeta|pending.*mutation/i);
  assert.match(core, /import \{ createRecoveryContinuity \} from "\.\/recovery-continuity\.js";/);
  assert.match(core, /await browser\.storage\.local\.get\(LOCAL_SYNC_CONTINUITY_KEY\)/);
  assert.match(core, /await browser\.storage\.local\.set\(\{ \[LOCAL_SYNC_CONTINUITY_KEY\]: next \}\)/);
  assert.match(core, /const firstCoreCheck = await browser\.storage\.sync\.get\(null\)[\s\S]*?hasLiveSyncCoreSignal\(firstCoreCheck\)[\s\S]*?const secondCoreCheck = await browser\.storage\.sync\.get\(null\)[\s\S]*?hasLiveSyncCoreSignal\(secondCoreCheck\)[\s\S]*?planLossQuarantine\(/,
    "live shared-core absence must be double-confirmed before quarantine planning");
  assert.match(core, /planRecoveryAttempt\([\s\S]*?await writeSyncContinuity\([\s\S]*?await writeSyncRecoveryStatus\("recovering"\)[\s\S]*?await bootstrapLocal\(/,
    "restart grace must be durable before Recovery publication starts");
  assert.match(core, /await bootstrapLocal\([\s\S]*?retryPendingCrossSpaceSync\([\s\S]*?retryPendingLocalSyncMutation\([\s\S]*?getSyncStatus\(\)/,
    "publication, pending replay, and post-publication verification remain in the orchestrator");
});

test("1.30.18.24 generated Firefox and Chromium continuity owners are byte-identical", () => {
  const firefox = fs.readFileSync("dist/firefox/background/recovery-continuity.js");
  const chrome = fs.readFileSync("dist/chrome/background/recovery-continuity.js");
  assert.deepEqual(chrome, firefox);
});
