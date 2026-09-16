import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
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

function extractRuntimeFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const openParen = source.indexOf("(", start);
  let parenDepth = 0;
  let paramQuote = "", paramEscaped = false;
  let closeParen = -1;
  for (let i = openParen; i < source.length; i += 1) {
    const c = source[i];
    if (paramQuote) {
      if (paramEscaped) { paramEscaped = false; continue; }
      if (c === "\\") { paramEscaped = true; continue; }
      if (c === paramQuote) paramQuote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { paramQuote = c; continue; }
    if (c === "(") parenDepth += 1;
    else if (c === ")" && --parenDepth === 0) { closeParen = i; break; }
  }
  assert.ok(closeParen > openParen, `missing parameter boundary for ${name}`);
  const brace = source.indexOf("{", closeParen);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

async function runBookmarkDrop({ shortcuts, position = null, targetId = "" }) {
  const payloadFn = extractRuntimeFunction(newtab, "bookmarkDragPayloadFor");
  const recordFn = extractRuntimeFunction(newtab, "bookmarkShortcutRecord");
  const commitFn = extractRuntimeFunction(newtab, "commitBookmarkShortcutDrop");
  let nextId = 0;
  const calls = { save: 0, render: 0, hydrated: [] };
  const context = {
    drag: { title: "Example Bookmark", url: "https://www.example.com/path", committing: false, committed: false },
    state: { shortcuts: structuredClone(shortcuts), settings: {}, updatedAt: 100 },
    normalizeShortcutUrl(value) {
      const url = new URL(String(value));
      if (!/^https?:$/.test(url.protocol)) throw new Error("unsafe");
      return url.href;
    },
    hostLabel(value) { return new URL(value).hostname.replace(/^www\./, ""); },
    uid() { nextId += 1; return `new-${nextId}`; },
    getTopLevelItem(id) { return context.state.shortcuts.find(item => item.id === id) || null; },
    nextMutationTime(...values) {
      const flat = values.flat(Infinity).map(Number).filter(Number.isFinite);
      return Math.max(100, ...flat) + 1;
    },
    async saveState() { calls.save += 1; },
    render() { calls.render += 1; },
    document: { querySelector() { return null; } },
    CSS: { escape(value) { return String(value); } },
    folderPopover: { hidden: true },
    openFolder() {},
    showToast() {},
    t(key) { return key; },
    requestMissingSiteIcons(ids) { calls.hydrated.push(...ids); },
    visibleTopLevelCapacity() { return 24; },
    shortcutOrderMode: "manual",
    setTimeout() { return 0; },
    console
  };
  vm.createContext(context);
  vm.runInContext(`let bookmarkDrag = this.drag; const shortcutOrderMode = this.shortcutOrderMode; ${payloadFn}; ${recordFn}; ${commitFn}; this.commitForTest = commitBookmarkShortcutDrop;`, context);
  const committed = await context.commitForTest({ position, targetId });
  return { committed, state: context.state, calls };
}

test("1.33.0.29 bookmark drag behavior creates a real shortcut in an empty tile", async () => {
  const result = await runBookmarkDrop({ shortcuts: [], position: 3 });
  assert.equal(result.committed, true);
  assert.equal(result.state.shortcuts.length, 1);
  const shortcut = result.state.shortcuts[0];
  assert.equal(shortcut.type, "shortcut");
  assert.equal(shortcut.title, "Example Bookmark");
  assert.equal(shortcut.url, "https://www.example.com/path");
  assert.equal(shortcut.position, 3);
  assert.equal(result.calls.save, 1);
  assert.deepEqual(result.calls.hydrated, [shortcut.id]);
});

test("1.33.0.29 bookmark drag behavior appends the converted shortcut to an existing folder", async () => {
  const folder = { type: "folder", id: "folder-1", title: "Folder", position: 0, modifiedAt: 90, items: [] };
  const result = await runBookmarkDrop({ shortcuts: [folder], targetId: "folder-1" });
  assert.equal(result.committed, true);
  const updated = result.state.shortcuts[0];
  assert.equal(updated.type, "folder");
  assert.equal(updated.items.length, 1);
  assert.equal(updated.items[0].title, "Example Bookmark");
  assert.equal(updated.items[0].position, 0);
  assert.equal(result.calls.save, 1);
});

test("1.33.0.29 bookmark drag behavior turns an occupied shortcut into a two-item folder without overwriting it", async () => {
  const existing = { type: "shortcut", id: "old", title: "Existing", url: "https://old.test/", position: 4, modifiedAt: 90 };
  const result = await runBookmarkDrop({ shortcuts: [existing], targetId: "old" });
  assert.equal(result.committed, true);
  assert.equal(result.state.shortcuts.length, 1);
  const folder = result.state.shortcuts[0];
  assert.equal(folder.type, "folder");
  assert.equal(folder.position, 4);
  assert.equal(folder.items.length, 2);
  assert.equal(folder.items[0].id, "old");
  assert.equal(folder.items[0].position, 0);
  assert.equal(folder.items[1].title, "Example Bookmark");
  assert.equal(folder.items[1].position, 1);
  assert.equal(result.calls.save, 1);
});
