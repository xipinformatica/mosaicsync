// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_STATE, LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY } from '../src/shared/core/constants.js';
import { normalizeState, selectActiveSpaceNormalized, normalizeMeta } from '../src/shared/core/model.js';

const source = fs.readFileSync(new URL('../src/shared/newtab/newtab.js', import.meta.url), 'utf8');
const clone = value => structuredClone(value);

// Run the real UI handlers and real saveState/re-adoption code, with a controlled
// persistence boundary. No mock replacement of the handlers under test.
function extract(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const open = source.indexOf(') {', start) + 2;
  assert.ok(open > start);
  let depth = 0, quote = '', escape = false, comment = false;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (comment) { if (c === '\n') comment = false; continue; }
    if (quote) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { comment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`unterminated ${name}`);
}

function profileWithShortcuts() {
  const base = normalizeState(DEFAULT_STATE);
  base.spaces.personal.shortcuts = [
    { type: 'shortcut', id: 'a', title: 'Alpha', url: 'https://a.test/', position: 0, createdAt: 100, modifiedAt: 100, source: 'manual' },
    { type: 'shortcut', id: 'b', title: 'Beta', url: 'https://b.test/', position: 1, createdAt: 100, modifiedAt: 100, source: 'manual' }
  ];
  return selectActiveSpaceNormalized(base, 'personal');
}
function profileWithFolder() {
  const base = profileWithShortcuts();
  const [a, b] = base.shortcuts;
  base.shortcuts = [{ type: 'folder', id: 'folder-1', title: 'Old name', items: [{ ...a, position: 0 }, { ...b, position: 1 }], position: 0, createdAt: 100, modifiedAt: 100 }];
  return selectActiveSpaceNormalized(normalizeState(base), 'personal');
}
function harness(initial, { failWrite = 1, ambiguousWrite = false, failRecoveryRead = false, concurrentChange = null } = {}) {
  const local = { [LOCAL_STATE_KEY]: clone(initial), [LOCAL_ACTIVE_SPACE_KEY]: 'personal', [LOCAL_META_KEY]: { deviceId: 'device-1' } };
  let writes = 0, reads = 0, idCounter = 0;
  const ctx = {
    browser: { storage: { local: { get: async keys => {
      reads += 1;
      if (failRecoveryRead && reads === 1) throw Error('recovery read failed');
      return Object.fromEntries(keys.map(key => [key, clone(local[key])]));
    } } } },
    LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY,
    rawStateMultipleSpacesEnabled: state => state.spaces?.personal?.settings?.multipleSpacesEnabled !== false,
    SPACE_IDS: ['personal', 'work'], normalizeState, selectActiveSpaceNormalized, normalizeMeta,
    hydratePersistedState: async raw => clone(raw), createPersistedWriteBaseline: clone, DEFAULT_STATE,
    ERROR_CODES: { STORAGE_LOCAL_QUOTA_EXCEEDED: 'quota', STORAGE_LOCAL_WRITE_FAILED: 'write' },
    state: clone(initial), writeBaseline: clone(initial), meta: { deviceId: 'device-1' },
    stateMutationGeneration: 0, persistedStateChangeGeneration: 0, failedShortcutRecoveryPending: false,
    nextMutationTime: () => Date.now(), repairTopLevelPositionsWithinCapacity: items => items, visibleTopLevelCapacity: () => 64,
    pendingSettingsDraft: new Map(), applyPendingSettingsDraft() {}, syncFrequentlyVisitedLocalsFromState() {},
    refreshSettingsControlsAfterExternalState() {}, reconcileLauncherAfterExternalState() {}, updateSpaceSwitcher() {},
    scheduleAppearanceHintRefresh() {}, refreshFirstPaintCaches() {}, scheduleRenderPreviewRefresh() {},
    settlePersistedSettingsDraft() {}, refreshRenderManifestAfterArtworkChange() {},
    t: key => key, console: { warn() {} }, PRODUCT_NAME: 'MosaicSync',
    getTopLevelItem: id => ctx.state.shortcuts.find(item => item.id === id),
    uid: () => `new-folder-${++idCounter}`, now: () => Date.now(), render() {},
    document: { querySelector() { return null; } }, CSS: { escape: value => value }, setTimeout() {},
    activeFolderId: 'folder-1', folderTitleInput: { value: 'New name' },
    persistenceGateway: { async commitWithBaseline(next) {
      writes += 1;
      if (writes === failWrite) {
        if (concurrentChange) concurrentChange(local[LOCAL_STATE_KEY]);
        if (ambiguousWrite) local[LOCAL_STATE_KEY] = clone(next);
        throw Error('simulated storage.local.set rejection');
      }
      local[LOCAL_STATE_KEY] = clone(next);
      return { state: clone(next), compactBaseline: clone(next) };
    } }
  };
  vm.createContext(ctx);
  vm.runInContext([
    extract('presentLocalPersistenceError'),
    extract('reAdoptDurableShortcutStateAfterFailure'),
    extract('saveState'),
    extract('createFolderFromShortcuts'),
    extract('commitFolderTitle'),
    'this.save = saveState; this.createFolder = createFolderFromShortcuts; this.renameFolder = commitFolderTitle;'
  ].join('\n'), ctx);
  return { ctx, local, get durable() { return local[LOCAL_STATE_KEY]; }, get writes() { return writes; } };
}

function ids(state) { return state.shortcuts.map(item => item.id).sort(); }
function addUnrelated(state) { state.settings.theme = 'dark'; }

test('Stage 2C: failed folder creation cannot ride a later unrelated settings save', async () => {
  const h = harness(profileWithShortcuts());
  await assert.rejects(h.ctx.createFolder('a', 'b'), /simulated storage/);
  assert.deepEqual(ids(h.durable), ['a', 'b']);
  assert.deepEqual(ids(h.ctx.state), ['a', 'b'], 'failed create must re-adopt durable layout');
  addUnrelated(h.ctx.state);
  await h.ctx.save();
  assert.deepEqual(ids(h.durable), ['a', 'b'], 'unrelated save must not commit hidden folder');
  await h.ctx.createFolder('a', 'b');
  assert.equal(h.durable.shortcuts.length, 1);
  assert.equal(h.durable.shortcuts[0].type, 'folder');
  assert.deepEqual(h.durable.shortcuts[0].items.map(x => x.id), ['b', 'a']);
});

test('Stage 2C: failed folder rename cannot be committed by a later unrelated save', async () => {
  const h = harness(profileWithFolder());
  await assert.rejects(h.ctx.renameFolder(), /simulated storage/);
  assert.equal(h.durable.shortcuts[0].title, 'Old name');
  assert.equal(h.ctx.state.shortcuts[0].title, 'Old name');
  addUnrelated(h.ctx.state);
  await h.ctx.save();
  assert.equal(h.durable.shortcuts[0].title, 'Old name');
});

test('Stage 2C: ambiguous folder creation adopts exactly the committed folder and no ghost', async () => {
  const h = harness(profileWithShortcuts(), { ambiguousWrite: true });
  await assert.rejects(h.ctx.createFolder('a', 'b'), /simulated storage/);
  assert.equal(h.durable.shortcuts.length, 1);
  assert.equal(h.ctx.state.shortcuts.length, 1);
  assert.equal(h.ctx.state.shortcuts[0].id, h.durable.shortcuts[0].id);
  assert.equal(h.durable.shortcuts[0].items.length, 2);
});

test('Stage 2C: concurrent other-tab commit survives failed folder creation', async () => {
  const h = harness(profileWithShortcuts(), { concurrentChange: raw => {
    raw.spaces.personal.shortcuts[0].title = 'Other tab rename';
    raw.shortcuts[0].title = 'Other tab rename';
  } });
  await assert.rejects(h.ctx.createFolder('a', 'b'), /simulated storage/);
  assert.deepEqual(ids(h.ctx.state), ['a', 'b']);
  assert.equal(h.ctx.state.shortcuts[0].title, 'Other tab rename');
  addUnrelated(h.ctx.state);
  await h.ctx.save();
  assert.equal(h.durable.shortcuts[0].title, 'Other tab rename');
});

test('Stage 2C: failed recovery read prevents the next unrelated save from publishing a ghost folder', async () => {
  const h = harness(profileWithShortcuts(), { failRecoveryRead: true });
  await assert.rejects(h.ctx.createFolder('a', 'b'), /simulated storage/);
  assert.equal(h.ctx.failedShortcutRecoveryPending, true);
  addUnrelated(h.ctx.state);
  await assert.rejects(h.ctx.save(), /localSaveFailedUnsaved/);
  assert.deepEqual(ids(h.durable), ['a', 'b']);
  assert.equal(h.ctx.failedShortcutRecoveryPending, false);
});

test('Stage 2C: all structural mutation save sites explicitly enable durable recovery', () => {
  // Verify the concrete call sites, not merely the existence of the helper.
  const functions = [
    'createFolderFromShortcuts', 'addTopLevelShortcutToFolder',
    'commitBookmarkShortcutDrop', 'commitFolderTitle'
  ];
  for (const name of functions) assert.match(extract(name), /await saveState\(\{ recoverOnFailure: true \}\);/, name);
  assert.match(source, /folder\.items\.splice\(from, 1\);[\s\S]{0,650}await saveState\(\{ recoverOnFailure: true \}\);/);
  assert.match(source, /ungroupFolderButton\.addEventListener\("click", async \(\) => \{[\s\S]{0,2000}await saveState\(\{ recoverOnFailure: true \}\);/);
  assert.match(source, /dropMoveButton\.addEventListener\("click", async \(\) => \{[\s\S]{0,400}await saveState\(\{ recoverOnFailure: true \}\);/);
});
