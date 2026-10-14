// TEST-ONLY scenario runner for the .64 audit. usage: R63=... R64=... node s2d-claude-x.mjs <chrome|firefox> <lww|server-wins> <scenario> <versions e.g. 64,64,64> [space]
import {bootN, round, settle, view, ledger, pull, WATCH} from './s2d-64-multi.mjs';
const [browser, policy, id, vers, space = 'work'] = process.argv.slice(2);
const versions = vers.split(',');
const env = await bootN(browser, policy, versions); const {relay, devs} = env;
const M = (D, sp, action, sid, extra = {}) => D.command('mutate', {space: sp, action, id: sid, ...extra});
const snapAll = async (tag, list = devs, sp = space) => { const v = {}; for (const D of list) v[D.name] = await view(D, sp); return {tag, space: sp, views: v, ledger: ledger(relay, sp)}; };
const out = [];
const S = {
  // Concurrent adds, all devices online afterwards.
  async C1() { const [A, B] = devs; await M(A, space, 'add', 'x-a'); await M(B, space, 'add', 'x-b'); await settle(relay, devs, 10); out.push(await snapAll('after settle')); },
  async C2() { const [A, B] = devs; const [i0, i1] = space === 'work' ? ['work-a', 'work-b'] : ['home-a', 'home-b'];
    await M(A, space, 'rename', i0, {title: 'A-renamed'}); await M(B, space, 'rename', i1, {title: 'B-renamed'}); await settle(relay, devs, 10); out.push(await snapAll('after settle')); },
  // C1 then a later local edit on B (does "an edit heals" still work?)
  async C1E() { const [A, B] = devs; await M(A, space, 'add', 'x-a'); await M(B, space, 'add', 'x-b'); await settle(relay, devs, 6); out.push(await snapAll('after concurrent adds'));
    await M(B, space, 'add', 'later-b'); await settle(relay, devs, 8); out.push(await snapAll('after later edit on B')); },
  // Delete vs stale rename, deleting device misses the overwrite event.
  async D1M() { const [A, B] = devs; const i0 = space === 'work' ? 'work-a' : 'home-a';
    await M(A, space, 'delete', i0); await round(relay, A); await M(B, space, 'rename', i0, {title: 'stale rename'}); relay.upload(B.view);
    relay.download(A.view); // applied without storage.onChanged
    for (let i = 0; i < 8; i++) { await A.command('alarm', {name: WATCH}); relay.upload(A.view); for (const D of devs.slice(1)) await round(relay, D); await round(relay, A); }
    out.push(await snapAll('after settle')); },
  // Three devices, all concurrent, all online afterwards.
  async T3() { for (const [i, D] of devs.entries()) await M(D, space, 'add', `x-${i}`); await settle(relay, devs, 10); out.push(await snapAll('after settle')); },
  // A third device authored a record, then is retired (never syncs again). Then A and B edit concurrently,
  // then B adds a PERSONAL shortcut: does A still receive Personal changes?
  async RET() { const [A, B, C] = devs; await M(C, 'work', 'add', 'x-c'); await M(C, 'personal', 'add', 'p-c'); await settle(relay, devs, 4);
    out.push(await snapAll('3 devices converged (work)', devs, 'work'));
    const live = [A, B]; // C retired from here on
    await M(A, 'work', 'add', 'x-a'); await M(B, 'work', 'add', 'x-b'); await settle(relay, live, 12);
    out.push(await snapAll('A+B after concurrent Work adds, C retired', live, 'work'));
    await M(B, 'personal', 'add', 'p-b'); await settle(relay, live, 8);
    out.push(await snapAll('after B adds a PERSONAL shortcut', live, 'personal'));
    out.push(await snapAll('Work at end', live, 'work')); },
  // Mirror of RET: torn Personal must not block coherent Work updates.
  async RETP() { const [A, B, C] = devs;
    await M(C, 'personal', 'add', 'p-c'); await M(C, 'work', 'add', 'x-c');
    await settle(relay, devs, 4);
    const live = [A, B];
    await M(A, 'personal', 'add', 'p-a'); await M(B, 'personal', 'add', 'p-b');
    await settle(relay, live, 12);
    out.push(await snapAll('Personal blocked by retired device', live, 'personal'));
    await M(B, 'work', 'add', 'x-b'); await settle(relay, live, 8);
    out.push(await snapAll('Work must converge while Personal waits', live, 'work'));
  },
  // Genuine partial delivery: B misses one of A's records for several watch rounds while both edited concurrently.
  async PART() { const [A, B] = devs; const pref = space === 'work' ? 'mosaicsync.sync.space.work.item.' : 'mosaicsync.sync.item.';
    await M(A, space, 'add', 'x-a'); await M(A, space, 'add', 'x-a2'); await M(B, space, 'add', 'x-b');
    relay.block = {dev: B.view, keys: new Set([pref + 'x-a2'])};
    await settle(relay, devs, 8); out.push(await snapAll('while B is missing x-a2 (8 rounds)'));
    relay.block = null; await settle(relay, devs, 10); out.push(await snapAll('after full delivery')); },
  // Concurrent Work adds, then B adds a PERSONAL shortcut; then A makes a later Work edit.
  async CX() { const [A, B] = devs; await M(A, 'work', 'add', 'x-a'); await M(B, 'work', 'add', 'x-b'); await settle(relay, devs, 8);
    out.push(await snapAll('after concurrent Work adds', devs, 'work'));
    await M(B, 'personal', 'add', 'p-b'); await settle(relay, devs, 8);
    out.push(await snapAll('after B adds a PERSONAL shortcut', devs, 'personal'));
    await M(A, 'work', 'add', 'later-a'); await settle(relay, devs, 8);
    out.push(await snapAll('after a later Work edit on A', devs, 'work'));
    out.push(await snapAll('Personal at end', devs, 'personal')); },
};
try { await S[id](); } catch (e) { out.push({error: String(e).slice(0, 1200)}); }
env.close();
for (const r of out) {
  if (r.error) { console.log(`${id} ${vers} ${browser}/${policy}/${space}: ERROR ${r.error.split('\n')[0]}`); continue; }
  const items = Object.values(r.views).map(v => JSON.stringify(v.items));
  console.log(`${id} [${vers}] ${browser}/${policy} ${r.space} [${r.tag}] converged=${new Set(items).size === 1} ledgerCoherent=${r.ledger.coherent} witnesses=${r.ledger.witnesses} tomb=${r.ledger.tomb.join(',')}`);
  for (const [n, v] of Object.entries(r.views)) console.log(`    ${n}: ${v.items.join(' ')} | ${v.status}${v.warn ? ' (waiting msg)' : ''}`);
}
if (process.env.OUT) (await import('node:fs')).appendFileSync(process.env.OUT, JSON.stringify({id, vers, browser, policy, space, out}) + '\n');
process.exit(0);
