import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');

function functionBody(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escape = false, line = false, block = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i], next = source[i+1];
    if (line) { if (ch === '\n') line = false; continue; }
    if (block) { if (ch === '*' && next === '/') { block = false; i++; } continue; }
    if (quote) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { line = true; i++; continue; }
    if (ch === '/' && next === '*') { block = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i+1);
  }
  throw new Error(`unclosed ${name}`);
}
const errorWithCode = code => Object.assign(new Error('RAW PLATFORM diagnostic must not leak'), {code});
function workspaceCtx(failingCode) {
  const pending = { settings: { spaceName: 'Old', multipleSpacesEnabled: false }, settingsModifiedAt: 80, updatedAt: 80 };
  const saved = { spaces: { personal: structuredClone(pending), work: structuredClone(pending) } };
  const trace = [];
  const ctx = vm.createContext({
    state: saved, writeBaseline: { previous: true }, stateMutationGeneration: 0, meta: {},
    nextMutationTime: () => 81,
    replaceWorkspaceTrustedNormalized: (s, id, w) => ({...s, spaces: {...s.spaces, [id]: w}}),
    selectActiveSpaceNormalized: s => s,
    writeActiveSpace: async () => {},
    writeLocalStateWithBaseline: async (candidate, opts) => { trace.push({candidate, opts}); throw errorWithCode(failingCode); },
    presentLocalPersistenceError: e => {e.message = e.code === 'STORAGE_LOCAL_QUOTA_EXCEEDED' ? 'Translated quota warning' : 'Translated unsaved warning'; return e;},
    updateSpaceSwitcher() {}, refreshSpacesSettings() {}, refreshFirstPaintCaches() {},
    applySettings() {}, render() {}, scheduleAppearanceHintRefresh() {},
    Boolean, Number, Object
  });
  vm.runInContext(functionBody('persistWorkspaceSetting') + '\n' + functionBody('setMultipleSpacesEnabled'), ctx);
  return {ctx, trace};
}

test('.43 a Space-name save failure is localized without committing a false durable baseline', async () => {
  const {ctx, trace} = workspaceCtx('STORAGE_LOCAL_QUOTA_EXCEEDED');
  await assert.rejects(() => ctx.persistWorkspaceSetting('work', 'spaceName', 'New name'), e => {
    assert.equal(e.message, 'Translated quota warning');
    assert.equal(e.code, 'STORAGE_LOCAL_QUOTA_EXCEEDED');
    return true;
  });
  assert.equal(ctx.state.spaces.work.settings.spaceName, 'New name');
  assert.ok(ctx.writeBaseline.previous);
  assert.equal(trace.length, 1);
});

test('.43 a multiple-Spaces save failure has localized presentation without advancing baseline', async () => {
  const {ctx, trace} = workspaceCtx('STORAGE_LOCAL_WRITE_FAILED');
  await assert.rejects(() => ctx.setMultipleSpacesEnabled(true), e => {
    assert.equal(e.message, 'Translated unsaved warning');
    assert.equal(e.code, 'STORAGE_LOCAL_WRITE_FAILED');
    return true;
  });
  assert.equal(ctx.state.spaces.personal.settings.multipleSpacesEnabled, true);
  assert.ok(ctx.writeBaseline.previous);
  assert.equal(trace.length, 1);
});

test('.43 both immediate and debounced wallpaper saves show user-visible localized failures', async () => {
  const seen = []; let queued;
  const ctx = vm.createContext({
    backgroundPersistTimer: null,
    clearTimeout() {}, setTimeout(cb) {queued = cb; return 1;},
    saveSettingsState: async () => {throw Error('Translated unsaved warning');},
    showToast: message => seen.push(message), t: key => key,
    console: {error() {throw Error('Unexpected console-only save failure');}}
  });
  vm.runInContext(functionBody('scheduleBackgroundPersist'), ctx);
  ctx.scheduleBackgroundPersist(0);
  await new Promise(setImmediate);
  assert.deepEqual(seen, ['Translated unsaved warning']);
  ctx.scheduleBackgroundPersist(180);
  assert.ok(queued, 'delayed save must be queued');
  queued();
  await new Promise(setImmediate);
  assert.deepEqual(seen, ['Translated unsaved warning', 'Translated unsaved warning']);
});

test('.43 theme-choice save errors are caught and shown, not unhandled', async () => {
  const seen = [];
  let click;
  const button = {dataset: {themeChoice:'dark'}, addEventListener(type, fn) { if (type === 'click') click = fn; }};
  const start = source.lastIndexOf('  themeToggle?.querySelectorAll("[data-theme-choice]")');
  const end = source.indexOf('  let tileSizePersistTimer', start);
  assert.ok(start > 0 && end > start);
  const ctx = vm.createContext({
    themeToggle: {querySelectorAll: () => [button]},
    state: {settings:{theme:'light'}},
    markSettingsChanged() {}, rememberPendingSettings() {}, applyThemeTransition() {},
    saveSettingsState: async () => {throw Error('Translated unsaved warning');},
    showToast: message => seen.push(message), t: key => key,
  });
  vm.runInContext(source.slice(start,end), ctx);
  await click();
  assert.equal(ctx.state.settings.theme, 'dark');
  assert.deepEqual(seen, ['Translated unsaved warning']);
});

test('.43 every folder-rename exit handler surfaces localized save errors', async () => {
  const occurrences = source.match(/commitFolderTitle\(\)\.catch\(error => showToast\(error\?\.message \|\| t\("operationFailed"\)\)\)/g) || [];
  assert.equal(occurrences.length, 4, 'all folder-rename exits must report save failure');
  const line = source.match(/folderTitleInput\.addEventListener\("blur",[^\n]+\);/);
  assert.ok(line);
  const seen = [];
  let blur;
  vm.runInNewContext(line[0], {
    folderTitleInput: {addEventListener(type, cb) { if(type==='blur') blur=cb; }},
    commitFolderTitle: async () => {throw Error('Localized unsaved edit');},
    showToast: msg => seen.push(msg), t: key => key
  });
  blur();
  await new Promise(setImmediate);
  assert.deepEqual(seen, ['Localized unsaved edit']);
});

test('.43 inherits Claude B-1/B-2/B-3 fixes without weakening shortcut policy', () => {
  const bookmarks = fs.readFileSync('src/shared/core/bookmarks.js','utf8');
  const utils = fs.readFileSync('src/shared/newtab/ui-utils.js','utf8');
  const welcome = fs.readFileSync('src/shared/welcome/welcome.js','utf8');
  assert.match(bookmarks, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
  assert.doesNotMatch(bookmarks.slice(bookmarks.indexOf('export function isWebBookmarkUrl'), bookmarks.indexOf('export async function readBookmarkTree')), /username|password/);
  assert.match(utils, /URLs containing a username or password cannot be saved\./);
  assert.match(welcome, /PROFILE_IMPORT_STALE_BASELINE/);
  assert.match(welcome, /discardPendingSourceCandidate\(/);
});
