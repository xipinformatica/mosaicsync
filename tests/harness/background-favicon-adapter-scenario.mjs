import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [browserName, scenario] = process.argv.slice(2);
if (!['firefox', 'chrome'].includes(browserName) || !scenario) throw new Error('usage: browser scenario');
const root = resolve(import.meta.dirname, '../..');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function makeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) { listeners.push(fn); },
    removeListener(fn) { const index = listeners.indexOf(fn); if (index >= 0) listeners.splice(index, 1); },
    hasListener(fn) { return listeners.includes(fn); }
  };
}

function makeStorageArea(initial = {}) {
  const data = new Map(Object.entries(clone(initial)));
  return {
    data,
    async get(keys = null) {
      if (keys === null || keys === undefined) return Object.fromEntries([...data].map(([key, value]) => [key, clone(value)]));
      if (typeof keys === 'string') return data.has(keys) ? { [keys]: clone(data.get(keys)) } : {};
      if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) if (data.has(key)) out[key] = clone(data.get(key));
        return out;
      }
      if (typeof keys === 'object') {
        const out = {};
        for (const [key, fallback] of Object.entries(keys)) out[key] = data.has(key) ? clone(data.get(key)) : clone(fallback);
        return out;
      }
      return {};
    },
    async set(items) { for (const [key, value] of Object.entries(items || {})) data.set(key, clone(value)); },
    async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) data.delete(key); },
    async clear() { data.clear(); },
    async getBytesInUse(keys = null) { return Buffer.byteLength(JSON.stringify(await this.get(keys))); }
  };
}

const events = {
  onInstalled: makeEvent(),
  onStartup: makeEvent(),
  onMessage: makeEvent(),
  onStorageChanged: makeEvent(),
  onAlarm: makeEvent(),
  onPermissionAdded: makeEvent(),
  onPermissionRemoved: makeEvent(),
  onTabUpdated: makeEvent(),
  onTabRemoved: makeEvent(),
  onActionClicked: makeEvent()
};
const local = makeStorageArea();
const sync = makeStorageArea();
const session = makeStorageArea();
const alarms = new Map();
const createdTabs = [];
const queryLog = [];
const fetchLog = [];
let websiteAccess = false;
let topSitesPermission = false;
let openTabs = [];
let fetchHandler = async url => { throw new Error(`unexpected fetch: ${url}`); };

globalThis.fetch = async (url, options = {}) => {
  fetchLog.push({ url: String(url), options: clone(options) });
  return fetchHandler(String(url), options);
};

const runtimeId = `mosaicsync-${browserName}-adapter-test`;
const api = {
  runtime: {
    id: runtimeId,
    getURL: path => `${browserName === 'chrome' ? 'chrome-extension' : 'moz-extension'}://${runtimeId}/${String(path).replace(/^\//, '')}`,
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
      if (Array.isArray(request?.permissions) && request.permissions.includes('topSites')) return topSitesPermission;
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async request(request) {
      if (Array.isArray(request?.permissions) && request.permissions.includes('topSites')) return topSitesPermission;
      if (Array.isArray(request?.origins) && request.origins.length) return websiteAccess;
      return false;
    },
    async remove() { websiteAccess = false; return true; }
  },
  tabs: {
    onUpdated: events.onTabUpdated,
    onRemoved: events.onTabRemoved,
    async create(options = {}) { createdTabs.push(clone(options)); return { id: createdTabs.length }; },
    async query(options = {}) { queryLog.push(clone(options)); return clone(openTabs); }
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

const constants = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/constants.js`)).href}?adapter=${Date.now()}`);
const model = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/model.js`)).href}?adapter=${Date.now()}`);

function workspace(shortcuts) {
  return {
    shortcuts,
    settings: { ...constants.DEFAULT_SETTINGS, autoSiteIcons: true },
    settingsModifiedAt: 100,
    updatedAt: 100
  };
}

function shortcut(id, url) {
  return {
    type: 'shortcut', id, title: id, url,
    image: '', imageSyncData: '', imageAssetId: '', localImageAssetId: '',
    imageSyncKind: 'none', imageSourceKind: 'none', imageSourceUrl: '', imageIsFallback: false,
    imageStyle: 'contain', position: 0, createdAt: 100, modifiedAt: 100, source: 'manual'
  };
}

function stateWith(shortcuts) {
  return model.normalizeState({
    schemaVersion: constants.STATE_SCHEMA_VERSION,
    activeSpaceId: 'personal',
    spaces: {
      personal: workspace(shortcuts),
      work: workspace([])
    }
  });
}

async function seedState(shortcuts) {
  const state = stateWith(shortcuts);
  await local.set({
    [constants.LOCAL_STATE_KEY]: state,
    [constants.LOCAL_ACTIVE_SPACE_KEY]: 'personal',
    [constants.LOCAL_META_KEY]: {
      ...constants.DEFAULT_META,
      deviceId: 'adapter-test-device',
      onboardingCompleted: true,
      syncEnabled: false,
      syncInitialized: false,
      syncStatus: 'off'
    }
  });
  return state;
}

function tinyPng(width = 32, height = 32, marker = 0) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes[31] = marker;
  return bytes;
}

function dataUrl(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

function responseBytes(bytes, type = 'image/png', url = '') {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get(name) { const lower = String(name).toLowerCase(); if (lower === 'content-type') return type; if (lower === 'content-length') return String(bytes.length); return null; } },
    body: null,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    async blob() { return new Blob([bytes], { type }); },
    async text() { return new TextDecoder().decode(bytes); }
  };
}

function findShortcut(rawState, id) {
  for (const spaceId of ['personal', 'work']) {
    for (const item of rawState?.spaces?.[spaceId]?.shortcuts || []) {
      if (item?.type === 'shortcut' && item.id === id) return item;
      if (item?.type === 'folder') {
        const child = (item.items || []).find(value => value?.id === id);
        if (child) return child;
      }
    }
  }
  return null;
}

async function readShortcut(id) {
  const stored = await local.get(constants.LOCAL_STATE_KEY);
  return findShortcut(stored?.[constants.LOCAL_STATE_KEY], id);
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolveWait => setTimeout(resolveWait, 20));
  }
  throw new Error(message);
}

// Import the unmodified generated production background only after the fake browser
// surface is complete. These scenarios exist specifically to exercise the real
// shared-core -> real browser-adapter boundary, not a VM copy or mocked adapter.
await import(`${pathToFileURL(resolve(root, `dist/${browserName}/background/background.js`)).href}?favicon-adapter=${encodeURIComponent(scenario)}-${Date.now()}`);
assert.equal(events.onMessage.listeners.length, 1, 'production background should install one runtime message listener');
const send = (message, sender = { id: runtimeId }) => events.onMessage.listeners[0](message, sender);

if (scenario === 'firefox-open-tab-cache') {
  assert.equal(browserName, 'firefox');
  websiteAccess = true;
  await seedState([shortcut('cached', 'https://cached.test/path')]);
  const icon = dataUrl(tinyPng(32, 32, 17));
  openTabs = [{ id: 41, url: 'https://cached.test/other', favIconUrl: icon }];
  fetchHandler = async url => { throw new Error(`network fallback must not run: ${url}`); };

  const result = await send({ type: 'mosaicsync:hydrate-missing-icons', shortcutIds: ['cached'], force: true });
  const learned = await readShortcut('cached');
  assert.equal(result?.hydrated, 1, 'open-tab browser favicon must hydrate the missing shortcut');
  assert.equal(learned?.imageSourceKind, 'browser');
  assert.equal(learned?.imageSourceUrl, '');
  assert.equal(learned?.imageSyncKind, 'device');
  assert.ok(learned?.localImageAssetId, 'browser favicon must become a device-local content-addressed asset');
  assert.ok(queryLog.some(entry => String(entry?.url || '').includes('cached.test')), 'Firefox adapter must query open tabs for the shortcut host');
  assert.equal(fetchLog.length, 0, 'successful Firefox open-tab cache recovery must not fall through to network discovery');
  const asset = (await local.get(`${constants.LOCAL_ASSET_PREFIX}${learned.localImageAssetId}`))[`${constants.LOCAL_ASSET_PREFIX}${learned.localImageAssetId}`];
  assert.match(String(asset || ''), /^data:image\/png;base64,/);
  console.log(JSON.stringify({ ok: true, scenario, hydrated: result.hydrated, queryCount: queryLog.length, fetchCount: fetchLog.length }));
}

else if (scenario === 'firefox-tab-updated-learning') {
  assert.equal(browserName, 'firefox');
  websiteAccess = true;
  const pageUrl = 'https://visited.test/page';
  const faviconUrl = 'https://visited.test/native-icon.png';
  await seedState([shortcut('visited', pageUrl)]);
  openTabs = [];
  fetchHandler = async url => {
    if (url === faviconUrl) return responseBytes(tinyPng(48, 48, 31), 'image/png', url);
    throw new Error(`quality discovery intentionally unavailable: ${url}`);
  };

  const tabId = 73;
  const expected = await send(
    { type: 'mosaicsync:expect-shortcut-navigation', shortcutId: 'visited' },
    { id: runtimeId, tab: { id: tabId } }
  );
  assert.equal(expected?.ok, true);
  assert.ok(events.onTabUpdated.listeners.length >= 1, 'production background must register tab favicon learning');
  const tab = { id: tabId, url: pageUrl, favIconUrl: faviconUrl };
  for (const listener of events.onTabUpdated.listeners) listener(tabId, { status: 'complete', favIconUrl: faviconUrl }, tab);

  const learned = await waitFor(async () => {
    const current = await readShortcut('visited');
    return current?.localImageAssetId ? current : null;
  }, 'real Firefox tabs.onUpdated path did not learn the native favicon');
  assert.equal(learned.imageSourceKind, 'firefox');
  assert.equal(learned.imageSourceUrl, faviconUrl);
  assert.equal(learned.imageSyncKind, 'device');
  assert.ok(fetchLog.some(entry => entry.url === faviconUrl), 'real Firefox adapter must receive and use the core fetchImageDataUrl capability');
  const pending = (await session.get(constants.SESSION_PENDING_NAVIGATIONS_KEY))[constants.SESSION_PENDING_NAVIGATIONS_KEY] || {};
  await waitFor(async () => {
    const value = (await session.get(constants.SESSION_PENDING_NAVIGATIONS_KEY))[constants.SESSION_PENDING_NAVIGATIONS_KEY] || {};
    return !Object.prototype.hasOwnProperty.call(value, String(tabId));
  }, 'successful native favicon learning must clear the durable expected-navigation marker');
  console.log(JSON.stringify({ ok: true, scenario, sourceKind: learned.imageSourceKind, nativeFetches: fetchLog.filter(entry => entry.url === faviconUrl).length, pendingInitially: Object.keys(pending).length }));
}

else if (scenario === 'chrome-store-tab-learning') {
  assert.equal(browserName, 'chrome');
  websiteAccess = false;
  const pageUrl = 'https://chromewebstore.google.com/detail/example/abcdefghijklmnopabcdefghijklmnop';
  const remoteFavicon = 'https://cdn.example.test/store-icon.png';
  await seedState([shortcut('store', pageUrl)]);
  openTabs = [];
  fetchHandler = async url => {
    if (url.startsWith(`chrome-extension://${runtimeId}/_favicon/`)) {
      const parsed = new URL(url);
      const target = parsed.searchParams.get('pageUrl') || '';
      const marker = target.includes('mosaicsync-placeholder-') ? 7 : 11;
      return responseBytes(tinyPng(32, 32, marker), 'image/png', url);
    }
    if (url === remoteFavicon) throw new Error('protected Chrome Web Store favicon URL must not be fetched remotely');
    throw new Error(`unexpected protected-page fetch: ${url}`);
  };

  const tabId = 91;
  const expected = await send(
    { type: 'mosaicsync:expect-shortcut-navigation', shortcutId: 'store' },
    { id: runtimeId, tab: { id: tabId } }
  );
  assert.equal(expected?.ok, true);
  const tab = { id: tabId, url: pageUrl, favIconUrl: remoteFavicon };
  for (const listener of events.onTabUpdated.listeners) listener(tabId, { status: 'complete', favIconUrl: remoteFavicon }, tab);

  const learned = await waitFor(async () => {
    const current = await readShortcut('store');
    return current?.localImageAssetId ? current : null;
  }, 'real Chrome protected-page tab path did not learn a native favicon');
  assert.equal(learned.imageSourceKind, 'firefox', 'legacy cross-browser source kind remains stable for tab-native learning');
  assert.equal(learned.imageSourceUrl, '', 'protected Chrome Web Store artwork must not retain a remote source URL');
  assert.ok(fetchLog.some(entry => entry.url.includes('/_favicon/')), 'Chrome adapter must use the browser-local _favicon endpoint');
  assert.equal(fetchLog.filter(entry => entry.url === remoteFavicon).length, 0, 'protected store remote favicon URL must never be fetched');
  console.log(JSON.stringify({ ok: true, scenario, sourceUrl: learned.imageSourceUrl, nativeFetches: fetchLog.filter(entry => entry.url.includes('/_favicon/')).length, remoteFetches: 0 }));
}

else {
  throw new Error(`unknown scenario: ${scenario}`);
}
