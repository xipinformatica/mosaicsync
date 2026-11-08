// @kind integration
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readBackgroundSource } from "./harness/background-source.mjs";

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

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.43 ${browser} Clear Sync copy succeeds when reset-intent cannot be added to a full namespace`, () => {
    const out = runScenario(browser, "sync-1301843-full-quota-clear");
    assert.equal(out.cleared, true);
    assert.equal(out.localPreserved, true);
    assert.equal(out.onlyResetIntent, true);
    assert.equal(out.syncWaiting, true);
    assert.equal(out.noAutoRepublish, true);
    assert.equal(out.clearCalls, 0);
  });
}

test("1.31.0 Clear Sync copy arms locally, makes capacity, commits the sentinel, then removes old keys", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("async function clearSyncData()");
    const end = source.indexOf("async function readSyncSnapshot", start);
    const block = source.slice(start, end);
    const localReset = block.indexOf("markIntentionalSyncReset");
    const capacity = block.indexOf("planResetIntentCapacity");
    const sentinel = block.lastIndexOf("writeSyncItems({ [SYNC_RESET_INTENT_KEY]: resetIntent, [SYNC_RESET_EPOCH_KEY]: resetMarker }");
    const finalRemoval = block.indexOf("removeSyncItems(oldKeys)");
    assert.ok(localReset >= 0, `${browser}: reset must be armed locally`);
    assert.ok(capacity > localReset, `${browser}: capacity planning must happen after local reset protection is armed`);
    assert.ok(sentinel > capacity, `${browser}: reset sentinel must be written after capacity planning`);
    assert.ok(finalRemoval > sentinel, `${browser}: old keys must be removed only after reset-intent is durable`);
    assert.doesNotMatch(block, /browser\.storage\.sync\.clear\(\)/, `${browser}: reset cannot expose an empty namespace before sentinel durability`);
  }
});

test("1.30.18.43 destructive reset warning exists in every supported runtime locale", async () => {
  const localeDir = resolve(root, "src/shared/core/i18n-locales");
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js"));
  assert.ok(files.length >= 30);
  for (const file of files) {
    const module = await import(`${new URL(`../src/shared/core/i18n-locales/${file}`, import.meta.url).href}?v=1301843`);
    for (const key of ["clearSyncWarning", "syncDataCleared"]) {
      assert.equal(typeof module.MESSAGES[key], "string", `${file} missing ${key}`);
      assert.ok(module.MESSAGES[key].length > 20, `${file} ${key} unexpectedly short`);
    }
  }
});

test("1.30.18.43 Settings confirmation presents the destructive reset warning", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const start = source.indexOf('clearSyncButton?.addEventListener("click"');
  const end = source.indexOf("// ---------------------------------------------------------------------------", start);
  const block = source.slice(start, end);
  assert.match(block, /t\("deleteSyncTitle"\)/);
  assert.match(block, /t\("clearSyncWarning"\)/);
});

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: a full Sync namespace makes older Recovery generations give way to layout changes`, () => {
    const out = runScenario(browser, "sync-recovery-copies-yield-to-layout");
    assert.equal(out.allReached, true, "every layout change must reach Sync");
    assert.equal(out.syncStatus, "ready");
    for (const device of ["device-b", "device-c", "device-d"]) {
      assert.ok(out.after[device] >= 1, `${device} keeps its newest complete Recovery copy`);
    }
    const count = value => Object.values(value).reduce((sum, n) => sum + n, 0);
    assert.ok(count(out.after) < count(out.before), "older Recovery generations were retired to make room");
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: a temporary Sync write-rate limit never removes Recovery generations`, () => {
    const out = runScenario(browser, "sync-recovery-copies-kept-on-write-rate-limit");
    assert.equal(out.rateLimited, true, "the scenario must hit the simulated write-rate limit");
    assert.ok(out.usedBefore < 100000, "space was still available");
    assert.deepEqual(out.after, out.before, "every Recovery generation is kept");
    assert.equal(out.second, true, "the next change reaches Sync once the limit passes");
  });
}

test("firefox: a write Firefox refuses although getBytesInUse says it fits still makes older Recovery generations give way", () => {
  const out = runScenario("firefox", "sync-recovery-copies-yield-in-firefox-quota-window");
  assert.ok(out.plainFreeBefore >= out.write, "by getBytesInUse the change still fits");
  assert.equal(out.reached, true, "the layout change must reach Sync");
  const count = value => Object.values(value).reduce((sum, n) => sum + n, 0);
  assert.ok(count(out.after) < count(out.before), "older Recovery generations were retired to make room");
  for (const device of ["device-b", "device-c", "device-d"]) assert.ok(out.after[device] >= 1, `${device} keeps its newest complete Recovery copy`);
});

test("firefox: at the 512-item edge a write refused by one byte still makes older Recovery generations give way", () => {
  const out = runScenario("firefox", "sync-recovery-copies-yield-at-firefox-item-limit");
  assert.equal(out.itemsAfterWrite, 512, "the write lands exactly on the item limit");
  assert.equal(out.bytesAfterWrite, 102400 - 4 * 512, "and exactly 2,048 bytes below the byte limit by getBytesInUse");
  assert.equal(out.reached, true, "the layout change must reach Sync");
  const count = value => Object.values(value).reduce((sum, n) => sum + n, 0);
  assert.ok(count(out.after) < count(out.before), "older Recovery generations were retired to make room");
  for (const device of ["device-b", "device-c", "device-d"]) assert.ok(out.after[device] >= 1, `${device} keeps its newest complete Recovery copy`);
});

// Clear Sync copy must fit its two reset markers under each browser's real Sync quota
// rule (measured in Firefox 140/158 and Chrome 153): Firefox counts the whole namespace
// serialized as one JSON object (4 bytes per item plus 1 more than getBytesInUse);
// Chrome counts key + its own JSON, where timestamps are doubles (up to 5 bytes more).
function assertResetCompleted(out, label) {
  assert.equal(out.cleared, true, `${label}: Clear Sync copy must succeed (${out.error})`);
  assert.equal(out.onlyResetMarkers, true, `${label}: only the two reset markers remain`);
  assert.equal(out.localPreserved, true, `${label}: the local layout is kept`);
  assert.equal(out.pendingEditKept, true, `${label}: an unsynced local edit is kept`);
  assert.equal(out.syncEnabled, true, `${label}: the Sync preference is kept`);
  assert.equal(out.syncInitialized, false, `${label}: the device waits for a deliberate choice`);
  assert.equal(out.syncWaiting, true, `${label}: await-remote / waiting`);
  assert.equal(out.noAutoRepublish, true, `${label}: nothing is republished automatically`);
  assert.deepEqual(out.violations, [], `${label}: never empty, live-core evidence until the marker is durable`);
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: Clear Sync copy succeeds when Sync is full by the browser's real quota rule`, () => {
    assertResetCompleted(runScenario(browser, "sync-reset-browser-quota-window"), browser);
  });
  test(`${browser}: Clear Sync copy succeeds at the 512-item limit`, () => {
    assertResetCompleted(runScenario(browser, "sync-reset-browser-quota-item-limit"), `${browser} 512 items`);
  });
  test(`${browser}: Clear Sync copy counts multi-byte and escaped text as the browser does`, () => {
    assertResetCompleted(runScenario(browser, "sync-reset-browser-quota-unicode"), `${browser} unicode`);
  });
  test(`${browser}: Clear Sync copy removes nothing early when its markers just fit`, () => {
    const out = runScenario(browser, "sync-reset-browser-quota-exact-fit");
    assertResetCompleted(out, `${browser} exact fit`);
    assert.deepEqual(out.preSentinelRemovals, [], "no old record is removed when the markers fit");
  });
}

test("chrome: a write-rate refusal of the reset marker leaves Sync and this computer as before", () => {
  const out = runScenario("chrome", "sync-reset-browser-quota-rate-limit");
  assert.equal(out.cleared, false);
  assert.match(out.error, /MAX_WRITE_OPERATIONS/);
  assert.equal(out.remoteUnchanged, true, "no old record was removed before the refused marker write");
  assert.deepEqual(out.preSentinelRemovals, []);
  assert.equal(out.syncInitialized, true, "the previous Sync relationship is restored");
  assert.equal(out.localPreserved, true);
  assert.equal(out.pendingEditKept, true);
});

// R1: when this computer's own reset marker never became durable (refused, write-rate
// limited, or the worker stopped mid-write), nothing automatic may adopt the pre-reset
// cloud over an unsynced local edit or discard its journal; an explicit retry still works.
for (const mode of ["own-refused", "own-rate", "own-interrupted", "own-committed-interrupted", "own-unmutated-interrupted", "own-refused-peer-reset"]) {
  test(`${mode}: an incomplete reset of this computer never auto-adopts the old cloud or drops unsynced edits`, () => {
    for (const browser of ["firefox", "chrome"]) {
      const out = runScenario(browser, `sync-reset-browser-quota-${mode}`);
      const label = `${browser} ${mode}`;
      assert.equal(out.firstFailed, true, `${label}: the reset must not report success`);
      assert.equal(out.automatic.localPreserved, true, `${label}: the local layout is kept`);
      assert.equal(out.automatic.pendingEditKept, true, `${label}: the unsynced local edit is kept`);
      assert.equal(out.automatic.journalKept, true, `${label}: its pending Sync journal is kept`);
      assert.equal(out.automatic.noDeviceWrites, true, `${label}: nothing is published or removed automatically`);
      assert.equal(out.automatic.syncInitialized, false, `${label}: the computer waits for an explicit choice`);
      assert.equal(out.automatic.syncEnabled, true, `${label}: the Sync preference is kept`);
      assert.equal(out.retry.cleared, true, `${label}: an explicit retry completes the reset (${out.retry.error})`);
      assert.equal(out.retry.onlyResetMarkers, true, `${label}: the retry leaves only the reset markers`);
      assert.equal(out.retry.pendingEditKept, true, `${label}: the local edit survives the retry`);
      assert.deepEqual(out.violations, [], `${label}: never empty, live-core evidence until the marker is durable`);
    }
  });
}
