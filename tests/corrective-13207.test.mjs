import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.32.0.7 ${browser}: a post-recheck user edit with stale cached Sync meta remains durably pending`, () => {
    const result = runScenario(browser, "adjudicate-claude-f1-post-recheck-stale-meta");
    assert.equal(result.localHas, true, "the user edit must remain authoritative locally");
    assert.equal(result.remoteHas, false, "the already-running bootstrap must not pretend it published the later edit");
    assert.equal(result.pendingAfter, true, "the later edit must remain durably pending for reconciliation");
    assert.equal(result.secondOk, true, "normal reconciliation must accept the durable retry");
    assert.equal(result.remoteHasAfterReconcile, true, "normal reconciliation must publish the late edit");
    assert.equal(result.pendingAfterReconcile, false, "the journal may clear only after the late edit is actually published");
  });
}

test("1.32.0.7 New Tab marks user Sync intent semantically while durable meta owns journal authority", async () => {
  const fs = await import("node:fs");
  const newtab = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const storage = fs.readFileSync(resolve(root, "src/shared/core/storage.js"), "utf8");
  assert.doesNotMatch(newtab, /recordSyncMutation:\s*meta\?\.syncEnabled\s*&&\s*meta\?\.syncInitialized/);
  assert.doesNotMatch(newtab, /recordSyncMutation:\s*publishLegacyIntent\s*&&\s*loaded\.meta\?\.syncEnabled/);
  assert.match(newtab, /recordSyncMutation:\s*!localCacheOnly\s*&&\s*!crossSpaceSyncIntent/);
  assert.match(storage, /durableSyncMeta\.syncEnabled\s*&&\s*durableSyncMeta\.syncInitialized/);
  assert.match(storage, /syncDurabilityActive\s*&&\s*recordSyncMutation\s*&&\s*!effectiveCrossSpaceSyncIntent/);
});
