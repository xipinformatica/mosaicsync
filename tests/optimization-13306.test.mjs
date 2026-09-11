import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const html = () => fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
const source = () => fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.33.0.6 removes the Bookmarks dialog shell from initial New Tab HTML", () => {
  const text = html();
  assert.doesNotMatch(text, /<dialog id="bookmarksDialog"/);
  assert.doesNotMatch(text, /id="bookmarksPermissionState"/);
  assert.doesNotMatch(text, /id="bookmarkFolderTree"/);
  const shell = fs.readFileSync("src/shared/newtab/bookmarks-shell.js", "utf8");
  assert.match(shell, /bookmarksDialog/);
  assert.match(shell, /bookmarksPermissionState/);
  assert.match(shell, /bookmarkFolderTree/);
});

test("1.33.0.6 removes Bookmarks controller and shell from the static startup graph", () => {
  const text = source();
  assert.doesNotMatch(text, /^import \{ createBookmarksController \} from "\.\/bookmarks-controller\.js";/m);
  assert.match(text, /import\("\.\/bookmarks-controller\.js"\)/);
  assert.match(text, /import\("\.\/bookmarks-shell\.js"\)/);
  assert.doesNotMatch(text, /const bookmarksDialog = document\.getElementById\("bookmarksDialog"\)/);
  assert.doesNotMatch(text, /const bookmarksPermissionState = document\.getElementById\("bookmarksPermissionState"\)/);
});

test("1.33.0.6 lazy Bookmarks opening hands first use back to the existing controller owner", () => {
  const text = source();
  assert.match(text, /let bookmarksController = null/);
  assert.match(text, /let bookmarksDialog = null/);
  assert.match(text, /bookmarksControllerPromise/);
  assert.match(text, /activateBookmarksOnFirstUse/);
  assert.match(text, /openOnBind: true/);
  const owner = fs.readFileSync("src/shared/newtab/bookmarks-controller.js", "utf8");
  assert.match(owner, /openOnBind = false/);
  assert.match(owner, /if \(openOnBind\) void open\(\)/);
  const returnBlock = owner.match(/return Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(returnBlock);
  assert.doesNotMatch(returnBlock[1], /\bopen\s*,/, "open() remains controller-private");
});

test("1.33.0.6 critical-path census proves Bookmarks left initial DOM and static module closure", () => {
  const raw = execFileSync(process.execPath, ["tools/critical-path-census.mjs", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  assert.ok(parsed.initialDom.elementCount <= 598, `expected <=598 initial elements, got ${parsed.initialDom.elementCount}`);
  assert.ok(parsed.initialDom.secondaryElementCount <= 490, `expected <=490 secondary elements, got ${parsed.initialDom.secondaryElementCount}`);
  assert.ok(parsed.eagerDomBindings.total <= 186, `expected <=186 eager bindings, got ${parsed.eagerDomBindings.total}`);
  assert.ok(parsed.eagerDomBindings.secondary <= 151, `expected <=151 secondary eager bindings, got ${parsed.eagerDomBindings.secondary}`);
  assert.ok(parsed.moduleEvaluation.staticGraph.moduleCount <= 23, `expected <=23 static modules, got ${parsed.moduleEvaluation.staticGraph.moduleCount}`);
  assert.ok(parsed.deferredModules.roots.some(entry => entry.root === "newtab/bookmarks-controller.js"), "Bookmarks controller must be deferred");
  assert.ok(parsed.deferredModules.roots.some(entry => entry.root === "newtab/bookmarks-shell.js"), "Bookmarks shell must be deferred");
});

test("1.33.0.6 Bookmarks shell uses safe DOM construction and owns its dynamic close control", () => {
  const shell = fs.readFileSync("src/shared/newtab/bookmarks-shell.js", "utf8");
  assert.doesNotMatch(shell, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(shell, /createElement/);
  assert.match(shell, /createElementNS/);
  assert.match(shell, /closeButton\.addEventListener\("click", onClose\)/);
});

import { testFilesForGroup } from "../tools/test-groups.mjs";

test("1.33.0.6 focused Startup and New Tab groups include Step-3B coverage", () => {
  for (const group of ["startup", "newtab"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-13306.test.mjs"), `${group} must include optimization-13306.test.mjs`);
  }
});

test("1.33.0.6 freezes Step-3B evidence and remains the Step 3 completion endpoint", () => {
  const snapshot = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP3B-1.33.0.6.json", "utf8"));
  assert.equal(snapshot.version, "1.33.0.6");
  assert.equal(snapshot.after.initialElements, 598);
  assert.equal(snapshot.after.secondaryElements, 490);
  assert.equal(snapshot.after.eagerBindings, 186);
  assert.equal(snapshot.after.secondaryEagerBindings, 151);
  assert.equal(snapshot.after.staticModuleCount, 23);
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 3 — DOM\/CSS\/lazy secondary UI: DONE in 1\.33\.0\.6/);
});
