// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {settingsRefreshDomains} from '../src/shared/newtab/settings-refresh-domains.js';
import {testFilesForGroup} from '../tools/test-groups.mjs';

const source = readFileSync('src/shared/newtab/newtab.js', 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `real owner not found: ${start}`);
  return source.slice(a,b);
}
const loader = extract('  let settingsRefreshDomainsModulePromise = null;', '\n  const bootRenderManifest =');
const opener = extract('  async function openSettings() {', '\n  function updateBackgroundControlLabels()');
const behavior = `${loader.replace('import("./settings-refresh-domains.js")', 'deferredImport()')}\n${opener}\nthis.openSettings = openSettings; this.isComparatorReady = () => typeof settingsRefreshDomainsForOpenPanel === "function";`;

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {resolve = ok; reject = fail;});
  return {promise, resolve, reject};
}
function harness({module = null, styles = null} = {}) {
  const events = [];
  let imports = 0;
  const settingsDialog = {hidden:true, setAttribute(name,value){this[name] = value;}};
  const settingsButton = {setAttribute(name,value){this[name] = value;}};
  const noop = (...args) => {events.push('paint');};
  const context = vm.createContext({
    Promise, TypeError, console,
    settingsDialog, settingsButton,
    state:{settings:{autoSiteIcons:true}},settingsLanguage:{},settingsShortcutOrder:{},settingsShortcutOrderHint:{},
    settingsFrequentlyVisitedDescription:{}, settingsFrequentlyVisitedCountLabel:{},settingsAutoSiteIcons:{},
    meta:{},lastSyncStatus:{},shortcutUsage:{},shortcutOrderMode:'',deferredSettingsControlRefresh:false,
    PRODUCT_NAME:'MosaicSync',
    t:key => key === 'operationFailed' ? 'Translated: couldn\'t complete that operation' : key,
    deferredImport:() => {imports++; return module ? module.promise : Promise.resolve({settingsRefreshDomains});},
    ensureSecondaryStyles: () => {events.push('styles'); return styles ? styles.promise : Promise.resolve();},
    isSettingsOpen:() => !settingsDialog.hidden,
    closeDropChoice:noop,closeFolder:noop,closeDialog:dialog => {dialog.hidden = true;},
    localizeDocument:noop, refreshGridSettingsControls:noop,populateLanguageSelect:noop,
    readShortcutOrderPreference:()=> 'manual',readShortcutUsage:()=>({}),
    refreshSpacesSettings:noop,syncFrequentlyVisitedLocalsFromState:noop,
    refreshFrequentlyVisitedSettingsControls:noop,refreshFrequentlyVisited:()=>Promise.resolve(),
    refreshBackgroundSettingsControls:noop,updateSyncUi:()=>events.push('activate'),
    reconcileAndRefreshSyncStatus:()=>Promise.resolve(), refreshWebAccessUi:()=>Promise.resolve()
  });
  vm.runInContext(behavior,context);
  return {context,events,settingsDialog,open:()=>context.openSettings(),get imports(){return imports;},get loaded(){return context.isComparatorReady();}};
}

test('Slice 17 thrown export getter is normalized to a localized error and keeps Settings closed', async () => {
  const request = deferred(), h = harness({module:request});
  const pending = h.open();
  request.resolve(Object.defineProperty({}, 'settingsRefreshDomains', {get() {throw new Error('secret internal getter diagnostic');}}));
  await assert.rejects(pending, error => error.message === "Translated: couldn't complete that operation");
  assert.equal(h.settingsDialog.hidden, true);
  assert.equal(h.loaded, false);
  assert.equal(h.events.includes('activate'), false, 'no half-open Settings panel');
  await assert.rejects(h.open(), /Translated/);
  assert.equal(h.imports, 1, 'one failed import promise, no repeated lookup until reload');
});

test('Slice 17 getter is read only once, avoiding a second throwing or inconsistent access', async () => {
  const request = deferred(), h = harness({module:request});
  let reads = 0;
  const module = Object.defineProperty({}, 'settingsRefreshDomains', {get() {
    reads++;
    if (reads > 1) throw new Error('second read');
    return settingsRefreshDomains;
  }});
  const opening = h.open();
  request.resolve(module);
  await opening;
  assert.equal(reads, 1);
  assert.equal(h.settingsDialog.hidden, false);
  assert.equal(h.loaded, true);
  assert.equal(h.events.filter(x=>x==='activate').length, 1);
});

test('Slice 17 proxy lookup errors, null module and missing export fail closed with same translated error', async () => {
  for (const invalid of [
    new Proxy({}, {get(_target, key) {if (key === 'settingsRefreshDomains') throw new RangeError('proxy internal detail'); return undefined;}}),
    null, {}, {settingsRefreshDomains:0}
  ]) {
    const request = deferred(), h = harness({module:request});
    const opening = h.open();
    request.resolve(invalid);
    await assert.rejects(opening, error => error.message === "Translated: couldn't complete that operation");
    assert.equal(h.loaded, false);
    assert.equal(h.settingsDialog.hidden, true);
  }
});

test('Slice 17 real comparator remains gated by secondary CSS and maintains one import', async () => {
  const request = deferred(), style = deferred(), h = harness({module:request,styles:style});
  const first = h.open(), second = h.open();
  request.resolve({settingsRefreshDomains});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.loaded,true);
  assert.equal(h.settingsDialog.hidden,true,'do not open before styles resolve');
  style.resolve();
  await Promise.all([first,second]);
  assert.equal(h.settingsDialog.hidden,false);
  assert.equal(h.imports,1);
  assert.equal(h.events.filter(x=>x==='activate').length,1);
  await h.open();
  assert.equal(h.settingsDialog.hidden,true);
});

test('Slice 17 import rejection stays cached and the existing Settings click toast remains wired', async () => {
  const request = deferred(), h = harness({module:request});
  const opening = h.open();
  request.reject(new Error('network offline'));
  await assert.rejects(opening, /network offline/);
  assert.equal(h.settingsDialog.hidden,true);
  await assert.rejects(h.open(), /network offline/);
  assert.equal(h.imports,1);
  assert.match(source,/openSettings\(\)\.catch\(error => showToast\(localizePresentationError\(error, "operationFailed"\)\)\)/);
});

test('Slice 17 retains deferred comparator, unchanged version and startup ceiling', () => {
  const path = JSON.parse(execFileSync(process.execPath,['tools/critical-path-census.mjs','--json'],{encoding:'utf8'}));
  assert.equal(path.moduleEvaluation.staticGraph.moduleCount,24);
  assert.ok(path.moduleEvaluation.staticGraph.rawBytes < 725000);
  assert.ok(path.moduleEvaluation.staticGraph.rawBytes <= 729000);
  assert.ok(!path.moduleEvaluation.staticGraph.modules.some(m=>m.path==='newtab/settings-refresh-domains.js'));
  assert.ok(path.deferredModules.roots.some(m=>m.root==='newtab/settings-refresh-domains.js'));
  assert.match(readFileSync('src/shared/core/constants.js','utf8'),/export const VERSION = "1\.33\.0\.98";/);
});

test('Slice 17 is in startup, New Tab and release test groups', () => {
  for (const group of ['startup','newtab','release'])
    assert.ok(testFilesForGroup(group).includes('tests/modernization-slice17-133097.test.mjs'),group);
});
