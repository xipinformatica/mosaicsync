import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NEWTAB = "src/shared/newtab/newtab.js";
const OWNER = "src/shared/newtab/bookmarks-controller.js";
const read = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

const newtab = read(NEWTAB);
const owner = read(OWNER);

test("1.32.0.3 gives the Bookmarks dialog one dedicated New Tab UI owner", () => {
  assert.match(newtab, /import\("\.\/bookmarks-controller\.js"\)/, "the dedicated owner may be loaded lazily");
  assert.doesNotMatch(newtab, /^import \{ createBookmarksController \} from "\.\/bookmarks-controller\.js";/m);
  assert.match(owner, /export function createBookmarksController/);
});

test("1.32.0.3 moves Bookmarks dialog mutable UI state out of the New Tab orchestrator", () => {
  for (const token of ["let bookmarkTree", "let bookmarkFolders", "let bookmarkAllItems", "let activeBookmarkFolderId", "let bookmarkFolderColors", "let bookmarkColorMenu"]) {
    assert.doesNotMatch(newtab, new RegExp(token));
    assert.match(owner, new RegExp(token));
  }
});

test("1.32.0.3 keeps browser Bookmarks API loading lazy and outside the extracted controller", () => {
  assert.match(newtab, /import\("\.\.\/core\/bookmarks\.js"\)/);
  assert.doesNotMatch(owner, /import\s+.*bookmarks\.js|import\("\.\.\/core\/bookmarks\.js"\)/);
  assert.match(owner, /loadBookmarksModule/);
});

test("1.32.0.3 preserves secondary-style-before-Bookmarks-visibility ordering", () => {
  assert.match(owner, /async function open\(\)[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?bookmarksDialog\.showModal\(\)/);
});

test("1.32.0.3 keeps bookmark-folder colors device-local and outside first-paint authority", () => {
  assert.match(owner, /function readBookmarkFolderColors\(\)[\s\S]*?localStorage\.getItem\(BOOKMARK_FOLDER_COLORS_PREF_KEY\)/);
  assert.match(owner, /async function loadBookmarksIntoDialog\([^)]*\)[\s\S]*?bookmarkFolderColors = readBookmarkFolderColors\(\)[\s\S]*?renderBookmarkBrowser\(\)/);
  assert.doesNotMatch(newtab, /BOOKMARK_FOLDER_COLORS_PREF_KEY|readBookmarkFolderColors/);
});

test("1.32.0.3 controller owns bookmark-local event wiring without adding global listeners", () => {
  assert.match(owner, /function bind\(\)[\s\S]*?bookmarksButton\?\.addEventListener\("click"[\s\S]*?bookmarksPermissionButton\?\.addEventListener\("click"[\s\S]*?bookmarksSearch\?\.addEventListener\("input"[\s\S]*?bookmarksDialog\?\.addEventListener\("close"[\s\S]*?bookmarksDialog\?\.addEventListener\("click"/);
  assert.doesNotMatch(owner, /document\.addEventListener|window\.addEventListener/);
});

test("1.32.0.3 keeps global menu coordination in the New Tab orchestrator", () => {
  assert.match(newtab, /document\.addEventListener\("pointerdown"[\s\S]*?bookmarksController\?\.closeColorMenuIfOutside\(event\.target\)/);
  assert.match(newtab, /if \(event\.key === "Escape"\)[\s\S]*?bookmarksController\?\.closeColorMenu\(\)/);
});

test("1.32.0.3 keeps the modal popover palette inside the Bookmarks dialog", () => {
  assert.match(owner, /menu\.setAttribute\("popover", "manual"\)[\s\S]*?bookmarksDialog\?\.append\(menu\)[\s\S]*?menu\.showPopover\(\)/);
  assert.doesNotMatch(owner, /document\.body\.append\(menu\)/);
});

test("1.32.0.3 controller has no browser storage, Sync, network, timer or top-level async ownership", () => {
  assert.match(owner, /export function createBookmarksController/);
  assert.doesNotMatch(owner, /browser\.storage|storage\.sync|fetch\(|setTimeout\(|setInterval\(|requestIdleCallback|top-level await/);
});

test("1.32.0.3 controller preserves close-toggle behavior without touching the lazy Bookmarks API", async () => {
  assert.ok(fs.existsSync(OWNER), "dedicated Bookmarks controller must exist");
  const moduleUrl = `${pathToFileURL(path.resolve(OWNER)).href}?test=${Date.now()}`;
  const { createBookmarksController } = await import(moduleUrl);
  let clickHandler = null;
  let closed = 0;
  let loaded = 0;
  const dialog = { open: true, addEventListener() {} };
  const button = {
    addEventListener(type, handler) {
      if (type === "click") clickHandler = handler;
    }
  };
  const controller = createBookmarksController({
    loadBookmarksModule: async () => { loaded += 1; return {}; },
    ensureSecondaryStyles: async () => true,
    closeDialog: value => { assert.equal(value, dialog); closed += 1; },
    positionFloatingMenu() {},
    graphemeSegmenter: null,
    elements: { bookmarksButton: button, bookmarksDialog: dialog }
  });
  controller.bind();
  assert.equal(typeof clickHandler, "function");
  clickHandler();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1);
  assert.equal(loaded, 0, "closing an already-open dialog must not touch browser Bookmarks API");
});
