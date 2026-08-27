import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

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

test("1.30.6 foreground/resume Sync hooks are throttled and reuse the existing reconciliation message", async () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  assert.match(source, /document\.addEventListener\("visibilitychange"[\s\S]*?maybeForegroundSyncReconcile\(\)/);
  assert.match(source, /window\.addEventListener\("focus"[\s\S]*?maybeForegroundSyncReconcile\(\)/);
  assert.match(source, /if \(pageshowPersisted\) maybeForegroundSyncReconcile\(\);/);
  assert.match(source, /sendSyncMessage\("mosaicsync:reconcile-if-needed", \{ reason: "foreground" \}\)/);

  const functionSource = extractFunction(source, "maybeForegroundSyncReconcile");
  let now = 100_000;
  const calls = [];
  const ctx = {
    document: { visibilityState: "visible" },
    meta: { syncEnabled: true, syncInitialized: true },
    lastForegroundSyncRequestAt: 0,
    foregroundSyncRequestInFlight: false,
    SYNC_FOREGROUND_CHECK_MIN_INTERVAL_MS: 60_000,
    performance: { now: () => now },
    sendSyncMessage: async (type, payload) => { calls.push({ type, payload }); return { ok: true }; }
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource, ctx);

  assert.equal(ctx.maybeForegroundSyncReconcile(), true);
  for (let index = 0; index < 20; index += 1) assert.equal(ctx.maybeForegroundSyncReconcile(), false);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 1, "rapid focus/visibility bursts must produce one background reconcile request");
  assert.equal(calls[0]?.type, "mosaicsync:reconcile-if-needed");
  assert.equal(calls[0]?.payload?.reason, "foreground");

  now += 59_999;
  assert.equal(ctx.maybeForegroundSyncReconcile(), false);
  now += 1;
  assert.equal(ctx.maybeForegroundSyncReconcile(), true, "the foreground check should become eligible after the throttle interval");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 2);

  ctx.document.visibilityState = "hidden";
  now += 60_000;
  assert.equal(ctx.maybeForegroundSyncReconcile(), false, "hidden pages must not wake the background for foreground checks");
});

test("1.30.6 foreground reconciliation self-heals the watchdog and keeps diagnostics device-local", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1306-foreground-recovery");
    assert.equal(out.recovered, true);
    assert.equal(out.alarmPeriod, 5);
    assert.equal(out.reason, "foreground");
  }
});

test("1.30.6 five-minute watchdog still recovers a missed storage.sync event", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1306-alarm-recovery");
    assert.equal(out.recovered, true);
    assert.equal(out.reason, "alarm");
  }
});

test("1.30.6 a local edit racing foreground recovery is rebased rather than lost", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1306-local-edit-foreground-race");
    assert.equal(out.localSurvived, true);
    assert.equal(out.remoteArrived, true);
  }
});

test("1.30.6 normal Work publication preserves newer delivered remote records", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1306-work-publication-rebase");
    assert.equal(out.remotePreserved, true);
    assert.equal(out.localPublished, true);
    assert.equal(out.liveRecordCount, 3);
  }
});

test("1.30.6 overlapping storage-event/alarm/foreground recovery remains serialized and idempotent", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1306-multi-trigger-idempotent");
    assert.equal(out.idempotent, true);
    assert.equal(out.count, 1);
  }
});

test("1.30.6 Sync diagnostics use a dedicated storage.local key and never a storage.sync key", () => {
  const constants = fs.readFileSync(resolve(root, "src/shared/core/constants.js"), "utf8");
  assert.match(constants, /LOCAL_SYNC_DIAGNOSTICS_KEY = "mosaicsync\.sync-diagnostics\.v1"/);
  assert.match(constants, /SYNC_FOREGROUND_CHECK_MIN_INTERVAL_MS = 60_000/);
  for (const browser of ["firefox", "chrome"]) {
    const background = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    assert.match(background, /browser\.storage\.local\.set\(\{ \[LOCAL_SYNC_DIAGNOSTICS_KEY\]: next \}\)/);
    assert.doesNotMatch(background, /browser\.storage\.sync\.set\(\{ \[LOCAL_SYNC_DIAGNOSTICS_KEY\]/);
    assert.match(background, /lastObservedSharedRevision/);
    assert.match(background, /lastObservedDeviceRevision/);
    assert.match(background, /lastObservedWorkRevision/);
    assert.match(background, /lastObservedProfileRevision/);
    assert.match(background, /lastSyncStorageChangeEventAt/);
  }
});
