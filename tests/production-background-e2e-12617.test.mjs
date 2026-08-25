import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const helper=resolve(import.meta.dirname,'harness/background-runtime-scenario.mjs');
function run(browser, scenario) {
  const result=spawnSync(process.execPath,[helper,browser,scenario],{cwd:resolve(import.meta.dirname,'..'),encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,`${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines=result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

for(const browser of ['firefox','chrome']) {
  test(`1.26.17 production ${browser} background recovers a never-visited favicon end-to-end`,()=>{
    const out=run(browser,'favicon-network'); assert.equal(out.hydrated,1); assert.ok(out.localImageAssetId);
  });
  test(`1.26.17 production ${browser} background recovers an inactive Work-space favicon`,()=>{
    const out=run(browser,'favicon-work-space'); assert.equal(out.space,'work');
  });
  test(`1.26.17 production ${browser} background self-heals same-marker Sync semantic divergence`,()=>{
    const out=run(browser,'sync-same-marker-divergence'); assert.equal(out.ok,true);
  });
}

test('1.26.17 production Chrome fails closed on a transient placeholder-sentinel failure and retries it',()=>{
  const out=run('chrome','chrome-placeholder-failure');
  assert.equal(out.sentinelAttempts,2); assert.equal(out.third.hydrated,1);
});

test('1.26.17 production Chrome keeps a permission-free native miss durably scheduled without spinning',()=>{
  const out=run('chrome','chrome-native-miss-scheduling'); assert.equal(out.pending,1); assert.ok(out.nextAttemptAt>Date.now());
});

for(const browser of ['firefox','chrome']) {
  test(`1.26.17 production ${browser} re-grants Website Access and resumes favicon recovery`,()=>{
    const out=run(browser,'permission-regrant'); assert.equal(out.recovered,true);
  });
  test(`1.26.17 production ${browser} drops quality-only favicon work when Website Access is revoked`,()=>{
    const out=run(browser,'permission-revoke-drops-quality'); assert.equal(out.qualityPending,false);
  });
}

for(const browser of ['firefox','chrome']) {
  test(`1.26.17 production ${browser} applies a usable device snapshot without repairing a partial shared ledger`,()=>{
    const out=run(browser,'sync-partial-ledger-no-repair');
    assert.equal(out.sharedLedgerPending,true); assert.equal(out.syncWrites,0);
  });
}


for(const browser of ['firefox','chrome']) {
  test(`1.27.8 production ${browser} fresh bootstrap waits for complete Work and preserves a local edit`,()=>{
    const out=run(browser,'sync-1278-fresh-waits-for-work');
    assert.equal(out.ok,true); assert.equal(out.waiting,'waiting'); assert.equal(out.final,'ready'); assert.equal(out.restored,true);
  });
}


for(const browser of ['firefox','chrome']) {
  test(`1.27.8.1 production ${browser} Work-only Sync keeps recovery quota degradation observable`,()=>{
    const out=run(browser,'sync-12781-work-quota-protection');
    assert.equal(out.ok,true); assert.equal(out.status,'ready'); assert.equal(out.protection,'limited'); assert.equal(out.reason,'quota'); assert.equal(out.warning,true);
  });
}


for(const browser of ['firefox','chrome']) {
  test(`1.27.8.1 production ${browser} failed profile root flip preserves the previous complete generation`,()=>{
    const out=run(browser,'sync-12781-profile-root-quota-rollback');
    assert.equal(out.ok,true); assert.equal(out.afterCommit,out.beforeCommit); assert.ok(out.newChunkWrites>0); assert.equal(out.protection,'limited');
  });
}
