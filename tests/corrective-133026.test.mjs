import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testFilesForGroup } from "../tools/test-groups.mjs";

const NEWTAB = "src/shared/newtab/newtab.js";
const BOOKMARKS = "src/shared/newtab/bookmarks-controller.js";
const newtab = fs.readFileSync(NEWTAB, "utf8");
const bookmarks = fs.readFileSync(BOOKMARKS, "utf8");

test("1.33.0.26 Bookmarks rows hand explicit drag ownership to the New Tab orchestrator", () => {
  assert.match(bookmarks, /onBookmarkDragStart = null/);
  assert.match(bookmarks, /onBookmarkDragEnd = null/);
  assert.match(bookmarks, /link\.draggable = true/);
  assert.match(bookmarks, /link\.addEventListener\("dragstart"[\s\S]*?onBookmarkDragStart\?\.\(item, link, event\)/);
  assert.match(bookmarks, /link\.addEventListener\("dragend"[\s\S]*?onBookmarkDragEnd\?\.\(link, event\)/);
  assert.match(newtab, /onBookmarkDragStart: beginBookmarkShortcutDrag/);
  assert.match(newtab, /onBookmarkDragEnd: endBookmarkShortcutDrag/);
});

test("1.33.0.26 native bookmark drag releases the modal without deleting the live drag source", () => {
  assert.match(newtab, /function bookmarkDragPayloadFor\([\s\S]*?normalizeShortcutUrl\(item\?\.url\)/);
  assert.match(newtab, /function beginBookmarkShortcutDrag\([\s\S]*?bookmarkDragPayloadFor\(item\)/);
  assert.match(newtab, /transfer\.effectAllowed = "copy"/);
  assert.match(newtab, /transfer\.setData\("text\/uri-list", payload\.url\)/);
  assert.match(newtab, /setTimeout\(\(\) => \{[\s\S]*?document\.body\.append\(keeper\);[\s\S]*?keeper\.append\(sourceElement\);[\s\S]*?closeDialog\(bookmarksDialog\)/,
    "the live source must move outside the closing dialog before its reset can remove rendered rows");
  assert.match(newtab, /function endBookmarkShortcutDrag\([\s\S]*?bookmarkDragSourceKeeper\.remove\(\)[\s\S]*?bookmarkDrag = null/);
});

test("1.33.0.26 empty Manual tiles accept bookmark copy at the exact requested position", () => {
  assert.match(newtab, /const bookmarkDrop = typeof bookmarkDrag !== "undefined" \? bookmarkDrag : null/);
  assert.match(newtab, /if \(!dragId && !frequentDragSite && !bookmarkDrop\) return/);
  assert.match(newtab, /dropEffect = \(frequentDragSite \|\| bookmarkDrop\) \? "copy" : "move"/);
  assert.match(newtab, /if \(bookmarkDrag\) \{[\s\S]*?commitBookmarkShortcutDrop\(\{ position \}\)/);
  assert.match(newtab, /if \(shortcutOrderMode === "recent" && state\.shortcuts\.length !== 0\) return false/,
    "Recent presentation slots must never become canonical Manual positions");
  assert.match(newtab, /state\.shortcuts\.some\(item => item\.position === position\)/,
    "an exact empty-slot drop must never overwrite an occupied Manual position");
});

test("1.33.0.26 occupied shortcut and folder drops preserve existing user data", () => {
  assert.match(newtab, /if \(target\.type === "folder"\) \{[\s\S]*?target\.items\.push\(shortcut\)/,
    "dropping on a folder must append the converted bookmark inside it");
  assert.match(newtab, /else if \(target\.type === "shortcut"\) \{[\s\S]*?items: \[[\s\S]*?\.\.\.target, position: 0[\s\S]*?shortcut[\s\S]*?\][\s\S]*?state\.shortcuts = state\.shortcuts\.filter\(item => item\.id !== target\.id\)[\s\S]*?state\.shortcuts\.push\(folder\)/,
    "dropping on a shortcut must convert the occupied tile into a folder, never overwrite it");
  assert.match(newtab, /if \(bookmarkDrag\) \{[\s\S]*?commitBookmarkShortcutDrop\(\{ targetId: item\.id \}\)/,
    "occupied launcher slots must route browser-bookmark drops through the copy conversion path");
});

test("1.33.0.26 an empty launcher accepts a dragged bookmark on the Add control", () => {
  assert.match(newtab, /addFirstButton\.addEventListener\("dragover"[\s\S]*?bookmarkDrag && state\.shortcuts\.length === 0[\s\S]*?dropEffect = "copy"/);
  assert.match(newtab, /addFirstButton\.addEventListener\("drop"[\s\S]*?bookmarkDrag && state\.shortcuts\.length === 0[\s\S]*?commitBookmarkShortcutDrop\(\{ position: 0 \}\)/);
});

test("1.33.0.26 bookmark conversion stays explicit, HTTP(S)-bounded and device-local for learned artwork", () => {
  assert.match(newtab, /function bookmarkDragPayloadFor\([\s\S]*?normalizeShortcutUrl\(item\?\.url\)/,
    "the browser-owned URL must cross the boundary through the shared URL normalizer");
  assert.ok(newtab.includes('if (!/^https?:\\/\\//i.test(url)) return null;'),
    "bookmark conversion must be limited to HTTP(S) URLs");
  assert.match(newtab, /Re-validate at the mutation boundary[\s\S]*?bookmarkDragPayloadFor\(drag\)/,
    "drop commit must revalidate untrusted bookmark input");
  assert.match(newtab, /imageSyncKind: "none"[\s\S]*?imageSourceKind: "none"[\s\S]*?source: "manual"/,
    "the converted item must enter the ordinary shortcut model without synchronized bookmark/favicon bytes");
  assert.match(newtab, /if \(shortcut\?\.id\) requestMissingSiteIcons\(\[shortcut\.id\]\)/,
    "normal device-local favicon hydration should run after conversion");
  assert.doesNotMatch(newtab, /bookmarksApi\.(?:remove|move)\(/,
    "conversion is copy semantics and must never move/delete the browser bookmark");
  assert.match(newtab, /document\.addEventListener\("drop"[\s\S]*?if \(!bookmarkDrag \|\| event\.defaultPrevented\) return;[\s\S]*?event\.preventDefault\(\)/,
    "an unhandled dragged bookmark URL must not navigate the extension page");
});

test("1.33.0.26 bookmark drag regression is covered by New Tab, security, browser and release groups", () => {
  for (const group of ["newtab", "security", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133026.test.mjs"), `${group} must include corrective-133026.test.mjs`);
  }
});
