import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import fs from "node:fs";
import { createRecoveryGenerationLifecycle } from "../src/shared/background/recovery-generation-lifecycle.js";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");
function run(browser, scenario) {
  const out = spawnSync(process.execPath, [helper, browser, scenario], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(out.status, 0, `${browser}/${scenario} failed:\n${out.stdout}\n${out.stderr}`);
  return JSON.parse(out.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.32.0.10 audit ${browser}: safe cleanup removes only superseded Recovery and touches no live/reset/name keys`, () => {
    const result = run(browser, "recovery-manager-132010-safe-cleanup");
    assert.equal(result.newestProtected, true);
    assert.equal(result.unrelatedKeysProtected, true);
    assert.equal(result.removedGenerations, 2);
  });
  test(`1.32.0.10 audit ${browser}: old-device deletion fails closed if current fallback disappears during revalidation`, () => {
    const result = run(browser, "recovery-manager-132010-device-revalidation");
    assert.equal(result.revalidationCancelled, true);
    assert.equal(result.remotePreserved, true);
  });
  test(`1.32.0.10 audit ${browser}: storage removal failure cannot report Recovery cleanup success`, () => {
    const result = run(browser, "recovery-manager-132010-remove-failure");
    assert.equal(result.failedClosed, true);
    assert.equal(result.oldPreserved, true);
    assert.equal(result.newestPreserved, true);
  });
}

test("1.32.0.10 audit: manual Recovery policy exports no browser/storage authority", () => {
  const src = fs.readFileSync("src/shared/background/recovery-generation-lifecycle.js", "utf8");
  assert.doesNotMatch(src, /browser\.|storage\.(?:local|sync)|runtime\./);
  assert.match(src, /planManualRecoveryCleanup/);
  assert.match(src, /confirmedManualRecoveryCleanupKeys/);
});

test("1.32.0.10 audit: destructive manager surface remains Recovery-key-only and expected-change-aware", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const start = core.indexOf("async function cleanupRecoveryCopies(");
  const end = core.indexOf("\n  async function getSyncStatus", start);
  const body = core.slice(start, end);
  assert.match(body, /confirmedManualRecoveryCleanupKeys\(latest, latestSnapshots, plan\)/);
  assert.match(body, /await removeSyncItems\(keys\)/);
  assert.doesNotMatch(body, /storage\.sync\.(?:clear|remove)\(/);
  assert.doesNotMatch(body, /LOCAL_PENDING_|SYNC_RESET_INTENT_KEY|SYNC_DATASET_KEY/,
    "manual cleanup must not name unrelated live/pending/reset authorities as deletion targets");
});
