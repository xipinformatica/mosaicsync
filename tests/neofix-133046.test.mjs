// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inventoryTests } from '../tools/test-inventory.mjs';
import { certificationPlan } from '../tools/certify-release.mjs';

for (const browser of ['chrome','firefox']) {
  test(`.46 ${browser}: rejected background work replies once, with structured error`, () => {
    const output = execFileSync(process.execPath, [
      'tests/harness/background-runtime-scenario.mjs', browser, 'neofix-133046-rejected-message-callback'
    ], { encoding: 'utf8', timeout: 25000 });
    const report = JSON.parse(output.trim().split('\n').at(-1));
    assert.deepEqual(report, { ok: true, rejectedCallback: true, exactlyOnce: true });
  });
}

test('.46 source inventory is complete, labeled, file-level and honest about its limits', async () => {
  const inventory = await inventoryTests();
  assert.ok(inventory.totalFiles >= 206);
  assert.equal(inventory.files.length, inventory.totalFiles);
  assert.equal(Object.values(inventory.counts).reduce((a,b)=>a+b,0),inventory.totalFiles);
  assert.ok(inventory.counts.static > 0 && inventory.counts.integration > 0);
  assert.equal(inventory.scope, 'primary-file-classification');
});

test('.46 browser gate requires real setup, a background reply, two engines and no hidden skip', () => {
  const workflow = readFileSync('.github/workflows/neofix-browser-gate.yml','utf8');
  const smoke = readFileSync('tools/browser-smoke.mjs','utf8');
  assert.match(workflow,/141/);
  assert.match(workflow,/140\.0/);
  assert.match(workflow,/setup-chrome@v2/);
  assert.match(workflow,/setup-firefox@v1/);
  assert.match(workflow,/browser-smoke:\s*$/m);
  assert.match(workflow,/release-gate:/);
  assert.match(workflow,/BROWSERS.*success/);
  assert.match(smoke,/exerciseFreshSetup\(client, kind/);
  assert.match(smoke,/mosaicsync:get-sync-status/);
  assert.match(smoke,/shortcutCreateAndReload: true/);
  assert.ok(certificationPlan().some(x=>x.id==='browser-smoke'));
  assert.ok(!certificationPlan({skipBrowserSmoke:true}).some(x=>x.id==='browser-smoke'));
});
