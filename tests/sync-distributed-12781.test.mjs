import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const childScript=resolve(import.meta.dirname,'harness/sync-device-process.mjs');
const clone=value=>value===undefined?undefined:structuredClone(value);

class RemoteSync {
  constructor(){ this.cloud=new Map(); this.views=new Map(); }
  view(id){ if(!this.views.has(id)) this.views.set(id,new Map()); return this.views.get(id); }
  select(map,keys){
    if(keys===null||keys===undefined) return Object.fromEntries([...map].map(([k,v])=>[k,clone(v)]));
    if(typeof keys==='string') return map.has(keys)?{[keys]:clone(map.get(keys))}:{};
    if(Array.isArray(keys)){const out={};for(const k of keys)if(map.has(k))out[k]=clone(map.get(k));return out;}
    if(typeof keys==='object'){const out={};for(const [k,d] of Object.entries(keys))out[k]=map.has(k)?clone(map.get(k)):clone(d);return out;}
    return {};
  }
  async rpc(deviceId,op,args={}){
    const view=this.view(deviceId);
    if(op==='get') return this.select(view,args.keys);
    if(op==='getBytesInUse') return Buffer.byteLength(JSON.stringify(this.select(view,args.keys)));
    if(op==='set'){
      for(const [k,v] of Object.entries(args.items||{})){ const c=clone(v); this.cloud.set(k,c); view.set(k,clone(c)); }
      return undefined;
    }
    if(op==='remove'){
      for(const k of (Array.isArray(args.keys)?args.keys:[args.keys])){ this.cloud.delete(k); view.delete(k); }
      return undefined;
    }
    if(op==='clear'){ this.cloud.clear(); view.clear(); return undefined; }
    throw new Error(`unknown rpc ${op}`);
  }
  deliver(deviceId,keys){
    const view=this.view(deviceId); const changes={};
    for(const key of keys){
      const oldValue=view.has(key)?clone(view.get(key)):undefined;
      if(this.cloud.has(key)){
        const newValue=clone(this.cloud.get(key)); view.set(key,clone(newValue)); changes[key]={oldValue,newValue};
      } else if(view.has(key)){
        view.delete(key); changes[key]={oldValue,newValue:undefined};
      }
    }
    return changes;
  }
  keys(){ return [...this.cloud.keys()].sort(); }
}

function spawnDevice(browser,deviceId,role,remote){
  const child=fork(childScript,[browser,deviceId,role],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
  let stderr=''; child.stderr.on('data',d=>stderr+=d);
  let seq=0; const pending=new Map();
  let readyResolve; const ready=new Promise(r=>readyResolve=r);
  child.on('message',async message=>{
    if(message?.type==='ready'){ readyResolve(); return; }
    if(message?.type==='rpc'){
      try{ const result=await remote.rpc(deviceId,message.op,message.args); child.send({type:'rpc-result',id:message.id,result}); }
      catch(error){ child.send({type:'rpc-result',id:message.id,error:error?.message||String(error)}); }
      return;
    }
    if(message?.type==='reply'){
      const p=pending.get(message.id); if(!p) return; pending.delete(message.id);
      if(message.error) p.reject(new Error(`${message.error}\nchild stderr:\n${stderr}`)); else p.resolve(message.result);
    }
  });
  const command=(command,args={})=>new Promise((resolve,reject)=>{ const id=`cmd-${++seq}`; pending.set(id,{resolve,reject}); child.send({type:'command',id,command,args}); });
  return {child,ready,command,stderr:()=>stderr,close:()=>child.kill()};
}

for(const browser of ['firefox','chrome']){
  test(`1.27.8.1 ${browser} two-computer partial/out-of-order Sync converges without losing a waiting local Work edit`,async t=>{
    const remote=new RemoteSync();
    const a=spawnDevice(browser,'device-a','a',remote);
    const b=spawnDevice(browser,'device-b','b',remote);
    t.after(()=>{a.close();b.close();});
    await Promise.all([a.ready,b.ready]);

    await a.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    const aBoot=await a.command('call',{message:{type:'mosaicsync:bootstrap-local'}});
    assert.equal(aBoot?.ok,true,'computer A should publish its populated profile');
    assert.ok(remote.keys().some(k=>k.startsWith('mosaicsync.sync.device.device-a')),'A must publish a complete safety generation');

    await b.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    const firstWait=await b.command('call',{message:{type:'mosaicsync:wait-for-remote'}});
    assert.equal(firstWait?.pending,true,'B should enter await-remote mode before any delivery');

    const keys=remote.keys();
    const personal=keys.filter(k=>
      k==='mosaicsync.sync.settings' || k==='mosaicsync.sync.dataset' ||
      (k.startsWith('mosaicsync.sync.item.') && !k.startsWith('mosaicsync.sync.space.'))
    );
    const work=keys.filter(k=>k.startsWith('mosaicsync.sync.space.work.'));
    const workItems=work.filter(k=>k.startsWith('mosaicsync.sync.space.work.item.'));
    assert.ok(personal.length>=4 && workItems.length>=2,'fixture should contain complete Personal and at least two Work records');
    const partialWork=work.filter(k=>!k.startsWith('mosaicsync.sync.space.work.item.')).concat(workItems.slice(0,1));
    const firstDelivery=[...personal,...partialWork];
    const firstChanges=remote.deliver('device-b',firstDelivery);
    await b.command('sync-changed',{changes:firstChanges});
    let bSnap=await b.command('snapshot');
    assert.equal(bSnap.meta.syncInitialized,false,'Personal + partial Work must not initialize B');
    assert.equal(bSnap.meta.syncStatus,'waiting');
    assert.equal(bSnap.ids.some(id=>id==='work:work-a'||id==='work:work-b'),false,'partial Work must not activate');

    await b.command('add-work-shortcut',{id:'local-new',url:'https://local-new.test/',modifiedAt:600});
    assert.equal(remote.keys().some(k=>k.endsWith(encodeURIComponent('local-new'))),false,'waiting local edit must not upload before a complete baseline exists');

    // Deliver the missing Work key WITHOUT an onChanged notification. The real
    // 5-minute Sync watchdog must discover it from storage.sync and complete the bootstrap.
    const remainingWork=work.filter(k=>!firstDelivery.includes(k));
    remote.deliver('device-b',remainingWork);
    await b.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    bSnap=await b.command('snapshot');
    for(const id of ['personal:home-a','personal:home-b','work:work-a','work:work-b','work:local-new']) assert.ok(bSnap.ids.includes(id),`B missing ${id}`);
    assert.equal(bSnap.meta.syncInitialized,true);
    assert.equal(bSnap.meta.syncStatus,'ready');
    assert.ok(bSnap.meta.lastAppliedWorkSyncRevision,'B must record Work before Ready');
    assert.equal(bSnap.meta.syncProfileProtection,'protected','B should publish a complete protection generation after successful bootstrap');
    assert.ok(remote.keys().some(k=>k.includes(encodeURIComponent('local-new'))),'B local edit must reach the shared remote after baseline completion');

    // Computer A receives B's resulting cloud state in one arbitrary late batch;
    // again do not rely on onChanged — the watchdog must converge A too.
    remote.deliver('device-a',remote.keys());
    await a.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    const aSnap=await a.command('snapshot');
    assert.ok(aSnap.ids.includes('work:local-new'),'A must converge to B\'s new Work shortcut');
    for(const id of ['personal:home-a','personal:home-b','work:work-a','work:work-b']) assert.ok(aSnap.ids.includes(id),`A lost ${id}`);
  },{timeout:30000});
}

for(const browser of ['firefox','chrome']){
  test(`1.30 ${browser} Sync timestamps distinguish this-device publication from foreign receipt`,async t=>{
    const remote=new RemoteSync();
    const a=spawnDevice(browser,'timestamp-a','a',remote);
    const b=spawnDevice(browser,'timestamp-b','b',remote);
    t.after(()=>{a.close();b.close();});
    await Promise.all([a.ready,b.ready]);

    await a.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    const aPublish=await a.command('call',{message:{type:'mosaicsync:bootstrap-local'}});
    assert.equal(aPublish?.ok,true);
    const aSnap=await a.command('snapshot');
    assert.ok(Number(aSnap.meta.lastSyncAt)>0,'local publication records a local Sync timestamp');
    assert.equal(Number(aSnap.meta.lastRemoteReceiptAt)||0,0,'self-publication must not masquerade as a foreign receipt');

    await b.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    await b.command('call',{message:{type:'mosaicsync:wait-for-remote'}});
    remote.deliver('timestamp-b',remote.keys());
    await b.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    const received=await b.command('snapshot');
    assert.ok(Number(received.meta.lastRemoteReceiptAt)>0,'receiving A must record a foreign receipt timestamp');
    assert.equal(received.meta.lastRemoteReceiptOriginDeviceId,'timestamp-a');
    const receiptAt=received.meta.lastRemoteReceiptAt;

    const bPublish=await b.command('call',{message:{type:'mosaicsync:bootstrap-local'}});
    assert.equal(bPublish?.ok,true);
    const afterSelfPublish=await b.command('snapshot');
    assert.ok(Number(afterSelfPublish.meta.lastSyncAt)>0);
    assert.equal(afterSelfPublish.meta.lastRemoteReceiptAt,receiptAt,'self-publication must leave the last foreign-receipt timestamp unchanged');
    assert.equal(afterSelfPublish.meta.lastRemoteReceiptOriginDeviceId,'timestamp-a');
  },{timeout:30000});

  test(`1.30 ${browser} explicit local bootstrap is authoritative when a newer remote copy is delivered but not reconciled`,async t=>{
    const remote=new RemoteSync();
    const a=spawnDevice(browser,'source-a','a',remote);
    const b=spawnDevice(browser,'source-b','b',remote);
    t.after(()=>{a.close();b.close();});
    await Promise.all([a.ready,b.ready]);

    await a.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    await a.command('call',{message:{type:'mosaicsync:bootstrap-local'}});
    await b.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    await b.command('call',{message:{type:'mosaicsync:wait-for-remote'}});
    remote.deliver('source-b',remote.keys());
    await b.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    let bSnap=await b.command('snapshot');
    assert.equal(bSnap.meta.syncInitialized,true);

    await a.command('add-work-shortcut',{id:'newer-on-a',url:'https://newer-on-a.test/',modifiedAt:900});
    assert.ok(remote.keys().some(key=>key.includes(encodeURIComponent('newer-on-a'))),'A must publish its newer Work record');

    // Firefox has delivered the newer synchronized data into B's local storage.sync
    // cache, but B has not processed an onChanged event or watchdog reconciliation.
    // The explicit bootstrap-local command is deliberately authoritative: it uses
    // B's current local layout as the source rather than performing an implicit merge.
    remote.deliver('source-b',remote.keys());
    bSnap=await b.command('snapshot');
    assert.equal(bSnap.ids.includes('work:newer-on-a'),false,'B local layout is intentionally stale before authoritative republish');
    const republish=await b.command('call',{message:{type:'mosaicsync:bootstrap-local'}});
    assert.equal(republish?.ok,true);
    const staleKey=remote.keys().find(key=>key.includes(encodeURIComponent('newer-on-a')));
    assert.ok(staleKey,'authoritative publication retains a deletion record for deterministic convergence');
    assert.equal(remote.cloud.get(staleKey)?.kind,'deleted',
      'authoritative republish tombstones a newer delivered remote record absent from the chosen local source');
  },{timeout:30000});
}
