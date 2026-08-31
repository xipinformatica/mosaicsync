import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}`);
  if (start < 0) start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test("1.30.7 trusted cross-Space fast paths are output-equivalent to defensive wrappers", async () => {
  const model = await import(`../dist/firefox/core/model.js?1307=${Date.now()}`);
  // Keep the fixture's logical clock safely ahead of wall time so the defensive
  // and trusted calls cannot differ merely because Date.now() crosses a
  // millisecond boundary between the two otherwise-equivalent operations.
  const logicalClock = 4_000_000_000_000;
  const before = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{ type:"shortcut", id:"a", title:"A", url:"https://a.test/", position:0, createdAt:logicalClock, modifiedAt:logicalClock, image:"", imageSyncData:"", imageSyncKind:"none", imageSourceKind:"none", imageStyle:"contain", source:"manual" }],
        settings: {}, settingsModifiedAt:logicalClock, updatedAt:logicalClock
      },
      work: { shortcuts: [], settings: {}, settingsModifiedAt:logicalClock, updatedAt:logicalClock }
    }
  });
  const options = { shortcutId:"a", fromSpaceId:"personal", toSpaceId:"work" };
  const defensiveMove = model.moveShortcutBetweenSpaces(before, options);
  const fastMove = model.moveShortcutBetweenSpacesNormalized(before, options);
  assert.deepEqual(fastMove, defensiveMove);

  const intentOptions = { fromSpaceId:"personal", toSpaceId:"work", shortcutIds:["a"], deviceId:"dev", timestamp:123 };
  const originalRandomUUID = globalThis.crypto?.randomUUID;
  // Intent IDs are intentionally random; compare semantic payload excluding the ID.
  const defensiveIntent = model.createCrossSpaceSyncIntent(before, defensiveMove, intentOptions);
  const fastIntent = model.createCrossSpaceSyncIntentNormalized(before, fastMove, intentOptions);
  const stripId = intent => ({ ...intent, intentId:"" });
  assert.deepEqual(stripId(fastIntent), stripId(defensiveIntent));
  void originalRandomUUID;
});

test("1.30.7 New Tab uses normalized cross-Space paths and exact compact write baselines", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  assert.match(source, /moveShortcutBetweenSpacesNormalized\(beforeMove/);
  assert.match(source, /createCrossSpaceSyncIntentNormalized\(beforeMove/);
  assert.match(source, /writeLocalStateWithBaseline\(state, \{[\s\S]*?baseStateIsCompact: Boolean\(baseState\)/);
  assert.match(source, /writeBaseline\s*=\s*persisted\.compactBaseline/);
});

test("1.30.7 compact baseline path bypasses defensive baseline reconstruction", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/core/storage.js"), "utf8");
  assert.match(source, /baseStateIsCompact \? cloneCompactJson\(baseState\) : createWriteBaseline\(baseState, assetIdMemo\)/);
  assert.match(source, /compactBaseline: cloneCompactJson\(projection\.state\)/);
  assert.match(source, /export async function writeLocalStateWithBaseline/);
});

test("1.30.7 twenty simultaneous foreground checks share one background freshness read", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1307-foreground-single-flight");
    assert.equal(out.requests, 20);
    assert.equal(out.syncGetAllCalls, 1);
  }
});

test("1.30.7 foreground throttle uses a monotonic page-lifetime clock", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const fn = extractFunction(source, "maybeForegroundSyncReconcile");
  assert.match(fn, /const requestedAt = performance\.now\(\)/);
  assert.doesNotMatch(fn, /Date\.now\(\)/);
});

test("1.30.7 publication rebase skips serialization immediately when delivered remote wins", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const fn = extractFunction(source, "rebaseCoreWritesAgainstDeliveredSnapshot");
    assert.match(fn, /if \(winner === remote\) continue;/);
    assert.doesNotMatch(fn, /stableStringify\(remote\)\s*!==\s*stableStringify\(winner\)/);
  }
});

test("1.30.7 workspace clocks provide a positive fast path while equal clocks retain semantic fallback", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const fn = extractFunction(source, "workspaceCoreChanged");
    let signatureCalls = 0;
    const ctx = {
      Number,
      workspaceCoreSignature: () => { signatureCalls += 1; return String(signatureCalls); }
    };
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);
    const changedClock = ctx.workspaceCoreChanged(
      { spaces:{ personal:{ updatedAt:1, settingsModifiedAt:1 } } },
      { spaces:{ personal:{ updatedAt:2, settingsModifiedAt:1 } } },
      "personal", "dev"
    );
    assert.equal(changedClock, true);
    assert.equal(signatureCalls, 0, "changed clocks must not build semantic signatures");
    ctx.workspaceCoreChanged(
      { spaces:{ personal:{ updatedAt:2, settingsModifiedAt:1 } } },
      { spaces:{ personal:{ updatedAt:2, settingsModifiedAt:1 } } },
      "personal", "dev"
    );
    assert.equal(signatureCalls, 2, "equal clocks must retain exact semantic fallback");
  }
});

test("1.30.7 expected own Sync echoes do not overwrite remote-delivery forensic evidence", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const onChangedAt = source.indexOf("browser.storage.onChanged.addListener");
    const alarmAt = source.indexOf("browser.alarms?.onAlarm?.addListener", onChangedAt);
    const block = source.slice(onChangedAt, alarmAt);
    assert.match(block, /if \(unresolvedChanges\.length \|\| overwrittenEvidenceCount\) \{\s*const storageEventAt = Date\.now\(\)/);
    assert.doesNotMatch(block, /else \{\s*void diagnosticWrite/);
  }
});

test("1.30.7 Settings geometry writes are skipped when columns/tile size are unchanged", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  assert.match(source, /const geometryKey = `\$\{settings\.columns\}:\$\{tileSize\}`/);
  assert.match(source, /if \(geometryKey !== lastAppliedGeometryKey\)/);
  assert.match(source, /lastAppliedGeometryKey = geometryKey/);
});

test("1.30.7 Settings CSS keeps one scroll owner without dead aside backdrop/inner height overrides", () => {
  const css = fs.readFileSync(resolve(root, "src/shared/newtab/newtab-secondary.css"), "utf8");
  assert.doesNotMatch(css, /\.settings-dialog::backdrop/);
  assert.doesNotMatch(css, /\.settings-dialog \.dialog-card\{max-height: calc\(100vh - (?:80|90)px\)/);
  assert.match(css, /\.settings-dialog\{width: min\(500px,[^}]*overflow-y: auto;overflow-x: hidden;/);
  assert.match(css, /\.settings-dialog \.dialog-card\{width: 100%;max-width: 100%;max-height: none;overflow: visible;padding: 22px;/);
});
