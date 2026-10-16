// @kind integration
// Independent Claude Stage 3A HOLD repros: a partial Space/Recovery and conflicting reset authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

for(const browser of ['chrome','firefox']) {
  for(const scenario of ['claude71-o2-work-stamp-personal-old', 'claude71-o3-personal-stamp-work-old',
    'claude71-o10-stamped-markers-old-recovery-profile', 'claude71-o8-same-epoch-conflict', 'claude71-o8b-invalid-stamp']) {
    test(`Stage 3A Claude ${browser} ${scenario}`, {timeout:35000}, () => {
      const proc=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,scenario],
        {cwd:process.cwd(),encoding:'utf8',timeout:30000});
      assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
      const out=JSON.parse(proc.stdout.trim().split(/\r?\n/).at(-1));
      if(scenario.includes('o8')) {
        assert.equal(out.clear,'ok','Reset escape hatch must stay available');
        assert.equal(out.useLocal,'ok','Local rejoin must recover');
        assert.ok(out.localP.includes('user-edit'),'Current user edit must survive');
        assert.equal(out.status,'ready');
      } else {
        assert.equal(out.mid.mode,'await-remote','Incomplete replacement must not auto-join');
        if(scenario.includes('o10')) assert.equal(out.afterJoin.mode,'await-remote','Old Recovery must not bootstrap');
        else assert.equal(out.setsBeforeRest,0,'Partial one-Space delivery must not publish');
        assert.deepEqual(out.localP,['current'],'Only new Personal data may survive');
        assert.deepEqual(out.localW,['new-work'],'Only new Work data may survive');
        assert.deepEqual(out.cloudP,['current'],'No obsolete Personal may reach Sync');
        assert.deepEqual(out.cloudW,['new-work'],'No obsolete Work may reach Sync');
      }
    });
  }
  for(const id of ['ONE_W','ONE_P','DUP']) {
    test(`Stage 3A Claude multi-device ${browser} ${id}`, {timeout:90000}, () => {
      const run=spawnSync(process.execPath,['tests/harness/stage3a-claude-multi-runner.mjs',browser,
        browser==='chrome'?'lww':'server-wins',id,id==='DUP'?'71,71,71':'71,71'],{
          cwd:process.cwd(),encoding:'utf8',timeout:80000,env:{...process.env,R71:resolve('.'),R64:resolve('.')}});
      assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
      const out=JSON.parse(run.stdout);
      assert.ok(!out.out.some(x=>x.error),JSON.stringify(out.out));
      const final=out.out.at(-1);
      if(id==='DUP') {
        assert.equal(out.out.at(-2)?.clear,'ok','Conflicting reset must permit Clear Sync');
        assert.equal(out.out.at(-2)?.useLocal,'ok','Conflicting reset must permit local recovery');
        assert.match(final.cloudP,/a-after/,'New edit must survive resetting');
        assert.doesNotMatch(JSON.stringify(final.views),/ error/,'Devices must not remain wedged');
      } else {
        const partial=out.out.find(x=>/has new (Work|Personal) only/.test(x.tag||''));
        assert.ok(partial,'Must exercise one-Space partial delivery');
        assert.match(JSON.stringify(partial.views),/await/,'Offline device must wait');
        assert.doesNotMatch(final.cloudP,/home-b/,'Old Personal shortcut must not reappear');
        assert.doesNotMatch(final.cloudW,/work-b/,'Old Work shortcut must not reappear');
        assert.match(final.cloudP,/new-r/,'Replacement must survive');
      }
    });
  }
}
