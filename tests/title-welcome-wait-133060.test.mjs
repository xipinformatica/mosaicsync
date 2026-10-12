// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waitForFreshProfileWelcome } from '../tools/title-welcome-wait.mjs';

test('.60 Firefox title smoke tolerates a document unload and waits for completed Welcome navigation', async () => {
  const sequence = [
    new Error('Document was unloaded'),
    { pathname: '/newtab/newtab.html', readyState: 'complete' },
    { pathname: '/welcome/welcome.html', readyState: 'loading' },
    { pathname: '/welcome/welcome.html', readyState: 'complete' }
  ];
  let calls = 0;
  await waitForFreshProfileWelcome({
    async execute() {
      const next = sequence[calls++];
      if (next instanceof Error) throw next;
      return next;
    }
  }, {timeoutMs: 200, pollMs: 0, sleep: async () => {}});
  assert.equal(calls, 4, 'must not send requests before the Welcome document finishes loading');
});

test('.60 Firefox title smoke fails with last URL and error instead of silently passing', async () => {
  await assert.rejects(
    waitForFreshProfileWelcome({
      execute: async () => { throw new Error('Document was unloaded'); },
      currentUrl: async () => 'moz-extension://test/newtab/newtab.html'
    }, {timeoutMs: 0, pollMs: 0, sleep: async () => {}}),
    error => /Welcome page/.test(error.message) && /newtab\/newtab.html/.test(error.message) && /Document was unloaded/.test(error.message)
  );
});

test('.60 browser gate preserves title-smoke failure stderr in uploaded browser evidence', () => {
  const workflow = readFileSync('.github/workflows/neofix-browser-gate.yml', 'utf8');
  const smoke = readFileSync('tools/title-redirect-smoke.mjs', 'utf8');
  assert.match(smoke, /await waitForFreshProfileWelcome\(client\)/);
  assert.match(workflow, /title-redirect-\$\{\{ matrix\.kind \}\}\.stderr\.log/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /set -o pipefail/);
});
