// TEST-ONLY (Claude Stage 2D independent review). Not a production test.
// Two child processes each run the REAL shipped dist/<browser> background.
// The cloud is an explicit relay with per-device local storage.sync copies:
//   - set() applies to the writer's own copy immediately and queues an upload;
//   - the writer receives its own storage.onChanged (area "sync"), as in browsers;
//   - upload(dev) commits queued keys to the server under a conflict policy;
//   - download(dev) copies server values into the device copy and fires
//     storage.onChanged ONLY for keys whose value actually changed, with oldValue.
// Policies: "lww" (last upload wins per key) and "server-wins" (an upload of a key
// the server changed since this device last downloaded it is discarded).
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
import {stableStringify} from '../dist/chrome/core/model.js';

const script = resolve(import.meta.dirname, 'harness/s2d-claude-device.mjs');
const clone = x => x === undefined ? undefined : structuredClone(x);
const same = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);
const WATCH = 'mosaicsync-sync-watch-v1';

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

function spawn(browser, view, role, relay) {
  const child = fork(script, [browser, view, role], {stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  let stderr = '', seq = 0; const pending = new Map();
  child.stderr.on('data', c => stderr += c);
  let readyResolve; const ready = new Promise(r => readyResolve = r);
  child.on('message', msg => {
    if (msg?.type === 'ready') return readyResolve();
    if (msg?.type === 'rpc') {
      try { child.send({type: 'rpc-result', id: msg.id, result: relay.rpc(view, msg.op, msg.args)}); }
      catch (e) { child.send({type: 'rpc-result', id: msg.id, error: String(e)}); }
      return;
    }
    if (msg?.type === 'reply') {
      const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id);
      msg.error ? p.reject(Error(msg.error + '\n' + stderr.slice(-2000))) : p.resolve(msg.result);
    }
  });
  const raw = (command, args = {}) => new Promise((res, rej) => { const id = `c${++seq}`; pending.set(id, {resolve: res, reject: rej}); child.send({type: 'command', id, command, args}); });
  // After each command, deliver the writer's own storage.onChanged events.
  const command = async (c, a) => { const r = await raw(c, a); await flushOwn(); return r; };
  const flushOwn = async () => { for (let i = 0; i < 20; i++) { const ev = relay.takeEvents(view); if (!ev.length) return; for (const ch of ev) await raw('sync-changed', {changes: ch}); } };
  return {view, child, ready, command, close: () => child.kill()};
}

export async function boot(browser, policy = 'lww') {
  const relay = new Relay(policy);
  const A = spawn(browser, `A-${browser}`, 'a', relay);
  const B = spawn(browser, `B-${browser}`, 'b', relay);
  await Promise.all([A.ready, B.ready]);
  await A.command('call', {message: {type: 'mosaicsync:set-sync-enabled', enabled: true}});
  const boot = await A.command('call', {message: {type: 'mosaicsync:bootstrap-local'}});
  if (!boot?.ok) throw Error('A bootstrap failed ' + JSON.stringify(boot));
  relay.upload(A.view);
  await B.command('call', {message: {type: 'mosaicsync:set-sync-enabled', enabled: true}});
  await B.command('call', {message: {type: 'mosaicsync:wait-for-remote'}});
  await pull(relay, B); await B.command('alarm', {name: WATCH}); relay.upload(B.view);
  const sb = await B.command('snapshot');
  if (!sb.meta.syncInitialized) throw Error('B not initialized');
  await pull(relay, A); relay.upload(A.view);
  return {relay, A, B, close: () => { A.close(); B.close(); }};
}
export async function pull(relay, D) {
  const ch = relay.download(D.view);
  if (Object.keys(ch).length) await D.command('sync-changed', {changes: ch});
  return Object.keys(ch);
}
// One "online" round: device uploads, downloads, watchdog alarm, uploads again.
export async function round(relay, D) {
  relay.upload(D.view); await pull(relay, D); await D.command('alarm', {name: WATCH}); relay.upload(D.view);
}
export async function settle(relay, A, B, n = 6) { for (let i = 0; i < n; i++) { await round(relay, A); await round(relay, B); } }

export function ledger(relay, D, space) {
  const view = D ? relay.d(D.view).view : relay.server;
  const pref = space === 'work' ? 'mosaicsync.sync.space.work.item.' : 'mosaicsync.sync.item.';
  const dsKey = space === 'work' ? 'mosaicsync.sync.space.work.dataset' : 'mosaicsync.sync.dataset';
  const recs = [...view].filter(([k]) => k.startsWith(pref)).map(([, v]) => v);
  const live = recs.filter(v => v?.kind === 'shortcut' || v?.kind === 'folder').map(({deviceId, ...r}) => r).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let h = 0x811c9dc5; for (const c of stableStringify(live)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  const ds = view.get(dsKey);
  return {live: live.map(r => `${r.id}@${r.position}`), tomb: recs.filter(v => v?.kind === 'deleted').map(v => v.id),
    dsCount: ds?.liveRecordCount, dsFp: ds?.recordFingerprint, fp: h.toString(16).padStart(8, '0'),
    coherent: !!ds && ds.liveRecordCount === live.length && ds.recordFingerprint === h.toString(16).padStart(8, '0')};
}
export async function view(D, space) {
  const s = await D.command('snapshot');
  const items = s.state.spaces[space].shortcuts.map(x => `${x.id}@${x.position}${x.title !== x.id ? `"${x.title}"` : ''}`);
  return {items, status: s.meta.syncStatus, err: s.meta.lastSyncError || '', warn: s.meta.lastSyncWarning || ''};
}
