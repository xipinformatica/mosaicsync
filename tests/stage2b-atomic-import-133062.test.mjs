// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, DEFAULT_META, LOCAL_META_KEY, LOCAL_STATE_KEY, LOCAL_CUSTOM_BRANDING_KEY, LOCAL_PENDING_SYNC_MUTATION_KEY, LOCAL_ASSET_INDEX_KEY } from '../src/shared/core/constants.js';
import { normalizeState, stampImportedProfileState } from '../src/shared/core/model.js';
import { ensureLocalStorage, writeLocalState, writeLocalStateWithBaseline } from '../src/shared/core/storage.js';
import { normalizeCustomBranding, writeCustomBranding } from '../src/shared/core/custom-branding.js';
import { createNewTabPersistenceGateway } from '../src/shared/newtab/persistence-gateway.js';
import { TINY_PNG } from './harness/raster-fixtures.mjs';

const copy = value => structuredClone(value);
const branding = text => ({ schemaVersion: 1, enabled: true, text, logo: '' });
function profile(label, image = '') {
  const s = normalizeState(DEFAULT_STATE);
  s.spaces.personal.settings.spaceName = label;
  s.spaces.personal.settingsModifiedAt = 10;
  s.spaces.personal.updatedAt = 10;
  s.spaces.personal.shortcuts = [{ type: 'shortcut', id: label, title: label,
    url: 'https://example.org/', position: 0, createdAt: 10, modifiedAt: 10,
    image, imageSourceKind: image ? 'upload' : 'none', imageSyncKind: image ? 'device' : 'none', source: 'manual' }];
  return normalizeState(s);
}
class Area {
  data = {};
  calls = [];
  fault = '';
  limit = Infinity;
  async get(keys) {
    if (keys == null) return copy(this.data);
    const out = {};
    for (const k of typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)) {
      if (Object.hasOwn(this.data, k)) out[k] = copy(this.data[k]);
    }
    return out;
  }
  async set(items) {
    const keys = Object.keys(items);
    this.calls.push(keys);
    const next = { ...this.data, ...copy(items) };
    const size = Object.entries(next).reduce((n,[k,v])=>n+Buffer.byteLength(k)+Buffer.byteLength(JSON.stringify(v)),0);
    if (this.fault === 'before' && keys.includes(LOCAL_STATE_KEY)) { this.fault = ''; throw new Error('I/O error: before commit'); }
    if (size > this.limit) throw new Error('QUOTA_BYTES quota exceeded');
    this.data = next;
    if (this.fault === 'after' && keys.includes(LOCAL_STATE_KEY)) { this.fault = ''; throw new Error('I/O error: after commit'); }
  }
  async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete this.data[k]; }
}
async function setup({ withImage = false, syncEnabled = false } = {}) {
  const local = new Area();
  globalThis.browser = { storage: { local, session: new Area() } };
  await writeLocalState(profile('Old', withImage ? TINY_PNG : ''));
  await writeCustomBranding(branding('Old branding'));
  if (syncEnabled) local.data[LOCAL_META_KEY] = { ...DEFAULT_META, deviceId: "stage2b-test", syncEnabled: true, syncInitialized: true };
  const baseline = (await ensureLocalStorage({ hydrateAssets: 'all' })).compactBaseline;
  local.calls = [];
  const gateway = createNewTabPersistenceGateway(writeLocalStateWithBaseline);
  const imported = stampImportedProfileState(profile('New', withImage ? TINY_PNG : ''), (await ensureLocalStorage({ hydrateAssets: 'all' })).state);
  return { local, baseline, gateway, imported };
}
async function importProfile(fixture) {
  return fixture.gateway.commitImportedProfile(fixture.imported, fixture.baseline, branding('New branding'));
}
const check = (local, name, brand) => {
  assert.equal(local.data[LOCAL_STATE_KEY].spaces.personal.settings.spaceName, name);
  assert.equal(local.data[LOCAL_CUSTOM_BRANDING_KEY].text, brand);
};

test('C1 real persistence: profile, branding, assets and pending Sync journal share exactly one commit', async () => {
  const f = await setup({ withImage: true, syncEnabled: true });
  const result = await importProfile(f);
  check(f.local, 'New', 'New branding');
  assert.equal(result.state.spaces.personal.settings.spaceName, 'New');
  const batches = f.local.calls.filter(keys => keys.includes(LOCAL_STATE_KEY));
  assert.equal(batches.length, 1);
  assert.ok(batches[0].includes(LOCAL_CUSTOM_BRANDING_KEY));
  assert.ok(batches[0].includes(LOCAL_ASSET_INDEX_KEY));
  assert.ok(batches[0].includes(LOCAL_PENDING_SYNC_MUTATION_KEY));
  assert.equal(f.local.calls.filter(keys => keys.includes(LOCAL_CUSTOM_BRANDING_KEY)).length, 1);
});

test('C1 rejected profile batch cannot publish branding or any profile key', async () => {
  const f = await setup({ withImage: true });
  const before = copy(f.local.data);
  f.local.fault = 'before';
  await assert.rejects(importProfile(f), /I\/O error|write/i);
  assert.deepEqual(f.local.data, before);
  check(f.local, 'Old', 'Old branding');
});

test('C1 ambiguous commit cannot mix new profile with old branding', async () => {
  const f = await setup();
  f.local.fault = 'after';
  await assert.rejects(importProfile(f), /I\/O error|write/i);
  check(f.local, 'New', 'New branding');
  assert.equal(f.local.calls.filter(keys => keys.includes(LOCAL_STATE_KEY) && keys.includes(LOCAL_CUSTOM_BRANDING_KEY)).length, 1);
});

test('C1 rejected stale import preserves second tab changes AND branding', async () => {
  const f = await setup();
  await writeLocalState(profile('Newer tab'));
  const before = copy(f.local.data);
  await assert.rejects(importProfile(f), e => e?.code === 'PROFILE_IMPORT_STALE_BASELINE');
  assert.deepEqual(f.local.data, before);
  check(f.local, 'Newer tab', 'Old branding');
});

test('C1 storage quota rejection preserves the complete original storage', async () => {
  const f = await setup({ withImage: true });
  const before = copy(f.local.data);
  const bytes = Object.entries(before).reduce((n,[k,v])=>n+Buffer.byteLength(k)+Buffer.byteLength(JSON.stringify(v)),0);
  f.local.limit = bytes + 50;
  await assert.rejects(importProfile(f), /quota|QUOTA|write/i);
  assert.deepEqual(f.local.data, before);
  check(f.local, 'Old', 'Old branding');
});

test('C1 import branding is strictly validated before any durable mutation', async () => {
  const f = await setup();
  const before = copy(f.local.data);
  await assert.rejects(f.gateway.commitImportedProfile(f.imported, f.baseline, { enabled: true, text: 'x'.repeat(121) }), /too long/i);
  assert.deepEqual(f.local.data, before);
  assert.equal(f.local.calls.length, 0);
});

test('C1 ordinary shortcut save does not overwrite branding or add a branding write', async () => {
  const f = await setup();
  await writeLocalState(profile('Normal edit'));
  check(f.local, 'Normal edit', 'Old branding');
  assert.ok(f.local.calls.every(keys => !keys.includes(LOCAL_CUSTOM_BRANDING_KEY)));
});
