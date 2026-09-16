import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { moveShortcutOutOfFolder, normalizeState } from "../dist/firefox/core/model.js";
import { rebaseConcurrentState } from "../dist/firefox/core/concurrency.js";

function shortcut(id, position, modifiedAt = 10, extra = {}) {
  return {
    type: "shortcut",
    id,
    title: id.toUpperCase(),
    url: `https://${id}.example/`,
    image: "",
    imageKind: "none",
    imageSourceKind: "none",
    imageSourceUrl: "",
    imageLocalAssetId: "",
    imageStyle: "contain",
    position,
    createdAt: 1,
    modifiedAt,
    ...extra
  };
}

function stateWith(folderItems, other = []) {
  return normalizeState({
    schemaVersion: 14,
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{
          type: "folder",
          id: "folder",
          title: "Folder",
          items: folderItems,
          position: 1,
          createdAt: 1,
          modifiedAt: 20
        }, ...other],
        settings: { columns: 8, rows: 4 },
        settingsModifiedAt: 1,
        updatedAt: 20
      },
      work: { shortcuts: [], settings: { columns: 8, rows: 4 }, settingsModifiedAt: 1, updatedAt: 1 }
    }
  });
}

test("1.26.7 extracts one child from a 3+ shortcut folder into an empty top-level slot", () => {
  const before = stateWith([
    shortcut("a", 0, 11),
    shortcut("b", 1, 12, { title: "Preserve me", url: "https://b.example/path?q=1" }),
    shortcut("c", 2, 13)
  ]);
  const after = moveShortcutOutOfFolder(before, { shortcutId: "b", spaceId: "personal", position: 5 });

  const folder = after.shortcuts.find(item => item.id === "folder");
  const moved = after.shortcuts.find(item => item.id === "b");
  assert.equal(folder?.type, "folder");
  assert.deepEqual(folder.items.map(item => [item.id, item.position]), [["a", 0], ["c", 1]]);
  assert.equal(moved?.type, "shortcut");
  assert.equal(moved.position, 5);
  assert.equal(moved.title, "Preserve me");
  assert.equal(moved.url, "https://b.example/path?q=1");
  assert.equal(after.shortcuts.flatMap(item => item.type === "folder" ? item.items : [item]).filter(item => item.id === "b").length, 1);
  assert.ok(moved.modifiedAt > 20);
  assert.ok(folder.modifiedAt > 20);
});

test("1.26.7 dissolves a two-shortcut folder when one child is dragged out", () => {
  const before = stateWith([shortcut("a", 0, 11), shortcut("b", 1, 12)]);
  const after = moveShortcutOutOfFolder(before, { shortcutId: "b", spaceId: "personal", position: 6 });

  assert.equal(after.shortcuts.some(item => item.type === "folder"), false);
  const remaining = after.shortcuts.find(item => item.id === "a");
  const moved = after.shortcuts.find(item => item.id === "b");
  assert.equal(remaining?.position, 1, "remaining child takes the old folder slot");
  assert.equal(moved?.position, 6);
  assert.ok(remaining.modifiedAt > 20);
  assert.ok(moved.modifiedAt > 20);
  assert.equal(new Set(after.shortcuts.map(item => item.id)).size, 2);
});

test("1.26.7 refuses extraction onto an occupied top-level slot without losing data", () => {
  const before = stateWith([shortcut("a", 0), shortcut("b", 1), shortcut("c", 2)], [shortcut("top", 4, 15)]);
  const after = moveShortcutOutOfFolder(before, { shortcutId: "b", spaceId: "personal", position: 4 });
  const folder = after.shortcuts.find(item => item.id === "folder");
  assert.deepEqual(folder.items.map(item => item.id), ["a", "b", "c"]);
  assert.equal(after.shortcuts.find(item => item.id === "top")?.position, 4);
  assert.equal(after.shortcuts.some(item => item.id === "b"), false);
});

test("1.26.7 folder extraction preserves an unrelated concurrent top-level addition", () => {
  const base = stateWith([shortcut("a", 0, 11), shortcut("b", 1, 12), shortcut("c", 2, 13)]);
  const intended = moveShortcutOutOfFolder(base, { shortcutId: "b", spaceId: "personal", position: 5 });

  const latest = structuredClone(base);
  const added = shortcut("new", 7, intended.updatedAt + 10, { title: "Concurrent" });
  latest.spaces.personal.shortcuts.push(added);
  latest.spaces.personal.updatedAt = added.modifiedAt;
  latest.shortcuts = latest.spaces.personal.shortcuts;
  latest.updatedAt = latest.spaces.personal.updatedAt;

  const merged = rebaseConcurrentState(base, intended, normalizeState(latest));
  const folder = merged.shortcuts.find(item => item.id === "folder");
  assert.equal(merged.shortcuts.find(item => item.id === "b")?.position, 5);
  assert.equal(merged.shortcuts.find(item => item.id === "new")?.title, "Concurrent");
  assert.deepEqual(folder.items.map(item => item.id), ["a", "c"]);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.7 ${browser} empty-slot drop routes nested shortcuts through the audited model transition`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(js, /moveShortcutOutOfFolder,/);
    const emptyDrop = js.match(/function createEmptySlot\(position\)[\s\S]*?slot\.addEventListener\("drop", async event => \{([\s\S]*?)\n    \}\);/);
    assert.ok(emptyDrop, `${browser}: empty-slot drop handler missing`);
    assert.match(emptyDrop[1], /findShortcutRecord\(sourceId\)[\s\S]*?nested\?\.parentFolder[\s\S]*?moveShortcutOutOfFolder\(state,[\s\S]*?shortcutId: sourceId[\s\S]*?position[\s\S]*?state = next[\s\S]*?closeFolder\(\)[\s\S]*?await saveState\(\)[\s\S]*?render\(\)/,
      `${browser}: nested child extraction must use one state transition, normal persistence and one render path`);
  });
}
