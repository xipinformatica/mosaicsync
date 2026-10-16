// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

for (const browser of ['chrome', 'firefox']) {
  test(`Stage 2E ${browser}: a remote reset retires old deletion authority before accepting a replacement profile`, { timeout: 30000 }, () => {
    const run = spawnSync(process.execPath, ['tests/harness/background-runtime-scenario.mjs', browser, 'stage2e-remote-reset-deletion-evidence'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 25000
    });
    assert.equal(run.status, 0, `${run.stderr}\n${run.stdout}`);
    const out = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(out.resetObserved, 'intentional-remote-reset');
    assert.equal(out.postResetInitialized, true);
    assert.equal(out.journalRetainedAfterReset, false, 'reset must retire previous-epoch tombstones');
    assert.equal(out.journalRetainedAfterRejoin, false);
    assert.equal(out.presenceBitAfterReset, false);
    assert.equal(out.presenceBitAfterRejoin, false);
    assert.equal(out.replacementVisible, true);
    assert.equal(out.postResetCloudKind, 'shortcut', 'later partial delivery must not erase new-epoch shortcut');
    assert.equal(out.postResetCloudTitle, 'post-reset-new-edit');
  });
}

// Failure injection checks real production background flows, not just a static source pattern.
for (const browser of ['chrome', 'firefox']) {
  for (const scenario of ['stage2e-remote-reset-atomic-failure','stage2e-remote-reset-pending-failure']) {
    test(`Stage 2E ${browser}: ${scenario} fails closed then safely retries`, { timeout: 30000 }, () => {
      const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,scenario],{
        cwd:process.cwd(),encoding:'utf8',timeout:25000
      });
      assert.equal(run.status,0,`${run.stderr}\n${run.stdout}`);
      const out=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(out.failedClosed,true);
      assert.equal(out.retrySucceeded,true);
      assert.equal(out.oldEvidenceRetired,true);
    });
  }
}

for (const browser of ['chrome','firefox']) {
  test(`Stage 2E ${browser}: ambiguous reset commit never replays previous-epoch pending mutations`, {timeout:30000}, () => {
    const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,'stage2e-remote-reset-ambiguous-replay'],{
      cwd:process.cwd(),encoding:'utf8',timeout:25000
    });
    assert.equal(run.status,0,`${run.stderr}\n${run.stdout}`);
    const out=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(out.ambiguousWriteObserved,true);
    assert.equal(out.staleJournalDiscarded,true);
    assert.equal(out.oldCloudRecordsNotResurrected,true);
  });
}

test('Stage 2E reset authority and deletion journal are committed atomically under the persistence lock', () => {
  const storage = readFileSync('src/shared/core/storage.js', 'utf8');
  const bg = readFileSync('src/shared/background/background-core.js', 'utf8');
  const start = storage.indexOf('export async function writeLocalMeta');
  const end = storage.indexOf('export async function updateLocalMeta', start);
  const block = storage.slice(start, end);
  assert.match(block, /clearDeletionEvidenceForRemoteReset\s*=\s*false/);
  assert.match(block, /\[LOCAL_META_KEY\]: normalized, \[LOCAL_SYNC_DELETION_EVIDENCE_KEY\]: \{\}/);
  const reset = bg.slice(bg.indexOf('async function observeRemoteResetIntent'), bg.indexOf('async function beginOrContinueCatastrophicSyncRecovery'));
  assert.match(reset, /clearDeletionEvidenceForRemoteReset: true/);
  assert.match(reset, /clearAllPendingSyncRecoveryState/);
});

// Claude independent .69 audit E2/E2b: real production Chrome/Firefox
// background with a commit-then-reject storage.local reset transition.
for (const browser of ['chrome', 'firefox']) {
  test(`Stage 2E ${browser}: using local layout after ambiguous remote reset discards prior-epoch journal`, {timeout:30000}, () => {
    const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,'stage2e-bootstrap-local-ambiguous'],{
      cwd:process.cwd(),encoding:'utf8',timeout:25000
    });
    assert.equal(run.status,0,`${run.stderr}\n${run.stdout}`);
    const out=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(out.ambiguousWriteInjected,true,'fault injection must run');
    assert.equal(out.failedOk,false,'ambiguous reset write must report failure');
    assert.equal(out.heldPending,'old-epoch-pending','the scenario must reproduce the original rollback hazard');
    assert.equal(out.useThisOk,true,'device rejoin through local layout must succeed');
    assert.equal(out.pendingAfterUse,null,'old pending journal must be cleared at local rejoin');
    assert.equal(out.cloud.obsolete,null,'deleted previous-epoch shortcut must not be republished');
    assert.equal(out.evidencePresentBit,false,'old deletion authority must not be re-armed');
    assert.equal(out.pendingAtEnd,null,'no old pending journal may persist');
    assert.deepEqual(out.evidenceIds,[],'old deletion journal must stay empty');
  });
  test(`Stage 2E ${browser}: using local layout cannot veto deliberately restored shortcut in new epoch`, {timeout:30000}, () => {
    const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,'stage2e-bootstrap-local-restored-shortcut'],{
      cwd:process.cwd(),encoding:'utf8',timeout:25000
    });
    assert.equal(run.status,0,`${run.stderr}\n${run.stdout}`);
    const out=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(out.ambiguousWriteInjected,true,'fault injection must run');
    assert.equal(out.cloudGone,'shortcut','deliberate new-epoch restore must survive in Sync');
    assert.equal(out.localHasGone,true,'restored shortcut must survive locally');
    assert.equal(out.cloudObsolete,null,'previous-epoch deleted shortcut must stay absent');
  });
}
