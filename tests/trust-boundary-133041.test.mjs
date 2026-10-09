import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;
const constants = await import("../src/shared/core/constants.js");
const model = await import("../src/shared/core/model.js");
const storage = await import("../src/shared/core/storage.js");
const FIXED_NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function shortcut(id, clock, spaceMoveAt = 0) {
  return { type: "shortcut", id, title: id, url: `https://${id}.example/`, createdAt: 1,
    modifiedAt: clock, spaceMoveAt, source: "manual", image: "", imageSyncData: "", imageSyncKind: "none", imageSourceKind: "none", position: 0 };
}
function profile(clock = 100, label = "healthy") {
  return model.normalizeState({
    schemaVersion: constants.STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: {
      personal: { shortcuts: [shortcut("shared", clock, clock)], settings: { ...constants.DEFAULT_SETTINGS, spaceName: label },
        settingsModifiedAt: clock, updatedAt: clock,
        settingsClock: Object.fromEntries(constants.SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [clock, ""]])) },
      work: { shortcuts: [shortcut("work", clock)], settings: { ...constants.DEFAULT_SETTINGS },
        settingsModifiedAt: clock, updatedAt: clock,
        settingsClock: Object.fromEntries(constants.SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [clock, ""]])) }
    }
  });
}
function maxClock(state) {
  let result = 0;
  for (const id of constants.SPACE_IDS) {
    const workspace = state.spaces[id];
    result = Math.max(result, workspace.updatedAt, workspace.settingsModifiedAt);
    for (const item of workspace.shortcuts) {
      result = Math.max(result, item.modifiedAt, item.spaceMoveAt || 0);
      for (const child of item.items || []) result = Math.max(result, child.modifiedAt, child.spaceMoveAt || 0);
    }
    for (const clock of Object.values(workspace.settingsClock)) result = Math.max(result, clock[0]);
  }
  return result;
}
async function frozen(callback) {
  const original = Date.now;
  Date.now = () => FIXED_NOW;
  try { return await callback(); } finally { Date.now = original; }
}

test("1.33.0.41 explicit import recovers an already exhausted local profile, including Settings and cross-Space clocks", async () => {
  await frozen(() => {
    const current = profile(model.MAX_LOGICAL_TIME);
    const imported = profile(20, "Restored");
    const result = model.stampImportedProfileState(imported, current);
    assert.ok(maxClock(result) <= FIXED_NOW + 366 * DAY + 1, "poisoned stored clocks cannot become new authority");
    assert.doesNotThrow(() => model.nextMutationTime(maxClock(result)), "normal editing must work after restoring a healthy backup");
    assert.equal(result.spaces.personal.shortcuts[0].spaceMoveAt, maxClock(result), "existing namespace markers are preserved and rebased");
    assert.equal(result.spaces.personal.settings.spaceName, "Restored");
  });
});

test("1.33.0.41 import recovers nearly exhausted clocks with headroom, while legitimate current future authority remains ordered", async () => {
  await frozen(() => {
    const recovered = model.stampImportedProfileState(profile(10), profile(model.MAX_LOGICAL_TIME - 1));
    assert.ok(model.MAX_LOGICAL_TIME - maxClock(recovered) > 100_000, "an almost exhausted profile must not just gain one further edit");
    const legitimate = FIXED_NOW + 90 * DAY;
    const stamped = model.stampImportedProfileState(profile(10), profile(legitimate));
    assert.ok(maxClock(stamped) > legitimate, "plausible local future clocks retain causal ordering");
  });
});

function extractFunction(source, name) {
  const signature = `async function ${name}(`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${name}`);
  const body = source.indexOf("{", start);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("unterminated helper");
}

test("1.33.0.41 deliberate cloud replacement can publish over poisoned Sync clocks without relaxing normal Sync", async () => {
  await frozen(() => {
    const candidate = profile(20);
    const remotePoison = model.MAX_LOGICAL_TIME;
    assert.throws(() => model.nextMutationTime(candidate.spaces.personal.updatedAt, remotePoison), RangeError,
      "ordinary mutation/Sync remains fail-closed on exhausted authority");
    const timestamp = model.nextProfileImportMutationTime(candidate.spaces.personal.updatedAt, remotePoison);
    assert.ok(timestamp < model.MAX_LOGICAL_TIME - 100_000);
    assert.doesNotThrow(() => model.nextMutationTime(timestamp), "post-import publication leaves edit headroom");
    const reasonableRemote = FIXED_NOW + 45 * DAY;
    assert.ok(model.nextProfileImportMutationTime(10, reasonableRemote) > reasonableRemote,
      "manual replacement still honors plausible cloud authority");
  });
  const background = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(background, /profileImport \? nextProfileImportMutationTime : nextMutationTime/,
    "authoritative publication must use import-specific recovery boundary");
  assert.match(background, /publishWorkspaceAuthoritative\(state, meta, WORK_SPACE_ID, \{ retainedTombstones: retainedWorkTombstones, profileImport \}\)/);
  assert.match(newtab, /if \(meta\?\.syncEnabled && meta\?\.syncInitialized\) \{\s*const published = await sendSyncMessage\("mosaicsync:bootstrap-local", \{ profileImport: true \}\)/,
    "only the confirmed import action may opt into poisoned-cloud recovery");
  assert.match(newtab, /const response = await sendSyncMessage\("mosaicsync:bootstrap-local"\);/,
    "the routine Use This Device Sync authority action must retain strict clock semantics");
});

test("1.33.0.41 skewed existing or cloud clocks remain causal authority, while hostile backup clocks cannot", async () => {
  await frozen(() => {
    const skewed = FIXED_NOW + 400 * DAY;
    const imported = profile(skewed, "Backup with untrusted 400-day clock");
    const current = profile(skewed, "Local device clock 400 days ahead");
    const healthy = profile(20, "Healthy imported backup");
    const restored = model.stampImportedProfileState(healthy, current);
    assert.ok(maxClock(restored) > skewed, "import must outrank a real device clock 400 days ahead");
    assert.ok(model.nextProfileImportMutationTime(FIXED_NOW, skewed) > skewed,
      "explicit cloud publication must outrank a real 400-day skew, including another device's writes");
    const rejectedBackupClock = model.stampImportedProfileState(imported, profile(20));
    assert.ok(maxClock(rejectedBackupClock) < skewed,
      "imported file clocks are still untrusted beyond 366 days");
    const impossible = model.MAX_LOGICAL_TIME;
    assert.ok(model.nextProfileImportMutationTime(FIXED_NOW, impossible) < impossible - 100_000,
      "a mathematically impossible stored/cloud clock cannot exhaust the restore");
  });
});

test("1.33.0.41 import commits use the examined durable snapshot guard, without relaxing normal Sync", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const background = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(newtab, /const preparedImport = await prepareProfileImportAgainstLocalAuthority\(parsed\.state\)/);
  assert.match(newtab, /writeLocalStateWithBaseline\(importedState,\s*\{\s*recordSyncMutation:\s*true,\s*requireUnchangedCompactState:\s*preparedImport\.compactBaseline/,
    "New Tab must pass the examined snapshot into the committing storage transaction");
  assert.match(newtab, /sendSyncMessage\("mosaicsync:bootstrap-local", \{ profileImport: true \}\)/,
    "only confirmed imports opt into the special Sync publication rule");
  assert.match(newtab, /sendSyncMessage\("mosaicsync:bootstrap-local"\)/,
    "ordinary Use This Device action must not opt in");
  const publications = [...background.matchAll(/\(profileImport \? nextProfileImportMutationTime : nextMutationTime\)\(/g)];
  assert.equal(publications.length, 2, "both Personal and Work publishers must scope the exception to actual imports");
  assert.match(background, /profileImport: message\.profileImport === true/,
    "the background dispatcher must not accidentally enable the exception by default");
});

test("1.33.0.41 New Tab profile import stamps a fresh persistent read, not stale in-memory state", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const calls = [];
  const context = vm.createContext({
    state: profile(100),
    async ensureLocalStorage(options) {
      calls.push(options);
      return { state: profile(FIXED_NOW + 28 * DAY), compactBaseline: { snapshot: "latest" } };
    },
    stampImportedProfileState: model.stampImportedProfileState,
    Object
  });
  vm.runInContext(extractFunction(source, "prepareProfileImportAgainstLocalAuthority"), context);
  await frozen(async () => {
    const prepared = await context.prepareProfileImportAgainstLocalAuthority(profile(10));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.hydrateAssets, "all");
    assert.ok(maxClock(prepared.importedState) > FIXED_NOW + 28 * DAY);
    assert.equal(prepared.compactBaseline.snapshot, "latest");
  });
  assert.match(source, /prepareProfileImportAgainstLocalAuthority\(parsed\.state\)/,
    "actual profile import handler must use the tested fresh-authority helper");
  assert.doesNotMatch(source, /stampImportedProfileState\(parsed\.state,\s*state\)/);
});

test("1.33.0.41 explicit import fails closed if another tab changes persisted state before commit", async () => {
  const raw = { state: profile(100) };
  const local = {
    async get(keys) {
      const data = { [constants.LOCAL_STATE_KEY]: raw.state, [constants.LOCAL_ACTIVE_SPACE_KEY]: "personal" };
      const result = {};
      for (const key of keys) if (Object.hasOwn(data, key)) result[key] = structuredClone(data[key]);
      return result;
    },
    async set(items) { if (Object.hasOwn(items, constants.LOCAL_STATE_KEY)) raw.state = structuredClone(items[constants.LOCAL_STATE_KEY]); },
    async remove() {}
  };
  const previousBrowser = globalThis.browser;
  globalThis.browser = { storage: { local } };
  try {
    // Import exactly the compact baseline that was examined before file staging.
    const original = structuredClone(raw.state);
    raw.state = profile(200, "Other tab edit");
    await assert.rejects(
      () => storage.writeLocalStateWithBaseline(profile(300, "New import"), {
        recordSyncMutation: true,
        requireUnchangedCompactState: original
      }),
      error => error?.code === "PROFILE_IMPORT_STALE_BASELINE"
    );
    assert.equal(raw.state.spaces.personal.settings.spaceName, "Other tab edit",
      "failed import must never overwrite newer durable edits");
  } finally { globalThis.browser = previousBrowser; }
});

test("1.33.0.41 new regression has canonical group ownership", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["startup", "newtab", "sync", "security", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/trust-boundary-133041.test.mjs"), group);
  }
});
