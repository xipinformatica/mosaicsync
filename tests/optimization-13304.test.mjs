import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const html = () => fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
const source = () => fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

function extractAsyncFunction(text, name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers.map(m => text.indexOf(m)).find(i => i >= 0);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = text.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test("1.33.0.4 removes the Wallpaper Gallery shell from the initial live New Tab HTML", () => {
  const text = html();
  assert.doesNotMatch(text, /<dialog id="wallpaperGalleryDialog"/);
  assert.doesNotMatch(text, /id="wallpaperGalleryGrid"/);
  const shell = fs.readFileSync("src/shared/newtab/wallpaper-gallery-shell.js", "utf8");
  assert.match(shell, /wallpaperGalleryDialog/);
  assert.match(shell, /wallpaperGalleryGrid/);
  assert.match(shell, /aria-labelledby/);
});

test("1.33.0.4 Wallpaper Gallery shell leaves the static startup graph and has no eager ID lookup", () => {
  const text = source();
  assert.match(text, /import\("\.\/wallpaper-gallery-shell\.js"\)/);
  assert.match(text, /let wallpaperGalleryDialog = null/);
  assert.match(text, /let wallpaperGalleryGrid = null/);
  assert.doesNotMatch(text, /const wallpaperGalleryDialog = document\.getElementById\("wallpaperGalleryDialog"\)/);
  assert.doesNotMatch(text, /const wallpaperGalleryGrid = document\.getElementById\("wallpaperGalleryGrid"\)/);
});

test("1.33.0.4 lazy Wallpaper Gallery opening is bound to the current Settings ownership generation", () => {
  const helper = extractAsyncFunction(source(), "openWallpaperGallery");
  assert.match(helper, /__mosaicOwnershipGeneration/);
  assert.match(helper, /await wallpaperGalleryModulePromise/);
  assert.match(helper, /isSettingsOpen\(\)/);
  assert.match(helper, /ownerGeneration/);
  assert.match(helper, /showModal\(\)/);
  assert.ok(helper.indexOf("await wallpaperGalleryModulePromise") < helper.indexOf("showModal()"));
});

test("1.33.0.4 critical-path census proves the pilot extraction reduced startup DOM and eager bindings", () => {
  const raw = execFileSync(process.execPath, ["tools/critical-path-census.mjs", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(raw);
  assert.ok(parsed.initialDom.elementCount <= 631, `expected <=631 initial elements, got ${parsed.initialDom.elementCount}`);
  assert.ok(parsed.initialDom.secondaryElementCount <= 523, `expected <=523 secondary elements, got ${parsed.initialDom.secondaryElementCount}`);
  assert.ok(parsed.eagerDomBindings.total <= 198, `expected <=198 eager bindings, got ${parsed.eagerDomBindings.total}`);
  assert.ok(parsed.eagerDomBindings.secondary <= 163, `expected <=163 secondary eager bindings, got ${parsed.eagerDomBindings.secondary}`);
  assert.ok(parsed.deferredModules.roots.some(entry => entry.root === "newtab/wallpaper-gallery-shell.js"), "gallery shell must be in the deferred module graph");
});

test("1.33.0.4 lazy shell owns close wiring so dynamically-created controls are not missed by startup scans", () => {
  const shell = fs.readFileSync("src/shared/newtab/wallpaper-gallery-shell.js", "utf8");
  assert.match(shell, /closeButton\.addEventListener\("click", onClose\)/);
  assert.match(shell, /dialog\.addEventListener\("click"/);
  assert.match(shell, /event\.target === dialog/);
});


test("1.33.0.4 freezes the Step-3A evidence while leaving the larger DOM journey in progress", () => {
  const snapshot = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP3A-1.33.0.4.json", "utf8"));
  assert.equal(snapshot.version, "1.33.0.4");
  assert.equal(snapshot.after.initialElements, 631);
  assert.equal(snapshot.after.secondaryElements, 523);
  assert.equal(snapshot.after.eagerBindings, 198);
  assert.equal(snapshot.after.secondaryEagerBindings, 163);
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 3 — DOM\/CSS\/lazy secondary UI: (?:IN PROGRESS (?:in 1\.33\.0\.4|through 1\.33\.0\.6)|DONE in 1\.33\.0\.6)/);
});
