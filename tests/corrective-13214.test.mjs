import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { rebaseConcurrentState } from "../dist/firefox/core/concurrency.js";

globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const profile = await import("../dist/firefox/core/profile.js");

function shortcut(id, position, modifiedAt = 100) {
  return {
    type: "shortcut",
    id,
    title: id,
    url: `https://${id.toLowerCase()}.example/`,
    image: "",
    imageSyncData: "",
    imageAssetId: "",
    imageSyncKind: "none",
    imageSourceKind: "none",
    imageSourceUrl: "",
    imageStyle: "contain",
    position,
    createdAt: 1,
    modifiedAt,
    spaceMoveAt: 0,
    source: "manual"
  };
}

function rawWorkspace(shortcuts, columns = 6, rows = 2, updatedAt = 100) {
  return {
    shortcuts,
    settings: { ...constants.DEFAULT_SETTINGS, columns, rows },
    settingsClock: {},
    settingsModifiedAt: 10,
    updatedAt
  };
}

test("1.32.1.4 colliding top-level positions normalize to a fixed point in one pass", () => {
  const raw = rawWorkspace([
    shortcut("A", 5, 100),
    shortcut("B", 5, 50)
  ]);
  const once = model.normalizeState(raw);
  const twice = model.normalizeState(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(once.shortcuts.map(item => [item.id, item.position]), [["A", 5], ["B", 6]]);
});

test("1.32.1.4 ordinary two-device Sync merge collision is normalized idempotently", () => {
  const base = rawWorkspace([shortcut("A", 0, 10), shortcut("B", 1, 10)], 6, 2, 10);
  const deviceA = model.normalizeState(rawWorkspace([shortcut("A", 5, 100), shortcut("B", 1, 10)], 6, 2, 100));
  const deviceB = model.normalizeState(rawWorkspace([shortcut("A", 0, 10), shortcut("B", 5, 110)], 6, 2, 110));
  const recordsA = model.flattenState(deviceA, "device-a");
  const recordsB = model.flattenState(deviceB, "device-b");
  const mergedRecords = model.mergeRecordMaps(recordsA, recordsB);
  assert.deepEqual([...mergedRecords.values()].filter(r => r.kind === "shortcut").map(r => [r.id, r.position]).sort(), [["A", 5], ["B", 5]]);
  const reconstructed = model.stateFromRecords(mergedRecords, model.makeSettingsRecord(deviceA, "device-a"), base);
  assert.deepEqual(model.normalizeState(reconstructed), reconstructed);
  assert.equal(new Set(reconstructed.shortcuts.map(item => item.position)).size, reconstructed.shortcuts.length);
  assert.deepEqual(reconstructed.shortcuts.map(item => [item.id, item.position]), [["B", 5], ["A", 6]]);
});

test("1.32.1.4 collision-shaped profile export-import-export is canonical after one normalization", async () => {
  const originalNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    const normalized = model.normalizeState(rawWorkspace([
      shortcut("A", 5, 100),
      shortcut("B", 5, 50)
    ]));
    const first = await profile.createProfilePackage(normalized, {});
    const parsed = await profile.parseProfilePackage(JSON.stringify(first));
    const second = await profile.createProfilePackage(parsed.state, parsed.preferences, parsed.branding);
    assert.equal(second.integrity.value, first.integrity.value);
    assert.deepEqual(second.profile.state, first.profile.state);
  } finally {
    Date.now = originalNow;
  }
});


test("1.32.1.4 no-op workspace intent rebased onto a newer state preserves latest exactly", () => {
  const base = model.normalizeState(rawWorkspace([shortcut("A", 0, 10), shortcut("B", 1, 10)], 6, 2, 10));
  const latest = structuredClone(base);
  latest.shortcuts[0] = { ...latest.shortcuts[0], title: "Latest", modifiedAt: 200 };
  latest.spaces.personal.shortcuts = latest.shortcuts;
  latest.updatedAt = 200;
  latest.spaces.personal.updatedAt = 200;
  const normalizedLatest = model.normalizeState(latest);
  const rebased = rebaseConcurrentState(base, base, normalizedLatest);
  assert.deepEqual(rebased, normalizedLatest);
});

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("1.32.1.4 seeded normalization property remains idempotent across collision-heavy states", () => {
  const random = mulberry32(0x13214);
  for (let run = 0; run < 2500; run += 1) {
    const columns = 6 + Math.floor(random() * 7);
    const rows = 2 + Math.floor(random() * 7);
    const capacity = columns * rows;
    const count = Math.floor(random() * (Math.min(capacity, 40) + 1));
    const shortcuts = [];
    for (let i = 0; i < count; i += 1) {
      // Bias heavily toward collisions while still exercising negative and
      // out-of-grid legacy positions that the normalizer is expected to repair.
      const span = Math.max(1, Math.min(capacity, Math.ceil(Math.max(1, count) / 2)));
      let position = Math.floor(random() * span);
      if (random() < 0.08) position = -1 - Math.floor(random() * 3);
      else if (random() < 0.08) position = capacity + Math.floor(random() * 4);
      shortcuts.push(shortcut(`r${run}-${i}`, position, 10_000 - i));
    }
    const once = model.normalizeState(rawWorkspace(shortcuts, columns, rows, 10_000 + run));
    const twice = model.normalizeState(once);
    assert.deepEqual(twice, once, `normalization failed fixed-point property at seeded run ${run}`);
  }
});
