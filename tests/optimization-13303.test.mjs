import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const text = path => readFile(path, "utf8");

test("1.33.0.3 storage exposes an exact persisted-compact baseline clone fast path", async () => {
  const storage = await import("../dist/firefox/core/storage.js");
  assert.equal(typeof storage.createPersistedWriteBaseline, "function");

  const compact = {
    schemaVersion: 14,
    activeSpaceId: "work",
    spaces: {
      personal: { shortcuts: [{ type: "shortcut", id: "p", position: 0 }], settings: { marker: "p" } },
      work: { shortcuts: [{ type: "shortcut", id: "w", position: 2 }], settings: { marker: "w" } }
    }
  };
  const baseline = storage.createPersistedWriteBaseline(compact);
  assert.deepEqual(baseline, compact, "baseline must preserve the exact persisted JSON payload");
  assert.notEqual(baseline, compact, "baseline must detach from the storage event object");
  assert.notEqual(baseline.spaces, compact.spaces);
  compact.spaces.work.shortcuts[0].position = 99;
  assert.equal(baseline.spaces.work.shortcuts[0].position, 2, "later mutation of the event object must not mutate the baseline");
});

test("1.33.0.3 persisted baseline fast path does not normalize or project trusted storage bytes", async () => {
  const source = await text("src/shared/core/storage.js");
  const match = source.match(/export function createPersistedWriteBaseline\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, "persisted baseline helper must exist");
  assert.doesNotMatch(match[1], /normalizeState|projectStateToLocalAssets/, "exact persisted bytes must not be re-normalized/re-projected");
  assert.match(match[1], /cloneCompactJson/, "fast path must still create a detached immutable snapshot");
});

test("1.33.0.3 New Tab storage events reuse exact persisted compact authority for both baseline adoption paths", async () => {
  const source = await text("src/shared/newtab/newtab.js");
  const eventStart = source.indexOf("browser.storage.onChanged.addListener");
  assert.notEqual(eventStart, -1);
  const eventSource = source.slice(eventStart);
  const fastPathUses = [...eventSource.matchAll(/createPersistedWriteBaseline\(stateChange\.newValue\)/g)];
  assert.equal(fastPathUses.length, 2, "device-artwork-only and general adoption must share the persisted compact fast path");
  assert.doesNotMatch(eventSource, /createWriteBaseline\(stateChange\.newValue\)/, "storage-event adoption must not pay full normalize+projection baseline construction");
});

test("1.33.0.3 benchmark keeps defensive baseline construction and measures persisted compact adoption separately", async () => {
  const source = await text("bench/performance.mjs");
  assert.match(source, /createWriteBaseline\(200\)/, "defensive boundary benchmark must remain as a control");
  assert.match(source, /persisted compact baseline clone\(200\)/, "fast persisted-authority path must have its own benchmark");
  assert.match(source, /createPersistedWriteBaseline\(projected\.state\)/);
});


test("1.33.0.3 normalized Settings-clock stamping is byte-equivalent while avoiding a second intended-state normalization", async () => {
  const model = await import("../dist/firefox/core/model.js");
  const fixture = await import("../fixtures/worst-case-profile.mjs");
  const base = model.normalizeState(fixture.makeWorstCaseProfile({ count: 80 }));
  const personal = base.spaces.personal;
  const timestamp = model.nextMutationTime(personal.settingsModifiedAt, personal.updatedAt);
  const intended = model.replaceWorkspaceTrustedNormalized(base, "personal", {
    ...personal,
    settings: { ...personal.settings, spaceName: "Snow Leopard II" },
    settingsModifiedAt: timestamp,
    updatedAt: timestamp
  });
  const defensive = model.stampSettingsMutationClocks(base, intended);
  const trusted = model.stampSettingsMutationClocksTrustedNormalized(base, intended);
  assert.equal(model.stableStringify(trusted), model.stableStringify(defensive));
});

test("1.33.0.3 persistence uses normalized intended Settings stamping after its single defensive state validation", async () => {
  const storage = await text("src/shared/core/storage.js");
  assert.match(storage, /const normalized = normalizeState\(state \|\| DEFAULT_STATE, assetIdMemo\)/);
  assert.match(storage, /finalState = stampSettingsMutationClocksTrustedNormalized\([\s\S]*?normalizeState\(baseState \|\| latestRaw \|\| DEFAULT_STATE, assetIdMemo\),[\s\S]*?finalState[\s\S]*?\)/);
  assert.doesNotMatch(storage, /finalState = stampSettingsMutationClocks\(baseState \|\| latestRaw \|\| DEFAULT_STATE, finalState\)/);
});


test("1.33.0.3 Sync and optimistic-rebase paths carry normalized-state proof instead of revalidating the same tree", async () => {
  const background = await text("src/shared/background/background-core.js");
  const concurrency = await text("src/shared/core/concurrency.js");
  assert.match(background, /const oldState = normalizeState\(oldRaw\);[\s\S]*const newState = stampSettingsMutationClocksTrustedNormalized\(oldState, normalizeState\(newRaw\)\)/);
  assert.match(concurrency, /const base = normalizeState\(baseState\);[\s\S]*stampSettingsMutationClocksTrustedNormalized\(base, normalizeState\(intendedState\)\)[\s\S]*stampSettingsMutationClocksTrustedNormalized\(base, normalizeState\(latestState\)\)/);
});


test("1.33.0.3 freezes the Step-2 optimization evidence and advances the journey to secondary UI", async () => {
  const snapshot = JSON.parse(await text("docs/SNOW-LEOPARD-II-STEP2-1.33.0.3.json"));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.version, "1.33.0.3");
  assert.equal(snapshot.step, 2);
  assert.ok(snapshot.benchmarks.baselineMedianSpeedup > 10);
  assert.ok(snapshot.benchmarks.settingsStampMedianSpeedup > 10);
  const tracker = await text("docs/SNOW-LEOPARD-II.md");
  assert.match(tracker, /Step 2 — State computation and serialization: DONE in 1\.33\.0\.3/);
  assert.match(tracker, /Step 3 — DOM\/CSS\/lazy secondary UI: (?:NEXT|IN PROGRESS|DONE in 1\.33\.0\.6)/);
});
