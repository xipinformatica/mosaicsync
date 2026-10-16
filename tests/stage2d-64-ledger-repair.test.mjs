// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  deletionRepairs,
  ledgerContainsOwnChanges,
  liveLedgerWitnessDigest,
  requiredWitnessDevices,
  witnessFor,
  witnessKey,
  witnessesAgree
} from '../dist/chrome/background/sync-ledger-repair.js';
import { makeTombstone } from '../dist/chrome/core/model.js';

function snapshot(records) {
  return { records: new Map(records.map(r => [r.id, r])), settings: { kind: 'settings', modifiedAt: 0, settings: {}, settingsClock: {} },
    dataset: { kind: 'dataset', commitId: 'commit-old', originDeviceId: 'dev-a' } };
}
function live(id, owner, modifiedAt = 100) {
  return { kind: 'shortcut', id, deviceId: owner, title: id, url: `https://${id}.test/`, position: 0, modifiedAt };
}

test('witness fingerprint includes tombstones, not only visible shortcuts', () => {
  const a = snapshot([live('x','dev-a')]);
  const b = snapshot([live('x','dev-a'), makeTombstone('deleted','dev-b',200)]);
  assert.notEqual(liveLedgerWitnessDigest(a), liveLedgerWitnessDigest(b));
});

test('two independent witnesses required, including each record owner', () => {
  const s = snapshot([live('x','dev-a'), live('y','dev-b')]);
  const ids = requiredWitnessDevices(s, 'dev-a');
  assert.deepEqual(ids, ['dev-a','dev-b']);
  const prefix = 'mosaicsync.sync.space.work.';
  const all = { [witnessKey(prefix, 'dev-a')]: witnessFor(s, 'dev-a', 'work') };
  assert.equal(witnessesAgree(s, ids, all, prefix, 'dev-a'), false);
  all[witnessKey(prefix, 'dev-b')] = witnessFor(s, 'dev-b', 'work');
  assert.equal(witnessesAgree(s, ids, all, prefix, 'dev-a'), true);
  all[witnessKey(prefix, 'dev-b')].datasetCommitId = 'stale';
  assert.equal(witnessesAgree(s, ids, all, prefix, 'dev-a'), false);
});

test('a partial ledger cannot be witnessed when it omits a local record', () => {
  const s = snapshot([live('x','dev-a')]);
  assert.equal(ledgerContainsOwnChanges(s, new Map([['x',s.records.get('x')], ['missing',live('missing','dev-a')]]), s.settings), false);
});

test('durable deletion repairs a stale rename, but not a later explicit Space move', () => {
  const tombstone = makeTombstone('x', 'dev-a', 200);
  const stale = live('x', 'dev-b', 500);
  assert.deepEqual([...deletionRepairs(snapshot([stale]), new Map([['x',tombstone]])).keys()], ['x']);
  const moved = { ...stale, spaceMoveAt: 400 };
  assert.equal(deletionRepairs(snapshot([moved]), new Map([['x',tombstone]])).size, 0);
});

function runScript(path, args, timeout = 70000) {
  const run = spawnSync(process.execPath, [path, ...args], { cwd: process.cwd(), timeout, encoding: 'utf8' });
  assert.equal(run.status, 0, `${path} ${args.join(' ')}\n${run.stderr}\n${run.stdout}`);
  return run.stdout;
}

test('real background two-device conflict matrix converges under LWW and server-wins', { timeout: 150000 }, () => {
  for (const [browser, policy] of [['chrome','lww'], ['firefox','server-wins']]) {
    const stdout = runScript('tests/s2d-claude-scenarios.mjs', [browser, policy, 'C1,C2,C4,D1,D2'], 70000);
    assert.doesNotMatch(stdout, /converged=false|cloudCoherent=false|ERROR/, `${browser}/${policy}\n${stdout}`);
    assert.match(stdout, /D2\/personal .*converged=true/);
  }
});

test('missed onChanged cannot erase a durable tombstone', { timeout: 80000 }, () => {
  const output = runScript('tests/s2d-claude-d1missed.mjs', ['chrome','lww'], 70000);
  const last = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(last.serverKey, 'deleted');
  assert.equal(last.cloud.coherent, true);
  assert.equal(last.A.some(s => s.startsWith('work-a@')), false);
  assert.equal(last.B.some(s => s.startsWith('work-a@')), false);
});

test('delayed partial delivery for 12 watch periods never heals prematurely', { timeout: 90000 }, () => {
  const output = runScript('tests/s2d-64-partial.mjs', ['chrome','lww'], 80000);
  const result = JSON.parse(output.trim());
  assert.equal(result.pass, true);
  assert.equal(result.waitingCycles, 12);
  assert.equal(result.final.cloud.coherent, true);
});


test('deletion journal and presence bit are written in one guarded local transaction', () => {
  const storage = readFileSync('src/shared/core/storage.js', 'utf8');
  const start = storage.indexOf('export async function rememberSyncDeletionEvidence');
  const end = storage.indexOf('export async function clearSyncDeletionEvidence', start);
  const block = storage.slice(start, end);
  assert.match(block, /withPersistenceWriteLock\(async \(\) =>/);
  assert.match(block, /browser\.storage\.local\.set\(\{[\s\S]*?\[LOCAL_SYNC_DELETION_EVIDENCE_KEY\]: next,[\s\S]*?\[LOCAL_META_KEY\]: \{ \.\.\.current, syncDeletionEvidencePresent: true \}/);
  // Ordinary metadata writes must preserve the flag, but an observed remote
  // reset intentionally retires prior-epoch evidence in the same local commit.
  assert.match(storage, /syncDeletionEvidencePresent:\s*clearDeletionEvidenceForRemoteReset\s*\?\s*false\s*:\s*current\.syncDeletionEvidencePresent/,
    'ordinary meta writes preserve deletion evidence; peer-reset authority transitions clear it');
});

test('cooperative repair never uses immutable Recovery generations as merge data', () => {
  const background = readFileSync('src/shared/background/background-core.js', 'utf8');
  const start = background.indexOf('async function maybeRepairTornLedger');
  const end = background.indexOf('async function markTornLedgerWaiting', start);
  const block = background.slice(start, end);
  assert.match(block, /ledgerContainsOwnChanges/);
  assert.match(block, /witnessesAgree/);
  assert.match(block, /readSyncSnapshot\(null, \{ includeAssets: false, spaceId \}\)/);
  assert.doesNotMatch(block, /combinedRemoteCore|combinedWorkRemoteCore|sources\.profile|sources\.device|mergeRecordMaps/);
});
