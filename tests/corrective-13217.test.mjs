import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const model = await import("../dist/firefox/core/model.js");
const constants = await import("../dist/firefox/core/constants.js");

function shortcut(id, modifiedAt, extra = {}) {
  return {
    schemaVersion: 2,
    kind: "shortcut",
    id,
    title: id,
    url: `https://${id}.example/`,
    position: 0,
    createdAt: 1,
    modifiedAt,
    deviceId: id,
    ...extra
  };
}

test("1.32.1.7 persisted state normalization rejects non-safe logical clocks before they can pin later edits", () => {
  const unsafe = 1e20;
  const state = model.normalizeState({
    schemaVersion: constants.STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [
          {
            type: "folder",
            id: "folder",
            title: "Folder",
            position: 0,
            createdAt: unsafe,
            modifiedAt: unsafe,
            items: [
              { type: "shortcut", id: "a", title: "A", url: "https://a.example/", position: 0, createdAt: unsafe, modifiedAt: unsafe, spaceMoveAt: unsafe },
              { type: "shortcut", id: "b", title: "B", url: "https://b.example/", position: 1, createdAt: unsafe, modifiedAt: unsafe, spaceMoveAt: unsafe }
            ]
          }
        ],
        settings: { ...constants.DEFAULT_SETTINGS },
        settingsClock: Object.fromEntries(constants.SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [unsafe, "deadbeef"]])),
        settingsModifiedAt: unsafe,
        updatedAt: unsafe
      },
      work: {
        shortcuts: [],
        settings: { ...constants.DEFAULT_SETTINGS },
        settingsModifiedAt: unsafe,
        updatedAt: unsafe
      }
    }
  });

  for (const spaceId of constants.SPACE_IDS) {
    const workspace = state.spaces[spaceId];
    assert.ok(Number.isSafeInteger(workspace.settingsModifiedAt));
    assert.ok(Number.isSafeInteger(workspace.updatedAt));
    for (const stamp of Object.values(workspace.settingsClock)) assert.ok(Number.isSafeInteger(stamp[0]));
    for (const item of workspace.shortcuts) {
      assert.ok(Number.isSafeInteger(item.createdAt));
      assert.ok(Number.isSafeInteger(item.modifiedAt));
      for (const child of item.items || []) {
        assert.ok(Number.isSafeInteger(child.createdAt));
        assert.ok(Number.isSafeInteger(child.modifiedAt));
        assert.ok(Number.isSafeInteger(child.spaceMoveAt));
      }
    }
  }

  assert.notEqual(state.spaces.personal.updatedAt, unsafe);
  assert.notEqual(state.spaces.personal.shortcuts[0].modifiedAt, unsafe);
  assert.ok(model.nextMutationTime(state.spaces.personal.updatedAt, state.spaces.personal.shortcuts[0].modifiedAt) > state.spaces.personal.updatedAt);
});

test("1.32.1.7 mutation clock never silently reuses an exhausted or non-safe observed timestamp", () => {
  const unsafe = 1e20;
  const normalized = model.normalizeLogicalTime(unsafe, 123);
  assert.equal(normalized, 123, "non-safe numeric clocks must be rejected at the model trust boundary");
  assert.ok(Number.isSafeInteger(model.nextMutationTime(unsafe)), "invalid observed clocks must not poison the local clock");
  assert.throws(
    () => model.nextMutationTime(model.MAX_LOGICAL_TIME),
    /logical mutation clock exhausted/i,
    "the theoretical safe-integer ceiling must fail closed instead of returning a non-advancing timestamp"
  );
});

test("1.32.1.7 malformed non-safe Sync clocks cannot outrank a legitimate safe record or namespace move", () => {
  const legitimate = shortcut("x", 100, { deviceId: "a" });
  const poisoned = shortcut("x", 1e20, { deviceId: "z", title: "poisoned" });
  assert.equal(model.chooseNewerRecord(legitimate, poisoned), legitimate,
    "non-safe modifiedAt must not dominate deterministic record ordering");

  const tombstone = { schemaVersion: 2, kind: "deleted", id: "x", deletedAt: 1e20, modifiedAt: 1e20, deviceId: "z" };
  const moved = shortcut("x", 200, { spaceMoveAt: 200, deviceId: "a", title: "moved" });
  assert.equal(model.chooseNewerRecord(tombstone, moved), moved,
    "non-safe tombstone clocks must not permanently block a legitimate explicit later namespace move");
});

test("1.32.1.7 Sync reconstruction never reintroduces non-safe logical clocks into authoritative local state", () => {
  const unsafe = 1e20;
  const records = new Map([
    ["x", shortcut("x", unsafe, { createdAt: unsafe, spaceMoveAt: unsafe })]
  ]);
  const settings = {
    schemaVersion: 2,
    kind: "settings",
    settings: { ...constants.DEFAULT_SETTINGS },
    settingsClock: Object.fromEntries(constants.SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [unsafe, "deadbeef"]])),
    modifiedAt: unsafe,
    deviceId: "remote"
  };
  const rebuilt = model.stateFromRecords(records, settings, constants.DEFAULT_STATE, new Map());
  assert.ok(Number.isSafeInteger(rebuilt.shortcuts[0].createdAt));
  assert.ok(Number.isSafeInteger(rebuilt.shortcuts[0].modifiedAt));
  assert.ok(Number.isSafeInteger(rebuilt.shortcuts[0].spaceMoveAt));
  assert.ok(Number.isSafeInteger(rebuilt.settingsModifiedAt));
  assert.ok(Number.isSafeInteger(rebuilt.updatedAt));
  for (const stamp of Object.values(rebuilt.settingsClock)) assert.ok(Number.isSafeInteger(stamp[0]));
});
