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
  return {
    data,
    async get(keys = null) {
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
    async set(items) { for (const [k,v] of Object.entries(items || {})) data.set(k, clone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys)?keys:[keys])) data.delete(k); },
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
