import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NEWTAB = "src/shared/newtab/newtab.js";
const OWNER = "src/shared/newtab/bookmarks-controller.js";
const read = file => fs.readFileSync(file, "utf8");
const newtab = read(NEWTAB);
const owner = read(OWNER);

test("1.32.0.5 removes the redundant startup bookmark-folder-color preference read", () => {
  assert.doesNotMatch(newtab, /bookmarksController\.hydratePostPaintPreferences\(\)/);
  assert.doesNotMatch(owner, /function hydratePostPaintPreferences\(/);
  assert.doesNotMatch(owner, /\bhydratePostPaintPreferences\s*,/);
  const reads = [...owner.matchAll(/bookmarkFolderColors\s*=\s*readBookmarkFolderColors\(\)/g)];
  assert.equal(reads.length, 1, "folder colors should be read only when the Bookmarks dialog loads its tree");
  assert.match(owner, /const nextBookmarkTree\s*=\s*await api\.readBookmarkTree\(\)[\s\S]*?bookmarkTree\s*=\s*nextBookmarkTree[\s\S]*?bookmarkFolderColors\s*=\s*readBookmarkFolderColors\(\)[\s\S]*?renderBookmarkBrowser\(\)/);
});

test("1.32.0.5 keeps Bookmarks opening private to controller-owned event wiring", () => {
  assert.match(owner, /function bind\(\)[\s\S]*?bookmarksButton\?\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*void open\(\);\s*\}\)/);
  const returnBlock = owner.match(/return Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(returnBlock, "controller public contract should remain explicit");
  assert.doesNotMatch(returnBlock[1], /\bopen\s*,/);
});

test("1.32.0.5 localization refresh rebuilds the Bookmarks sidebar only once", () => {
  const browserBlock = owner.match(/function renderBookmarkBrowser\(\)\s*\{([\s\S]*?)\n  \}\n\n  async function loadBookmarksIntoDialog/);
  assert.ok(browserBlock);
  assert.match(browserBlock[1], /renderBookmarkSidebar\(\)/);

  const refreshBlock = owner.match(/function refreshLocalizedUi\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(refreshBlock);
  assert.doesNotMatch(refreshBlock[1], /renderBookmarkSidebar\(\)/);
  assert.equal((refreshBlock[1].match(/renderBookmarkBrowser\(\)/g) || []).length, 1);
});

test("1.32.0.5 close-toggle behavior remains reachable through bind without exposing open()", async () => {
  const moduleUrl = `${pathToFileURL(path.resolve(OWNER)).href}?step6=${Date.now()}`;
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

  assert.equal("open" in controller, false, "open() is controller-private after contract simplification");
  controller.bind();
  assert.equal(typeof clickHandler, "function");
  clickHandler();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1);
  assert.equal(loaded, 0, "closing an already-open dialog must still avoid the lazy Bookmarks API");
});
