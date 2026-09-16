import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { ERROR_CODES } from "../src/shared/core/errors.js";
import { DEFAULT_STATE, SYNC_CONTINUITY_SCHEMA_VERSION, SYNC_QUOTA_MAX_ITEMS, SYNC_RECOVERY_MAX_ATTEMPTS, TOMBSTONE_TTL_MS } from "../src/shared/core/constants.js";
import { normalizeState, stableStringify } from "../src/shared/core/model.js";
import { createProfilePackage, parseProfilePackage } from "../src/shared/core/profile.js";
import { safeShortcutNavigationUrl } from "../src/shared/newtab/ui-utils.js";
import { createRecoveryContinuity } from "../src/shared/background/recovery-continuity.js";
import { caseLabel, createSeededRandom, randomJsonish } from "./harness/deterministic-fuzz.mjs";

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

function compareStableText(left, right) {
  const a = String(left ?? ""), b = String(right ?? "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function checksumBody(body) {
  return createHash("sha256").update(stableStringify(body)).digest("hex");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const PROFILE_ERROR_CODES = new Set(Object.values(ERROR_CODES).filter(code => code.startsWith("PROFILE_")));

test("1.30.18.36 seeded state fuzzing normalizes hostile JSON-ish values without prototype pollution", () => {
  const seed = 0x13018360;
  const rng = createSeededRandom(seed);
  delete Object.prototype.mosaicsyncFuzzPolluted;

  for (let index = 0; index < 600; index += 1) {
    const raw = randomJsonish(rng);
    const first = normalizeState(raw);
    const second = normalizeState(first);
    const label = caseLabel(seed, index);

    assert.equal(first?.schemaVersion, second?.schemaVersion, label);
    assert.ok(first?.spaces?.personal && first?.spaces?.work, label);
    assert.ok(Array.isArray(first.spaces.personal.shortcuts), label);
    assert.ok(Array.isArray(first.spaces.work.shortcuts), label);
    assert.equal(first.shortcuts, first.spaces[first.activeSpaceId].shortcuts, label);
    assert.deepEqual(second, first, `${label} normalizeState must become idempotent after first normalization`);
    assert.equal(Object.prototype.mosaicsyncFuzzPolluted, undefined, `${label} must not pollute Object.prototype`);
  }
});

test("1.30.18.36 seeded profile-import fuzzing fails closed or returns normalized data with controlled errors", async () => {
  const seed = 0x13018361;
  const rng = createSeededRandom(seed);
  const valid = await createProfilePackage(DEFAULT_STATE, { uiLocale: "auto" });

  for (let index = 0; index < 240; index += 1) {
    const label = caseLabel(seed, index);
    let candidate;
    if (index % 2 === 0) {
      candidate = randomJsonish(rng);
    } else {
      candidate = cloneJson(valid);
      candidate.profile.state = randomJsonish(rng);
      candidate.profile.assets = {};
      const { integrity: _ignored, ...body } = candidate;
      candidate.integrity = { algorithm: "SHA-256", value: checksumBody(body) };
    }
    const text = JSON.stringify(candidate) ?? "undefined";
    try {
      const parsed = await parseProfilePackage(text);
      assert.ok(parsed?.state?.spaces?.personal && parsed?.state?.spaces?.work, `${label} accepted profile must normalize both Spaces`);
      assert.deepEqual(normalizeState(parsed.state), parsed.state, `${label} accepted profile must already be normalized`);
    } catch (error) {
      assert.ok(PROFILE_ERROR_CODES.has(error?.code), `${label} unexpected profile error ${error?.name || "Error"}: ${error?.message || error}`);
    }
  }
});

test("1.30.18.36 seeded Recovery continuity fuzzing preserves bounded deterministic persisted-state invariants", () => {
  const seed = 0x13018362;
  const rng = createSeededRandom(seed);
  const owner = createRecoveryContinuity({ compareStableText, fnv1a });
  const validLossStates = new Set(["none", "quarantine", "recovering", "failed"]);

  for (let index = 0; index < 800; index += 1) {
    const now = 1_800_000_000_000 + rng.int(0, 1_000_000);
    const raw = randomJsonish(rng);
    const meta = randomJsonish(rng);
    const normalized = owner.normalizeSyncContinuity(raw, meta, now);
    const repeated = owner.normalizeSyncContinuity(raw, meta, now);
    const label = caseLabel(seed, index);

    assert.deepEqual(repeated, normalized, `${label} continuity normalization must be deterministic`);
    assert.equal(normalized.schemaVersion, SYNC_CONTINUITY_SCHEMA_VERSION, label);
    assert.ok(validLossStates.has(normalized.lossState), label);
    assert.ok(Number.isFinite(normalized.recoveryAttempts), label);
    assert.ok(normalized.recoveryAttempts >= 0 && normalized.recoveryAttempts <= SYNC_RECOVERY_MAX_ATTEMPTS, label);

    for (const field of ["lastHealthyAt", "lastResetEpoch", "lossDetectedAt", "recoveryEligibleAt", "lastRecoveredAt"]) {
      assert.ok(Number.isFinite(normalized[field]), `${label} ${field} must be finite`);
    }

    for (const field of ["personalTombstones", "workTombstones"]) {
      const tombstones = normalized[field];
      assert.ok(tombstones.length <= SYNC_QUOTA_MAX_ITEMS, `${label} ${field} must stay bounded`);
      assert.equal(new Set(tombstones.map(entry => entry.id)).size, tombstones.length, `${label} ${field} ids must be unique`);
      for (let tombstoneIndex = 0; tombstoneIndex < tombstones.length; tombstoneIndex += 1) {
        const entry = tombstones[tombstoneIndex];
        assert.equal(entry.kind, "deleted", label);
        assert.ok(entry.id, label);
        assert.ok(Number.isFinite(entry.deletedAt) && entry.deletedAt >= now - TOMBSTONE_TTL_MS, label);
        assert.ok(Number.isFinite(entry.modifiedAt), label);
        if (tombstoneIndex > 0) {
          const prior = tombstones[tombstoneIndex - 1];
          assert.ok(prior.modifiedAt > entry.modifiedAt || (prior.modifiedAt === entry.modifiedAt && compareStableText(prior.id, entry.id) <= 0),
            `${label} ${field} must preserve deterministic sort order`);
        }
      }
    }
  }
});

test("1.30.18.36 seeded navigation fuzzing never upgrades a non-HTTP(S) input into an allowed destination", () => {
  const seed = 0x13018363;
  const rng = createSeededRandom(seed);
  const schemes = ["javascript", "data", "file", "ftp", "about", "moz-extension", "chrome-extension", "ws", "wss", "blob", "mailto"];

  for (let index = 0; index < 1_000; index += 1) {
    const label = caseLabel(seed, index);
    let input;
    if (index % 4 === 0) {
      input = `https://example${rng.int(0, 999)}.com/path/${rng.int(0, 999)}?q=${rng.int(0, 999)}`;
    } else if (index % 4 === 1) {
      input = `http://localhost:${rng.int(1_024, 65_535)}/x/${rng.int(0, 999)}`;
    } else if (index % 4 === 2) {
      input = `${rng.pick(schemes)}:${String(randomJsonish(rng) ?? "payload")}`;
    } else {
      input = String(randomJsonish(rng) ?? "");
    }

    const result = safeShortcutNavigationUrl(input);
    if (!result) continue;
    const parsed = new URL(result);
    assert.ok(parsed.protocol === "http:" || parsed.protocol === "https:", `${label} returned forbidden protocol ${parsed.protocol}`);
    assert.ok(input.length <= 2048, `${label} oversized input must not be accepted`);
  }
});
