import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = 1_800_000_000_000;

function shortcut(id, modifiedAt, extra = {}) {
  return {
    type: "shortcut",
    id,
    title: id,
    url: `https://${id}.example/`,
    image: "",
    imageSyncData: "",
    imageSyncKind: "none",
    imageSourceKind: "none",
    imageStyle: "contain",
    position: 0,
    createdAt: 1,
    modifiedAt,
    source: "manual",
    ...extra
  };
}

function profile({ personalClock = 10, workClock = 20, settingsClock = null } = {}) {
  const settingsClockValue = value => Object.fromEntries(
    constants.SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [value, ""]])
  );
  return model.normalizeState({
    schemaVersion: constants.STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [shortcut("shared", personalClock)],
        settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Personal" },
        settingsClock: settingsClockValue(settingsClock ?? personalClock),
        settingsModifiedAt: personalClock,
        updatedAt: personalClock
      },
      work: {
        shortcuts: [shortcut("work", workClock)],
        settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Work" },
        settingsClock: settingsClockValue(settingsClock ?? workClock),
        settingsModifiedAt: workClock,
        updatedAt: workClock
      }
    }
  });
}

function extractLegacyStamp() {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = source.indexOf("function stampImportedProfileState(importedState)");
  if (start < 0) return null;
  const end = source.indexOf("\n  function paintBrandIdentity", start);
  assert.ok(end > start, "legacy New Tab import stamp function must be extractable");
  const functionSource = source.slice(start, end).trim();
  return vm.runInNewContext(`(${functionSource})`, {
    normalizeState: model.normalizeState,
    nextMutationTime: model.nextMutationTime,
    SPACE_IDS: constants.SPACE_IDS,
    SETTINGS_SYNC_CLOCK_KEYS: constants.SETTINGS_SYNC_CLOCK_KEYS
  });
}

function stampImported(imported, current = null) {
  if (typeof model.stampImportedProfileState === "function") {
    return model.stampImportedProfileState(imported, current);
  }
  const legacy = extractLegacyStamp();
  assert.equal(typeof legacy, "function", "an import stamping implementation must exist");
  return legacy(imported, current);
}

async function withFixedNow(callback) {
  const original = Date.now;
  Date.now = () => FIXED_NOW;
  try {
    return await callback();
  } finally {
    Date.now = original;
  }
}

function maxProfileClock(state) {
  let newest = 0;
  for (const spaceId of constants.SPACE_IDS) {
    const workspace = state.spaces[spaceId];
    newest = Math.max(newest, workspace.updatedAt, workspace.settingsModifiedAt);
    for (const stamp of Object.values(workspace.settingsClock || {})) newest = Math.max(newest, Number(stamp?.[0]) || 0);
    for (const item of workspace.shortcuts || []) {
      newest = Math.max(newest, Number(item.modifiedAt) || 0, Number(item.spaceMoveAt) || 0);
      for (const child of item.items || []) newest = Math.max(newest, Number(child.modifiedAt) || 0, Number(child.spaceMoveAt) || 0);
    }
  }
  return newest;
}

test("1.33.0.39 hostile imported clocks near MAX_SAFE_INTEGER cannot exhaust later edits", async () => {
  await withFixedNow(() => {
    const poisoned = profile({
      personalClock: model.MAX_LOGICAL_TIME - 1,
      workClock: model.MAX_LOGICAL_TIME - 2,
      settingsClock: model.MAX_LOGICAL_TIME - 1
    });
    const stamped = stampImported(poisoned, profile({ personalClock: 100, workClock: 200 }));
    const stampedMax = maxProfileClock(stamped);
    assert.ok(stampedMax < model.MAX_LOGICAL_TIME - 1, "untrusted imported clocks must not push authoritative state to the logical ceiling");
    assert.doesNotThrow(() => model.nextMutationTime(stampedMax), "the first edit after import must remain possible");
    assert.ok(model.nextMutationTime(stampedMax) > stampedMax);
  });
});

test("1.33.0.39 imported replacement outranks the current profile even when current clocks are ahead of wall time", async () => {
  await withFixedNow(() => {
    const currentFuture = FIXED_NOW + 30 * DAY_MS;
    const current = profile({ personalClock: currentFuture, workClock: currentFuture + 100 });
    const imported = profile({ personalClock: 50, workClock: 60 });
    const stamped = stampImported(imported, current);
    assert.ok(maxProfileClock(stamped) > maxProfileClock(current), "whole-profile import must be newer than the authoritative profile it replaces");
  });
});

test("1.33.0.39 import authority observes per-group Settings clocks and both Spaces", async () => {
  await withFixedNow(() => {
    const current = profile({ personalClock: 100, workClock: 200 });
    const farButLegitimate = FIXED_NOW + 45 * DAY_MS;
    current.spaces.work.settingsClock = Object.fromEntries(
      constants.SETTINGS_SYNC_CLOCK_KEYS.map((key, index) => [key, [farButLegitimate + index, "deadbeef"]])
    );
    current.spaces.work.settingsModifiedAt = 200;
    current.spaces.work.updatedAt = 200;
    const stamped = stampImported(profile({ personalClock: 10, workClock: 20 }), current);
    assert.ok(maxProfileClock(stamped) > farButLegitimate + constants.SETTINGS_SYNC_CLOCK_KEYS.length - 1,
      "an imported replacement must outrank current fine-grained Settings authority too");
  });
});

test("1.33.0.39 imported namespace authority rebases hostile or older spaceMoveAt without adding markers gratuitously", async () => {
  await withFixedNow(() => {
    const currentMove = FIXED_NOW + 40 * DAY_MS;
    const current = profile({ personalClock: 100, workClock: 200 });
    current.spaces.personal.shortcuts[0].spaceMoveAt = currentMove;

    const imported = profile({ personalClock: 10, workClock: 20 });
    imported.spaces.personal.shortcuts[0].spaceMoveAt = model.MAX_LOGICAL_TIME - 1;
    const stamped = stampImported(imported, current);
    const importedShortcut = stamped.spaces.personal.shortcuts.find(item => item.id === "shared");
    assert.ok(importedShortcut.spaceMoveAt > currentMove, "the imported namespace generation must outrank the current same-ID record");
    assert.ok(importedShortcut.spaceMoveAt < model.MAX_LOGICAL_TIME - 1, "hostile imported move clocks must be rebased away from the ceiling");

    const clean = stampImported(profile({ personalClock: 10, workClock: 20 }), profile({ personalClock: 100, workClock: 200 }));
    assert.equal(clean.spaces.personal.shortcuts.find(item => item.id === "shared").spaceMoveAt, 0,
      "imports must not add namespace markers to shortcuts that have never crossed Spaces");

    const currentRecord = model.flattenStateNormalized(model.workspaceStateNormalized(current, "personal"), "current").get("shared");
    const importedRecord = model.flattenStateNormalized(model.workspaceStateNormalized(stamped, "personal"), "import").get("shared");
    assert.equal(model.chooseNewerRecord(currentRecord, importedRecord), importedRecord,
      "deterministic Sync ordering must choose the explicit imported namespace authority");
  });
});

test("1.33.0.39 reasonable imported future clocks retain ordering authority instead of being flattened unnecessarily", async () => {
  await withFixedNow(() => {
    const legitimateFuture = FIXED_NOW + 90 * DAY_MS;
    const imported = profile({ personalClock: legitimateFuture, workClock: legitimateFuture + 10 });
    const stamped = stampImported(imported, profile({ personalClock: 100, workClock: 200 }));
    assert.ok(maxProfileClock(stamped) > legitimateFuture + 10,
      "reasonable clock skew in a legitimate exported profile should still influence the replacement stamp");
    assert.doesNotThrow(() => model.nextMutationTime(maxProfileClock(stamped)));
  });
});

test("1.33.0.39 New Tab and Welcome profile imports share the model-owned trust boundary and include current state", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const welcome = fs.readFileSync("src/shared/welcome/welcome.js", "utf8");

  assert.match(newtab, /stampImportedProfileState\(parsedState,\s*loaded\.state\)/,
    "normal profile import must stamp against the current authoritative profile");
  assert.doesNotMatch(newtab, /function stampImportedProfileState\(/,
    "New Tab must not own a second private clock-trust implementation");

  assert.match(welcome, /stampImportedProfileState\(parsed\.state,\s*loaded\.state\)/,
    "Welcome profile import must stamp against the local profile it can replace");
  assert.doesNotMatch(welcome, /function stampImportedProfileState\(/,
    "Welcome must use the same model-owned clock-trust implementation");
});

test("1.33.0.39 trust-boundary regression is owned by Startup, New Tab, Sync, Security, Core and Release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  const file = "tests/trust-boundary-133039.test.mjs";
  for (const group of ["startup", "newtab", "sync", "security", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes(file), `${group} must own ${file}`);
  }
});
