// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { testFilesForGroup } from '../tools/test-groups.mjs';

const newTab = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');

function loadRealCleanupFlow(options = {}) {
  const start = newTab.indexOf('  async function performRecoveryCleanup(payload) {');
  const end = newTab.indexOf('\n  function shortSyncId(', start);
  assert.ok(start >= 0 && end > start, 'actual Recovery cleanup controller must exist');
  const calls = [];
  const feedback = [];
  const summary = {textContent: ''};
  const context = vm.createContext({
    recoveryCopiesSessionGeneration: 3,
    recoveryCopiesDialog: {open: true},
    recoveryCopiesSummary: summary,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesLoadInFlightGeneration: 0,
    setRecoveryCopiesBusy: busy => calls.push(`busy:${busy}`),
    sendSyncMessage: async (type, payload) => {
      calls.push(`message:${type}:${payload.mode}`);
      if (options.cleanupReject) throw new Error('cleanup rejected by background');
      if (options.closeBeforeResponse) context.recoveryCopiesDialog.open = false;
      if (options.reopenBeforeResponse) context.recoveryCopiesSessionGeneration++;
      return {removedBytes: 128, removedGenerations: 2};
    },
    renderRecoveryCopies: async (_response, generation) => {
      calls.push(`render:${generation}`);
      if (options.renderReject) throw new Error('dynamic view module unavailable');
    },
    showSyncFeedback: value => feedback.push(value),
    t: (key, values = {}) => `${key}:${values.size ?? ''}:${values.count ?? ''}`,
    formatLocalizedBytes: bytes => `${bytes} bytes`,
    localizePresentationError: error => `ERROR:${error.message}`,
    refreshSyncStatus: async () => { calls.push('refresh-status'); },
    loadRecoveryCopies: async session => { calls.push(`refresh-model:${session}`); }
  });
  vm.runInContext(`${newTab.slice(start, end)}\nthis.realCleanup = performRecoveryCleanup;`, context);
  return { context, calls, feedback, summary, run: () => context.realCleanup({mode: 'generation'}) };
}

test('Slice 12: a successful cleanup stays successful if the lazy view subsequently rejects', async () => {
  const h = loadRealCleanupFlow({renderReject: true});
  await h.run();
  assert.deepEqual(h.feedback, ['recoveryCleanupComplete:128 bytes:2'], 'do not report a completed destructive operation as failed');
  assert.equal(h.calls.filter(x => x.startsWith('message:')).length, 1, 'never retry a deletion');
  assert.equal(h.calls.filter(x => x === 'refresh-status').length, 1, 'status refresh must still happen');
  assert.equal(h.calls.filter(x => x.startsWith('refresh-model:')).length, 1, 'read-only current session refresh is allowed');
  assert.match(h.summary.textContent, /^ERROR:dynamic view module unavailable$/);
  assert.equal(h.context.recoveryCopiesCleanupBusy, false);
});

test('Slice 12: successful cleanup and successful renderer keep the existing single success path', async () => {
  const h = loadRealCleanupFlow();
  await h.run();
  assert.deepEqual(h.feedback, ['recoveryCleanupComplete:128 bytes:2']);
  assert.equal(h.calls.filter(x => x === 'render:3').length, 1);
  assert.equal(h.calls.filter(x => x === 'refresh-status').length, 1);
  assert.equal(h.calls.filter(x => x.startsWith('refresh-model:')).length, 0);
  assert.equal(h.summary.textContent, '');
  assert.equal(h.context.recoveryCopiesCleanupBusy, false);
});

test('Slice 12: background cleanup failures remain failures and do not claim success', async () => {
  const h = loadRealCleanupFlow({cleanupReject: true});
  await h.run();
  assert.deepEqual(h.feedback, ['ERROR:cleanup rejected by background']);
  assert.equal(h.calls.filter(x => x === 'refresh-status').length, 0);
  assert.equal(h.calls.filter(x => x.startsWith('refresh-model:')).length, 1);
  assert.equal(h.calls.filter(x => x.startsWith('render:')).length, 0);
  assert.equal(h.context.recoveryCopiesCleanupBusy, false);
});

test('Slice 12: closed or replaced Recovery dialog is not painted after cleanup', async () => {
  for (const mode of ['closeBeforeResponse', 'reopenBeforeResponse']) {
    const h = loadRealCleanupFlow({[mode]: true});
    await h.run();
    assert.deepEqual(h.feedback, ['recoveryCleanupComplete:128 bytes:2']);
    assert.equal(h.calls.filter(x => x.startsWith('render:')).length, 0, `${mode} must never paint superseded response`);
    assert.equal(h.calls.filter(x => x.startsWith('refresh-model:')).length, mode === 'reopenBeforeResponse' ? 1 : 0);
    assert.equal(h.context.recoveryCopiesCleanupBusy, false);
  }
});

test('Slice 12: register Recovery cleanup outcome tests for New Tab, Startup and Release coverage', () => {
  for (const group of ['newtab', 'startup', 'release']) {
    assert.ok(testFilesForGroup(group).includes('tests/modernization-slice12-133097.test.mjs'), `missing ${group} registration`);
  }
});
