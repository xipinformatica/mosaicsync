import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [browserName, scenario] = process.argv.slice(2);
if (!['firefox','chrome'].includes(browserName) || !scenario) throw new Error('usage: browser scenario');
const root = resolve(import.meta.dirname, '../..');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function makeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) { listeners.push(fn); },
    removeListener(fn) { const i=listeners.indexOf(fn); if(i>=0) listeners.splice(i,1); },
    hasListener(fn) { return listeners.includes(fn); }
  };
}

function makeStorageArea(initial = {}) {
  const data = new Map(Object.entries(clone(initial)));
  const stats = { getCalls: 0, getAllCalls: 0, setCalls: 0, removeCalls: 0 };
  return {
    data, stats,
    async get(keys = null) {
      stats.getCalls += 1;
      if (keys === null || keys === undefined) stats.getAllCalls += 1;
      if (keys === null || keys === undefined) return Object.fromEntries([...data].map(([k,v]) => [k, clone(v)]));
      if (typeof keys === 'string') return data.has(keys) ? { [keys]: clone(data.get(keys)) } : {};
      if (Array.isArray(keys)) {
        const out={}; for (const k of keys) if (data.has(k)) out[k]=clone(data.get(k)); return out;
      }
      if (typeof keys === 'object') {
        const out={}; for (const [k,def] of Object.entries(keys)) out[k]=data.has(k)?clone(data.get(k)):clone(def); return out;
      }
      return {};
    },
    async set(items) { stats.setCalls += 1; for (const [k,v] of Object.entries(items || {})) data.set(k, clone(v)); },
    async remove(keys) { stats.removeCalls += 1; for (const k of (Array.isArray(keys)?keys:[keys])) data.delete(k); },
    async clear() { data.clear(); },
    async getBytesInUse(keys = null) {
      const obj = await this.get(keys);
      return Buffer.byteLength(JSON.stringify(obj));
    }
  };
}

const events = {
  onInstalled: makeEvent(), onStartup: makeEvent(), onMessage: makeEvent(), onStorageChanged: makeEvent(),
  onAlarm: makeEvent(), onPermissionAdded: makeEvent(), onPermissionRemoved: makeEvent(),
  onTabUpdated: makeEvent(), onTabRemoved: makeEvent(), onActionClicked: makeEvent()
};
const local = makeStorageArea();
const sync = makeStorageArea();
const session = makeStorageArea();
const alarms = new Map();
let websiteAccess = false;
let fetchHandler = async () => { throw new Error('unexpected fetch'); };
const fetchLog = [];

globalThis.fetch = async (url, options = {}) => {
  fetchLog.push({ url: String(url), options: clone(options) });
  return fetchHandler(String(url), options);
};

const runtimeId = `mosaicsync-${browserName}-test`;
const api = {
  runtime: {
    id: runtimeId,
    getURL: path => `${browserName === 'chrome' ? 'chrome-extension' : 'moz-extension'}://${runtimeId}/${path}`,
    onInstalled: events.onInstalled,
    onStartup: events.onStartup,
    onMessage: events.onMessage,
    async sendMessage(message) {
      const listener = events.onMessage.listeners[0];
      return listener ? listener(message, { id: runtimeId }) : undefined;
    }
  },
  action: { onClicked: events.onActionClicked },
  storage: { local, sync, session, onChanged: events.onStorageChanged },
  alarms: {
    onAlarm: events.onAlarm,
    async create(name, info) { alarms.set(name, clone(info || {})); },
    async clear(name) { return alarms.delete(name); },
    async get(name) { return alarms.has(name) ? { name, ...clone(alarms.get(name)) } : undefined; }
  },
  permissions: {
    onAdded: events.onPermissionAdded,
    onRemoved: events.onPermissionRemoved,
    async contains(request) {
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async request(request) {
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async remove() { websiteAccess = false; return true; }
  },
  tabs: {
    onUpdated: events.onTabUpdated,
    onRemoved: events.onTabRemoved,
    async create() { return { id: 1 }; },
    async query() { return []; }
  },
  topSites: { async get() { return []; } },
  bookmarks: {}
};
if (browserName === 'chrome') {
  globalThis.chrome = api;
  globalThis.browser = undefined;
} else {
  globalThis.browser = api;
  globalThis.chrome = undefined;
}

const constants = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/constants.js`)).href}?h=${Date.now()}`);
const model = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/model.js`)).href}?h=${Date.now()}`);

function workspace(shortcuts, settings = {}) {
  return {
    shortcuts,
    settings: { ...constants.DEFAULT_SETTINGS, ...settings },
    settingsModifiedAt: 100,
    updatedAt: 100
  };
}
function shortcut(id, url, modifiedAt = 100) {
  return {
    type: 'shortcut', id, title: id, url, image: '', imageSyncData: '', imageAssetId: '', localImageAssetId: '',
    imageSyncKind: 'none', imageSourceKind: 'none', imageSourceUrl: '', imageIsFallback: false, imageStyle: 'contain',
    position: 0, createdAt: 100, modifiedAt, source: 'manual'
  };
}
function stateWith({ personal = [], work = [], activeSpaceId = 'personal', autoPersonal = true, autoWork = true } = {}) {
  return model.normalizeState({
    schemaVersion: constants.STATE_SCHEMA_VERSION,
    activeSpaceId,
    spaces: {
      personal: workspace(personal, { autoSiteIcons: autoPersonal }),
      work: workspace(work, { autoSiteIcons: autoWork })
    }
  });
}
async function seedLocalState(state, metaPatch = {}) {
  const compact = model.projectStateToLocalAssets ? model.projectStateToLocalAssets(state).state : state;
  // projectStateToLocalAssets is exported from local-assets, not model; for iconless states normalized state is already compact.
  await local.set({
    [constants.LOCAL_STATE_KEY]: clone(state),
    [constants.LOCAL_ACTIVE_SPACE_KEY]: state.activeSpaceId,
    [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId: 'device-b', onboardingCompleted: true, ...metaPatch }
  });
}

function tinyPng(width = 32, height = 32, marker = 0) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52],0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16,width); view.setUint32(20,height); bytes[24]=8; bytes[25]=6; bytes[31]=marker;
  return bytes;
}
function responseBytes(bytes, type='image/png', url='') {
  return {
    ok: true, status: 200, url,
    headers: { get(name) { const n=String(name).toLowerCase(); if(n==='content-type') return type; if(n==='content-length') return String(bytes.length); return null; } },
    body: null,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength); },
    async blob() { return new Blob([bytes], { type }); },
    async text() { return new TextDecoder().decode(bytes); }
  };
}

// Import the unmodified production background after every browser API/storage fixture is installed.
await import(`${pathToFileURL(resolve(root, `dist/${browserName}/background/background.js`)).href}?scenario=${encodeURIComponent(scenario)}-${Date.now()}`);
assert.equal(events.onMessage.listeners.length, 1, 'production background should install one runtime message listener');
const send = message => events.onMessage.listeners[0](message, { id: runtimeId });

function remotePersonalEntries(remoteState, commitId, originDeviceId = "remote-device") {
  const personal = model.workspaceStateNormalized(remoteState, "personal");
  const records = model.flattenStateNormalized(personal, originDeviceId);
  const settings = model.makeSettingsRecordNormalized(personal, originDeviceId);
  const entries = {};
  for (const [id, record] of records) entries[`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent(id)}`] = record;
  entries[constants.SYNC_SETTINGS_KEY] = settings;
  entries[constants.SYNC_DATASET_KEY] = {
    schemaVersion: constants.SYNC_SCHEMA_VERSION,
    kind: "dataset",
    updatedAt: 500,
    liveRecordCount: records.size,
    settingsModifiedAt: Number(settings.modifiedAt) || 0,
    commitId,
    originDeviceId
  };
  return entries;
}

function remoteWorkEntries(remoteState, commitId, originDeviceId = "remote-device") {
  const work = model.workspaceStateNormalized(remoteState, "work");
  const records = model.flattenStateNormalized(work, originDeviceId);
  const settings = model.makeSettingsRecordNormalized(work, originDeviceId);
  const prefix = `${constants.SYNC_SPACE_PREFIX}work.`;
  const entries = {};
  for (const [id, record] of records) entries[`${prefix}item.${encodeURIComponent(id)}`] = record;
  entries[`${prefix}settings`] = settings;
  entries[`${prefix}dataset`] = {
    schemaVersion: constants.SYNC_SCHEMA_VERSION,
    kind: "dataset",
    updatedAt: 500,
    liveRecordCount: records.size,
    settingsModifiedAt: Number(settings.modifiedAt) || 0,
    commitId,
    originDeviceId
  };
  return entries;
}

function findCompactShortcut(rawState, id) {
  for (const spaceId of ['personal','work']) {
    for (const item of rawState?.spaces?.[spaceId]?.shortcuts || []) {
      if (item?.type === 'shortcut' && item.id === id) return item;
      if (item?.type === 'folder') {
        const child=(item.items||[]).find(v=>v?.id===id); if(child) return child;
      }
    }
  }
  return null;
}

if (scenario === 'favicon-network') {
  websiteAccess = true;
  const s = stateWith({ personal: [shortcut('fresh','https://fresh.test/')] });
  await seedLocalState(s);
  const icon = tinyPng(32,32,1);
  fetchHandler = async url => {
    if (url === 'https://fresh.test/favicon.ico') return responseBytes(icon,'image/png',url);
    if (browserName === 'chrome' && url.includes('_favicon/')) {
      const globe = tinyPng(32,32,9);
      return responseBytes(globe,'image/png',url);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await send({ type:'mosaicsync:hydrate-missing-icons', shortcutIds:['fresh'], force:true });
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const item=findCompactShortcut(raw,'fresh');
  assert.equal(result.hydrated,1);
  assert.ok(item.localImageAssetId,'favicon should be materialized into local content-addressed asset');
  assert.equal(item.imageSyncKind,'device');
  assert.equal(item.imageSourceKind,'favicon');
  const asset=(await local.get(`${constants.LOCAL_ASSET_PREFIX}${item.localImageAssetId}`))[`${constants.LOCAL_ASSET_PREFIX}${item.localImageAssetId}`];
  assert.match(asset,/^data:image\/png;base64,/);
  console.log(JSON.stringify({ok:true, hydrated:result.hydrated, localImageAssetId:item.localImageAssetId}));
}
else if (scenario === 'favicon-work-space') {
  websiteAccess = true;
  const s=stateWith({ personal:[], work:[shortcut('work-fresh','https://work-fresh.test/')], activeSpaceId:'personal' });
  await seedLocalState(s);
  const icon=tinyPng(48,48,2);
  fetchHandler=async url => {
    if(url==='https://work-fresh.test/favicon.ico') return responseBytes(icon,'image/png',url);
    if(browserName==='chrome' && url.includes('_favicon/')) return responseBytes(tinyPng(32,32,9),'image/png',url);
    throw new Error(`unexpected fetch ${url}`);
  };
  const result=await send({type:'mosaicsync:hydrate-missing-icons', shortcutIds:['work-fresh'], force:true});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const item=findCompactShortcut(raw,'work-fresh');
  assert.equal(result.hydrated,1); assert.ok(item.localImageAssetId); assert.equal(raw.activeSpaceId,'personal');
  console.log(JSON.stringify({ok:true,hydrated:1,space:'work'}));
}
else if (scenario === 'chrome-placeholder-failure') {
  assert.equal(browserName,'chrome');
  websiteAccess=false;
  const s=stateWith({ personal:[shortcut('native','https://native.test/')] });
  await seedLocalState(s);
  const globe=tinyPng(32,32,7), real=tinyPng(32,32,3);
  let sentinelAttempts=0, pageMode='globe';
  fetchHandler=async (url, options) => {
    if(!url.includes('_favicon/')) throw new Error(`unexpected fetch ${url}`);
    assert.match(url,/scaleFactor=1x/);
    assert.equal(options?.cache,'no-store');
    if(url.includes('mosaicsync-placeholder-')) {
      sentinelAttempts += 1;
      if(sentinelAttempts===1) throw new Error('transient sentinel failure');
      return responseBytes(globe,'image/png',url);
    }
    return responseBytes(pageMode==='real'?real:globe,'image/png',url);
  };
  const first=await send({type:'mosaicsync:hydrate-missing-icons',shortcutIds:['native'],force:true});
  let raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(Boolean(findCompactShortcut(raw,'native').localImageAssetId),false,'unknown placeholder identity must fail closed');
  assert.equal(sentinelAttempts,1);
  const second=await send({type:'mosaicsync:hydrate-missing-icons',shortcutIds:['native'],force:true});
  raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(Boolean(findCompactShortcut(raw,'native').localImageAssetId),false,'learned generic globe must be rejected');
  assert.equal(sentinelAttempts,2,'failed sentinel must be retried, not negatively cached');
  pageMode='real';
  const third=await send({type:'mosaicsync:hydrate-missing-icons',shortcutIds:['native'],force:true});
  raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(third.hydrated,1); assert.ok(findCompactShortcut(raw,'native').localImageAssetId,'real native favicon should commit after sentinel recovers');
  console.log(JSON.stringify({ok:true,sentinelAttempts,first,second,third}));
}
else if (scenario === 'chrome-native-miss-scheduling') {
  assert.equal(browserName,'chrome'); websiteAccess=false;
  const s=stateWith({personal:[shortcut('missing','https://never-visited.test/') ]}); await seedLocalState(s);
  const globe=tinyPng(32,32,7);
  fetchHandler=async url => {
    if(url.includes('_favicon/')) return responseBytes(globe,'image/png',url);
    throw new Error(`unexpected fetch ${url}`);
  };
  const result=await send({type:'mosaicsync:hydrate-missing-icons',shortcutIds:['missing'],force:true});
  const q=(await local.get(constants.LOCAL_ICON_RECOVERY_QUEUE_KEY))[constants.LOCAL_ICON_RECOVERY_QUEUE_KEY];
  assert.equal(result.hydrated,0); assert.equal(result.blockedByPermission,1); assert.equal(result.pending,1);
  assert.ok(q.items[0].nextAttemptAt > Date.now()+60*60*1000,'native miss should be deferred, not immediately due');
  assert.ok(alarms.has(constants.ICON_RECOVERY_ALARM),'bounded permission-free native retry should be durably scheduled');
  console.log(JSON.stringify({ok:true,pending:result.pending,nextAttemptAt:q.items[0].nextAttemptAt,alarm:alarms.get(constants.ICON_RECOVERY_ALARM)}));
}
else if (scenario === 'permission-regrant') {
  websiteAccess = false;
  const s=stateWith({personal:[shortcut('grant-me','https://grant-me.test/') ]}); await seedLocalState(s);
  const icon=tinyPng(64,64,5);
  const globe=tinyPng(32,32,7);
  fetchHandler=async url => {
    if(browserName==='chrome' && url.includes('_favicon/')) return responseBytes(globe,'image/png',url);
    if(url==='https://grant-me.test/favicon.ico') return responseBytes(icon,'image/png',url);
    throw new Error(`unexpected fetch ${url}`);
  };
  const blocked=await send({type:'mosaicsync:hydrate-missing-icons',shortcutIds:['grant-me'],force:true});
  let raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(Boolean(findCompactShortcut(raw,'grant-me').localImageAssetId),false);
  websiteAccess=true;
  for(const listener of events.onPermissionAdded.listeners) listener({origins:['https://*/*','http://*/*']});
  const deadline=Date.now()+2500;
  let item=null;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,20));
    raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
    item=findCompactShortcut(raw,'grant-me');
    if(item?.localImageAssetId) break;
  }
  assert.ok(item?.localImageAssetId,'permission re-grant must re-seed and recover the missing favicon');
  assert.equal(item.imageSourceKind,'favicon');
  console.log(JSON.stringify({ok:true,blocked:blocked.blockedByPermission||0,recovered:true}));
}
else if (scenario === 'permission-revoke-drops-quality') {
  websiteAccess = true;
  const recovered=shortcut('quality','https://quality.test/');
  recovered.image=`data:image/png;base64,${Buffer.from(tinyPng(32,32,6)).toString('base64')}`;
  recovered.imageSyncKind='device';
  recovered.imageSourceKind='favicon';
  recovered.imageSourceUrl='https://quality.test/favicon.ico';
  const s=stateWith({personal:[recovered]}); await seedLocalState(s);
  await local.set({
    [constants.LOCAL_ICON_RECOVERY_QUEUE_KEY]: {
      version: constants.ICON_RECOVERY_QUEUE_VERSION,
      updatedAt: Date.now(),
      items: [{id:'quality',url:'https://quality.test/',attempts:0,nextAttemptAt:Date.now()+60_000,qualityUpgrade:true,lastReason:'',lastAttemptAt:0}]
    }
  });
  websiteAccess=false;
  for(const listener of events.onPermissionRemoved.listeners) listener({origins:['https://*/*','http://*/*']});
  const deadline=Date.now()+1000;
  let q=null;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,10));
    q=(await local.get(constants.LOCAL_ICON_RECOVERY_QUEUE_KEY))[constants.LOCAL_ICON_RECOVERY_QUEUE_KEY];
    if(!q || !(q.items||[]).some(item=>item.qualityUpgrade)) break;
  }
  assert.ok(!q || !(q.items||[]).some(item=>item.qualityUpgrade),'permission revoke must drop quality-only recovery work');
  console.log(JSON.stringify({ok:true,qualityPending:false}));
}

else if (scenario === 'sync-partial-ledger-no-repair') {
  websiteAccess=false;
  const localState=stateWith({personal:[shortcut('shared','https://local-partial.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready'});
  const remoteState=stateWith({personal:[shortcut('shared','https://remote-partial.test/',200)]});
  const remotePersonal=model.workspaceStateNormalized(remoteState,'personal');
  const records=model.flattenStateNormalized(remotePersonal,'remote-device');
  const settings=model.makeSettingsRecordNormalized(remotePersonal,'remote-device');
  const payload={version:constants.DEVICE_SNAPSHOT_SCHEMA_VERSION,records:[...records.values()],settings};
  const json=JSON.stringify(payload);
  const compressed=new Uint8Array(await new Response(new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const data=Buffer.from(compressed).toString('base64');
  const deviceId='remote-device';
  const deviceRootKey=`${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(deviceId)}`;
  const deviceRoot={
    schemaVersion:constants.DEVICE_SNAPSHOT_SCHEMA_VERSION,kind:'device-snapshot',deviceId,commitId:'device-new',publishedAt:200,updatedAt:200,
    liveRecordCount:records.size,settingsModifiedAt:Number(settings.modifiedAt)||0,encoding:'gzip-base64',compressedBytes:compressed.length,jsonChars:json.length,data
  };
  // The atomic device snapshot is complete, but the compatibility shared ledger
  // advertises two live records while only one has arrived. This is the exact
  // partial-delivery shape where 1.26.17 must avoid repairing/republishing the
  // ledger until Firefox/Chrome finishes delivering it.
  const [onlyId,onlyRecord]=[...records.entries()][0];
  await sync.set({
    [deviceRootKey]:deviceRoot,
    [constants.SYNC_SETTINGS_KEY]:settings,
    [`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent(onlyId)}`]:onlyRecord,
    [constants.SYNC_DATASET_KEY]:{schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:200,liveRecordCount:2,settingsModifiedAt:Number(settings.modifiedAt)||0,commitId:'partial',originDeviceId:'remote-device'}
  });
  let syncWrites=0; const originalSet=sync.set.bind(sync); sync.set=async items=>{syncWrites+=1; return originalSet(items);};
  const result=await send({type:'mosaicsync:reconcile-now'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://remote-partial.test/','usable device snapshot should still apply locally');
  assert.equal(result?.sharedLedgerPending,true,'reconcile should report the incomplete compatibility ledger');
  assert.equal(syncWrites,0,'partial compatibility ledger must not be repaired/republished immediately');
  console.log(JSON.stringify({ok:true,sharedLedgerPending:true,syncWrites}));
}


else if (scenario === 'sync-1278-fresh-waits-for-work') {
  websiteAccess=false;
  const localWaiting=stateWith({personal:[shortcut('local-new','https://local-new.test/',300)],work:[]});
  await seedLocalState(localWaiting,{
    syncEnabled:true,syncInitialized:false,syncBootstrapMode:'await-remote',syncStatus:'waiting',
    lastAppliedSyncRevision:'',lastAppliedWorkSyncRevision:'',lastAppliedProfileSnapshotRevision:''
  });

  const remoteState=stateWith({
    personal:[shortcut('home-a','https://home-a.test/',200),shortcut('home-b','https://home-b.test/',200)],
    work:[shortcut('work-a','https://work-a.test/',200),shortcut('work-b','https://work-b.test/',200)]
  });
  const personal=model.workspaceStateNormalized(remoteState,'personal');
  const work=model.workspaceStateNormalized(remoteState,'work');
  const personalRecords=model.flattenStateNormalized(personal,'home-device');
  const workRecords=model.flattenStateNormalized(work,'home-device');
  const personalSettings=model.makeSettingsRecordNormalized(personal,'home-device');
  const workSettings=model.makeSettingsRecordNormalized(work,'home-device');
  const seed={};
  for(const [id,record] of personalRecords) seed[`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent(id)}`]=record;
  seed[constants.SYNC_SETTINGS_KEY]=personalSettings;
  seed[constants.SYNC_DATASET_KEY]={
    schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:200,liveRecordCount:personalRecords.size,
    settingsModifiedAt:Number(personalSettings.modifiedAt)||0,commitId:'personal-complete',originDeviceId:'home-device'
  };
  const workPrefix=`${constants.SYNC_SPACE_PREFIX}work.`;
  const workEntries=[...workRecords.entries()];
  seed[`${workPrefix}settings`]=workSettings;
  seed[`${workPrefix}item.${encodeURIComponent(workEntries[0][0])}`]=workEntries[0][1];
  seed[`${workPrefix}dataset`]={
    schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:200,liveRecordCount:workRecords.size,
    settingsModifiedAt:Number(workSettings.modifiedAt)||0,commitId:'work-partial',originDeviceId:'home-device'
  };
  await sync.set(seed);

  let syncWrites=0; const originalSet=sync.set.bind(sync); sync.set=async items=>{syncWrites+=1; return originalSet(items);};
  const waiting=await send({type:'mosaicsync:wait-for-remote'});
  const waitingMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const waitingState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(waitingMeta.syncInitialized,false,'Personal alone plus partial Work must not initialize the fresh profile');
  assert.equal(waitingMeta.syncStatus,'waiting');
  assert.equal(findCompactShortcut(waitingState,'local-new')?.url,'https://local-new.test/','local edit made while waiting must remain local');
  assert.equal(findCompactShortcut(waitingState,'work-a'),null,'partial Work must not be activated');
  assert.equal(syncWrites,0,'fresh incomplete profile must not publish its temporary local state');
  assert.equal(waiting?.pending,true);

  // Firefox finishes delivering the remaining Work record. The existing dataset
  // marker now becomes valid without needing a user Restore/Send action.
  await originalSet({[`${workPrefix}item.${encodeURIComponent(workEntries[1][0])}`]:workEntries[1][1]});
  const restored=await send({type:'mosaicsync:wait-for-remote'});
  const finalMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const finalState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  for(const id of ['home-a','home-b','local-new','work-a','work-b']) assert.ok(findCompactShortcut(finalState,id),`missing merged shortcut ${id}`);
  assert.equal(finalMeta.syncInitialized,true);
  assert.equal(finalMeta.syncStatus,'ready');
  assert.ok(finalMeta.lastAppliedWorkSyncRevision,'Work revision must be recorded before ready');
  assert.ok(finalMeta.lastAppliedProfileSnapshotRevision,'completed bootstrap must publish/record a full profile safety generation');
  const ownRoot=(await sync.get(`${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent('device-b')}`))[`${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent('device-b')}`];
  assert.equal(ownRoot?.profileComplete,true,'fresh device should publish a full profile only after complete bootstrap');
  assert.ok(syncWrites>0,'after completeness is proven the merged local delta/profile may be published');
  console.log(JSON.stringify({ok:true,waiting:waitingMeta.syncStatus,final:finalMeta.syncStatus,syncWrites,restored:restored?.ok===true}));
}

else if (scenario === 'sync-12781-work-quota-protection') {
  websiteAccess=false;
  const initial=stateWith({
    personal:[shortcut('personal-a','https://personal-a.test/',100)],
    work:[shortcut('work-a','https://work-a.test/',100)]
  });
  await seedLocalState(initial,{syncEnabled:false,syncInitialized:false,syncBootstrapMode:'none',syncStatus:'off'});
  await send({type:'mosaicsync:set-sync-enabled',enabled:true});
  const boot=await send({type:'mosaicsync:bootstrap-local'});
  assert.equal(boot?.ok,true);
  let meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.equal(meta.syncProfileProtection,'protected','initial complete profile snapshot should establish protection');
  assert.equal(meta.syncFastSnapshotFallback,false);

  const normalSet=sync.set.bind(sync);
  sync.set=async items=>{
    const keys=Object.keys(items||{});
    if(keys.some(key=>key.startsWith(`${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent('device-b')}`))){
      const error=new Error('simulated storage.sync quota exhaustion while publishing profile protection');
      error.name='QuotaExceededError';
      throw error;
    }
    return normalSet(items);
  };

  const edited=stateWith({
    personal:[shortcut('personal-a','https://personal-a.test/',100)],
    work:[shortcut('work-a','https://work-a.test/',100),shortcut('work-new','https://work-new.test/',400)]
  });
  const oldRaw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  await local.set({[constants.LOCAL_STATE_KEY]:edited});
  for(const listener of events.onStorageChanged.listeners){
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:oldRaw,newValue:edited}},'local');
  }
  // Runtime messages use the same serialized queue, so this waits until the
  // local-change publication has finished before inspecting metadata.
  const status=await send({type:'mosaicsync:get-sync-status'});
  meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const workItemKey=`${constants.SYNC_SPACE_PREFIX}work.item.${encodeURIComponent('work-new')}`;
  assert.ok((await sync.get(workItemKey))[workItemKey],'ordinary Work ledger must still synchronize');
  assert.equal(meta.syncStatus,'ready','ordinary Sync remains healthy when only the additional recovery copy cannot fit');
  assert.equal(meta.syncProfileProtection,'limited');
  assert.equal(meta.syncProfileProtectionReason,'quota');
  assert.equal(meta.syncFastSnapshotFallback,true,'existing localized warning must remain visible for a Work-only mutation');
  assert.equal(status?.recoveryProtection,'limited');
  assert.equal(status?.recoveryProtectionReason,'quota');
  assert.equal(status?.meta?.syncFastSnapshotFallback,true);
  console.log(JSON.stringify({ok:true,status:meta.syncStatus,protection:meta.syncProfileProtection,reason:meta.syncProfileProtectionReason,warning:meta.syncFastSnapshotFallback}));
}

else if (scenario === 'sync-12781-profile-root-quota-rollback') {
  websiteAccess=false;
  const initial=stateWith({
    personal:[shortcut('personal-a','https://personal-a.test/',100)],
    work:[shortcut('work-a','https://work-a.test/',100)]
  });
  await seedLocalState(initial,{syncEnabled:false,syncInitialized:false,syncBootstrapMode:'none',syncStatus:'off'});
  await send({type:'mosaicsync:set-sync-enabled',enabled:true});
  const boot=await send({type:'mosaicsync:bootstrap-local'});
  assert.equal(boot?.ok,true);
  const rootKey=`${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent('device-b')}`;
  const beforeRoot=(await sync.get(rootKey))[rootKey];
  assert.equal(beforeRoot?.profileComplete,true);
  const beforeCommit=beforeRoot.commitId;
  const targetSlot=beforeRoot.slot==='a'?'b':'a';

  const normalSet=sync.set.bind(sync);
  let newChunkWrites=0;
  sync.set=async items=>{
    const entries=Object.entries(items||{});
    if(entries.some(([key,value])=>key===rootKey && value?.commitId!==beforeCommit)){
      const error=new Error('simulated quota failure on profile root flip');
      error.name='QuotaExceededError';
      throw error;
    }
    if(entries.some(([key])=>key.startsWith(`${rootKey}.chunk.${targetSlot}.`))) newChunkWrites += 1;
    return normalSet(items);
  };

  const edited=stateWith({
    personal:[shortcut('personal-a','https://personal-a.test/',100)],
    work:[shortcut('work-a','https://work-a.test/',100),shortcut('work-new','https://work-new.test/',500)]
  });
  const oldRaw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  await local.set({[constants.LOCAL_STATE_KEY]:edited});
  for(const listener of events.onStorageChanged.listeners){
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:oldRaw,newValue:edited}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});

  const afterRoot=(await sync.get(rootKey))[rootKey];
  assert.equal(afterRoot?.commitId,beforeCommit,'failed root flip must leave the previous complete generation authoritative');
  assert.ok(newChunkWrites>0,'test must fail after at least one target-slot chunk write');
  const all=await sync.get(null);
  assert.equal(Object.keys(all).some(key=>key.startsWith(`${rootKey}.chunk.${targetSlot}.`)),false,'failed target generation chunks must be cleaned up');
  const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.equal(meta.syncProfileProtection,'limited');
  assert.equal(meta.syncProfileProtectionReason,'quota');
  assert.equal(meta.syncFastSnapshotFallback,true);
  const workItemKey=`${constants.SYNC_SPACE_PREFIX}work.item.${encodeURIComponent('work-new')}`;
  assert.ok(all[workItemKey],'ordinary Work ledger must retain the edit despite safety-root failure');
  console.log(JSON.stringify({ok:true,beforeCommit,afterCommit:afterRoot.commitId,newChunkWrites,protection:meta.syncProfileProtection}));
}

else if (scenario === 'sync-1307-foreground-single-flight') {
  const localState = stateWith({ personal:[shortcut('local','https://local.test/')] });
  await seedLocalState(localState, {
    syncEnabled:true, syncInitialized:true, syncStatus:'ready',
    lastAppliedSyncRevision:'', lastAppliedWorkSyncRevision:'',
    lastAppliedDeviceSnapshotRevision:'', lastAppliedProfileSnapshotRevision:''
  });
  const before = sync.stats.getAllCalls;
  const results = await Promise.all(Array.from({ length: 20 }, () => send({ type:'mosaicsync:reconcile-if-needed', reason:'foreground' })));
  const reads = sync.stats.getAllCalls - before;
  assert.equal(reads, 1, 'simultaneous foreground requests must share one background freshness read');
  assert.ok(results.every(result => result?.ok !== false));
  console.log(JSON.stringify({ok:true, requests:results.length, syncGetAllCalls:reads}));
}
else if (scenario === 'sync-1306-foreground-recovery') {
  websiteAccess=false;
  const localState=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:old'});
  const remoteState=stateWith({personal:[shortcut('shared','https://remote.test/',500),shortcut('remote-new','https://remote-new.test/',500)]});
  await sync.set(remotePersonalEntries(remoteState,'remote-1306-foreground'));
  assert.equal(alarms.has(constants.SYNC_WATCH_ALARM),false,'fixture starts with no Sync watchdog alarm');
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://remote.test/');
  assert.ok(findCompactShortcut(raw,'remote-new'),'foreground recovery must apply remote data even without storage.onChanged');
  const alarm=alarms.get(constants.SYNC_WATCH_ALARM);
  assert.equal(Number(alarm?.periodInMinutes),constants.SYNC_WATCH_PERIOD_MINUTES,'foreground recovery must self-heal the existing watchdog');
  const diag=(await local.get(constants.LOCAL_SYNC_DIAGNOSTICS_KEY))[constants.LOCAL_SYNC_DIAGNOSTICS_KEY];
  assert.equal(diag?.lastCheckReason,'foreground');
  assert.ok(Number(diag?.lastForegroundSyncCheckAt)>0);
  assert.equal(diag?.lastObservedSharedRevision,'commit:remote-1306-foreground');
  assert.equal((await sync.get(constants.LOCAL_SYNC_DIAGNOSTICS_KEY))[constants.LOCAL_SYNC_DIAGNOSTICS_KEY],undefined,'diagnostics must remain device-local');
  console.log(JSON.stringify({ok:true,recovered:true,alarmPeriod:alarm.periodInMinutes,reason:diag.lastCheckReason,outcome:diag.lastCheckOutcome,resultOk:result?.ok===true}));
}

else if (scenario === 'sync-1306-alarm-recovery') {
  websiteAccess=false;
  const localState=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:old'});
  const remoteState=stateWith({personal:[shortcut('shared','https://alarm-remote.test/',500),shortcut('alarm-new','https://alarm-new.test/',500)]});
  await sync.set(remotePersonalEntries(remoteState,'remote-1306-alarm'));
  for(const listener of events.onAlarm.listeners) listener({name:constants.SYNC_WATCH_ALARM});
  await send({type:'mosaicsync:get-sync-status'}); // waits behind the alarm's serialized task
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://alarm-remote.test/');
  assert.ok(findCompactShortcut(raw,'alarm-new'),'watchdog must recover remote data without a storage event');
  const diag=(await local.get(constants.LOCAL_SYNC_DIAGNOSTICS_KEY))[constants.LOCAL_SYNC_DIAGNOSTICS_KEY];
  assert.equal(diag?.lastCheckReason,'alarm');
  assert.ok(Number(diag?.lastSyncWatchCheckAt)>0);
  assert.equal(diag?.lastObservedSharedRevision,'commit:remote-1306-alarm');
  console.log(JSON.stringify({ok:true,recovered:true,reason:diag.lastCheckReason,outcome:diag.lastCheckOutcome}));
}

else if (scenario === 'sync-1306-local-edit-foreground-race') {
  websiteAccess=false;
  const originalLocal=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:old'});
  const remoteState=stateWith({personal:[shortcut('shared','https://remote-race.test/',500),shortcut('remote-new','https://remote-new.test/',500)]});
  await sync.set(remotePersonalEntries(remoteState,'remote-1306-local-race'));

  const editedLocal=stateWith({personal:[shortcut('shared','https://local.test/',100),shortcut('local-new','https://local-new.test/',600)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  const foreground=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.ok(findCompactShortcut(raw,'local-new'),'local edit racing foreground recovery must survive');
  assert.ok(findCompactShortcut(raw,'remote-new'),'remote edit must still arrive');
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://remote-race.test/','newer remote winner should still converge deterministically');
  console.log(JSON.stringify({ok:true,localSurvived:true,remoteArrived:true,resultOk:foreground?.ok===true}));
}

else if (scenario === 'sync-1306-work-publication-rebase') {
  websiteAccess=false;
  const originalLocal=stateWith({work:[shortcut('work-shared','https://work-local.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:personal-old',lastAppliedWorkSyncRevision:'commit:work-old'});
  const remoteState=stateWith({work:[shortcut('work-shared','https://work-remote.test/',500),shortcut('work-remote-new','https://work-remote-new.test/',500)]});
  await sync.set(remoteWorkEntries(remoteState,'remote-1306-work'));

  const editedLocal=stateWith({work:[shortcut('work-shared','https://work-local.test/',100),shortcut('work-local-new','https://work-local-new.test/',600)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const prefix=`${constants.SYNC_SPACE_PREFIX}work.`;
  const remoteShared=(await sync.get(`${prefix}item.${encodeURIComponent('work-shared')}`))[`${prefix}item.${encodeURIComponent('work-shared')}`];
  const localNew=(await sync.get(`${prefix}item.${encodeURIComponent('work-local-new')}`))[`${prefix}item.${encodeURIComponent('work-local-new')}`];
  const dataset=(await sync.get(`${prefix}dataset`))[`${prefix}dataset`];
  assert.equal(remoteShared?.url,'https://work-remote.test/','normal Work publication must not overwrite a newer delivered remote record');
  assert.ok(localNew,'the unrelated local Work addition must still publish');
  assert.equal(Number(dataset?.liveRecordCount),3,'Work commit marker must describe the post-write ledger including delivered remote records');
  console.log(JSON.stringify({ok:true,remotePreserved:true,localPublished:true,liveRecordCount:dataset.liveRecordCount}));
}

else if (scenario === 'sync-1306-multi-trigger-idempotent') {
  websiteAccess=false;
  const localState=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:old'});
  const remoteState=stateWith({personal:[shortcut('shared','https://race-remote.test/',500),shortcut('race-new','https://race-new.test/',500)]});
  const entries=remotePersonalEntries(remoteState,'remote-1306-race');
  await sync.set(entries);
  for(const listener of events.onAlarm.listeners) listener({name:constants.SYNC_WATCH_ALARM});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.SYNC_DATASET_KEY]:{oldValue:undefined,newValue:entries[constants.SYNC_DATASET_KEY]}},'sync');
  }
  const foreground=send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  await foreground;
  await send({type:'mosaicsync:get-sync-status'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://race-remote.test/');
  const ids=[];
  for(const item of raw?.spaces?.personal?.shortcuts||[]) {
    if(item?.type==='shortcut') ids.push(item.id);
    else if(item?.type==='folder') for(const child of item.items||[]) ids.push(child?.id);
  }
  assert.equal(ids.filter(id=>id==='race-new').length,1,'overlapping recovery triggers must not duplicate shortcuts');
  const diag=(await local.get(constants.LOCAL_SYNC_DIAGNOSTICS_KEY))[constants.LOCAL_SYNC_DIAGNOSTICS_KEY];
  assert.ok(Number(diag?.lastSyncStorageChangeEventAt)>0,'storage event must be recorded');
  assert.ok(Number(diag?.lastForegroundSyncCheckAt)>0,'foreground check must be recorded');
  assert.ok(Number(diag?.lastSyncWatchCheckAt)>0,'alarm check must be recorded');
  assert.equal((await sync.get(constants.LOCAL_SYNC_DIAGNOSTICS_KEY))[constants.LOCAL_SYNC_DIAGNOSTICS_KEY],undefined);
  console.log(JSON.stringify({ok:true,idempotent:true,count:ids.filter(id=>id==='race-new').length,lastReason:diag.lastCheckReason}));
}

else if (scenario === 'sync-1308-personal-mid-publication-evidence') {
  websiteAccess=false;
  const originalLocal=stateWith({personal:[shortcut('shared','https://local-old.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:initial'});
  const initialRemote=stateWith({personal:[shortcut('shared','https://remote-old.test/',100)]});
  await sync.set(remotePersonalEntries(initialRemote,'initial-1308'));

  const targetKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('shared')}`;
  const newerRemoteState=stateWith({personal:[shortcut('shared','https://remote-newer.test/',500)]});
  const newerRemoteRecord=remotePersonalEntries(newerRemoteState,'foreign-1308')[targetKey];
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && Number(targetValue.modifiedAt) < 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(newerRemoteRecord));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(newerRemoteRecord)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const editedLocal=stateWith({personal:[shortcut('shared','https://local-mid.test/',200),shortcut('local-new','https://local-new.test/',300)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalShared=(await sync.get(targetKey))[targetKey];
  const localNewKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('local-new')}`;
  const finalLocalNew=(await sync.get(localNewKey))[localNewKey];
  const dataset=(await sync.get(constants.SYNC_DATASET_KEY))[constants.SYNC_DATASET_KEY];
  assert.equal(injected,true,'fixture must inject a newer same-key remote record between read and write');
  assert.equal(finalShared?.url,'https://remote-newer.test/','newer delivered same-key evidence must survive the racing local publication');
  assert.ok(finalLocalNew,'unrelated local record must still publish');
  assert.equal(Number(dataset?.liveRecordCount),2,'commit marker must describe the repaired post-write ledger');
  console.log(JSON.stringify({ok:true,injected,remoteWinner:finalShared?.url,localPublished:Boolean(finalLocalNew),liveRecordCount:dataset?.liveRecordCount}));
}

else if (scenario === 'sync-1308-work-mid-publication-evidence') {
  websiteAccess=false;
  const originalLocal=stateWith({work:[shortcut('work-shared','https://work-local-old.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:personal',lastAppliedWorkSyncRevision:'commit:work-initial'});
  const initialRemote=stateWith({work:[shortcut('work-shared','https://work-remote-old.test/',100)]});
  await sync.set(remoteWorkEntries(initialRemote,'work-initial-1308'));

  const prefix=`${constants.SYNC_SPACE_PREFIX}work.`;
  const targetKey=`${prefix}item.${encodeURIComponent('work-shared')}`;
  const newerRemoteState=stateWith({work:[shortcut('work-shared','https://work-remote-newer.test/',500)]});
  const newerRemoteRecord=remoteWorkEntries(newerRemoteState,'work-foreign-1308')[targetKey];
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && Number(targetValue.modifiedAt) < 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(newerRemoteRecord));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(newerRemoteRecord)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const editedLocal=stateWith({work:[shortcut('work-shared','https://work-local-mid.test/',200),shortcut('work-local-new','https://work-local-new.test/',300)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalShared=(await sync.get(targetKey))[targetKey];
  const localNewKey=`${prefix}item.${encodeURIComponent('work-local-new')}`;
  const finalLocalNew=(await sync.get(localNewKey))[localNewKey];
  const dataset=(await sync.get(`${prefix}dataset`))[`${prefix}dataset`];
  assert.equal(injected,true,'fixture must inject a newer Work same-key remote record between read and write');
  assert.equal(finalShared?.url,'https://work-remote-newer.test/','newer delivered Work evidence must survive the racing local publication');
  assert.ok(finalLocalNew,'unrelated local Work record must still publish');
  assert.equal(Number(dataset?.liveRecordCount),2,'Work commit marker must describe the repaired post-write ledger');
  console.log(JSON.stringify({ok:true,injected,remoteWinner:finalShared?.url,localPublished:Boolean(finalLocalNew),liveRecordCount:dataset?.liveRecordCount}));
}

else if (scenario === 'sync-1308-single-flight-failure-recovery') {
  const localState=stateWith({personal:[shortcut('local','https://local.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready'});
  const originalGet=sync.get.bind(sync);
  let failOnce=true;
  sync.get=async keys => {
    if ((keys === null || keys === undefined) && failOnce) {
      failOnce=false;
      throw new Error('forced sync read failure');
    }
    return originalGet(keys);
  };
  const first=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const beforeSecond=sync.stats.getAllCalls;
  const second=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  assert.equal(first?.ok,false,'first forced freshness check should fail through the serialized queue result');
  assert.notEqual(second?.ok,false,'a failed shared request must clear single-flight state so the next request can execute');
  assert.ok(sync.stats.getAllCalls > beforeSecond,'second request must perform a fresh storage.sync read');
  console.log(JSON.stringify({ok:true,firstFailed:first?.ok===false,secondRecovered:second?.ok!==false}));
}

else if (scenario === 'sync-1308-post-single-flight-freshness') {
  const localState=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(localState,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready'});
  const firstBatch=await Promise.all(Array.from({length:20},()=>send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'})));
  assert.ok(firstBatch.every(result=>result?.ok!==false));
  const readsAfterBatch=sync.stats.getAllCalls;
  const remoteState=stateWith({personal:[shortcut('shared','https://fresh-after-flight.test/',500)]});
  await sync.set(remotePersonalEntries(remoteState,'after-flight-1308'));
  const second=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.ok(sync.stats.getAllCalls > readsAfterBatch,'request after settled single-flight must perform a new freshness read');
  assert.equal(findCompactShortcut(raw,'shared')?.url,'https://fresh-after-flight.test/','newly delivered data after the shared request must be discoverable immediately');
  console.log(JSON.stringify({ok:true,firstRequests:firstBatch.length,newRead:true,recovered:second?.ok!==false}));
}

else if (scenario === 'sync-1309-personal-local-newer-than-evidence') {
  websiteAccess=false;
  const originalLocal=stateWith({personal:[shortcut('shared','https://local-old.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:initial'});
  const initialRemote=stateWith({personal:[shortcut('shared','https://remote-old.test/',100)]});
  await sync.set(remotePersonalEntries(initialRemote,'initial-1309-local-newer'));

  const targetKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('shared')}`;
  const deliveredRemoteState=stateWith({personal:[shortcut('shared','https://remote-mid.test/',500)]});
  const deliveredRemoteRecord=remotePersonalEntries(deliveredRemoteState,'foreign-1309-local-newer')[targetKey];
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && Number(targetValue.modifiedAt) > 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(deliveredRemoteRecord));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(deliveredRemoteRecord)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const editedLocal=stateWith({personal:[shortcut('shared','https://local-newer.test/',600),shortcut('local-new','https://local-new.test/',700)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalShared=(await sync.get(targetKey))[targetKey];
  const dataset=(await sync.get(constants.SYNC_DATASET_KEY))[constants.SYNC_DATASET_KEY];
  assert.equal(injected,true,'fixture must inject an older-than-local same-key remote value during publication');
  assert.equal(finalShared?.url,'https://local-newer.test/','delivered evidence must never reintroduce an older remote record over a newer local winner');
  assert.equal(Number(dataset?.liveRecordCount),2);
  console.log(JSON.stringify({ok:true,injected,localWinner:finalShared?.url,liveRecordCount:dataset?.liveRecordCount}));
}

else if (scenario === 'sync-1309-personal-newer-remote-tombstone-evidence') {
  websiteAccess=false;
  const originalLocal=stateWith({personal:[shortcut('shared','https://local-old.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:initial'});
  const initialRemote=stateWith({personal:[shortcut('shared','https://remote-old.test/',100)]});
  await sync.set(remotePersonalEntries(initialRemote,'initial-1309-tombstone'));

  const targetKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('shared')}`;
  const deliveredTombstone=model.makeTombstone('shared','remote-device',500);
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && targetValue.kind !== 'deleted' && Number(targetValue.modifiedAt) < 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(deliveredTombstone));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(deliveredTombstone)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const editedLocal=stateWith({personal:[shortcut('shared','https://local-mid.test/',200),shortcut('local-new','https://local-new.test/',300)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalShared=(await sync.get(targetKey))[targetKey];
  const localNewKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('local-new')}`;
  const finalLocalNew=(await sync.get(localNewKey))[localNewKey];
  const dataset=(await sync.get(constants.SYNC_DATASET_KEY))[constants.SYNC_DATASET_KEY];
  assert.equal(injected,true,'fixture must inject a newer remote tombstone during publication');
  assert.equal(finalShared?.kind,'deleted','a newer delivered tombstone must survive a racing older local live record');
  assert.ok(finalLocalNew,'unrelated local record must still publish while the tombstone wins');
  assert.equal(Number(dataset?.liveRecordCount),1,'tombstones are not live records in the repaired commit marker');
  console.log(JSON.stringify({ok:true,injected,tombstoneWinner:finalShared?.kind,localPublished:Boolean(finalLocalNew),liveRecordCount:dataset?.liveRecordCount}));
}

else if (scenario === 'sync-1309-personal-local-live-newer-than-tombstone-evidence') {
  websiteAccess=false;
  const originalLocal=stateWith({personal:[shortcut('shared','https://local-old.test/',100)]});
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:initial'});
  const initialRemote=stateWith({personal:[shortcut('shared','https://remote-old.test/',100)]});
  await sync.set(remotePersonalEntries(initialRemote,'initial-1309-local-live'));

  const targetKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('shared')}`;
  const deliveredTombstone=model.makeTombstone('shared','remote-device',500);
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && targetValue.kind !== 'deleted' && Number(targetValue.modifiedAt) > 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(deliveredTombstone));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(deliveredTombstone)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const editedLocal=stateWith({personal:[shortcut('shared','https://local-live-newer.test/',600),shortcut('local-new','https://local-new.test/',700)]});
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalShared=(await sync.get(targetKey))[targetKey];
  const dataset=(await sync.get(constants.SYNC_DATASET_KEY))[constants.SYNC_DATASET_KEY];
  assert.equal(injected,true,'fixture must inject an older remote tombstone during publication');
  assert.equal(finalShared?.kind,'deleted','an older tombstone still dominates a later ordinary edit unless an explicit newer cross-Space move revives the record');
  assert.equal(Number(dataset?.liveRecordCount),1);
  console.log(JSON.stringify({ok:true,injected,tombstoneWinner:finalShared?.kind,liveRecordCount:dataset?.liveRecordCount}));
}

else if (scenario === 'sync-1309-personal-settings-mid-publication-evidence') {
  websiteAccess=false;
  const base=stateWith({personal:[]});
  const originalWorkspace=model.workspaceStateNormalized(base,'personal');
  const originalLocal=model.replaceWorkspaceNormalized(base,'personal',{
    ...originalWorkspace,
    settings:{...originalWorkspace.settings,columns:8},
    settingsModifiedAt:100,
    updatedAt:100
  });
  await seedLocalState(originalLocal,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:initial'});
  await sync.set(remotePersonalEntries(originalLocal,'initial-1309-settings'));

  const targetKey=constants.SYNC_SETTINGS_KEY;
  const remoteWorkspace=model.workspaceStateNormalized(originalLocal,'personal');
  const newerRemoteState=model.replaceWorkspaceNormalized(originalLocal,'personal',{
    ...remoteWorkspace,
    settings:{...remoteWorkspace.settings,columns:12},
    settingsModifiedAt:500,
    updatedAt:500
  });
  const newerRemoteSettings=remotePersonalEntries(newerRemoteState,'foreign-1309-settings')[targetKey];
  const originalSet=sync.set.bind(sync);
  let injected=false;
  sync.set=async items => {
    const targetValue=items?.[targetKey];
    if (targetValue && !injected && Number(targetValue.modifiedAt) < 500) {
      injected=true;
      const previous=clone(sync.data.get(targetKey));
      sync.data.set(targetKey,clone(newerRemoteSettings));
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:previous,newValue:clone(newerRemoteSettings)}},'sync');
      }
    }
    const oldTarget=targetValue ? clone(sync.data.get(targetKey)) : undefined;
    await originalSet(items);
    if (targetValue) {
      for(const listener of events.onStorageChanged.listeners) {
        listener({[targetKey]:{oldValue:oldTarget,newValue:clone(targetValue)}},'sync');
      }
    }
  };

  const localWorkspace=model.workspaceStateNormalized(originalLocal,'personal');
  const editedLocal=model.replaceWorkspaceNormalized(originalLocal,'personal',{
    ...localWorkspace,
    settings:{...localWorkspace.settings,columns:10},
    settingsModifiedAt:200,
    updatedAt:200
  });
  await local.set({[constants.LOCAL_STATE_KEY]:editedLocal});
  for(const listener of events.onStorageChanged.listeners) {
    listener({[constants.LOCAL_STATE_KEY]:{oldValue:originalLocal,newValue:editedLocal}},'local');
  }
  await send({type:'mosaicsync:get-sync-status'});
  const finalSettings=(await sync.get(targetKey))[targetKey];
  const dataset=(await sync.get(constants.SYNC_DATASET_KEY))[constants.SYNC_DATASET_KEY];
  assert.equal(injected,true,'fixture must inject newer same-key settings during publication');
  assert.equal(Number(finalSettings?.settings?.columns),12,'newer delivered Settings evidence must survive the racing older local Settings write');
  assert.equal(Number(finalSettings?.modifiedAt),500);
  assert.equal(Number(dataset?.settingsModifiedAt),500,'commit marker must reflect the repaired Settings winner');
  console.log(JSON.stringify({ok:true,injected,columns:finalSettings?.settings?.columns,settingsModifiedAt:dataset?.settingsModifiedAt}));
}

else if (scenario === 'sync-same-marker-divergence') {
  websiteAccess=false;
  const localState=stateWith({personal:[shortcut('shared','https://local.test/',100)]});
  await seedLocalState(localState, {syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',lastAppliedSyncRevision:'commit:same'});
  const remoteState=stateWith({personal:[shortcut('shared','https://remote.test/',200)]});
  const remotePersonal=model.workspaceStateNormalized(remoteState,'personal');
  const records=model.flattenStateNormalized(remotePersonal,'remote-device');
  const settings=model.makeSettingsRecordNormalized(remotePersonal,'remote-device');
  const entries={}; for(const [id,record] of records) entries[`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent(id)}`]=record;
  entries[constants.SYNC_SETTINGS_KEY]=settings;
  entries[constants.SYNC_DATASET_KEY]={schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:200,liveRecordCount:1,settingsModifiedAt:Number(settings.modifiedAt)||0,commitId:'same',originDeviceId:'remote-device'};
  await sync.set(entries);
  const beforeSets=[]; const originalSet=sync.set.bind(sync); sync.set=async items=>{beforeSets.push(clone(items)); return originalSet(items);};
  const result=await send({type:'mosaicsync:reconcile-if-needed'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const merged=findCompactShortcut(raw,'shared');
  assert.equal(merged?.url,'https://remote.test/','semantic divergence under the same marker must apply the newer remote winner');
  assert.notEqual(result?.reason,'already-applied');
  console.log(JSON.stringify({ok:true,result,syncWrites:beforeSets.length}));
}
else {
  throw new Error(`unknown scenario ${scenario}`);
}
