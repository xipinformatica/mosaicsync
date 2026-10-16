// TEST-ONLY scenario runner for the .71 audit (Claude). Multi-device relay running each device's REAL shipped
// background. usage: R71=<tree> R70=<tree> R64=<tree> node s2d-claude-x71.mjs <chrome|firefox> <lww|server-wins> <scenario> <versions e.g. 71,71>
import {bootN, round, settle, view, ledger, pull, WATCH} from '../s2d-64-multi.mjs';
const [browser, policy, id, vers] = process.argv.slice(2);
const env = await bootN(browser, policy, vers.split(',')); const {relay, devs} = env;
const M = (D, sp, action, sid, extra = {}) => D.command('mutate', {space: sp, action, id: sid, ...extra});
const call = async (D, type, extra = {}) => { try { const r = await D.command('call', {message: {type, ...extra}}); return r?.ok ? 'ok' : `fail:${String(r?.error || r?.reason || '').slice(0, 80)}`; } catch (e) { return 'THROW:' + String(e.message).slice(0, 80); } };
const snap = async (tag, list = devs) => { const v = {}; for (const D of list) { const p = await view(D, 'personal'), w = await view(D, 'work'); const s = await D.command('snapshot');
  v[D.name] = `P[${p.items.join(' ')}] W[${w.items.join(' ')}] ${p.status}${s.meta.syncBootstrapMode === 'await-remote' ? '/await' : ''}`; }
  const lp = ledger(relay, 'personal'), lw = ledger(relay, 'work');
  const ds = relay.server.get('mosaicsync.sync.dataset'), dw = relay.server.get('mosaicsync.sync.space.work.dataset');
  return {tag, views: v, cloudP: `${lp.live.join(' ')}${lp.coherent ? '' : ' (TORN)'}`, cloudW: `${lw.live.join(' ')}${lw.coherent ? '' : ' (TORN)'}`,
    stamps: `${ds?.resetEpoch ? 'P:E' : 'P:-'} ${dw?.resetEpoch ? 'W:E' : 'W:-'}`, key: relay.server.has('mosaicsync.sync.reset-epoch.v1')}; };
const out = [];
// Reset by R and publication of a DIFFERENT replacement: home-b removed, new-r added (Personal); work-b removed (Work).
async function resetAndPublish(R) {
  await round(relay, R); await round(relay, R);   // resetter's view is current before Clear Sync
  const c = await call(R, 'mosaicsync:clear-sync-data'); relay.upload(R.view);
  await M(R, 'personal', 'delete', 'home-b'); await M(R, 'personal', 'add', 'new-r'); await M(R, 'work', 'delete', 'work-b');
  const b = await call(R, 'mosaicsync:bootstrap-local'); relay.upload(R.view); await round(relay, R);
  return {clear: c, publish: b};
}
const S = {
  // Sanity: reset with everyone online.
  async M0() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))}); await settle(relay, devs, 6);
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 6); out.push({...(await snap('after settle')), joinA: j}); },
  // A is offline for the whole reset + replacement, edits while offline (writes land in its local storage.sync), then reconnects.
  async OFFW_DL() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))});
    await M(A, 'personal', 'add', 'stray-a'); await M(A, 'personal', 'rename', 'home-b', {title: 'offline-edit'});
    await pull(relay, A); await A.command('alarm', {name: WATCH}); relay.upload(A.view);  // download first, then A's queued writes go up
    await settle(relay, devs, 8); out.push(await snap('after reconnect+settle'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 8); out.push({...(await snap('after A chooses synced layout')), joinA: j}); },
  async OFFW_UP() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))});
    await M(A, 'personal', 'add', 'stray-a'); await M(A, 'personal', 'rename', 'home-b', {title: 'offline-edit'});
    relay.upload(A.view);   // A's queued offline writes reach the server first
    await settle(relay, devs, 8); out.push(await snap('after reconnect+settle'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 8); out.push({...(await snap('after A chooses synced layout')), joinA: j}); },
  // The reset+replacement reaches A's storage while A is writing an ordinary edit (between guard and commit).
  async MID() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))}); let armed = true, ch = null;
    relay.onSet = (dev, items) => { if (armed && dev === A.view && Object.keys(items).some(k => k.endsWith('stray-a'))) { armed = false; ch = relay.download(A.view); } };
    await M(A, 'personal', 'add', 'stray-a'); relay.onSet = null; if (ch && Object.keys(ch).length) await A.command('sync-changed', {changes: ch});
    relay.upload(A.view); out.push(await snap('just after A\'s interrupted publication'));
    await settle(relay, devs, 10); out.push(await snap('after settle (10 rounds)'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 8); out.push({...(await snap('after A chooses synced layout')), joinA: j});
    const u = await call(R, 'mosaicsync:bootstrap-local'); await settle(relay, devs, 8); out.push({...(await snap('after R chooses "Use this device"')), useLocalR: u}); },
  // Mixed .71 resetter (D0), .70 peer (D2) and an offline .71 device (D1) that receives everything except the separate key.
  async MIX() { const [R, A, C] = devs; const m0 = relay.log.length; out.push({tag: 'reset', ...(await resetAndPublish(R)), resetLog: relay.log.slice(m0).filter(e => /home-b|work-b/.test(e.k)).map(e => `${e.id}:${e.k.replace('mosaicsync.sync.','')}:${e.kind}${e.dropped?':dropped':''}`)});
    const mk = relay.log.length; await round(relay, C); out.push({...(await snap('C after first round', [R, C])), homeBWrites: relay.log.slice(mk).filter(e => /home-b|work-b/.test(e.k)).map(e => `${e.id}:${e.k.replace('mosaicsync.sync.','')}:${e.kind}${e.dropped?':dropped':''}`)}); const jc = await call(C, 'mosaicsync:wait-for-remote'); out.push(await snap('C after wait-for-remote', [R, C])); await settle(relay, [R, C], 4);
    out.push(await snap('R+C settled', [R, C]));
    await M(C, 'personal', 'add', 'c70-p'); await M(C, 'work', 'add', 'c70-w'); await settle(relay, [R, C], 4);
    out.push({...(await snap('after .70 peer edits both Spaces', [R, C])), joinC: jc});
    relay.block = {dev: A.view, keys: new Set(['mosaicsync.sync.reset-epoch.v1'])};
    await settle(relay, devs, 6); out.push(await snap('offline .71 device reconnects; separate key withheld'));
    relay.block = null; await settle(relay, devs, 6); out.push(await snap('key delivered'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 6); out.push({...(await snap('A chooses synced layout')), joinA: j}); },
  // ONE Space of the reset reaches the offline device first (Work, with its stamped marker); Personal removals/new
  // records and the separate key arrive later. Then the rest is delivered.
  async ONE_W() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))});
    const personal = k => k === 'mosaicsync.sync.reset-epoch.v1' || k === 'mosaicsync.sync.reset-intent' || k === 'mosaicsync.sync.dataset' || k === 'mosaicsync.sync.settings' || k.startsWith('mosaicsync.sync.item.');
    relay.block = {dev: A.view, test: personal};
    for (let i = 0; i < 4; i++) await round(relay, A); out.push(await snap('A has new Work only'));
    relay.block = null; await settle(relay, devs, 8); out.push(await snap('everything delivered'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 6); out.push({...(await snap('A chooses synced layout')), joinA: j}); },
  async ONE_P() { const [A, R] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))});
    const work = k => k === 'mosaicsync.sync.reset-epoch.v1' || k === 'mosaicsync.sync.reset-intent' || k.startsWith('mosaicsync.sync.space.work.');
    relay.block = {dev: A.view, test: work};
    for (let i = 0; i < 4; i++) await round(relay, A); out.push(await snap('A has new Personal only'));
    relay.block = null; await settle(relay, devs, 8); out.push(await snap('everything delivered'));
    const j = await call(A, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 6); out.push({...(await snap('A chooses synced layout')), joinA: j}); },
  // Two devices press "Clear Sync copy" concurrently while a third device's clock is ahead (the visible epoch is in
  // their future), so both mint the SAME epoch with different initiators. One keeps editing before it syncs.
  async DUP() { const [A, B, F] = devs; await F.command('advance-time', {ms: 3600000});
    out.push({tag: 'F (clock +1h) resets', ...(await resetAndPublish(F))}); await settle(relay, devs, 4);
    out.push({joinA: await call(A, 'mosaicsync:wait-for-remote'), joinB: await call(B, 'mosaicsync:wait-for-remote')}); await settle(relay, devs, 4);
    out.push(await snap('all in epoch E'));
    const ca = await call(A, 'mosaicsync:clear-sync-data'); const cb = await call(B, 'mosaicsync:clear-sync-data');
    const pa = await call(A, 'mosaicsync:bootstrap-local'); const pb = await call(B, 'mosaicsync:bootstrap-local');
    relay.upload(A.view); relay.upload(B.view);
    await M(A, 'personal', 'add', 'a-after'); relay.upload(A.view);
    const k = relay.server.get('mosaicsync.sync.reset-epoch.v1'), dp = relay.server.get('mosaicsync.sync.dataset'), dw = relay.server.get('mosaicsync.sync.space.work.dataset');
    out.push({tag: 'concurrent resets', ca, cb, pa, pb, key: `${k?.epoch}/${k?.initiatedByDevice}`, personalStamp: `${dp?.resetEpoch}/${dp?.resetInitiatedByDevice}`, workStamp: `${dw?.resetEpoch}/${dw?.resetInitiatedByDevice}`});
    await settle(relay, devs, 6); out.push(await snap('after settle'));
    out.push({tag: 'escape hatches on A', clear: await call(A, 'mosaicsync:clear-sync-data'), useLocal: await call(A, 'mosaicsync:bootstrap-local')});
    await settle(relay, devs, 6); out.push(await snap('after A retries Clear Sync + Use this device')); },
  // Same as MIX but the .70 peer is offline-reconnect-safe check: does a .70 publisher and a .71 publisher rewrite each other's markers forever?
  async PING() { const [R, C] = devs; out.push({tag: 'reset', ...(await resetAndPublish(R))});
    await round(relay, C); await call(C, 'mosaicsync:wait-for-remote'); await settle(relay, devs, 4);
    await M(C, 'personal', 'add', 'c70-p'); await settle(relay, devs, 4); await M(R, 'personal', 'add', 'r71-p'); await settle(relay, devs, 4);
    const mark = relay.log.length; await settle(relay, devs, 10);
    const ds = relay.log.slice(mark).filter(e => !e.dropped && /dataset$/.test(e.k)).length;
    out.push({...(await snap('after 10 idle rounds')), datasetWritesDuringIdle: ds, allWritesDuringIdle: relay.log.slice(mark).filter(e => !e.dropped).length}); },
};
try { await S[id](); } catch (e) { out.push({error: String(e.stack || e).slice(0, 600)}); }
console.log(JSON.stringify({id, browser, policy, vers, out}, null, 1));
env.close(); process.exit(0);
