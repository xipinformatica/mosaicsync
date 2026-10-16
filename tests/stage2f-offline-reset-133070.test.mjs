// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for(const browser of ['chrome','firefox']) {
  for(const scenario of ['stage2f-offline-reset-entirely-missed','stage2f-offline-reset-pending-edit','stage2f-reset-arrives-between-probe-and-full',
    'stage2f-legacy-current-epoch-preserves-unsynced', 'stage2f-legacy-matching-ids-new-epoch-resets']) {
    test(`Stage 2F ${browser}: ${scenario}`, {timeout:30000}, () => {
      const proc=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,scenario],{
        cwd:process.cwd(),encoding:'utf8',timeout:25000});
      assert.equal(proc.status,0, `${proc.stderr}\n${proc.stdout}`);
      const out=JSON.parse(proc.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(out.ok,true);
      if (scenario.startsWith('stage2f-offline-reset') || scenario==='stage2f-reset-arrives-between-probe-and-full') assert.equal(out.guarded,true);
      if (scenario.startsWith('stage2f-offline-reset') || scenario==='stage2f-reset-arrives-between-probe-and-full') {
        assert.equal(out.notRearmed,true);
        assert.equal(out.epochRetained,true);
      }
    });
  }
}
