// TEST-ONLY (Claude, .64 audit). N devices, each running the REAL shipped background of the
// release tree given per device (mixed versions allowed). Same relay semantics as
// s2d-claude-two-device.mjs (per-device storage.sync copies, own-write events, changed-key
// downloads with true oldValue, LWW or server-wins).
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const R64 = process.env.R64, R63 = process.env.R63;
const {stableStringify} = await import(pathToFileURL(resolve(R64, 'dist/chrome/core/model.js')).href);
const script = resolve(import.meta.dirname, 'harness/s2d-claude-deviceN.mjs');
const clone = x => x === undefined ? undefined : structuredClone(x);
const same = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);
export const WATCH = 'mosaicsync-sync-watch-v1';
class Relay {
  constructor(policy) { this.policy = policy; this.server = new Map(); this.serverVer = new Map(); this.dev = new Map(); this.log = []; }
  d(id) { if (!this.dev.has(id)) this.dev.set(id, {view: new Map(), seen: new Map(), outbox: new Set(), events: []}); return this.dev.get(id); }
  select(map, keys) {
    if (keys == null) return Object.fromEntries([...map].map(([k, v]) => [k, clone(v)]));
    if (typeof keys === 'string') return map.has(keys) ? {[keys]: clone(map.get(keys))} : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => map.has(k)).map(k => [k, clone(map.get(k))]));
    if (typeof keys === 'object') return Object.fromEntries(Object.entries(keys).map(([k, dflt]) => [k, map.has(k) ? clone(map.get(k)) : clone(dflt)]));
    return {};
  }
  rpc(id, op, args = {}) {
    const d = this.d(id);
    if (op === 'get') return this.select(d.view, args.keys);
    if (op === 'getBytesInUse') return Buffer.byteLength(JSON.stringify(this.select(d.view, args.keys)));
    if (op === 'set') {
      const ch = {};
      for (const [k, v] of Object.entries(args.items || {})) {
        const old = d.view.get(k);
        d.view.set(k, clone(v)); d.outbox.add(k);
        if (!same(old, v)) ch[k] = {oldValue: clone(old), newValue: clone(v)};
      }
      if (Object.keys(ch).length) d.events.push(ch);
      return;
    }
    if (op === 'remove') {
      const ch = {};
      for (const k of (Array.isArray(args.keys) ? args.keys : [args.keys])) {
        if (d.view.has(k)) { ch[k] = {oldValue: clone(d.view.get(k)), newValue: undefined}; d.view.delete(k); d.outbox.add(k); }
      }
      if (Object.keys(ch).length) d.events.push(ch);
      return;
    }
    if (op === 'clear') { for (const k of d.view.keys()) d.outbox.add(k); d.view.clear(); return; }
    throw Error(`bad op ${op}`);
  }
  upload(id) {
    const d = this.d(id);
    for (const k of d.outbox) {
      const serverChangedSinceSeen = (this.serverVer.get(k) || 0) !== (d.seen.get(k) || 0);
      if (this.policy === 'server-wins' && serverChangedSinceSeen && this.server.has(k)) {
        this.log.push({id, k, dropped: true});
        continue; // our pending value is discarded; download will overwrite it
      }
      const v = d.view.get(k);
      if (v === undefined) this.server.delete(k); else this.server.set(k, clone(v));
      const ver = (this.serverVer.get(k) || 0) + 1; this.serverVer.set(k, ver); d.seen.set(k, ver);
      this.log.push({id, k, kind: v?.kind});
    }
    d.outbox.clear();
  }
  download(id) {
    const d = this.d(id), ch = {};
    const keys = new Set([...this.server.keys(), ...d.view.keys()]);
    for (const k of keys) {
      if (this.block && this.block.dev === id && this.block.keys.has(k)) continue; // test-only partial delivery
      const sv = this.serverVer.get(k) || 0;
      if (sv === (d.seen.get(k) || 0)) continue; // nothing new from server for this key
      const nv = this.server.get(k), ov = d.view.get(k);
      d.seen.set(k, sv);
      if (same(ov, nv)) continue;
      if (nv === undefined) d.view.delete(k); else d.view.set(k, clone(nv));
      ch[k] = {oldValue: clone(ov), newValue: clone(nv)};
    }
    return ch;
  }
  takeEvents(id) { const d = this.d(id); const e = d.events; d.events = []; return e; }
}

function spawnDev(browser, name, role, root, relay) {
  const child = fork(script, [browser, name, role], {stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {...process.env, MS_ROOT: root}});
  let stderr = '', seq = 0; const pending = new Map();
  child.stderr.on('data', c => stderr += c);
  let readyResolve; const ready = new Promise(r => readyResolve = r);
  child.on('message', msg => {
    if (msg?.type === 'ready') return readyResolve();
    if (msg?.type === 'rpc') { try { child.send({type: 'rpc-result', id: msg.id, result: relay.rpc(name, msg.op, msg.args)}); } catch (e) { child.send({type: 'rpc-result', id: msg.id, error: String(e)}); } return; }
    if (msg?.type === 'reply') { const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id); msg.error ? p.reject(Error(msg.error + '\n' + stderr.slice(-1500))) : p.resolve(msg.result); }
  });
  const raw = (c, a = {}) => new Promise((res, rej) => { const id = `c${++seq}`; pending.set(id, {resolve: res, reject: rej}); child.send({type: 'command', id, command: c, args: a}); });
  const flushOwn = async () => { for (let i = 0; i < 20; i++) { const ev = relay.takeEvents(name); if (!ev.length) return; for (const ch of ev) await raw('sync-changed', {changes: ch}); } };
  const command = async (c, a) => { const r = await raw(c, a); await flushOwn(); return r; };
  return {view: name, name, root, ready, command, close: () => child.kill()};
}
// versions: array like ['64','64','63'] -> devices D0 (seeds), D1, D2 ...
export async function bootN(browser, policy, versions) {
  const relay = new Relay(policy); const devs = [];
  versions.forEach((v, i) => devs.push(spawnDev(browser, `D${i}-${v}-${browser}`, i === 0 ? 'a' : 'b', v === '63' ? R63 : R64, relay)));
  await Promise.all(devs.map(d => d.ready));
  const [A, ...rest] = devs;
  await A.command('call', {message: {type: 'mosaicsync:set-sync-enabled', enabled: true}});
  const b = await A.command('call', {message: {type: 'mosaicsync:bootstrap-local'}}); if (!b?.ok) throw Error('bootstrap ' + JSON.stringify(b));
  relay.upload(A.view);
  for (const D of rest) {
    await D.command('call', {message: {type: 'mosaicsync:set-sync-enabled', enabled: true}});
    await D.command('call', {message: {type: 'mosaicsync:wait-for-remote'}});
    await pull(relay, D); await D.command('alarm', {name: WATCH}); relay.upload(D.view);
    if (!(await D.command('snapshot')).meta.syncInitialized) throw Error(D.name + ' not initialized');
  }
  for (const D of devs) await round(relay, D);
  return {relay, devs, close: () => devs.forEach(d => d.close())};
}
export async function pull(relay, D) { const ch = relay.download(D.view); if (Object.keys(ch).length) await D.command('sync-changed', {changes: ch}); return Object.keys(ch); }
export async function round(relay, D) { relay.upload(D.view); await pull(relay, D); await D.command('alarm', {name: WATCH}); relay.upload(D.view); }
export async function settle(relay, devs, n = 8) { for (let i = 0; i < n; i++) for (const D of devs) await round(relay, D); }
export async function view(D, space) {
  const s = await D.command('snapshot');
  return {items: s.state.spaces[space].shortcuts.map(x => `${x.id}${x.title !== x.id ? `"${x.title}"` : ''}`).sort(), status: s.meta.syncStatus, warn: s.meta.lastSyncWarning || ''};
}
export function ledger(relay, space) {
  const pref = space === 'work' ? 'mosaicsync.sync.space.work.item.' : 'mosaicsync.sync.item.';
  const dsKey = space === 'work' ? 'mosaicsync.sync.space.work.dataset' : 'mosaicsync.sync.dataset';
  const recs = [...relay.server].filter(([k]) => k.startsWith(pref)).map(([, v]) => v);
  const live = recs.filter(v => v?.kind === 'shortcut' || v?.kind === 'folder').map(({deviceId, ...r}) => r).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let h = 0x811c9dc5; for (const c of stableStringify(live)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const ds = relay.server.get(dsKey); const fp = h.toString(16).padStart(8, '0');
  return {live: live.map(r => r.id).sort(), tomb: recs.filter(v => v?.kind === 'deleted').map(v => v.id).sort(), coherent: !!ds && ds.liveRecordCount === live.length && ds.recordFingerprint === fp,
    witnesses: [...relay.server.keys()].filter(k => k.includes('repair-witness')).length};
}
