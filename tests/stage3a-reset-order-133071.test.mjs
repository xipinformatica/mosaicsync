// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const browser of ['chrome', 'firefox']) {
  for (const scenario of ['stage3a-marker-last','stage3a-pending-edit-late-key','stage3a-single-work-stamp','stage3a-current-legacy-adopts-without-key','stage3a-published-markers']) {
    test(`Stage 3A ${browser}: ${scenario}`, { timeout: 30000 }, () => {
      const run=spawnSync(process.execPath,['tests/harness/background-runtime-scenario.mjs',browser,scenario],{
        cwd:process.cwd(),encoding:'utf8',timeout:25000
      });
      assert.equal(run.status,0,`${run.stderr}\n${run.stdout}`);
      const out=JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(out.ok,true,JSON.stringify(out));
    });
  }
}
