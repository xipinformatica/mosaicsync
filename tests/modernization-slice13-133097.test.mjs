// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { testFilesForGroup } from '../tools/test-groups.mjs';

const page = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Evaluate the production loadRecoveryCopies() AND performRecoveryCleanup()
// together. The only substitutions are external effects: background transport,
// DOM presentation, status refresh, and feedback. The session/busy/refresh
// decisions are always the functions actually shipped in newtab.js.
function realRecoveryController(options = {}) {
  const start = page.indexOf('  async function loadRecoveryCopies(sessionGeneration = recoveryCopiesSessionGeneration) {');
  const end = page.indexOf('\n  function shortSyncId(', start);
  assert.ok(start >= 0 && end > start, 'actual Recovery controller boundaries must exist');
  const calls = [];
  const feedback = [];
  const summary = { textContent: '' };
  const enteredBackground = deferred();
  const releaseBackground = deferred();
  const enteredView = deferred();
  const releaseView = deferred();
  const enteredStatus = deferred();
  const releaseStatus = deferred();
  let cleanupCount = 0;
  let readonlyCount = 0;
  const context = vm.createContext({
    recoveryCopiesSessionGeneration: 7,
    recoveryCopiesDialog: { open: true },
    recoveryCopiesSummary: summary,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesLoadInFlightGeneration: 0,
    setRecoveryCopiesBusy: busy => calls.push(`busy:${busy}`),
    sendSyncMessage: async (type, payload) => {
      if (type === 'mosaicsync:cleanup-recovery-copies') {
        cleanupCount++;
        calls.push(`delete:${cleanupCount}:${payload.mode}`);
        if (options.pauseBackground) {
          enteredBackground.resolve();
          await releaseBackground.promise;
        }
        if (options.backgroundReject) throw new Error('background failure');
        return { removedBytes: 128, removedGenerations: 2, model: 'cleanup-result' };
      }
      assert.equal(type, 'mosaicsync:get-recovery-copies', 'model reload must be read-only');
      readonlyCount++;
      calls.push(`read:${readonlyCount}`);
      return { model: `new-model-${readonlyCount}` };
    },
    renderRecoveryCopies: async (response, generation) => {
      calls.push(`render:${response.model}:${generation}`);
      if (response.model === 'cleanup-result' && options.pauseView) {
        enteredView.resolve();
        await releaseView.promise;
      }
      if (response.model === 'cleanup-result' && options.viewReject) throw new Error('view unavailable');
      // Model the existing deferred renderer's post-import session check.
      if (generation === context.recoveryCopiesSessionGeneration && context.recoveryCopiesDialog.open) {
        calls.push(`paint:${response.model}:${generation}`);
      }
    },
    showSyncFeedback: value => feedback.push(value),
    t: (key, values = {}) => `${key}:${values.size ?? ''}:${values.count ?? ''}`,
    formatLocalizedBytes: bytes => `${bytes} bytes`,
    localizePresentationError: error => `ERROR:${error.message}`,
    refreshSyncStatus: async () => {
      calls.push('refresh-status');
      if (options.pauseStatus) {
        enteredStatus.resolve();
        await releaseStatus.promise;
      }
    }
  });
  vm.runInContext(`${page.slice(start, end)}\nthis.cleanup = performRecoveryCleanup; this.load = loadRecoveryCopies;`, context);
  return {
    calls, feedback, summary, context, enteredBackground, releaseBackground, enteredView, releaseView, enteredStatus, releaseStatus,
    count: () => ({ cleanup: cleanupCount, readonly: readonlyCount }),
    cleanup: () => context.cleanup({mode:'superseded'}),
    // The actual manager event handler increments on close and on new opening.
    close: () => { context.recoveryCopiesDialog.open = false; context.recoveryCopiesSessionGeneration += 1; },
    reopen: () => {
      context.recoveryCopiesSessionGeneration += 1;
      context.recoveryCopiesDialog.open = true;
      return context.load(context.recoveryCopiesSessionGeneration);
    }
  };
}

test('Slice 13: reopening while a successful deferred renderer is suspended always fills the new dialog', async () => {
  const h = realRecoveryController({pauseView:true});
  const cleanup = h.cleanup();
  await h.enteredView.promise;
  h.close();
  await h.reopen();
  assert.equal(h.count().readonly, 0, 'new open is blocked while destructive cleanup remains busy');
  h.releaseView.resolve();
  await cleanup;
  assert.deepEqual(h.count(), {cleanup:1, readonly:1}, 'single deletion and one deferred read-only refresh');
  assert.ok(h.calls.includes('paint:new-model-1:9'), 'new dialog receives a fresh model');
  assert.ok(!h.calls.includes('paint:cleanup-result:7'), 'old model must not paint');
  assert.equal(h.feedback.length, 1);
  assert.match(h.feedback[0], /^recoveryCleanupComplete:/);
  assert.equal(h.calls.filter(x=>x==='refresh-status').length, 1);
});

test('Slice 13: reopening during the post-cleanup status refresh also recovers the new dialog', async () => {
  const h = realRecoveryController({pauseStatus:true});
  const cleanup = h.cleanup();
  await h.enteredStatus.promise;
  h.close();
  await h.reopen();
  assert.equal(h.count().readonly, 0);
  h.releaseStatus.resolve();
  await cleanup;
  assert.deepEqual(h.count(), {cleanup:1, readonly:1});
  assert.ok(h.calls.includes('paint:new-model-1:9'));
  assert.equal(h.feedback.length, 1);
});

test('Slice 13: closing without reopening during import performs no hidden model fetch', async () => {
  const h = realRecoveryController({pauseView:true});
  const cleanup = h.cleanup();
  await h.enteredView.promise;
  h.close();
  h.releaseView.resolve();
  await cleanup;
  assert.deepEqual(h.count(), {cleanup:1, readonly:0});
  assert.equal(h.feedback.length, 1);
  assert.equal(h.calls.some(x=>x.startsWith('paint:')), false);
});

test('Slice 13: current dialog success path remains single-delete, no unnecessary model fetch', async () => {
  const h = realRecoveryController();
  await h.cleanup();
  assert.deepEqual(h.count(), {cleanup:1, readonly:0});
  assert.ok(h.calls.includes('paint:cleanup-result:7'));
  assert.equal(h.feedback.length, 1);
});

test('Slice 13: background failure after reopen triggers read-only refresh without success feedback', async () => {
  const h = realRecoveryController({pauseBackground:true, backgroundReject:true});
  const cleanup = h.cleanup();
  await h.enteredBackground.promise;
  h.close();
  await h.reopen();
  assert.equal(h.count().readonly, 0);
  h.releaseBackground.resolve();
  await cleanup;
  assert.deepEqual(h.count(), {cleanup:1, readonly:1});
  assert.ok(h.calls.includes('paint:new-model-1:9'));
  assert.deepEqual(h.feedback, ['ERROR:background failure']);
});

test('Slice 13: failed renderer with a new session never repeats cleanup or enters a retry loop', async () => {
  const h = realRecoveryController({pauseView:true,viewReject:true});
  const cleanup = h.cleanup();
  await h.enteredView.promise;
  h.close();
  await h.reopen();
  h.releaseView.resolve();
  await cleanup;
  assert.deepEqual(h.count(), {cleanup:1, readonly:1});
  assert.equal(h.calls.filter(x=>x==='refresh-status').length, 1);
  assert.equal(h.feedback.length, 1);
});

test('Slice 13: second deletion remains blocked throughout delayed renderer', async () => {
  const h = realRecoveryController({pauseView:true});
  const cleanup = h.cleanup();
  await h.enteredView.promise;
  await h.cleanup();
  assert.equal(h.count().cleanup, 1);
  h.releaseView.resolve();
  await cleanup;
  assert.equal(h.count().cleanup, 1);
});

test('Slice 13: register race-corrective in New Tab, Startup and Release groups', () => {
  for (const name of ['newtab','startup','release']) {
    assert.ok(testFilesForGroup(name).includes('tests/modernization-slice13-133097.test.mjs'), name);
  }
});
