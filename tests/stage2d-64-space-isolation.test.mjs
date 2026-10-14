// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

function runIsolation(scenario, browser, policy) {
  const dir = mkdtempSync(join(tmpdir(), 'mosaicsync-space-isolation-'));
  try {
    const out = join(dir, 'results.jsonl');
    const run = spawnSync(process.execPath,
      ['tests/s2d-64-cross-space-scenarios.mjs', browser, policy, scenario, '64,64,64'],
      {cwd: process.cwd(), env: {...process.env, R64: resolve('.'), OUT: out}, timeout: 75000, encoding: 'utf8'});
    assert.equal(run.status, 0, `scenario ${scenario} failed: ${run.stderr}\n${run.stdout}`);
    assert.doesNotMatch(run.stdout, /ERROR/);
    const results = JSON.parse(readFileSync(out, 'utf8').trim()).out;
    const blocked = results.find(x => x.tag.includes('blocked') || x.tag.includes('A+B after concurrent'));
    const healthy = results.find(x => x.tag.includes('must converge') || x.tag.includes('after B adds a PERSONAL'));
    assert.ok(blocked && healthy, `missing evidence: ${run.stdout}`);
    assert.equal(blocked.ledger.coherent, false, `control must actually be torn: ${run.stdout}`);
    assert.equal(healthy.ledger.coherent, true, `healthy Space ledger must remain coherent: ${run.stdout}`);
    const views = Object.values(healthy.views);
    assert.equal(new Set(views.map(v => JSON.stringify(v.items))).size, 1, `healthy Space must converge: ${run.stdout}`);
    const expected = scenario === 'RETP' ? 'x-b' : 'p-b';
    assert.ok(views.every(v => v.items.some(s => s.startsWith(expected))), `healthy remote edit must arrive: ${run.stdout}`);
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

test('retired Work author cannot block Personal Sync', {timeout: 90000}, () => runIsolation('RET', 'chrome', 'lww'));
test('retired Personal author cannot block Work Sync', {timeout: 90000}, () => runIsolation('RETP', 'firefox', 'server-wins'));
