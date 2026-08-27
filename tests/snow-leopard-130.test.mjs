import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const brace = source.indexOf("{\n", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} unterminated`);
}

const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
const critical = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
const firefoxBg = fs.readFileSync("src/firefox/background/background.js", "utf8");
const english = fs.readFileSync("src/shared/core/i18n-locales/en.js", "utf8");

for (const browser of ["firefox", "chrome"]) {
  test(`1.30 ${browser} open Settings never repaints a full-viewport appearance layer`, () => {
    const source = newtab;
    const calls = [];
    const ctx = vm.createContext({
      settingsDialog: { hidden: false },
      deferredAppearanceVisual: false,
      deferredLauncherSettings: false,
      deferredLauncherRender: false,
      state: { settings: {} },
      applySettings() { calls.push("applySettings"); },
      applyPageBackgroundVisual() { calls.push("applyPageBackgroundVisual"); },
      render() { calls.push("render"); },
      scheduleAppearanceHintRefresh() {},
      console
    });
    vm.runInContext(extractFunction(source, "isSettingsOpen"), ctx);
    vm.runInContext(extractFunction(source, "reconcileLauncherAfterExternalState"), ctx);
    ctx.reconcileLauncherAfterExternalState();
    assert.deepEqual(calls, [], "non-appearance external state must not touch any appearance painter while Settings is open");
    assert.equal(ctx.deferredLauncherSettings, true);
    assert.equal(ctx.deferredLauncherRender, true);

    const applyBackground = extractFunction(source, "applyPageBackgroundVisual");
    assert.doesNotMatch(applyBackground, /paintAppearancePreviewLayer\(/,
      "open Settings must defer the real page background instead of mutating a second full-screen compositor layer");
  });
}

test("1.30 empty-state callout centers the arrow tail on the bubble and the arrow tip on the tile across tile sizes", () => {
  assert.match(critical, /\.empty-guide-arrow\s*\{[\s\S]*?top:\s*calc\(var\(--tile-size\)\s*\/\s*2\s*-\s*25px\)/,
    "arrow path tip y=25 must track the tile vertical center");
  assert.match(critical, /\.empty-callout\s*\{[\s\S]*?top:\s*calc\(var\(--tile-size\)\s*\/\s*2\s*-\s*17px\)[\s\S]*?transform:\s*translateY\(-50%\)/,
    "bubble center must align with the arrow path start y=8 (17px above the tip)");
});

test("1.30 automatic favicon recovery always performs a bounded quality follow-up for merely adequate fast icons", () => {
  const threshold = Number(firefoxBg.match(/const FAVICON_AUTHORITATIVE_SUITABILITY\s*=\s*(\d+);/)?.[1] || 0);
  assert.ok(threshold >= 375, "64px conventional favicon must not suppress the automatic quality pass");
  const resolver = extractFunction(firefoxBg, "resolveFaviconForUrl");
  assert.match(resolver, /if \(!preferQuality && initialOrigin\)[\s\S]*?return \{ \.\.\.best, provisional: true \};/,
    "fast pass must explicitly remain provisional so the durable quality follow-up runs");
  assert.doesNotMatch(resolver, /if \(preferQuality[^\n]*faviconCandidateIsAuthoritativelyGoodEnough\(best\)[\s\S]{0,180}?return/,
    "final quality mode must not stop merely because an adequate candidate crossed the old threshold");
});

test("1.30 Sync copy wording distinguishes foreign receipt from this device publishing", () => {
  assert.match(english, /"received":"Received from another device"/);
  assert.match(newtab, /t\("received"\)/);
  assert.doesNotMatch(english, /"syncTimingTitle":"[^"]*every minute/i);
  assert.doesNotMatch(english, /"syncWaitAvailable":"[^"]*every minute/i);
  assert.match(english, /"sendToSync":"[^"]*(device|computer)[^"]*(source|Sync source)[^"]*"/i,
    "authoritative publish control must not read like a harmless Sync-now action");
});

test("1.30 source tree no longer carries the dead monolithic newtab.css reference", () => {
  assert.equal(fs.existsSync("src/shared/newtab/newtab.css"), false);
});

test("1.30 obsolete Personal-only snapshot publisher is gone while compatibility readers remain", () => {
  for (const browser of ["firefox", "chrome"]) {
    const src = fs.readFileSync(`src/${browser}/background/background.js`, "utf8");
    assert.doesNotMatch(src, /async function publishDeviceSnapshot\(/);
    assert.match(src, /async function readOwnDeviceSnapshot\(/,
      "legacy device-snapshot reading remains for backward compatibility");
  }
});
