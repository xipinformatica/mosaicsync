// @kind integration
// Claude K1: the durable reset key arrives BEFORE the old-ledger removals (Chrome's version order for a device that
// was offline during the whole reset; the transient reset-intent was already deleted). The up-to-date old-world
// device must neither adopt the epoch as "legacy" nor join the still-visible unstamped old ledgers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for (const browser of ['chrome','firefox']) {
  test(`Stage 3A key-first ${browser}: claude71y-k1-key-first-old-ledgers`, {timeout:45000}, () => {
    const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,'claude71y-k1-key-first-old-ledgers'],
      {cwd:process.cwd(),encoding:'utf8',timeout:40000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
    const r=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(r.first[0],'intentional-remote-reset','Key without stamped ledgers must quarantine, not be adopted');
    assert.equal(r.mid.mode,'await-remote','Must not join unstamped old ledgers');
    assert.equal(r.mid2.mode,'await-remote','Explicit wait-for-remote must not join unstamped old ledgers');
    assert.deepEqual(r.localP,['current']); assert.deepEqual(r.localW,['new-work']);
    assert.deepEqual(r.cloudP,['current']); assert.deepEqual(r.cloudW,['new-work']);
    assert.equal(r.status,'ready');
  });
}
