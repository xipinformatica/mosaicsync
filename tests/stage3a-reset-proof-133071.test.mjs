// @kind integration
// Claude's P1/P7/P8 counterexamples to accepting an unstamped Space as a post-reset replacement.
// Exercises the shipped Chrome/Firefox background logic with adversarial partial Sync delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for (const browser of ['chrome','firefox']) {
  for (const scenario of [
    'claude71x-p1-stale-prior-old-personal',
    'claude71x-p7-fresh-device-old-personal',
    'claude71x-p8-unstamped-personal-then-stamped'
  ]) {
    test(`Stage 3A reset epoch proof ${browser}: ${scenario}`, {timeout:45000}, () => {
      const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,scenario],
        {cwd:process.cwd(),encoding:'utf8',timeout:40000});
      assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
      const result=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(result.mode,'none','Device must complete rejoin after BOTH stamped Spaces arrive');
      assert.equal(result.status,'ready','Device must be ready after complete replacement');
      assert.deepEqual(result.localP,['current'],'Old Personal records must not resurrect');
      assert.deepEqual(result.localW,['new-work'],'Old Work records must not resurrect');
      assert.deepEqual(result.cloudP,['current'],'Old Personal must never be republished');
      assert.deepEqual(result.cloudW,['new-work'],'Old Work must never be republished');
      if (scenario.includes('-p1-')) {
        assert.equal(result.mid.mode,'await-remote','Changed pre-reset Personal must NOT qualify as new');
        assert.deepEqual(result.mid.localP,['keep','obsolete'],'Local old-world layout stays untouched while waiting');
        assert.deepEqual(result.mid.cloudP,['keep','obsolete','peer-old-edit'],'Old-era cloud records are not reclassified as new-epoch output');
      } else if (scenario.includes('-p7-')) {
        assert.equal(result.mid.init,false,'Fresh device must remain uninitialized until both Spaces are stamped');
        assert.equal(result.mid.mode,'await-remote','Fresh device must wait on old Personal');
      } else {
        assert.equal(result.mid.mode,'await-remote','Unstamped Personal must not qualify');
        assert.equal(result.join2,'ok','Rejoin must succeed after both Spaces are stamped');
      }
    });
  }
}
