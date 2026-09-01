import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [browserName, scenario] = process.argv.slice(2);
if (!['firefox','chrome'].includes(browserName) || !scenario) throw new Error('usage: browser scenario');
const root = resolve(import.meta.dirname, '../..');

let fakeNow = 1_787_920_000_000;
if (/^sync-loss-1301[34]-/.test(scenario)) Date.now = () => fakeNow;

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
if (/^sync-loss-1301[34]-/.test(scenario)) {
  sync.getBytesInUse = async function(keys = null) {
    const obj = await this.get(keys);
    return Object.entries(obj).reduce((sum,[key,value]) => sum + Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value)), 0);
  };
}
const alarms = new Map();
let websiteAccess = false;
let topSitesPermission = false;
const createdTabs = [];
let fetchHandler = async () => { throw new Error('unexpected fetch'); };
const fetchLog = [];

let decompressionStreamCount = 0;
const nativeDecompressionStream = globalThis.DecompressionStream;
if (scenario.startsWith("sync-13010-") && typeof nativeDecompressionStream === "function") {
  // Count the production decoder's expensive gzip phase without changing its
  // behavior. CompressionStream used by the test fixture is intentionally left
  // untouched.
  globalThis.DecompressionStream = function MosaicSyncCountedDecompressionStream(format) {
    decompressionStreamCount += 1;
    return new nativeDecompressionStream(format);
  };
}

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
      if (Array.isArray(request?.permissions) && request.permissions.includes("topSites")) return topSitesPermission;
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async request(request) {
      if (Array.isArray(request?.permissions) && request.permissions.includes("topSites")) return topSitesPermission;
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async remove() { websiteAccess = false; return true; }
  },
  tabs: {
    onUpdated: events.onTabUpdated,
    onRemoved: events.onTabRemoved,
    async create(options = {}) { createdTabs.push(clone(options)); return { id: createdTabs.length }; },
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
const storageCore = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/storage.js`)).href}?h=${Date.now()}`);

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

function fnv1aForFixture(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function liveRecordCountForFixture(records) {
  let count = 0;
  for (const record of records?.values?.() || []) {
    if (record?.kind === "shortcut" || record?.kind === "folder") count += 1;
  }
  return count;
}

function recordFingerprintForFixture(records) {
  const live = [];
  for (const record of records?.values?.() || []) {
    if (record?.kind !== "shortcut" && record?.kind !== "folder") continue;
    const { deviceId: _deviceId, ...semantic } = record;
    live.push(semantic);
  }
  live.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return fnv1aForFixture(model.stableStringify(live));
}

async function gzipBase64ForFixture(value) {
  const json = JSON.stringify(value);
  const input = new TextEncoder().encode(json);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return {
    data: Buffer.from(compressed).toString("base64"),
    compressedBytes: compressed.byteLength,
    jsonChars: json.length
  };
}

async function completeProfileSnapshotFixture(baseState, {
  deviceId = "remote-cache-device",
  commitId = "cache-generation",
  slot = "a",
  publishedAt = 500,
  chunkChars = 1400,
  previousProfile = null,
  transformSettings = null,
  transformWorkSettings = null
} = {}) {
  const personal = model.workspaceStateNormalized(baseState, "personal");
  const work = model.workspaceStateNormalized(baseState, "work");
  const personalRecords = model.flattenStateNormalized(personal, deviceId);
  const workRecords = model.flattenStateNormalized(work, deviceId);
  let personalSettings = model.makeSettingsRecordNormalized(personal, deviceId);
  let workSettings = model.makeSettingsRecordNormalized(work, deviceId);
  if (typeof transformSettings === "function") personalSettings = transformSettings(clone(personalSettings));
  if (typeof transformWorkSettings === "function") workSettings = transformWorkSettings(clone(workSettings));
  const payload = {
    version: constants.DEVICE_SNAPSHOT_SCHEMA_VERSION,
    records: [...personalRecords.values()],
    settings: personalSettings,
    workRecords: [...workRecords.values()],
    workSettings
  };
  const encoded = await gzipBase64ForFixture(payload);
  const parts = [];
  for (let offset = 0; offset < encoded.data.length; offset += chunkChars) parts.push(encoded.data.slice(offset, offset + chunkChars));
  const rootKey = `${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(deviceId)}`;
  const updatedAt = Math.max(Number(personal.updatedAt) || 0, Number(work.updatedAt) || 0);
  const root = {
    schemaVersion: constants.DEVICE_SNAPSHOT_SCHEMA_VERSION,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: constants.DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
    deviceId, commitId, publishedAt, updatedAt,
    liveRecordCount: liveRecordCountForFixture(personalRecords),
    recordFingerprint: recordFingerprintForFixture(personalRecords),
    settingsModifiedAt: Number(personalSettings.modifiedAt) || 0,
    encoding: "gzip-base64",
    compressedBytes: encoded.compressedBytes,
    jsonChars: encoded.jsonChars,
    profileSnapshotVersion: constants.PROFILE_SNAPSHOT_SCHEMA_VERSION,
    profileComplete: true,
    workLiveRecordCount: liveRecordCountForFixture(workRecords),
    workRecordFingerprint: recordFingerprintForFixture(workRecords),
    workSettingsModifiedAt: Number(workSettings.modifiedAt) || 0,
    slot, parts: parts.length, dataChars: encoded.data.length,
    dataFingerprint: fnv1aForFixture(encoded.data),
    ...(previousProfile ? { previousProfile: clone(previousProfile) } : {})
  };
  const entries = { [rootKey]: root };
  parts.forEach((data, index) => {
    entries[`${rootKey}.chunk.${slot}.${index}`] = {
      schemaVersion: constants.DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      kind: "device-snapshot-chunk",
      deviceId, commitId, slot, index, total: parts.length, data
    };
  });
  return { rootKey, root, entries, parts, personalRecords, workRecords, personalSettings, workSettings };
}

function previousDescriptorForFixture(root) {
  const fields = [
    "commitId", "publishedAt", "updatedAt", "liveRecordCount", "recordFingerprint", "settingsModifiedAt",
    "encoding", "compressedBytes", "jsonChars", "slot", "parts", "dataChars", "dataFingerprint",
    "workLiveRecordCount", "workRecordFingerprint", "workSettingsModifiedAt"
  ];
  const out = {};
  for (const field of fields) out[field] = root[field];
  return out;
}

function deviceSnapshotRootEntries(all, deviceId) {
  const prefix = `${constants.SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(deviceId)}`;
  return Object.entries(all || {})
    .filter(([key, value]) => key.startsWith(prefix) && !key.includes('.chunk.') &&
      value?.deviceId === deviceId && ['device-snapshot', 'device-snapshot-manifest'].includes(value?.kind))
    .sort(([, a], [, b]) =>
      (Number(b?.publishedAt) || 0) - (Number(a?.publishedAt) || 0) ||
      String(b?.commitId || '').localeCompare(String(a?.commitId || ''))
    );
}

async function latestDeviceSnapshotRoot(syncArea, deviceId) {
  const entries = deviceSnapshotRootEntries(await syncArea.get(null), deviceId);
  return entries.length ? { key: entries[0][0], root: entries[0][1] } : { key: '', root: null };
}

if (scenario === 'step3-listener-topology') {
  console.log(JSON.stringify({
    ok: true,
    onInstalled: events.onInstalled.listeners.length,
    onStartup: events.onStartup.listeners.length,
    onMessage: events.onMessage.listeners.length,
    onStorageChanged: events.onStorageChanged.listeners.length,
    onAlarm: events.onAlarm.listeners.length,
    onPermissionAdded: events.onPermissionAdded.listeners.length,
    onPermissionRemoved: events.onPermissionRemoved.listeners.length,
    onTabUpdated: events.onTabUpdated.listeners.length,
    onTabRemoved: events.onTabRemoved.listeners.length,
    onActionClicked: events.onActionClicked.listeners.length
  }));
}
else if (scenario === 'step3-data-collection-revoke') {
  const state = stateWith();
  await seedLocalState(state, {
    syncEnabled: true,
    syncInitialized: true,
    syncBootstrapMode: 'local',
    syncStatus: 'ready',
    lastRemoteReceiptAt: 123,
    lastRemoteReceiptRevision: 'remote',
    lastRemoteReceiptUpdatedAt: 122,
    lastRemoteReceiptOriginDeviceId: 'other-device'
  });
  for (const listener of events.onPermissionRemoved.listeners) listener({ data_collection: ['required'] });
  const deadline = Date.now() + 1000;
  let next = (await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  while (Date.now() < deadline && browserName === 'firefox' && next?.syncEnabled !== false) {
    await new Promise(resolve => setTimeout(resolve, 5));
    next = (await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  }
  if (browserName === 'firefox') {
    assert.equal(next.syncEnabled, false, 'Firefox data_collection revocation must disable Sync');
    assert.equal(next.syncInitialized, false);
    assert.equal(next.syncStatus, 'off');
    assert.equal(next.lastRemoteReceiptAt, 0);
    assert.equal(next.lastRemoteReceiptOriginDeviceId, '');
  } else {
    assert.equal(next.syncEnabled, true, 'Chrome must ignore Firefox-only data_collection permission events');
    assert.equal(next.syncInitialized, true);
    assert.equal(next.syncStatus, 'ready');
  }
  console.log(JSON.stringify({ ok: true, syncEnabled: next.syncEnabled, syncInitialized: next.syncInitialized, syncStatus: next.syncStatus }));
}
else if (scenario === 'favicon-preference-rehydrate-13014') {
  websiteAccess = true;
  const preferredBytes = tinyPng(64,64,4);
  const fallbackBytes = tinyPng(32,32,1);
  const preferredDataUrl = `data:image/png;base64,${Buffer.from(preferredBytes).toString('base64')}`;
  const preference = model.faviconPreferenceForCandidate({
    image: preferredDataUrl,
    sourceUrl: 'https://pref.test/chosen.png',
    source: 'link'
  });
  const chosen = shortcut('preferred','https://pref.test/');
  chosen.imageSyncKind = 'device';
  chosen.imageSourceKind = 'upload';
  chosen.imageIsFallback = true;
  chosen.faviconPreference = preference;
  const s = stateWith({ personal: [chosen], autoPersonal: false });
  await seedLocalState(s);
  const html = new TextEncoder().encode('<html><head><link rel="icon" type="image/png" sizes="64x64" href="/chosen.png"></head><body></body></html>');
  fetchHandler = async url => {
    if (url === 'https://pref.test/') return responseBytes(html,'text/html',url);
    if (url === 'https://pref.test/favicon.ico') return responseBytes(fallbackBytes,'image/png',url);
    if (url === 'https://pref.test/chosen.png') return responseBytes(preferredBytes,'image/png',url);
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await send({ type:'mosaicsync:hydrate-missing-icons', shortcutIds:['preferred'], force:true });
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const item=findCompactShortcut(raw,'preferred');
  assert.equal(result.hydrated,1,'explicit favicon preference must hydrate even with automatic site icons disabled');
  assert.equal(item.faviconPreference,preference,'compact user preference must remain durable after local hydration');
  assert.equal(item.imageSourceKind,'upload','preferred detected favicon remains explicit user artwork semantics');
  assert.equal(item.imageSyncKind,'device','actual favicon pixels must remain device-local');
  assert.equal(item.imageIsFallback,false,'exact preferred candidate must resolve the pending preference');
  assert.ok(item.localImageAssetId,'preferred candidate must be materialized as a local asset');
  const asset=(await local.get(`${constants.LOCAL_ASSET_PREFIX}${item.localImageAssetId}`))[`${constants.LOCAL_ASSET_PREFIX}${item.localImageAssetId}`];
  assert.equal(asset,preferredDataUrl,'receiver must reconstruct the exact selected candidate rather than automatic fallback');
  console.log(JSON.stringify({ok:true,hydrated:1,preference,exact:true}));
}
else if (scenario === 'favicon-network') {
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
  const ownRoot=(await latestDeviceSnapshotRoot(sync,'device-b')).root;
  assert.equal(ownRoot?.profileComplete,true,'fresh device should publish a full profile only after complete bootstrap');
  assert.equal(ownRoot?.chunkKeyMode,'generation','new complete-profile recovery snapshots use immutable generation roots');
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
  const beforeSnapshot=await latestDeviceSnapshotRoot(sync,'device-b');
  const beforeRoot=beforeSnapshot.root;
  assert.equal(beforeRoot?.profileComplete,true);
  const beforeCommit=beforeRoot.commitId;

  const normalSet=sync.set.bind(sync);
  let newChunkWrites=0;
  let failedRootKey='';
  sync.set=async items=>{
    const entries=Object.entries(items||{});
    const newRoot=entries.find(([key,value])=>
      value?.kind==='device-snapshot-manifest' && value?.deviceId==='device-b' && value?.commitId!==beforeCommit && !key.includes('.chunk.')
    );
    if(newRoot){
      failedRootKey=newRoot[0];
      const error=new Error('simulated quota failure on immutable profile generation root');
      error.name='QuotaExceededError';
      throw error;
    }
    if(entries.some(([,value])=>value?.kind==='device-snapshot-chunk' && value?.deviceId==='device-b' && value?.commitId!==beforeCommit)) newChunkWrites += 1;
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

  const afterSnapshot=await latestDeviceSnapshotRoot(sync,'device-b');
  assert.equal(afterSnapshot.root?.commitId,beforeCommit,'failed immutable root commit must leave the previous complete generation authoritative');
  assert.ok(newChunkWrites>0,'test must fail after at least one new-generation chunk write');
  assert.ok(failedRootKey,'test must intercept the attempted immutable generation root');
  const all=await sync.get(null);
  assert.equal(Object.keys(all).some(key=>key.startsWith(`${failedRootKey}.chunk.`)),false,'failed generation chunks must be cleaned up');
  const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.equal(meta.syncProfileProtection,'limited');
  assert.equal(meta.syncProfileProtectionReason,'quota');
  assert.equal(meta.syncFastSnapshotFallback,true);
  const workItemKey=`${constants.SYNC_SPACE_PREFIX}work.item.${encodeURIComponent('work-new')}`;
  assert.ok(all[workItemKey],'ordinary Work ledger must retain the edit despite safety-root failure');
  console.log(JSON.stringify({ok:true,beforeCommit,afterCommit:afterSnapshot.root?.commitId,newChunkWrites,protection:meta.syncProfileProtection}));
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
  const newerRemoteState=model.stampSettingsMutationClocks(originalLocal, model.replaceWorkspaceNormalized(originalLocal,'personal',{
    ...remoteWorkspace,
    settings:{...remoteWorkspace.settings,columns:12},
    settingsModifiedAt:500,
    updatedAt:500
  }));
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
  const editedLocal=model.stampSettingsMutationClocks(originalLocal, model.replaceWorkspaceNormalized(originalLocal,'personal',{
    ...localWorkspace,
    settings:{...localWorkspace.settings,columns:10},
    settingsModifiedAt:200,
    updatedAt:200
  }));
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

else if (scenario === 'sync-13010-device-cache-reuse') {
  const items=[];
  for(let i=0;i<12;i++) items.push(shortcut(`p${i}`,`https://p${i}.cache.test/`,200+i));
  const workItems=[];
  for(let i=0;i<8;i++) workItems.push(shortcut(`w${i}`,`https://w${i}.cache.test/`,300+i));
  const base=stateWith({personal:items,work:workItems});
  const allEntries={};
  for(let index=0;index<8;index++){
    const fixture=await completeProfileSnapshotFixture(base,{deviceId:`cache-device-${index}`,commitId:`cache-g${index}`,publishedAt:1000+index});
    Object.assign(allEntries,fixture.entries);
  }
  await sync.set(allEntries);
  decompressionStreamCount=0;
  const first=await send({type:'mosaicsync:get-sync-status'});
  const afterFirst=decompressionStreamCount;
  const second=await send({type:'mosaicsync:get-sync-status'});
  const afterSecond=decompressionStreamCount;
  assert.equal(first?.remoteState,'complete');
  assert.equal(second?.remoteState,'complete');
  assert.equal(first?.remoteItems,second?.remoteItems,'cached read must preserve merged Personal+Work semantics');
  assert.equal(afterFirst,8,'first read must decode all eight retained device generations');
  assert.equal(afterSecond,8,'identical second read must reuse all eight verified generations');
  console.log(JSON.stringify({ok:true,afterFirst,afterSecond,remoteCommitId:second?.remoteCommitId,remoteItems:second?.remoteItems}));
}

else if (scenario === 'sync-13010-cache-incomplete-then-complete') {
  const base=stateWith({personal:[shortcut('p','https://p.cache.test/',200)],work:[shortcut('w','https://w.cache.test/',200)]});
  const fixture=await completeProfileSnapshotFixture(base,{deviceId:'incomplete-device',commitId:'incomplete-g',publishedAt:2000,chunkChars:24});
  assert.ok(fixture.parts.length>1,'fixture must be multi-chunk');
  const missingKey=`${fixture.rootKey}.chunk.${fixture.root.slot}.${fixture.parts.length-1}`;
  const missingValue=fixture.entries[missingKey];
  const partial={...fixture.entries}; delete partial[missingKey];
  await sync.set(partial);
  decompressionStreamCount=0;
  const incomplete=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,0,'incomplete generation must fail before gzip and cannot populate cache');
  assert.equal(incomplete?.remoteState,'partial');
  await sync.set({[missingKey]:missingValue});
  const complete=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'later completion of the same generation must perform its first full decode');
  assert.equal(complete?.remoteState,'complete');
  await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'completed generation must then be reusable');
  console.log(JSON.stringify({ok:true,decompressions:decompressionStreamCount,remoteState:complete?.remoteState}));
}

else if (scenario === 'sync-13010-cache-revalidates-current-bytes') {
  const base=stateWith({personal:[shortcut('p','https://p.cache.test/',200)],work:[shortcut('w','https://w.cache.test/',200)]});
  const fixture=await completeProfileSnapshotFixture(base,{deviceId:'corrupt-device',commitId:'corrupt-g',publishedAt:3000,chunkChars:64});
  await sync.set(fixture.entries);
  decompressionStreamCount=0;
  const first=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(first?.remoteState,'complete');
  assert.equal(decompressionStreamCount,1);
  const chunkKey=`${fixture.rootKey}.chunk.${fixture.root.slot}.0`;
  const chunk=clone(fixture.entries[chunkKey]);
  chunk.data=(chunk.data[0]==='A'?'B':'A')+chunk.data.slice(1);
  await sync.set({[chunkKey]:chunk});
  const corrupt=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'changed compressed bytes must be rejected before a cache lookup can mask corruption');
  assert.equal(corrupt?.remoteState,'partial');
  await sync.set({[chunkKey]:fixture.entries[chunkKey]});
  const restored=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'restoring identical verified bytes may safely reuse the prior complete decode');
  assert.equal(restored?.remoteState,'complete');
  console.log(JSON.stringify({ok:true,decompressions:decompressionStreamCount,corruptState:corrupt?.remoteState,restoredState:restored?.remoteState}));
}

else if (scenario === 'sync-13010-cache-previous-generation-fallback') {
  const oldState=stateWith({personal:[shortcut('old','https://old.cache.test/',200)],work:[shortcut('work-old','https://work-old.cache.test/',200)]});
  const currentState=stateWith({personal:[shortcut('new','https://new.cache.test/',500)],work:[shortcut('work-new','https://work-new.cache.test/',500)]});
  const oldFixture=await completeProfileSnapshotFixture(oldState,{deviceId:'fallback-device',commitId:'old-generation',slot:'a',publishedAt:4000,chunkChars:48});
  const currentFixture=await completeProfileSnapshotFixture(currentState,{deviceId:'fallback-device',commitId:'new-generation',slot:'b',publishedAt:5000,chunkChars:48,previousProfile:previousDescriptorForFixture(oldFixture.root)});
  const all={...oldFixture.entries,...currentFixture.entries};
  const missingCurrentKey=`${currentFixture.rootKey}.chunk.${currentFixture.root.slot}.${currentFixture.parts.length-1}`;
  const missingCurrentValue=all[missingCurrentKey];
  delete all[missingCurrentKey];
  // Both fixtures share one root key: restore the current root after merging the
  // old chunks so previousProfile is authoritative while current is torn.
  all[currentFixture.rootKey]=currentFixture.root;
  await sync.set(all);
  decompressionStreamCount=0;
  const fallback=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'torn current generation must decode the previous complete slot once');
  assert.equal(fallback?.remoteCommitId,'old-generation');
  await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,1,'unchanged previous fallback should be cached');
  await sync.set({[missingCurrentKey]:missingCurrentValue});
  const current=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,2,'newly completed current generation must decode once rather than being blocked by cached previous data');
  assert.equal(current?.remoteCommitId,'new-generation');
  await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,2,'completed current generation should then reuse its cache entry');
  console.log(JSON.stringify({ok:true,decompressions:decompressionStreamCount,fallbackCommit:fallback?.remoteCommitId,currentCommit:current?.remoteCommitId}));
}

else if (scenario === 'sync-13010-cache-failures-never-cache') {
  const base=stateWith({personal:[shortcut('p','https://p.cache.test/',200)],work:[shortcut('w','https://w.cache.test/',200)]});
  const invalidFingerprint=await completeProfileSnapshotFixture(base,{deviceId:'invalid-record-device',commitId:'invalid-record-g',publishedAt:5500});
  invalidFingerprint.root.recordFingerprint='00000000';
  invalidFingerprint.entries[invalidFingerprint.rootKey]=invalidFingerprint.root;
  await sync.set(invalidFingerprint.entries);
  decompressionStreamCount=0;
  const firstInvalid=await send({type:'mosaicsync:get-sync-status'});
  const secondInvalid=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(firstInvalid?.remoteState,'partial');
  assert.equal(secondInvalid?.remoteState,'partial');
  assert.equal(decompressionStreamCount,2,'decoded-but-invalid record fingerprints must never populate the cache');

  await sync.clear();
  const malformed=await completeProfileSnapshotFixture(base,{deviceId:'invalid-gzip-device',commitId:'invalid-gzip-g',publishedAt:5600});
  const raw=Buffer.from('not-a-gzip-stream').toString('base64');
  const root={...malformed.root,compressedBytes:Buffer.byteLength('not-a-gzip-stream'),dataChars:raw.length,dataFingerprint:fnv1aForFixture(raw),parts:1};
  const chunkKey=`${malformed.rootKey}.chunk.${root.slot}.0`;
  await sync.set({
    [malformed.rootKey]:root,
    [chunkKey]:{schemaVersion:constants.DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,kind:'device-snapshot-chunk',deviceId:root.deviceId,commitId:root.commitId,slot:root.slot,index:0,total:1,data:raw}
  });
  decompressionStreamCount=0;
  const firstGzip=await send({type:'mosaicsync:get-sync-status'});
  const secondGzip=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(firstGzip?.remoteState,'partial');
  assert.equal(secondGzip?.remoteState,'partial');
  assert.equal(decompressionStreamCount,2,'malformed gzip generations must be retried rather than cached as a failure');

  await sync.clear();
  const legacyNoFingerprint=await completeProfileSnapshotFixture(base,{deviceId:'no-fingerprint-device',commitId:'no-fingerprint-g',publishedAt:5700});
  legacyNoFingerprint.root.dataFingerprint='';
  legacyNoFingerprint.entries[legacyNoFingerprint.rootKey]=legacyNoFingerprint.root;
  await sync.set(legacyNoFingerprint.entries);
  decompressionStreamCount=0;
  const firstLegacy=await send({type:'mosaicsync:get-sync-status'});
  const secondLegacy=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(firstLegacy?.remoteState,'complete','legacy compatible manifest without a data fingerprint remains readable');
  assert.equal(secondLegacy?.remoteState,'complete');
  assert.equal(decompressionStreamCount,2,'a generation without a verified compressed-data fingerprint must never enter the cache');
  console.log(JSON.stringify({ok:true,invalidFingerprintDecodes:2,invalidGzipDecodes:2,unfingerprintedDecodes:decompressionStreamCount}));
}

else if (scenario === 'sync-13010-cache-validation-metadata-miss') {
  const base=stateWith({personal:[shortcut('p','https://p.cache.test/',200)],work:[shortcut('w','https://w.cache.test/',200)]});
  const fixture=await completeProfileSnapshotFixture(base,{deviceId:'metadata-device',commitId:'metadata-g',publishedAt:6000});
  await sync.set(fixture.entries);
  decompressionStreamCount=0;
  const first=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(first?.remoteCommitId,'metadata-g');
  assert.equal(decompressionStreamCount,1);
  const changedRoot={...fixture.root,publishedAt:6001};
  await sync.set({[fixture.rootKey]:changedRoot});
  const second=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,2,'manifest metadata that changes decoded semantics must invalidate the cache even when compressed bytes match');
  assert.equal(second?.remoteCommitId,'metadata-g');

  const changedCommit='metadata-g2';
  const commitEntries={[fixture.rootKey]:{...changedRoot,commitId:changedCommit}};
  for(let index=0;index<fixture.parts.length;index++) {
    const key=`${fixture.rootKey}.chunk.${fixture.root.slot}.${index}`;
    commitEntries[key]={...fixture.entries[key],commitId:changedCommit};
  }
  await sync.set(commitEntries);
  const third=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,3,'a new generation identity must decode again even when payload bytes are unchanged');
  assert.equal(third?.remoteCommitId,changedCommit);
  await send({type:'mosaicsync:get-sync-status'});
  assert.equal(decompressionStreamCount,3);
  console.log(JSON.stringify({ok:true,decompressions:decompressionStreamCount,commitId:third?.remoteCommitId}));
}

else if (scenario === 'lifecycle-13012-false-install-preserves-complete') {
  const existingState=stateWith({
    personal:[shortcut('personal-kept','https://personal-kept.test/',400)],
    work:[shortcut('work-kept','https://work-kept.test/',450)],
    activeSpaceId:'work'
  });
  const existingMeta={
    ...constants.DEFAULT_META,
    deviceId:'device-preserved',
    syncEnabled:true,
    syncInitialized:true,
    syncBootstrapMode:'remote',
    syncStatus:'ready',
    lastSyncAt:123456,
    syncProfileProtection:'protected',
    syncProfileProtectionReason:'',
    onboardingCompleted:true,
    onboardingVersion:'1.30.10',
    syncWaitStartedAt:999,
    lastAppliedSyncRevision:'personal-rev',
    lastAppliedWorkSyncRevision:'work-rev',
    lastAppliedDeviceSnapshotRevision:'device-rev',
    lastAppliedProfileSnapshotRevision:'profile-rev',
    lastProfileSnapshotPublishedAt:777,
    lastRemoteReceiptAt:888,
    lastRemoteReceiptRevision:'receipt-rev',
    lastRemoteReceiptUpdatedAt:666,
    lastRemoteReceiptOriginDeviceId:'remote-device'
  };
  await local.set({
    [constants.LOCAL_STATE_KEY]:existingState,
    [constants.LOCAL_ACTIVE_SPACE_KEY]:'work',
    [constants.LOCAL_META_KEY]:existingMeta
  });
  const beforeState=clone((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  const beforeMeta=clone((await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY]);
  assert.equal(events.onInstalled.listeners.length,1);
  events.onInstalled.listeners[0]({reason:'install'});
  await send({type:'mosaicsync:get-sync-status'});
  const afterState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const afterMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.deepEqual(model.normalizeState(afterState),model.normalizeState(beforeState),'an install-like lifecycle event must not replace the semantic existing layout');
  for (const key of [
    'deviceId','syncEnabled','syncInitialized','syncBootstrapMode','syncStatus','lastSyncAt',
    'syncProfileProtection','syncProfileProtectionReason','onboardingCompleted','onboardingVersion',
    'syncWaitStartedAt','lastAppliedSyncRevision','lastAppliedWorkSyncRevision',
    'lastAppliedDeviceSnapshotRevision','lastAppliedProfileSnapshotRevision','lastProfileSnapshotPublishedAt',
    'lastRemoteReceiptAt','lastRemoteReceiptRevision','lastRemoteReceiptUpdatedAt','lastRemoteReceiptOriginDeviceId'
  ]) assert.deepEqual(afterMeta[key],beforeMeta[key],`false install must preserve meta.${key}`);
  assert.equal(createdTabs.length,0,'completed onboarding must not be reopened by a false install event');
  console.log(JSON.stringify({ok:true,preserved:true,onboarding:afterMeta.onboardingCompleted,syncStatus:afterMeta.syncStatus}));
}

else if (scenario === 'lifecycle-13012-false-install-preserves-waiting') {
  const existingState=stateWith({personal:[shortcut('local-draft','https://draft.test/',300)]});
  await seedLocalState(existingState,{
    syncEnabled:true,
    syncInitialized:false,
    syncBootstrapMode:'remote',
    syncStatus:'waiting',
    onboardingCompleted:false,
    onboardingVersion:'',
    syncWaitStartedAt:424242,
    lastRemoteReceiptAt:313131,
    lastRemoteReceiptRevision:'partial-receipt'
  });
  const beforeMeta=clone((await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY]);
  events.onInstalled.listeners[0]({reason:'install'});
  await send({type:'mosaicsync:get-sync-status'});
  const afterMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const afterState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  assert.ok(findCompactShortcut(afterState,'local-draft'),'waiting local draft must survive an install-like recovery event');
  for (const key of ['syncEnabled','syncInitialized','syncBootstrapMode','syncStatus','syncWaitStartedAt','lastRemoteReceiptAt','lastRemoteReceiptRevision']) {
    assert.deepEqual(afterMeta[key],beforeMeta[key],`false install must preserve waiting meta.${key}`);
  }
  assert.equal(createdTabs.length,1,'incomplete onboarding may still foreground Welcome without resetting recovery state');
  console.log(JSON.stringify({ok:true,preservedWaiting:true,syncStatus:afterMeta.syncStatus,welcomeTabs:createdTabs.length}));
}

else if (scenario === 'lifecycle-13012-genuine-fresh-install-defaults') {
  assert.equal((await local.get(null))[constants.LOCAL_STATE_KEY],undefined);
  assert.equal((await local.get(null))[constants.LOCAL_META_KEY],undefined);
  events.onInstalled.listeners[0]({reason:'install'});
  await send({type:'mosaicsync:get-sync-status'});
  const state=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.ok(state && typeof state==='object','fresh install must materialize default local state');
  assert.equal(meta?.syncEnabled,false);
  assert.equal(meta?.syncInitialized,false);
  assert.equal(meta?.syncBootstrapMode,'none');
  assert.equal(meta?.syncStatus,'off');
  assert.equal(meta?.onboardingCompleted,false);
  assert.ok(typeof meta?.deviceId==='string' && meta.deviceId.length>0,'fresh install must receive a device id');
  assert.equal(createdTabs.length,1,'genuine fresh install must foreground Welcome');
  console.log(JSON.stringify({ok:true,fresh:true,syncStatus:meta.syncStatus,welcomeTabs:createdTabs.length}));
}

else if (scenario === 'lifecycle-13012-update-and-downgrade-preserve') {
  const existingState=stateWith({personal:[shortcut('kept','https://kept.test/',500)]});
  await seedLocalState(existingState,{
    syncEnabled:true,syncInitialized:true,syncBootstrapMode:'local',syncStatus:'ready',
    onboardingCompleted:true,onboardingVersion:'1.30.10',lastAppliedSyncRevision:'stable-rev'
  });
  const baselineState=clone((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  const baselineMeta=clone((await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY]);
  events.onInstalled.listeners[0]({reason:'update',previousVersion:'1.30.10'});
  await send({type:'mosaicsync:get-sync-status'});
  let currentState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  let currentMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.deepEqual(model.normalizeState(currentState),model.normalizeState(baselineState),'normal update must preserve semantic local layout');
  for(const key of ['deviceId','syncEnabled','syncInitialized','syncBootstrapMode','syncStatus','onboardingCompleted','onboardingVersion','lastAppliedSyncRevision']) {
    assert.deepEqual(currentMeta[key],baselineMeta[key],`normal update must preserve meta.${key}`);
  }
  events.onInstalled.listeners[0]({reason:'update',previousVersion:'1.30.99'});
  await send({type:'mosaicsync:get-sync-status'});
  currentState=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  currentMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.deepEqual(model.normalizeState(currentState),model.normalizeState(baselineState),'downgrade/re-upgrade style update event must preserve semantic local layout');
  for(const key of ['deviceId','syncEnabled','syncInitialized','syncBootstrapMode','syncStatus','onboardingCompleted','onboardingVersion','lastAppliedSyncRevision']) {
    assert.deepEqual(currentMeta[key],baselineMeta[key],`downgrade/update must preserve meta.${key}`);
  }
  assert.equal(createdTabs.length,0,'completed onboarding must stay completed across update/downgrade events');
  console.log(JSON.stringify({ok:true,updatePreserved:true,downgradePreserved:true}));
}

else if (scenario === 'sync-loss-13013-single-survivor-recovers') {
  const base=stateWith({
    personal:[shortcut('keep','https://keep.test/',500),shortcut('delete-during-loss','https://delete-during-loss.test/',500)],
    work:[shortcut('work-keep','https://work-keep.test/',500)]
  });
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncBootstrapMode:'none',syncStatus:'ready',lastSyncAt:fakeNow-1000});
  const healthy={...remotePersonalEntries(base,'personal-healthy'),...remoteWorkEntries(base,'work-healthy')};
  const deletedKey=`${constants.SYNC_ITEM_PREFIX}${encodeURIComponent('old-deleted')}`;
  healthy[deletedKey]={schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'deleted',id:'old-deleted',deletedAt:fakeNow-2000,modifiedAt:fakeNow-2000,deviceId:'remote-device'};
  await sync.set(healthy);
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  let continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity?.established,true,'healthy established device must record Sync continuity');
  assert.ok(continuity.personalTombstones.some(t=>t.id==='old-deleted'),'continuity must retain synchronized tombstones needed to prevent stale resurrection');

  const before=clone((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  const writesBefore=sync.stats.setCalls;
  await sync.clear();
  const first=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  assert.equal(first?.reason,'remote-loss-quarantine');
  assert.equal(sync.stats.setCalls,writesBefore,'first empty observation must not immediately republish');
  assert.deepEqual(model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]),model.normalizeState(before),'quarantine must preserve the local profile');
  continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'quarantine');
  assert.ok(Number(continuity.recoveryEligibleAt)>fakeNow);
  assert.ok(alarms.has(constants.SYNC_RECOVERY_ALARM),'quarantine must persist a recovery wakeup');

  // A local edit made while the cloud is absent must remain local and must not
  // accidentally recreate the namespace before the quarantine expires.
  const edited=stateWith({
    personal:[shortcut('keep','https://keep.test/',500),shortcut('during-loss','https://during-loss.test/',700)],
    work:[shortcut('work-keep','https://work-keep.test/',500)]
  });
  const oldRaw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  await storageCore.writeLocalState(edited,{recordSyncMutation:true,baseState:oldRaw,baseStateIsCompact:true});
  const newRaw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const writesBeforeLocalEvent=sync.stats.setCalls;
  for(const listener of events.onStorageChanged.listeners) listener({[constants.LOCAL_STATE_KEY]:{oldValue:oldRaw,newValue:newRaw}},'local');
  await send({type:'mosaicsync:get-sync-status'});
  assert.equal(sync.stats.setCalls,writesBeforeLocalEvent,'local edits must be write-blocked during catastrophic-loss quarantine');

  fakeNow=Number(continuity.recoveryEligibleAt)+1;
  for(const listener of events.onAlarm.listeners) listener({name:constants.SYNC_RECOVERY_ALARM});
  const status=await send({type:'mosaicsync:get-sync-status'}); // flush the serialized recovery queue
  assert.equal(status.hasRemoteData,true,'surviving device must recreate a complete remote profile');
  const remote=await sync.get(null);
  assert.ok(remote[deletedKey]?.kind==='deleted','recovery must republish last-known-good tombstones');
  assert.ok(Object.values(remote).some(v=>v?.id==='during-loss' && v?.kind==='shortcut'),'local edits made during quarantine must be included in the recovered profile');
  assert.ok(Object.values(remote).some(v=>v?.id==='delete-during-loss' && v?.kind==='deleted'),'deletions made during quarantine must be replayed as tombstones after recovery');
  continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'none');
  assert.equal(continuity.established,true);
  assert.ok(Number(continuity.lastRecoveredAt)>0);
  const recoveryStatus=(await local.get(constants.LOCAL_SYNC_RECOVERY_STATUS_KEY))[constants.LOCAL_SYNC_RECOVERY_STATUS_KEY];
  assert.equal(recoveryStatus?.state,'restored');
  console.log(JSON.stringify({ok:true,recovered:true,remoteItems:status.remoteItems,tombstonePreserved:true,editPreserved:true,deletePreserved:true}));
}

else if (scenario === 'sync-loss-13013-upgrade-infers-established') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{
    syncEnabled:true,syncInitialized:true,syncBootstrapMode:'none',syncStatus:'ready',
    lastAppliedSyncRevision:'commit:old-personal',lastAppliedWorkSyncRevision:'commit:old-work',
    lastAppliedProfileSnapshotRevision:'profile:old',lastSyncAt:fakeNow-1000
  });
  assert.equal((await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY],undefined,'1.30.12-style profile must begin without the new continuity key');
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(result?.reason,'remote-loss-quarantine','upgrade must infer prior healthy participation instead of treating zero as a fresh install');
  assert.equal(continuity?.established,true);
  assert.equal(continuity?.lossState,'quarantine');
  assert.equal(sync.stats.setCalls,0,'migration guard must not publish before quarantine expires');
  console.log(JSON.stringify({ok:true,inferredEstablished:true,quarantined:true}));
}

else if (scenario === 'sync-loss-13013-fresh-empty-waits') {
  const fresh=stateWith();
  await seedLocalState(fresh,{syncEnabled:true,syncInitialized:false,syncBootstrapMode:'await-remote',syncStatus:'waiting',onboardingCompleted:false});
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  const recoveryStatus=(await local.get(constants.LOCAL_SYNC_RECOVERY_STATUS_KEY))[constants.LOCAL_SYNC_RECOVERY_STATUS_KEY];
  assert.equal(result?.pending,true);
  assert.equal(meta.syncBootstrapMode,'await-remote');
  assert.notEqual(continuity?.lossState,'quarantine','fresh device must not mistake an empty cloud for catastrophic loss');
  assert.equal(recoveryStatus,undefined);
  assert.equal(sync.stats.setCalls,0,'fresh waiting device must not publish');
  console.log(JSON.stringify({ok:true,freshWait:true,syncStatus:meta.syncStatus}));
}

else if (scenario === 'sync-loss-13013-transient-empty-cancels') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  const healthy={...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')};
  await sync.set(healthy);
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  await sync.clear();
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  let continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'quarantine');
  await sync.set(healthy);
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'none','valid data reappearing during quarantine must cancel recovery');
  const recoveryStatus=(await local.get(constants.LOCAL_SYNC_RECOVERY_STATUS_KEY))[constants.LOCAL_SYNC_RECOVERY_STATUS_KEY];
  assert.equal(recoveryStatus,undefined,'transient suspicion must remain silent to the user');
  assert.equal(Number(continuity.recoveryAttempts)||0,0,'cancelling transient loss must not manufacture a catastrophic recovery attempt');
  console.log(JSON.stringify({ok:true,cancelled:true,silent:true}));
}

else if (scenario === 'sync-loss-13013-intentional-reset-is-nonzero') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  await sync.set({...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')});
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const before=clone((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  const cleared=await send({type:'mosaicsync:clear-sync-data'});
  const remote=await sync.get(null);
  const keys=Object.keys(remote);
  assert.deepEqual(keys,[constants.SYNC_RESET_INTENT_KEY],'intentional clear must leave only the reset sentinel');
  assert.ok(await sync.getBytesInUse(null)>0,'intentional clear must never create a 0-byte namespace');
  assert.ok(Number(remote[constants.SYNC_RESET_INTENT_KEY]?.epoch)>0);
  assert.deepEqual(model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]),model.normalizeState(before),'clearing cloud copy must preserve local profile');
  let continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.established,false);
  assert.ok(Number(continuity.lastResetEpoch)>0);
  assert.equal(cleared.meta.syncEnabled,false);

  // Model another established device observing the reset marker: it must
  // preserve its local profile, stay safely enrolled in await-remote mode, and
  // never resurrect the cloud while the explicit reset sentinel remains.
  await local.set({
    [constants.LOCAL_META_KEY]:{...cleared.meta,syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-100},
    [constants.LOCAL_SYNC_CONTINUITY_KEY]:{...continuity,established:true,lastResetEpoch:0,lossState:'none',lastHealthyAt:fakeNow-100}
  });
  const setsBefore=sync.stats.setCalls;
  const observed=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const observerMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.equal(observed.reason,'intentional-remote-reset');
  assert.equal(observerMeta.syncEnabled,true,'observer must remain enrolled without becoming a recovery publisher');
  assert.equal(observerMeta.syncInitialized,false);
  assert.equal(observerMeta.syncBootstrapMode,'await-remote');
  assert.equal(sync.stats.setCalls,setsBefore,'observer must not write over the reset sentinel');

  // A later explicit local-source choice is allowed to supersede the reset, but
  // the marker must disappear only after a complete Personal+Work publication.
  const republished=await send({type:'mosaicsync:bootstrap-local'});
  assert.equal(republished?.ok,true);
  const afterRepublish=await sync.get(null);
  assert.equal(afterRepublish[constants.SYNC_RESET_INTENT_KEY],undefined,'successful explicit local bootstrap must retire the reset sentinel');
  const status=await send({type:'mosaicsync:get-sync-status'});
  assert.equal(status.hasRemoteData,true,'explicit local bootstrap after reset must create a complete synchronized profile');
  console.log(JSON.stringify({ok:true,nonzeroReset:true,observerRespected:true,republishedAfterReset:true,remainingBytes:await sync.getBytesInUse(null)}));
}

else if (scenario === 'sync-loss-13013-recovery-failure-preserves-local') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  const healthy={...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')};
  await sync.set(healthy);
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const before=clone((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  await sync.clear();
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});

  const originalSet=sync.set.bind(sync);
  sync.set=async () => { sync.stats.setCalls += 1; throw new Error('injected recovery write failure'); };
  for(let attempt=1; attempt<=constants.SYNC_RECOVERY_MAX_ATTEMPTS; attempt+=1){
    let continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
    fakeNow=Number(continuity.recoveryEligibleAt)+1;
    for(const listener of events.onAlarm.listeners) listener({name:constants.SYNC_RECOVERY_ALARM});
    await send({type:'mosaicsync:get-sync-status'});
  }
  const continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  const meta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const recoveryStatus=(await local.get(constants.LOCAL_SYNC_RECOVERY_STATUS_KEY))[constants.LOCAL_SYNC_RECOVERY_STATUS_KEY];
  assert.equal(continuity.lossState,'failed');
  assert.equal(continuity.recoveryAttempts,constants.SYNC_RECOVERY_MAX_ATTEMPTS);
  assert.equal(meta.syncStatus,'error');
  assert.match(meta.lastSyncError,/local profile is still safe/i);
  assert.equal(recoveryStatus?.state,'failed');
  assert.deepEqual(model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]),model.normalizeState(before),'exhausted recovery must never damage the local profile');
  sync.set=originalSet;
  console.log(JSON.stringify({ok:true,failedSafely:true,attempts:continuity.recoveryAttempts,localPreserved:true}));
}

else if (scenario === 'sync-loss-13013-partial-nonzero-does-not-recover') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  await sync.set({...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')});
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  await sync.clear();
  const settings=model.makeSettingsRecordNormalized(model.workspaceStateNormalized(base,'personal'),'remote-device');
  await sync.set({[constants.SYNC_SETTINGS_KEY]:settings});
  const setsBefore=sync.stats.setCalls;
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'none','non-zero partial/corrupt delivery must stay in existing torn-delivery handling');
  assert.equal(sync.stats.setCalls,setsBefore,'partial non-zero remote must not trigger catastrophic recovery publication');
  assert.notEqual(result?.reason,'remote-loss-quarantine');
  console.log(JSON.stringify({ok:true,partialStayedPartial:true,noRecovery:true}));
}

else if (scenario === 'sync-loss-13014-zero-double-check') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  const healthy={...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')};
  await sync.set(healthy);
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const setsBefore=sync.stats.setCalls;
  sync.getBytesInUse=async()=>0; // simulate a transient quota/API false zero
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.notEqual(continuity?.lossState,'quarantine','non-empty namespace must defeat a false getBytesInUse zero');
  assert.notEqual(result?.reason,'remote-loss-quarantine');
  assert.equal(sync.stats.setCalls,setsBefore,'double-check must not publish or mutate remote data');
  console.log(JSON.stringify({ok:true,doubleChecked:true,falseZeroIgnored:true}));
}

else if (scenario === 'sync-loss-13014-startup-warmup') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  await sync.set({...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')});
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  await sync.clear();
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  let continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  const oldEligible=Number(continuity.recoveryEligibleAt);
  fakeNow=oldEligible+(3*60*60*1000);
  const setsBefore=sync.stats.setCalls;
  for(const listener of events.onStartup.listeners) listener();
  await send({type:'mosaicsync:get-sync-status'}); // flush startup queue
  continuity=(await local.get(constants.LOCAL_SYNC_CONTINUITY_KEY))[constants.LOCAL_SYNC_CONTINUITY_KEY];
  assert.equal(continuity.lossState,'quarantine');
  assert.ok(Number(continuity.recoveryEligibleAt)>=fakeNow+constants.SYNC_RECOVERY_STARTUP_WARMUP_MS,
    'browser restart must grant Firefox Sync a fresh warm-up window before recovery');
  assert.equal(sync.stats.setCalls,setsBefore,'expired quarantine from a previous session must not publish immediately on startup');
  console.log(JSON.stringify({ok:true,startupWarmup:true,recoveryEligibleAt:continuity.recoveryEligibleAt}));
}

else if (scenario === 'sync-loss-13014-reset-peer-rejoins') {
  const base=stateWith({personal:[shortcut('old','https://old.test/',500)],work:[shortcut('work-old','https://work-old.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  await sync.set({...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')});
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  const epoch=fakeNow+100;
  await sync.clear();
  await sync.set({[constants.SYNC_RESET_INTENT_KEY]:{schemaVersion:constants.SYNC_RESET_INTENT_SCHEMA_VERSION,kind:'reset-intent',epoch,initiatedByDevice:'peer-reset-device',initiatedAt:fakeNow}});
  const observed=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  let observerMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  assert.equal(observed.reason,'intentional-remote-reset');
  assert.equal(observerMeta.syncEnabled,true,'reset observer must remain enrolled in Sync');
  assert.equal(observerMeta.syncInitialized,false);
  assert.equal(observerMeta.syncBootstrapMode,'await-remote');
  assert.equal(observerMeta.syncStatus,'waiting');

  const replacement=stateWith({personal:[shortcut('new','https://new.test/',900)],work:[shortcut('work-new','https://work-new.test/',900)]});
  await sync.clear();
  await sync.set({...remotePersonalEntries(replacement,'p2'),...remoteWorkEntries(replacement,'w2')});
  const restored=await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  observerMeta=(await local.get(constants.LOCAL_META_KEY))[constants.LOCAL_META_KEY];
  const localState=model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]);
  assert.equal(observerMeta.syncEnabled,true);
  assert.equal(observerMeta.syncInitialized,true,'observer must automatically rejoin when a complete post-reset profile appears');
  assert.equal(localState.spaces.personal.shortcuts.some(item=>item.id==='new'),true);
  assert.equal(localState.spaces.personal.shortcuts.some(item=>item.id==='old'),false);
  console.log(JSON.stringify({ok:true,waited:true,rejoined:true,restoredReason:restored?.reason||''}));
}

else if (scenario === 'sync-loss-13014-recovering-restart-grace') {
  const base=stateWith({personal:[shortcut('keep','https://keep.test/',500)],work:[shortcut('work','https://work.test/',500)]});
  await seedLocalState(base,{syncEnabled:true,syncInitialized:true,syncStatus:'ready',lastSyncAt:fakeNow-1000});
  await sync.set({...remotePersonalEntries(base,'p1'),...remoteWorkEntries(base,'w1')});
  await send({type:'mosaicsync:reconcile-if-needed',reason:'foreground'});
  await sync.clear();
  await local.set({[constants.LOCAL_SYNC_CONTINUITY_KEY]:{
    schemaVersion:constants.SYNC_CONTINUITY_SCHEMA_VERSION,established:true,lastHealthyAt:fakeNow-1000,
    lastCompleteRevision:'x',lastPublisherDeviceId:'peer',lastResetEpoch:0,personalTombstones:[],workTombstones:[],
    lossState:'recovering',lossDetectedAt:fakeNow-600000,recoveryEligibleAt:fakeNow+constants.SYNC_RECOVERY_RESTART_GRACE_MS,
    recoveryAttempts:1,lastRecoveredAt:0
  }});
  const setsBefore=sync.stats.setCalls;
  const result=await send({type:'mosaicsync:reconcile-if-needed',reason:'alarm'});
  assert.equal(result?.pending,true);
  assert.equal(sync.stats.setCalls,setsBefore,'replacement worker must respect persisted recovering grace before another publication');
  console.log(JSON.stringify({ok:true,restartGrace:true}));
}

else if (scenario === 'sync-13017-legacy-snapshot-settings-protected') {
  const waiting=stateWith();
  await seedLocalState(waiting,{syncEnabled:true,syncInitialized:false,syncBootstrapMode:'await-remote',syncStatus:'waiting'});

  const legacyState=stateWith();
  const legacyize = record => {
    delete record.settingsClock;
    record.schemaVersion = 10;
    record.modifiedAt = 5000;
    record.deviceId = 'legacy-device';
    record.settings.rows = 6;
    record.settings.columns = 10;
    return record;
  };
  const legacyFixture=await completeProfileSnapshotFixture(legacyState,{
    deviceId:'legacy-device',commitId:'legacy-profile',publishedAt:5000,
    transformSettings:legacyize,transformWorkSettings:legacyize
  });

  const modernState=stateWith();
  const modernPersonal=model.workspaceStateNormalized(modernState,'personal');
  const modernSettings=model.makeSettingsRecordNormalized(modernPersonal,'modern-device');
  modernSettings.settings.rows=7;
  modernSettings.settingsClock.r=[1000,'modern-device'];
  modernSettings.modifiedAt=1000;
  const modernWork=model.makeSettingsRecordNormalized(model.workspaceStateNormalized(modernState,'work'),'modern-device');
  modernWork.settings.rows=5;
  modernWork.settingsClock.r=[1100,'modern-device'];
  modernWork.modifiedAt=1100;
  const workPrefix=`${constants.SYNC_SPACE_PREFIX}work.`;
  await sync.set({
    ...legacyFixture.entries,
    [constants.SYNC_SETTINGS_KEY]:modernSettings,
    [constants.SYNC_DATASET_KEY]:{
      schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:1000,liveRecordCount:0,
      settingsModifiedAt:1000,commitId:'modern-shared',originDeviceId:'modern-device'
    },
    [`${workPrefix}settings`]:modernWork,
    [`${workPrefix}dataset`]:{
      schemaVersion:constants.SYNC_SCHEMA_VERSION,kind:'dataset',updatedAt:1100,liveRecordCount:0,
      settingsModifiedAt:1100,commitId:'modern-work-shared',originDeviceId:'modern-device'
    }
  });

  const result=await send({type:'mosaicsync:wait-for-remote'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const normalized=model.normalizeState(raw);
  assert.equal(result?.ok,true);
  assert.equal(normalized.spaces.personal.settings.rows,7,'decoded raw legacy snapshot must not revert explicit modern rows');
  assert.equal(normalized.spaces.personal.settings.columns,8,'legacy unrelated whole-record write must not override modern explicit columns');
  assert.equal(normalized.spaces.work.settings.rows,5,'decoded raw legacy Work snapshot must not revert explicit modern Work rows');
  assert.equal(normalized.spaces.work.settings.columns,8,'legacy Work whole-record write must not override unrelated modern Work columns');
  console.log(JSON.stringify({ok:true,rows:normalized.spaces.personal.settings.rows,columns:normalized.spaces.personal.settings.columns,workRows:normalized.spaces.work.settings.rows,workColumns:normalized.spaces.work.settings.columns}));
}

else if (scenario === 'sync-13017-legacy-shared-settings-protected') {
  const waiting=stateWith();
  await seedLocalState(waiting,{syncEnabled:true,syncInitialized:false,syncBootstrapMode:'await-remote',syncStatus:'waiting'});

  const modernState=stateWith();
  const modernize = record => {
    record.settings.rows = 7;
    record.settingsClock.r = [1000,'modern-device'];
    record.modifiedAt = 1000;
    return record;
  };
  const modernizeWork = record => {
    record.settings.rows = 5;
    record.settingsClock.r = [1100,'modern-device'];
    record.modifiedAt = 1100;
    return record;
  };
  const modernFixture=await completeProfileSnapshotFixture(modernState,{
    deviceId:'modern-device',commitId:'modern-profile',publishedAt:1000,
    transformSettings:modernize,transformWorkSettings:modernizeWork
  });
  const legacyPersonal=model.workspaceStateNormalized(stateWith(),'personal');
  const legacySettings=model.makeSettingsRecordNormalized(legacyPersonal,'legacy-device');
  delete legacySettings.settingsClock;
  legacySettings.schemaVersion=10;
  legacySettings.modifiedAt=5000;
  legacySettings.settings.rows=6;
  legacySettings.settings.columns=10;

  const legacyWork=clone(legacySettings);
  legacyWork.settings.rows=6;
  legacyWork.settings.columns=10;
  const workPrefix=`${constants.SYNC_SPACE_PREFIX}work.`;
  await sync.set({
    ...modernFixture.entries,
    [constants.SYNC_SETTINGS_KEY]:legacySettings,
    [constants.SYNC_DATASET_KEY]:{
      schemaVersion:10,kind:'dataset',updatedAt:5000,liveRecordCount:0,
      settingsModifiedAt:5000,commitId:'legacy-shared',originDeviceId:'legacy-device'
    },
    [`${workPrefix}settings`]:legacyWork,
    [`${workPrefix}dataset`]:{
      schemaVersion:10,kind:'dataset',updatedAt:5000,liveRecordCount:0,
      settingsModifiedAt:5000,commitId:'legacy-work-shared',originDeviceId:'legacy-device'
    }
  });

  const result=await send({type:'mosaicsync:wait-for-remote'});
  const raw=(await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY];
  const normalized=model.normalizeState(raw);
  assert.equal(result?.ok,true);
  assert.equal(normalized.spaces.personal.settings.rows,7,'raw legacy shared record must not revert explicit modern rows from a device snapshot');
  assert.equal(normalized.spaces.personal.settings.columns,8,'legacy shared whole-record write must not claim unrelated modern settings');
  assert.equal(normalized.spaces.work.settings.rows,5,'raw legacy Work shared record must not revert explicit modern Work rows from a device snapshot');
  assert.equal(normalized.spaces.work.settings.columns,8,'legacy Work shared record must not claim unrelated modern Work settings');
  console.log(JSON.stringify({ok:true,rows:normalized.spaces.personal.settings.rows,columns:normalized.spaces.personal.settings.columns,workRows:normalized.spaces.work.settings.rows,workColumns:normalized.spaces.work.settings.columns}));
}

else if (scenario === 'top-sites-permission-session-lifecycle') {
  const s=stateWith();
  // Frequently Visited intent is synchronized profile state; actual permission
  // and suggestions are device-local. Keep the preference ON throughout.
  s.spaces.personal.settings.frequentlyVisitedEnabled=true;
  s.spaces.personal.settings.frequentlyVisitedCount=5;
  s.spaces.work.settings.frequentlyVisitedEnabled=true;
  s.spaces.work.settings.frequentlyVisitedCount=5;
  await seedLocalState(s);
  await storageCore.writeLocalState(s);
  topSitesPermission=true;

  const prefBefore=model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]).spaces.personal.settings.frequentlyVisitedEnabled;
  topSitesPermission=false;
  for(const listener of events.onPermissionRemoved.listeners) listener({permissions:['topSites']});
  const removedDeadline=Date.now()+1000;
  while(Date.now()<removedDeadline && session.data.get(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)!==true) {
    await new Promise(r=>setTimeout(r,5));
  }
  const suppressed=session.data.get(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)===true;
  const afterRemove=model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]).spaces.personal.settings.frequentlyVisitedEnabled;

  topSitesPermission=true;
  for(const listener of events.onPermissionAdded.listeners) listener({permissions:['topSites']});
  const addedDeadline=Date.now()+1000;
  while(Date.now()<addedDeadline && session.data.get(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)===true) {
    await new Promise(r=>setTimeout(r,5));
  }
  const cleared=session.data.get(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)!==true;
  const afterAdd=model.normalizeState((await local.get(constants.LOCAL_STATE_KEY))[constants.LOCAL_STATE_KEY]).spaces.personal.settings.frequentlyVisitedEnabled;
  assert.equal(prefBefore,true);
  assert.equal(suppressed,true,'permission removal must set the session tombstone');
  assert.equal(afterRemove,true,'permission removal must not rewrite synchronized Show intent');
  assert.equal(cleared,true,'permission restoration must clear the session tombstone');
  assert.equal(afterAdd,true,'permission restoration must not rewrite synchronized Show intent');
  console.log(JSON.stringify({ok:true,suppressed,cleared,prefBefore,afterRemove,afterAdd}));
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
