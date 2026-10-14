// TEST-ONLY scenario runner. usage: node s2d-claude-scenarios.mjs <chrome|firefox> <lww|server-wins> <ids,...>
import {boot, round, settle, ledger, view, pull} from './s2d-claude-two-device.mjs';
const [browser = 'chrome', policy = 'lww', idsArg = 'P0,C1,C2,C3,C4,D1,D2,H1'] = process.argv.slice(2);
const out = [];
async function report(tag, env, space) {
  const {relay, A, B} = env;
  const r = {tag, A: await view(A, space), B: await view(B, space), cloud: ledger(relay, null, space), Aledger: ledger(relay, A, space), Bledger: ledger(relay, B, space)};
  r.converged = JSON.stringify(r.A.items) === JSON.stringify(r.B.items);
  return r;
}
const M = (D, space, action, id, extra = {}) => D.command('mutate', {space, action, id, ...extra});

const S = {
  // Positive control: B sees A's add before adding.
  async P0(env, sp) { const {relay, A, B} = env;
    await M(A, sp, 'add', 'x-a'); await round(relay, A); await round(relay, B);
    await M(B, sp, 'add', 'x-b'); await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Concurrent adds (both offline, same first-empty slot).
  async C1(env, sp) { const {relay, A, B} = env;
    await M(A, sp, 'add', 'x-a'); await M(B, sp, 'add', 'x-b');
    await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Concurrent edits with NO position collision: A renames one item, B renames another.
  async C2(env, sp) { const {relay, A, B} = env; const [i0, i1] = sp === 'work' ? ['work-a', 'work-b'] : ['home-a', 'home-b'];
    await M(A, sp, 'rename', i0, {title: 'A-renamed'}); await M(B, sp, 'rename', i1, {title: 'B-renamed'});
    await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Concurrent adds, then later single edits alternate; how many edits until convergence?
  async C3(env, sp) { const {relay, A, B} = env; const res = [];
    await M(A, sp, 'add', 'x-a'); await M(B, sp, 'add', 'x-b'); await settle(relay, A, B);
    res.push(await report('after concurrent adds', env, sp));
    for (let i = 1; i <= 4; i++) {
      const D = i % 2 ? A : B; await M(D, sp, 'add', `later-${i}`); await settle(relay, A, B);
      res.push(await report(`after later edit #${i} on ${i % 2 ? 'A' : 'B'}`, env, sp));
    }
    return res; },
  // Concurrent adds, but B comes online only after A has fully published (offline device case).
  async C4(env, sp) { const {relay, A, B} = env;
    await M(A, sp, 'add', 'x-a'); await round(relay, A);           // A online, publishes
    await M(B, sp, 'add', 'x-b');                                   // B offline edit (stale view)
    await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Disconnected delete vs stale rename of the same item.
  async D1(env, sp) { const {relay, A, B} = env; const i0 = sp === 'work' ? 'work-a' : 'home-a';
    await M(A, sp, 'delete', i0); await round(relay, A);
    await M(B, sp, 'rename', i0, {title: 'stale rename'});
    await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Same, but both upload "simultaneously" (neither has the other's change yet).
  async D2(env, sp) { const {relay, A, B} = env; const i0 = sp === 'work' ? 'work-a' : 'home-a';
    await M(A, sp, 'delete', i0); await M(B, sp, 'rename', i0, {title: 'stale rename'});
    await settle(relay, A, B); return [await report('after settle', env, sp)]; },
  // Single device only: add a shortcut whose slot collides with an existing record
  // already in the ledger (no concurrency) — does reconcile alone tear the ledger?
  async H1(env, sp) { const {relay, A, B} = env;
    await M(A, sp, 'add', 'x-a'); await round(relay, A); await round(relay, B);
    await M(B, sp, 'rename', sp === 'work' ? 'work-a' : 'home-a', {title: 'seq'}); await settle(relay, A, B);
    return [await report('sequential edits only', env, sp)]; },
};

for (const id of idsArg.split(',')) {
  for (const sp of (process.env.SPACES || 'work,personal').split(',')) {
    const env = await boot(browser, policy);
    try { out.push({id, space: sp, browser, policy, steps: await S[id](env, sp)}); }
    catch (e) { out.push({id, space: sp, browser, policy, error: String(e).slice(0, 1500)}); }
    finally { env.close(); }
  }
}
for (const r of out) {
  if (r.error) { console.log(`${r.id}/${r.space}: ERROR ${r.error.split('\n')[0]}`); continue; }
  for (const s of r.steps) console.log(`${r.id}/${r.space} [${s.tag}] converged=${s.converged} cloudCoherent=${s.cloud.coherent} A=${s.A.items.join(' ')} | B=${s.B.items.join(' ')} | cloud=${s.cloud.live.join(' ')} tomb=${s.cloud.tomb.join(',')} ds=${s.cloud.dsCount}/${s.cloud.live.length} A.status=${s.A.status}${s.A.warn ? ' A.warn' : ''} B.status=${s.B.status}${s.B.warn ? ' B.warn' : ''}`);
}
if (process.env.OUT) (await import('node:fs')).writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
process.exit(0);
