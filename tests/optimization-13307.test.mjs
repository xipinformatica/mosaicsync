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

test("1.33.0.7 closes Step 3 rather than forcing another ownership-sensitive UI extraction", () => {
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 3 — DOM\/CSS\/lazy secondary UI: DONE in 1\.33\.0\.6/);
  assert.match(tracker, /Step 4 — Asset\/image\/network frugality: (?:IN PROGRESS in 1\.33\.0\.8|DONE in 1\.33\.0\.9)/);
});

test("1.33.0.7 removes unconditional other-Space background warming", () => {
  const text = source();
  assert.doesNotMatch(text, /function preloadOtherSpaceBackgrounds\(/);
  assert.doesNotMatch(text, /preloadOtherSpaceBackgrounds\(\)/);
  const maintenance = functionBody(text, "schedulePostPaintMaintenance");
  assert.doesNotMatch(maintenance, /spaces\?\.|SPACE_IDS|preloadSpaceBackgroundOnIntent/,
    "ordinary post-paint maintenance must not decode an inactive Space background");
});

test("1.33.0.7 warms only the explicitly intended destination Space", () => {
  const text = source();
  const helper = functionBody(text, "preloadSpaceBackgroundOnIntent");
  assert.match(helper, /SPACE_IDS\.includes\(spaceId\)/);
  assert.match(helper, /spaceId === state\.activeSpaceId/);
  assert.match(helper, /state\?\.spaces\?\.\[spaceId\]\?\.settings/);
  assert.match(helper, /preloadEffectiveBackgroundForSettings\(settings\)/);
  assert.doesNotMatch(helper, /for \(const spaceId of SPACE_IDS\)/);
});

test("1.33.0.7 starts destination warming from real switch intent while preserving correctness-owned preload", () => {
  const text = source();
  assert.match(text, /button\.addEventListener\("pointerenter",[\s\S]*?preloadSpaceBackgroundOnIntent\(button\.dataset\.spaceId\)/);
  assert.match(text, /button\.addEventListener\("pointerdown",[\s\S]*?preloadSpaceBackgroundOnIntent\(button\.dataset\.spaceId\)/);
  assert.match(text, /button\.addEventListener\("focus",[\s\S]*?preloadSpaceBackgroundOnIntent\(button\.dataset\.spaceId\)/);
  assert.match(text, /button\.addEventListener\("dragenter",[\s\S]*?preloadSpaceBackgroundOnIntent\(button\.dataset\.spaceId\)/);
  assert.match(text, /preloadSpaceBackgroundOnIntent\(spaceId\);[\s\S]*?switchActiveSpace\(spaceId\)/,
    "keyboard Space switching should issue the same best-effort warm hint");
  assert.match(text, /hydrateSpaceForOwnedOperation\(spaceId, isCurrentSwitch, true\)/,
    "actual switching must still await correctness-owned destination background readiness");
});

test("1.33.0.7 focused Startup and New Tab groups include Step-4A coverage", () => {
  for (const group of ["startup", "newtab"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-13307.test.mjs"), `${group} must include optimization-13307.test.mjs`);
  }
});

test("1.33.0.7 freezes Step-4A evidence", () => {
  const snapshot = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP4A-1.33.0.7.json", "utf8"));
  assert.equal(snapshot.version, "1.33.0.7");
  assert.equal(snapshot.before.automaticInactiveSpaceWarmTriggers, 4);
  assert.equal(snapshot.after.automaticInactiveSpaceWarmTriggers, 0);
  assert.equal(snapshot.after.intentDrivenWarmTriggers, 5);
  assert.equal(snapshot.correctness.actualSwitchStillAwaitsDestinationBackground, true);
  assert.equal(snapshot.negativeControls.activeSpacePostPaintWarmPreserved, true);
});
