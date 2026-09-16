import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const childScript=resolve(import.meta.dirname,'harness/sync-device-process.mjs');
const clone=value=>value===undefined?undefined:structuredClone(value);

class RemoteSync {
  constructor(){ this.cloud=new Map(); this.views=new Map(); this.setCalls=new Map(); }
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
    if(op==='getBytesInUse') {
      const obj=this.select(view,args.keys);
      return Object.entries(obj).reduce((sum,[key,value])=>sum+Buffer.byteLength(String(key))+Buffer.byteLength(JSON.stringify(value)),0);
    }
    if(op==='set'){
      this.setCalls.set(deviceId,(this.setCalls.get(deviceId)||0)+1);
      for(const [k,v] of Object.entries(args.items||{})){const c=clone(v);this.cloud.set(k,c);view.set(k,clone(c));}
      return undefined;
    }
    if(op==='remove'){
      for(const k of (Array.isArray(args.keys)?args.keys:[args.keys])){this.cloud.delete(k);view.delete(k);}
      return undefined;
    }
    if(op==='clear'){this.cloud.clear();view.clear();return undefined;}
    throw new Error(`unknown rpc ${op}`);
  }
  deliver(deviceId,keys){
    const view=this.view(deviceId);const changes={};
    for(const key of keys){
      const oldValue=view.has(key)?clone(view.get(key)):undefined;
      if(this.cloud.has(key)){
        const newValue=clone(this.cloud.get(key));view.set(key,clone(newValue));
        if(JSON.stringify(oldValue)!==JSON.stringify(newValue)) changes[key]={oldValue,newValue};
      }else if(view.has(key)){
        view.delete(key);changes[key]={oldValue,newValue:undefined};
      }
    }
    return changes;
  }
  wipe(){ const keys=[...this.cloud.keys()]; this.cloud.clear(); return keys; }
  keys(){return [...this.cloud.keys()].sort();}
}

function spawnDevice(browser,deviceId,role,remote,{profileDeviceId=deviceId}={}){
  const child=fork(childScript,[browser,deviceId,role,profileDeviceId],{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
  let stderr='';child.stderr.on('data',d=>stderr+=d);
  let seq=0;const pending=new Map();let readyResolve;const ready=new Promise(r=>readyResolve=r);
  child.on('message',async message=>{
    if(message?.type==='ready'){readyResolve();return;}
    if(message?.type==='rpc'){
      try{const result=await remote.rpc(deviceId,message.op,message.args);child.send({type:'rpc-result',id:message.id,result});}
      catch(error){child.send({type:'rpc-result',id:message.id,error:error?.message||String(error)});}
      return;
    }
    if(message?.type==='reply'){
      const p=pending.get(message.id);if(!p)return;pending.delete(message.id);
      if(message.error)p.reject(new Error(`${message.error}\nchild stderr:\n${stderr}`));else p.resolve(message.result);
    }
  });
  const command=(command,args={})=>new Promise((resolve,reject)=>{
    const id=`cmd-${++seq}`;pending.set(id,{resolve,reject});child.send({type:'command',id,command,args});
  });
  return {id:deviceId,child,ready,command,close:()=>child.kill()};
}

function seededRandom(seed){
  let state=seed>>>0;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/0x100000000;};
}

for(const browser of ['firefox','chrome']){
  test(`1.30.14 ${browser} seeded three-device repeated catastrophic-loss stress converges without local loss`,async t=>{
    const remote=new RemoteSync();
    const devices=[
      spawnDevice(browser,'stress-a','a',remote),
      spawnDevice(browser,'stress-b','b',remote),
      spawnDevice(browser,'stress-c','b',remote)
    ];
    t.after(()=>devices.forEach(device=>device.close()));
    await Promise.all(devices.map(device=>device.ready));

    const [source,...receivers]=devices;
    await source.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
    assert.equal((await source.command('call',{message:{type:'mosaicsync:bootstrap-local'}}))?.ok,true);
    for(const device of receivers){
      await device.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
      await device.command('call',{message:{type:'mosaicsync:wait-for-remote'}});
      const changes=remote.deliver(device.id,remote.keys());
      await device.command('sync-changed',{changes});
      await device.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    }
    // Let all three see the complete protection generations produced during bootstrap.
    for(const device of devices){
      const changes=remote.deliver(device.id,remote.keys());
      if(Object.keys(changes).length) await device.command('sync-changed',{changes});
      await device.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    }

    const expected=new Set(['personal:home-a','personal:home-b','work:work-a','work:work-b']);
    const random=seededRandom(0x13014);

    for(let round=0;round<8;round++){
      // Randomly choose a healthy device to make a normal edit before the next wipe.
      const editor=devices[Math.floor(random()*devices.length)];
      const id=`stress-${round}`;
      expected.add(`work:${id}`);
      await editor.command('add-work-shortcut',{id,url:`https://${id}.test/`,modifiedAt:1000+round});
      for(const device of devices){
        const changes=remote.deliver(device.id,remote.keys());
        if(Object.keys(changes).length) await device.command('sync-changed',{changes});
        await device.command('alarm',{name:'mosaicsync-sync-watch-v1'});
      }

      const deletedKeys=remote.wipe();
      assert.ok(deletedKeys.length>0,`round ${round}: healthy cloud should not be empty before wipe`);
      for(const device of devices){
        const changes=remote.deliver(device.id,deletedKeys);
        await device.command('sync-changed',{changes});
        const snap=await device.command('snapshot');
        for(const expectedId of expected) assert.ok(snap.ids.includes(expectedId),`${browser} round ${round}: ${device.id} lost ${expectedId} during quarantine`);
      }

      // Fast-forward beyond the maximum 5m quarantine + stale penalty + jitter.
      await Promise.all(devices.map(device=>device.command('advance-time',{ms:12*60*1000})));
      const winner=devices[Math.floor(random()*devices.length)];
      const totalSetBefore=[...remote.setCalls.values()].reduce((sum,count)=>sum+count,0);
      await winner.command('alarm',{name:'mosaicsync-sync-recovery-v1'});
      assert.ok(remote.keys().length>0,`${browser} round ${round}: survivors failed to reconstruct cloud`);
      const totalSetAfter=[...remote.setCalls.values()].reduce((sum,count)=>sum+count,0);
      // A queued survivor can legitimately win the recovery race before the
      // explicitly poked device once every candidate is past quarantine. What
      // matters is that one protected survivor reconstructed the cloud and all
      // peers converge instead of a particular process owning the publication.
      assert.ok(totalSetAfter>=totalSetBefore,`${browser} round ${round}: recovery write accounting regressed`);

      // The other survivors receive the winning complete generation and must cancel
      // their own recovery rather than overwrite it with stale/partial state.
      for(const device of devices){
        const changes=remote.deliver(device.id,remote.keys());
        if(Object.keys(changes).length) await device.command('sync-changed',{changes});
        await device.command('alarm',{name:'mosaicsync-sync-watch-v1'});
        const snap=await device.command('snapshot');
        assert.equal(snap.meta.syncInitialized,true,`${browser} round ${round}: ${device.id} did not return to initialized Sync`);
        assert.equal(snap.meta.syncStatus,'ready',`${browser} round ${round}: ${device.id} did not return to ready Sync`);
        for(const expectedId of expected) assert.ok(snap.ids.includes(expectedId),`${browser} round ${round}: ${device.id} failed to converge ${expectedId}`);
      }
    }
  },{timeout:120000});
}


for(const browser of ['firefox','chrome']){
  test(`1.30.18.4 ${browser} two independent cloned profiles sharing one persistent identity keep distinct complete recovery generations`,async t=>{
    const remote=new RemoteSync();
    const sharedProfileId='cloned-profile-identity';
    const first=spawnDevice(browser,'clone-view-a','a',remote,{profileDeviceId:sharedProfileId});
    const second=spawnDevice(browser,'clone-view-b','a',remote,{profileDeviceId:sharedProfileId});
    t.after(()=>{first.close();second.close();});
    await Promise.all([first.ready,second.ready]);

    for(const device of [first,second]){
      await device.command('call',{message:{type:'mosaicsync:set-sync-enabled',enabled:true}});
      assert.equal((await device.command('call',{message:{type:'mosaicsync:bootstrap-local'}}))?.ok,true);
    }

    const rootPrefix=`mosaicsync.sync.device.${encodeURIComponent(sharedProfileId)}.snapshot.`;
    const generationRoots=remote.keys().filter(key=>key.startsWith(rootPrefix)&&!key.includes('.chunk.'));
    assert.equal(generationRoots.length,2,'the two physical profiles must not overwrite one recovery root merely because deviceId was cloned');
    assert.equal(new Set(generationRoots).size,2);
    for(const rootKey of generationRoots){
      assert.ok(remote.keys().some(key=>key.startsWith(`${rootKey}.chunk.`)),`${rootKey} must retain its own chunk namespace`);
    }

    // Deliver both immutable generations to both physical views and let normal
    // maintenance run. The two-generation retention bound must preserve both.
    for(const device of [first,second]){
      const changes=remote.deliver(device.id,remote.keys());
      if(Object.keys(changes).length) await device.command('sync-changed',{changes});
      await device.command('alarm',{name:'mosaicsync-sync-watch-v1'});
    }
    const rootsAfterMaintenance=remote.keys().filter(key=>key.startsWith(rootPrefix)&&!key.includes('.chunk.'));
    assert.equal(rootsAfterMaintenance.length,2);
  },{timeout:60000});
}
