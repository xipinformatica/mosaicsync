// @kind behavioral
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import * as model from "../src/shared/core/model.js";
import { selectCoherentRestoreSource } from "../src/shared/background/sync-source-policy.js";
import { DEFAULT_SETTINGS, SETTINGS_SYNC_CLOCK_KEYS } from "../src/shared/core/constants.js";
globalThis.crypto ||= webcrypto;

const DAY = 86_400_000;
const FIXED = 1_800_000_000_000;
const ceiling = 8_640_000_000_000_000;
async function withClock(fn, clock = FIXED) {
  const original = Date.now;
  Date.now = () => clock;
  try { return await fn(); } finally { Date.now = original; }
}
function shortcut({ at = FIXED, moved = 0, url = "https://local.test/", deviceId = "a" } = {}) {
  return { kind: "shortcut", schemaVersion: 2, id: "clock-id", url, title: "Clock", createdAt: FIXED - DAY,
    modifiedAt: at, spaceMoveAt: moved, position: 0, deviceId };
}
function tombstone(at) {
  return { kind: "deleted", schemaVersion: 2, id: "clock-id", deletedAt: at, modifiedAt: at, deviceId: "z" };
}
function settings(spaceName, at, deviceId) {
  return { kind: "settings", schemaVersion: 11, settings: { ...DEFAULT_SETTINGS, spaceName },
    modifiedAt: at, deviceId,
    settingsClock: Object.fromEntries(SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [at, deviceId]])) };
}

test("1.33.0.97 remote MAX_SAFE and Date-ceiling shortcut cannot outrank legitimate local edit", () => withClock(() => {
  const local = shortcut();
  for (const at of [Number.MAX_SAFE_INTEGER, ceiling, ceiling - 1, FIXED + 403 * DAY]) {
    const hostile = shortcut({ at, deviceId: "z", url: "https://poison.test/" });
    assert.equal(model.chooseNewerRecord(local, hostile), local);
    assert.equal(model.chooseNewerRecord(hostile, local), local);
    assert.ok(model.nextMutationTime(at) < at);
  }
}));

test("1.33.0.97 remote invalid move and deletion clocks cannot permanently pin namespace", () => withClock(() => {
  const moved = shortcut({ moved: FIXED + 1, at: FIXED + 2 });
  for (const poison of [Number.MAX_SAFE_INTEGER, ceiling, FIXED + 403 * DAY]) {
    assert.equal(model.chooseNewerRecord(moved, tombstone(poison)), moved);
    assert.equal(model.chooseNewerRecord(shortcut(), tombstone(poison)).kind, "deleted",
      "ordinary stale edit never revives a deleted shortcut");
    assert.equal(model.chooseNewerRecord(moved, shortcut({ moved: poison, deviceId: "z" })), moved);
  }
}));

test("1.33.0.97 settings group clocks and whole-record poison do not beat healthy Settings", () => withClock(() => {
  const healthy = settings("Local", FIXED, "a");
  for (const poison of [Number.MAX_SAFE_INTEGER, ceiling, FIXED + 403 * DAY]) {
    const result = model.mergeSettingsRecords(healthy, settings("Poison", poison, "z"));
    assert.equal(result.settings.spaceName, "Local");
    assert.ok(result.modifiedAt < poison);
  }
}));

test("1.33.0.97 +400 day clock remains authoritative and logical successors remain strictly newer", () => withClock(() => {
  const future = FIXED + 400 * DAY;
  const real = shortcut({ at: future, deviceId: "b", url: "https://future.test/" });
  assert.equal(model.chooseNewerRecord(shortcut(), real), real);
  assert.equal(model.nextMutationTime(future), future + 1);
  const successor = shortcut({ at: future + 1, url: "https://edited.test/" });
  assert.equal(model.chooseNewerRecord(real, successor), successor);
  assert.ok(model.authoritativeLogicalTime(future + 1) !== null);
}));

test("1.33.0.97 moving window rejects outside clocks today and admits after time advances", async () => {
  const hostile = FIXED + 403 * DAY;
  await withClock(() => assert.equal(model.authoritativeLogicalTime(hostile), null));
  await withClock(() => assert.equal(model.authoritativeLogicalTime(hostile), hostile), FIXED + 2 * DAY);
});

test("1.33.0.97 poisoned dataset revisions become NaN rather than old revision 0", () => withClock(() => {
  const poisoned = model.authoritativeLogicalTime(Number.MAX_SAFE_INTEGER) ?? NaN;
  const good = model.authoritativeLogicalTime(FIXED + 400 * DAY) ?? NaN;
  const base = {
    atomicAvailable: true, liveComplete: true, atomicMatchesLive: false,
    atomicPreservesLiveDeletions: true, atomicModern: true, liveModern: true,
    atomic: { originDeviceId: "one", personalUpdatedAt: FIXED - DAY, workUpdatedAt: FIXED - DAY },
    live: { personalOriginDeviceId: "one", workOriginDeviceId: "one", personalUpdatedAt: poisoned, workUpdatedAt: poisoned }
  };
  assert.equal(selectCoherentRestoreSource(base), "live", "do not promote stale atomic recovery over untrusted live revision");
  assert.equal(selectCoherentRestoreSource({ ...base, live: { ...base.live, personalUpdatedAt: 0, workUpdatedAt: 0 } }), "atomic");
  assert.equal(selectCoherentRestoreSource({ ...base, atomic: { ...base.atomic, personalUpdatedAt: good, workUpdatedAt: good },
    live: { ...base.live, personalUpdatedAt: FIXED, workUpdatedAt: FIXED } }), "atomic");
}));

test("1.33.0.97 poisoned local state revision is not republished by reconstruction", () => withClock(() => {
  const workspace = model.normalizeState({ updatedAt: Number.MAX_SAFE_INTEGER, settingsModifiedAt: Number.MAX_SAFE_INTEGER,
    shortcuts: [{ type: "shortcut", id: "clock-id", url: "https://local.test/", title: "Local", position: 0,
      createdAt: FIXED, modifiedAt: FIXED, spaceMoveAt: 0 }], settings: { ...DEFAULT_SETTINGS } });
  const result = model.stateFromRecords(new Map([["clock-id", shortcut()]]), settings("Local", FIXED, "a"), workspace);
  assert.ok(result.spaces.personal.updatedAt < ceiling);
  assert.ok(result.spaces.personal.settingsModifiedAt < ceiling);
}));


test("1.33.0.97 a same-millisecond boundary edit stays provisional until peer time advances", async () => {
  const boundary = FIXED + 402 * DAY;
  await withClock(() => {
    assert.equal(model.authoritativeLogicalTime(boundary), boundary);
    const edit = model.nextMutationTime(boundary);
    assert.equal(edit, boundary + 1, "do not silently reuse the remote boundary clock");
    assert.equal(model.authoritativeLogicalTime(edit), null, "the successor must wait before publication");
    assert.equal(model.nextMutationTime(edit), boundary + 2, "another local edit remains monotonic while waiting");
  });
  await withClock(() => {
    assert.equal(model.authoritativeLogicalTime(boundary + 1), boundary + 1);
    assert.ok(model.nextMutationTime(boundary + 1) > boundary + 1);
  }, FIXED + 5);
});

test("1.33.0.97 background defers provisional journaled changes rather than acknowledging Sync", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(source, /async function deferProvisionalClockPublication\(meta\)/);
  assert.match(source, /syncStatus: "waiting"/);
  assert.match(source, /if \(result\?\.pending\) return \{ \.\.\.\(await readLocalMeta\(\)\), __clockBoundaryPending: true \};/);
  assert.match(source, /if \(!result\?\.pending\) await clearPendingLocalSyncMutation\(pending\.journalId\);/);
  assert.match(source, /if \(meta\?\.__clockBoundaryPending\) return \{ ok: true, pending: true/);
});
