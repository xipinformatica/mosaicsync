import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testFilesForGroup } from "../tools/test-groups.mjs";

const source = () => fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

function functionBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = text.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("1.33.0.8 has an effective-background-only preload primitive", () => {
  const body = functionBody(source(), "preloadEffectiveBackgroundForSettings");
  assert.match(body, /preloadResolvedBackground\(effectiveBackgroundPresetId\(settings\), effectiveBackgroundImageValue\(settings\)\)/);
  assert.doesNotMatch(body, /lightBackgroundPreset|darkBackgroundPreset|Promise\.all/,
    "effective-only preload must not touch the alternate theme wallpaper");
});

test("1.33.0.8 Space intent warms only the background that can actually be painted", () => {
  const body = functionBody(source(), "preloadSpaceBackgroundOnIntent");
  assert.match(body, /preloadEffectiveBackgroundForSettings\(settings\)/);
  assert.doesNotMatch(body, /preloadBackgroundForSettings\(settings\)/);
});

test("1.33.0.8 correctness-owned Space hydration waits only for the effective destination background", () => {
  const body = functionBody(source(), "hydrateSpaceForOwnedOperation");
  assert.match(body, /if \(preloadBackground\)[\s\S]*?await preloadEffectiveBackgroundForSettings\(targetSettings\)/);
  assert.doesNotMatch(body, /if \(preloadBackground\)[\s\S]*?await preloadBackgroundForSettings\(targetSettings\)/);
});

test("1.33.0.8 preserves broader active-Space theme warming as an explicit negative control", () => {
  const text = source();
  const full = functionBody(text, "preloadBackgroundForSettings");
  assert.match(full, /preloadEffectiveBackgroundForSettings\(settings\)/,
    "full active-Space warming should include the currently effective background");
  assert.match(full, /effectiveThemeFor\(settings\)/);
  assert.match(full, /lightBackgroundPreset/);
  assert.match(full, /darkBackgroundPreset/);
  assert.match(functionBody(text, "schedulePostPaintMaintenance"), /preloadBackgroundForSettings\(state\.settings\)/,
    "active-Space post-paint theme continuity remains unchanged");
});

test("1.33.0.8 focused Startup and New Tab groups include Step-4B coverage", () => {
  for (const group of ["startup", "newtab"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-13308.test.mjs"), `${group} must include optimization-13308.test.mjs`);
  }
});

test("1.33.0.8 freezes Step-4B evidence and keeps Step 4 in progress", () => {
  const snapshot = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP4B-1.33.0.8.json", "utf8"));
  assert.equal(snapshot.version, "1.33.0.8");
  assert.equal(snapshot.before.destinationThemeVariantsWarmablePerIntentOrSwitch, 2);
  assert.equal(snapshot.after.destinationThemeVariantsWarmablePerIntentOrSwitch, 1);
  assert.equal(snapshot.correctness.actualSwitchStillAwaitsEffectiveDestinationBackground, true);
  assert.equal(snapshot.negativeControls.activeSpaceBroaderThemeWarmPreserved, true);
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 4 — Asset\/image\/network frugality: (?:IN PROGRESS in 1\.33\.0\.8|DONE in 1\.33\.0\.9)/);
});
