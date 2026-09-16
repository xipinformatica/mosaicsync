import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import fs from "node:fs";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");
const backgroundPath = resolve(root, "src/shared/background/background-core.js");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed:\n${result.stdout}\n${result.stderr}`);
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.32.0.6 ${browser}: authoritative local bootstrap preserves a newer pending journal`, () => {
    const result = runScenario(browser, "sync-13206-bootstrap-local-preserves-newer-journal");
    assert.equal(result.pendingPreserved, true);
    assert.equal(result.localHasNewer, true);
    assert.equal(result.remoteHasNewer, false);
  });

  test(`1.32.0.6 ${browser}: remote bootstrap preserves a journal created after its initial baseline`, () => {
    const result = runScenario(browser, "sync-13206-bootstrap-remote-preserves-newer-journal");
    assert.equal(result.pendingPreserved, true);
    assert.equal(result.localHasNewer, true);
  });

  test(`1.32.0.6 ${browser}: await-remote bootstrap preserves a concurrent local edit`, () => {
    const result = runScenario(browser, "sync-13206-await-remote-preserves-concurrent-edit");
    assert.equal(result.editSurvived, true);
    assert.equal(result.action, "bootstrapped-remote");
  });

  test(`1.32.0.6 ${browser}: explicit Restore preserves a concurrent local edit and its journal`, () => {
    const result = runScenario(browser, "sync-13206-restore-preserves-concurrent-edit");
    assert.equal(result.editSurvived, true);
    assert.equal(result.pendingPreserved, true);
  });

  test(`1.32.0.6 ${browser}: local bootstrap does not adopt a journal created after its captured state`, () => {
    const result = runScenario(browser, "sync-13206-bootstrap-local-snapshot-journal-gap-preserves-newer");
    assert.equal(result.pendingPreserved, true);
    assert.equal(result.remoteHasGapEdit, false);
  });

  test(`1.32.0.6 ${browser}: first-Sync authority handoff publishes a late unjournaled local edit`, () => {
    const result = runScenario(browser, "sync-13206-await-remote-late-uninitialized-edit-is-published");
    assert.equal(result.lateEditPreserved, true);
    assert.equal(result.lateEditPublished, true);
  });

}

test("1.32.0.6 bootstrap source contract uses baseline-aware persistence and generation-specific journal acknowledgement", () => {
  const source = fs.readFileSync(backgroundPath, "utf8");
  const localStart = source.indexOf("async function bootstrapLocal");
  const remoteStart = source.indexOf("async function bootstrapRemote");
  const nextAfterRemote = source.indexOf("const SPACE_IDS_FOR_SYNC", remoteStart);
  const localBlock = source.slice(localStart, remoteStart);
  const remoteBlock = source.slice(remoteStart, nextAfterRemote);

  assert.match(localBlock, /pendingCandidate\s*=\s*preservePendingSyncRecovery\s*\?\s*null\s*:\s*await readPendingLocalSyncMutation\(\)/);
  assert.match(localBlock, /clearPendingLocalSyncMutation\(pendingAtStart\.journalId\)/);
  assert.doesNotMatch(localBlock, /clearPendingLocalSyncMutation\(\s*\)/);

  assert.match(remoteBlock, /pendingCandidate\s*=\s*await readPendingLocalSyncMutation\(\)/);
  assert.match(remoteBlock, /localStateSyncSignature\(pendingCandidate\.after\) === localStateSyncSignature\(fullLocalState\)/);
  assert.match(remoteBlock, /if \(!meta\.syncInitialized\)[\s\S]*?browser\.storage\.local\.get\(LOCAL_STATE_KEY\)[\s\S]*?ensureLocalStorage\(\)/);
  assert.match(remoteBlock, /setLocalStateSilently\(mergedState,\s*\{\s*baseState:\s*fullLocalState\s*\}\)/);
  assert.match(remoteBlock, /mergedState\s*=\s*await setLocalStateSilently/);
  assert.match(remoteBlock, /clearPendingLocalSyncMutation\(pendingAtStart\.journalId\)/);
  assert.doesNotMatch(remoteBlock, /clearPendingLocalSyncMutation\(\s*\)/);
});
