import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");

const {
  VERSION,
  STATE_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  SETTINGS_SYNC_CLOCK_KEYS
} = constants;
const {
  makeSettingsRecordNormalized,
  mergeSettingsRecords,
  normalizeState,
  stampSettingsMutationClocks,
  stateFromRecords,
  stableStringify,
  workspaceStateNormalized
} = model;

function baseState(modifiedAt = 100) {
  return normalizeState({
    shortcuts: [],
    settings: { ...DEFAULT_SETTINGS },
    settingsModifiedAt: modifiedAt,
    updatedAt: modifiedAt
  });
}

function mutateSetting(state, field, value, timestamp) {
  const before = normalizeState(state);
  const next = structuredClone(before);
  next.spaces.personal.settings[field] = value;
  next.spaces.personal.settingsModifiedAt = timestamp;
  next.spaces.personal.updatedAt = Math.max(next.spaces.personal.updatedAt, timestamp);
  next.settings = next.spaces.personal.settings;
  next.settingsClock = next.spaces.personal.settingsClock;
  next.settingsModifiedAt = timestamp;
  next.updatedAt = Math.max(next.updatedAt, timestamp);
  return stampSettingsMutationClocks(before, next);
}

function mutatePair(state, changes, timestamp) {
  const before = normalizeState(state);
  const next = structuredClone(before);
  Object.assign(next.spaces.personal.settings, changes);
  next.spaces.personal.settingsModifiedAt = timestamp;
  next.spaces.personal.updatedAt = Math.max(next.spaces.personal.updatedAt, timestamp);
  next.settings = next.spaces.personal.settings;
  next.settingsClock = next.spaces.personal.settingsClock;
  next.settingsModifiedAt = timestamp;
  next.updatedAt = Math.max(next.updatedAt, timestamp);
  return stampSettingsMutationClocks(before, next);
}

function recordFor(state, deviceId) {
  return makeSettingsRecordNormalized(workspaceStateNormalized(state, "personal"), deviceId);
}

function applyRecord(record, local = baseState()) {
  return stateFromRecords(new Map(), record, local, new Map());
}

test("1.30.15 release and Settings clock schemas are explicit", () => {
  assert.equal(VERSION, "1.30.18.23");
  assert.equal(STATE_SCHEMA_VERSION, 19);
  assert.equal(SYNC_SCHEMA_VERSION, 11);
  assert.equal(SETTINGS_SYNC_CLOCK_KEYS.length, 17);
});

test("1.30.15 migrates an old whole Settings clock into every logical control clock", () => {
  const migrated = normalizeState({
    schemaVersion: 18,
    shortcuts: [],
    settings: { ...DEFAULT_SETTINGS, frequentlyVisitedEnabled: true },
    settingsModifiedAt: 777,
    updatedAt: 777
  });
  assert.equal(migrated.schemaVersion, 19);
  for (const key of SETTINGS_SYNC_CLOCK_KEYS) assert.deepEqual(migrated.settingsClock[key], [777, ""]);
});

test("1.30.15 Settings Sync record keeps device-local permission/icon preferences out", () => {
  const state = baseState();
  state.settings.autoSiteIcons = false;
  state.settings.webAccessPrompted = true;
  const record = recordFor(state, "device-a");
  assert.equal(Object.hasOwn(record.settings, "autoSiteIcons"), false);
  assert.equal(Object.hasOwn(record.settings, "webAccessPrompted"), false);
  assert.equal(Object.keys(record.settingsClock).length, 17);
});

test("1.30.15 stale tile-size edit cannot turn Frequently Visited back off", () => {
  const base = baseState();
  const pcA = mutateSetting(base, "frequentlyVisitedEnabled", true, 1000);
  const pcB = mutateSetting(base, "tileSize", 92, 1100);
  const merged = mergeSettingsRecords(recordFor(pcA, "pc-a"), recordFor(pcB, "pc-b"));
  assert.equal(merged.settings.frequentlyVisitedEnabled, true);
  assert.equal(merged.settings.tileSize, 92);
});

test("1.30.15 Frequently Visited Show and Count are independent decisions", () => {
  const base = baseState();
  const pcA = mutateSetting(base, "frequentlyVisitedEnabled", true, 1000);
  const pcB = mutateSetting(base, "frequentlyVisitedCount", 10, 1100);
  const merged = mergeSettingsRecords(recordFor(pcA, "pc-a"), recordFor(pcB, "pc-b"));
  assert.equal(merged.settings.frequentlyVisitedEnabled, true);
  assert.equal(merged.settings.frequentlyVisitedCount, 10);
});

test("1.30.15 columns and tile size merge independently", () => {
  const base = baseState();
  const pcA = mutateSetting(base, "columns", 10, 1000);
  const pcB = mutateSetting(base, "tileSize", 90, 1100);
  const merged = mergeSettingsRecords(recordFor(pcA, "pc-a"), recordFor(pcB, "pc-b"));
  assert.equal(merged.settings.columns, 10);
  assert.equal(merged.settings.tileSize, 90);
});

test("1.30.15 Light and Dark wallpaper controls no longer clobber each other", () => {
  const base = baseState();
  const pcA = mutateSetting(base, "lightBackgroundPreset", "aurora", 1000);
  const pcB = mutateSetting(base, "darkBackgroundPreset", "midnight", 1100);
  const merged = mergeSettingsRecords(recordFor(pcA, "pc-a"), recordFor(pcB, "pc-b"));
  assert.equal(merged.settings.lightBackgroundPreset, "aurora");
  assert.equal(merged.settings.darkBackgroundPreset, "midnight");
});

test("1.30.15 background color value and customized marker remain atomic", () => {
  const base = baseState();
  const pcA = mutatePair(base, { backgroundColor: "#112233", backgroundColorCustomized: true }, 1000);
  const pcB = mutatePair(base, { backgroundColor: "#445566", backgroundColorCustomized: false }, 1100);
  const merged = mergeSettingsRecords(recordFor(pcA, "pc-a"), recordFor(pcB, "pc-b"));
  assert.deepEqual(
    [merged.settings.backgroundColor, merged.settings.backgroundColorCustomized],
    ["#445566", false]
  );
});

test("1.30.15 same-setting equal-clock conflicts converge regardless of arrival order", () => {
  const base = baseState();
  const a = mutateSetting(base, "theme", "light", 1000);
  const b = mutateSetting(base, "theme", "dark", 1000);
  const ar = recordFor(a, "device-a");
  const br = recordFor(b, "device-b");
  const ab = mergeSettingsRecords(ar, br);
  const ba = mergeSettingsRecords(br, ar);
  assert.equal(ab.settings.theme, ba.settings.theme);
  assert.deepEqual(ab.settingsClock.t, ba.settingsClock.t);
});

test("1.30.18 explicit fine clocks outrank later legacy whole-record timestamps", () => {
  const base = baseState();
  const modern = mutateSetting(base, "rows", 7, 1000);
  const modernRecord = recordFor(modern, "new-device");
  const legacy = structuredClone(recordFor(base, "old-device"));
  delete legacy.settingsClock;
  legacy.schemaVersion = 10;
  legacy.modifiedAt = 5000;
  legacy.deviceId = "old-device";
  legacy.settings.rows = 6;
  legacy.settings.columns = 10;

  const merged = mergeSettingsRecords(modernRecord, legacy);
  const reversed = mergeSettingsRecords(legacy, modernRecord);
  assert.equal(merged.settings.rows, 7, "stale legacy rows must not revert an explicit modern edit");
  assert.equal(merged.settings.columns, base.settings.columns, "legacy whole-record writes cannot claim per-setting intent once fine clocks exist");
  assert.deepEqual(merged.settingsClock.r, modernRecord.settingsClock.r);
  assert.equal(stableStringify(reversed), stableStringify(merged), "mixed-version merge must remain arrival-order independent");
});

test("1.30.18 legacy same-value writes do not artificially advance fine clocks", () => {
  const base = baseState();
  const modern = mutateSetting(base, "theme", "light", 500);
  const modernRecord = recordFor(modern, "new-device");
  const legacy = structuredClone(modernRecord);
  delete legacy.settingsClock;
  legacy.schemaVersion = 10;
  legacy.modifiedAt = 1000;
  legacy.deviceId = "old-device";

  const merged = mergeSettingsRecords(modernRecord, legacy);
  assert.equal(merged.settings.theme, "light");
  assert.deepEqual(merged.settingsClock.t, modernRecord.settingsClock.t, "legacy equal-value write must not raise the fine clock");
});

test("1.30.18 two legacy Settings records retain deterministic whole-record compatibility", () => {
  const left = recordFor(baseState(100), "legacy-a");
  const right = recordFor(baseState(100), "legacy-b");
  delete left.settingsClock;
  delete right.settingsClock;
  left.schemaVersion = right.schemaVersion = 10;
  left.modifiedAt = 1000;
  right.modifiedAt = 2000;
  left.settings.rows = 7;
  right.settings.rows = 6;
  const ab = mergeSettingsRecords(left, right);
  const ba = mergeSettingsRecords(right, left);
  assert.equal(ab.settings.rows, 6);
  assert.equal(stableStringify(ab), stableStringify(ba));
});

test("1.30.18 a lone legacy Settings record remains readable and republishes with fine clocks", () => {
  const legacy = recordFor(baseState(777), "legacy-only");
  delete legacy.settingsClock;
  legacy.schemaVersion = 10;
  legacy.settings.rows = 7;
  const reconstructed = applyRecord(legacy, baseState());
  const modernized = recordFor(reconstructed, "receiver");
  assert.equal(reconstructed.settings.rows, 7);
  assert.equal(Object.keys(modernized.settingsClock).length, SETTINGS_SYNC_CLOCK_KEYS.length);
  assert.equal(modernized.settingsClock.r[0], 777);
  assert.ok(modernized.settingsClock.r[1], "legacy owner must be retained in compact tie-break form");
});

test("1.30.15 merged Settings clocks survive state reconstruction and republish", () => {
  const base = baseState();
  const a = mutateSetting(base, "frequentlyVisitedEnabled", true, 1000);
  const b = mutateSetting(base, "tileSize", 92, 1100);
  const merged = mergeSettingsRecords(recordFor(a, "a"), recordFor(b, "b"));
  const reconstructed = applyRecord(merged, base);
  const republished = recordFor(reconstructed, "receiver");
  assert.deepEqual(republished.settingsClock, merged.settingsClock);
  assert.equal(republished.settings.frequentlyVisitedEnabled, true);
  assert.equal(republished.settings.tileSize, 92);
});

test("1.30.15 fine Settings clock metadata stays comfortably below one Sync item", () => {
  const state = mutatePair(baseState(), {
    columns: 12,
    rows: 8,
    tileSize: 96,
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 10,
    lightBackgroundPreset: "aurora",
    darkBackgroundPreset: "midnight"
  }, 1000);
  const bytes = new TextEncoder().encode(JSON.stringify(recordFor(state, "device-with-a-long-identifier"))).length;
  assert.ok(bytes < 3000, `Settings record unexpectedly large: ${bytes} bytes`);
  assert.ok(bytes < 8192, "Settings record must stay below the browser per-item quota");
});

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const RANDOM_CONTROLS = [
  ["columns", [6, 7, 8, 9, 10, 11, 12]],
  ["rows", [2, 3, 4, 5, 6, 7, 8]],
  ["tileSize", [60, 68, 76, 84, 92, 96]],
  ["theme", ["system", "light", "dark"]],
  ["backgroundDim", [0, 10, 25, 50, 75]],
  ["themeWallpapersEnabled", [false, true]],
  ["lightBackgroundPreset", ["", "aurora", "softLight"]],
  ["lightBackgroundDim", [0, 20, 40, 60]],
  ["darkBackgroundPreset", ["", "midnight", "graphite"]],
  ["darkBackgroundDim", [0, 25, 50, 75]],
  ["brandVisible", [false, true]],
  ["frequentlyVisitedEnabled", [false, true]],
  ["frequentlyVisitedCount", [3, 5, 8, 10]],
  ["spaceName", ["", "Personal", "Home", "Main"]],
  ["multipleSpacesEnabled", [false, true]]
];

function mergeIntoDevice(device, remoteRecord) {
  const merged = mergeSettingsRecords(device.record, remoteRecord);
  return {
    ...device,
    record: merged,
    state: applyRecord(merged, device.state)
  };
}

test("1.30.15 seeded five-device Settings stress preserves independent intent through delays and a recovery epoch", () => {
  const random = seeded(0x13015);
  let logicalTime = 10_000;
  const deviceIds = ["A", "B", "C", "D", "E"];
  let devices = deviceIds.map(id => {
    const state = baseState(100);
    return { id, state, record: recordFor(state, id) };
  });
  let expected = { ...DEFAULT_SETTINGS };

  const applyRandomMutation = () => {
    const index = Math.floor(random() * devices.length);
    const [field, values] = RANDOM_CONTROLS[Math.floor(random() * RANDOM_CONTROLS.length)];
    const value = values[Math.floor(random() * values.length)];
    logicalTime += 1;
    const state = mutateSetting(devices[index].state, field, value, logicalTime);
    devices[index] = { ...devices[index], state, record: recordFor(state, devices[index].id) };
    expected[field] = value;
  };

  for (let step = 0; step < 1200; step += 1) {
    applyRandomMutation();
    // Reordered/delayed pair delivery. Some devices remain stale for long runs.
    if (random() < 0.62) {
      const a = Math.floor(random() * devices.length);
      let b = Math.floor(random() * devices.length);
      if (b === a) b = (b + 1) % devices.length;
      const merged = mergeSettingsRecords(devices[a].record, devices[b].record);
      devices[a] = mergeIntoDevice(devices[a], merged);
      devices[b] = mergeIntoDevice(devices[b], merged);
    }

    // Simulate one catastrophic namespace loss/recovery epoch. The selected
    // survivor becomes explicit authority, exactly like Use-this-device/recovery;
    // pre-loss remote-only intent is no longer knowable and expected resets to it.
    if (step === 599) {
      const survivor = devices[Math.floor(random() * devices.length)];
      expected = { ...survivor.state.settings };
      devices = devices.map(device => mergeIntoDevice(device, survivor.record));
      devices = devices.map(device => ({ ...device, record: survivor.record, state: applyRecord(survivor.record, device.state) }));
    }
  }

  // Merge every surviving record in several different orders. The result must be
  // associative/commutative for all fine-clock Settings groups.
  const orders = [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
    [2, 0, 4, 1, 3],
    [1, 3, 0, 4, 2]
  ];
  const finals = orders.map(order => order.reduce((acc, index) => mergeSettingsRecords(acc, devices[index].record), null));
  for (const candidate of finals.slice(1)) assert.equal(stableStringify(candidate), stableStringify(finals[0]));

  const finalSettings = finals[0].settings;
  for (const [field] of RANDOM_CONTROLS) {
    assert.deepEqual(finalSettings[field], expected[field], `latest intentional ${field} mutation must survive unrelated stale writes`);
  }
});
