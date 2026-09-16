import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [browserName, deviceId, role, profileDeviceIdArg] = process.argv.slice(2);
if (!['firefox','chrome'].includes(browserName) || !deviceId || !['a','b'].includes(role)) {
  throw new Error('usage: sync-device-process.mjs <firefox|chrome> <viewId> <a|b> [profileDeviceId]');
}
const profileDeviceId = profileDeviceIdArg || deviceId;
const root = resolve(import.meta.dirname, '../..');
const clone = value => value === undefined ? undefined : structuredClone(value);
const nativeDateNow = Date.now.bind(Date);
let timeOffsetMs = 0;
Date.now = () => nativeDateNow() + timeOffsetMs;

function makeEvent() {
  const listeners=[];
  return {
    listeners,
    addListener(fn){ listeners.push(fn); },
    removeListener(fn){ const i=listeners.indexOf(fn); if(i>=0) listeners.splice(i,1); },
    hasListener(fn){ return listeners.includes(fn); }
  };
}
function makeLocalArea(initial={}) {
  const data=new Map(Object.entries(clone(initial)));
  return {
    data,
    async get(keys=null){
      if(keys===null||keys===undefined) return Object.fromEntries([...data].map(([k,v])=>[k,clone(v)]));
      if(typeof keys==='string') return data.has(keys)?{[keys]:clone(data.get(keys))}:{};
      if(Array.isArray(keys)){ const out={}; for(const k of keys) if(data.has(k)) out[k]=clone(data.get(k)); return out; }
      if(typeof keys==='object'){ const out={}; for(const [k,d] of Object.entries(keys)) out[k]=data.has(k)?clone(data.get(k)):clone(d); return out; }
      return {};
    },
    async set(items){ for(const [k,v] of Object.entries(items||{})) data.set(k,clone(v)); },
    async remove(keys){ for(const k of (Array.isArray(keys)?keys:[keys])) data.delete(k); },
    async clear(){ data.clear(); },
    async getBytesInUse(keys=null){ return Buffer.byteLength(JSON.stringify(await this.get(keys))); }
  };
}

let rpcSeq=0;
const rpcPending=new Map();
function rpc(op,args={}){
  return new Promise((resolve,reject)=>{
    const id=`rpc-${++rpcSeq}`;
    rpcPending.set(id,{resolve,reject});
    process.send({type:'rpc',id,deviceId,op,args});
  });
}

const events={
  onInstalled:makeEvent(), onStartup:makeEvent(), onMessage:makeEvent(), onStorageChanged:makeEvent(),
  onAlarm:makeEvent(), onPermissionAdded:makeEvent(), onPermissionRemoved:makeEvent(),
  onTabUpdated:makeEvent(), onTabRemoved:makeEvent(), onActionClicked:makeEvent()
};
const local=makeLocalArea();
const session=makeLocalArea();
const alarms=new Map();
const sync={
  get: keys=>rpc('get',{keys}),
  set: items=>rpc('set',{items}),
  remove: keys=>rpc('remove',{keys}),
  clear: ()=>rpc('clear'),
  getBytesInUse: keys=>rpc('getBytesInUse',{keys})
};
const runtimeId=`mosaicsync-${browserName}-${deviceId}`;
const api={
  runtime:{
    id:runtimeId,
    getURL:path=>`${browserName==='chrome'?'chrome-extension':'moz-extension'}://${runtimeId}/${path}`,
    onInstalled:events.onInstalled,onStartup:events.onStartup,onMessage:events.onMessage,
    async sendMessage(message){ const fn=events.onMessage.listeners[0]; return fn?fn(message,{id:runtimeId}):undefined; }
  },
  action:{onClicked:events.onActionClicked},
  storage:{local,sync,session,onChanged:events.onStorageChanged},
  alarms:{
    onAlarm:events.onAlarm,
    async create(name,info){ alarms.set(name,clone(info||{})); },
    async clear(name){ return alarms.delete(name); },
    async get(name){ return alarms.has(name)?{name,...clone(alarms.get(name))}:undefined; }
  },
  permissions:{
    onAdded:events.onPermissionAdded,onRemoved:events.onPermissionRemoved,
    async contains(){return false;},async request(){return false;},async remove(){return true;}
  },
  tabs:{onUpdated:events.onTabUpdated,onRemoved:events.onTabRemoved,async create(){return {id:1};},async query(){return[];}},
  topSites:{async get(){return[];}},bookmarks:{}
};
if(browserName==='chrome'){ globalThis.chrome=api; globalThis.browser=undefined; }
else { globalThis.browser=api; globalThis.chrome=undefined; }
globalThis.fetch=async()=>{ throw new Error('unexpected fetch in distributed Sync test'); };

const constants=await import(`${pathToFileURL(resolve(root,`dist/${browserName}/core/constants.js`)).href}?d=${Date.now()}`);
const model=await import(`${pathToFileURL(resolve(root,`dist/${browserName}/core/model.js`)).href}?d=${Date.now()}`);
function shortcut(id,url,modifiedAt=100,position=0){
  return {type:'shortcut',id,title:id,url,image:'',imageSyncData:'',imageAssetId:'',localImageAssetId:'',imageSyncKind:'none',imageSourceKind:'none',imageSourceUrl:'',imageIsFallback:false,imageStyle:'contain',position,createdAt:100,modifiedAt,source:'manual'};
}
function workspace(shortcuts,modifiedAt=100){ return {shortcuts,settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:modifiedAt,updatedAt:modifiedAt}; }
function makeState(personal=[],work=[]){ return model.normalizeState({schemaVersion:constants.STATE_SCHEMA_VERSION,activeSpaceId:'personal',spaces:{personal:workspace(personal),work:workspace(work)}}); }
const initialState=role==='a'
  ? makeState([shortcut('home-a','https://home-a.test/',200,0),shortcut('home-b','https://home-b.test/',200,1)],[shortcut('work-a','https://work-a.test/',200,0),shortcut('work-b','https://work-b.test/',200,1)])
  : makeState([],[]);
await local.set({
  [constants.LOCAL_STATE_KEY]:initialState,
  [constants.LOCAL_ACTIVE_SPACE_KEY]:'personal',
  [constants.LOCAL_META_KEY]:{...constants.DEFAULT_META,deviceId:profileDeviceId,onboardingCompleted:true}
});

await import(`${pathToFileURL(resolve(root,`dist/${browserName}/background/background.js`)).href}?device=${deviceId}-${Date.now()}`);
if(events.onMessage.listeners.length!==1) throw new Error('production background did not install runtime message listener');
const send=message=>events.onMessage.listeners[0](message,{id:runtimeId});

function idsInState(raw){
  const out=[];
  for(const spaceId of ['personal','work']){
    for(const item of raw?.spaces?.[spaceId]?.shortcuts||[]){
      if(item?.id) out.push(`${spaceId}:${item.id}`);
      for(const child of item?.items||[]) if(child?.id) out.push(`${spaceId}:${child.id}`);
    }
  }
  return out.sort();
}

async function handleCommand(message){
  const {id,command,args={}}=message;
  try{
    let result;
    if(command==='call') result=await send(args.message);
    else if(command==='snapshot'){
      const state=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
      const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
      result={state,meta,ids:idsInState(state)};
    }
    else if(command==='add-work-shortcut'){
      const oldState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
      const normalized=model.normalizeState(oldState);
      const work=model.workspaceStateNormalized(normalized,'work');
      const nextWork={...work,shortcuts:[...work.shortcuts,shortcut(args.id,args.url,args.modifiedAt||500,work.shortcuts.length)],updatedAt:args.modifiedAt||500};
      const next=model.replaceWorkspaceNormalized(normalized,'work',nextWork);
      await local.set({[constants.LOCAL_STATE_KEY]:next});
      for(const listener of events.onStorageChanged.listeners){
        listener({[constants.LOCAL_STATE_KEY]:{oldValue:oldState,newValue:next}},'local');
      }
      // A queued status call is a deterministic barrier after the onChanged task.
      await send({type:'mosaicsync:get-sync-status'});
      result={ok:true};
    }
    else if(command==='sync-changed'){
      for(const listener of events.onStorageChanged.listeners) listener(args.changes||{},'sync');
      // Barrier after the Sync event enqueue.
      await send({type:'mosaicsync:get-sync-status'});
      result={ok:true};
    }
    else if(command==='alarm'){
      for(const listener of events.onAlarm.listeners) listener({name:args.name});
      // Alarm listeners enqueue asynchronously; a status request queues behind it.
      await send({type:'mosaicsync:get-sync-status'});
      result={ok:true};
    }
    else if(command==='advance-time'){
      const delta=Number(args.ms)||0;
      timeOffsetMs += delta;
      result={ok:true,now:Date.now(),offset:timeOffsetMs};
    }
    else throw new Error(`unknown command ${command}`);
    process.send({type:'reply',id,result});
  }catch(error){
    process.send({type:'reply',id,error:error?.stack||error?.message||String(error)});
  }
}

process.on('message',message=>{
  if(message?.type==='rpc-result'){
    const pending=rpcPending.get(message.id); if(!pending) return;
    rpcPending.delete(message.id);
    if(message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
    return;
  }
  if(message?.type==='command') void handleCommand(message);
});
process.send({type:'ready',deviceId});
