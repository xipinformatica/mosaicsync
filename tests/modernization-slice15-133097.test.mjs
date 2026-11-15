// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {settingsRefreshDomains, synchronizedFrequentlyVisitedSettings as legacyPreference} from '../src/shared/newtab/settings-refresh-domains.js';
import {synchronizedFrequentlyVisitedSettings as leanPreference} from '../src/shared/newtab/frequently-visited-preference.js';
import {testFilesForGroup} from '../tools/test-groups.mjs';

const source = readFileSync('src/shared/newtab/newtab.js', 'utf8');
function extract(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a > -1 && b > a, `actual production owner: ${start}`);
  return source.slice(a, b);
}
const lazyOwner = extract('  let settingsRefreshDomainsModulePromise = null;', '\n  const bootRenderManifest =');
const openOwner = extract('  async function openSettings() {', '\n  function updateBackgroundControlLabels()');
const refreshOwner = extract('  function refreshSettingsControlsAfterExternalState(', '\n  async function openSettings()');
const code = `${lazyOwner.replace('import("./settings-refresh-domains.js")', 'deferredImport()')}\n${refreshOwner}\n${openOwner}\nthis.openSettings = openSettings; this.externalRefresh = refreshSettingsControlsAfterExternalState; this.hasDiffOwner = () => !!settingsRefreshDomainsForOpenPanel;`;

function defer() {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve = yes; reject = no;});
  return {promise,resolve,reject};
}
function makeHarness({deferredModule = null, deferredStyles = null} = {}) {
  const calls = [];
  let imports = 0;
  const settingsDialog = {hidden:true, attrs:{}, setAttribute(k,v) {this.attrs[k]=v;}};
  const settingsButton = {attrs:{}, setAttribute(k,v) {this.attrs[k]=v;}};
  const state = {activeSpaceId:'personal',settings:{columns:5,rows:3,tileSize:70,theme:'light',autoSiteIcons:true,backgroundColor:'#123456',frequentlyVisitedEnabled:false,frequentlyVisitedCount:5},spaces:{personal:{settings:{}},work:{settings:{}}}};
  const mark = name => (...args) => {calls.push(name); return false;};
  const scope = {
    Promise, Set, console,
    state,settingsDialog,settingsButton,
    settingsLanguage:{},settingsShortcutOrder:{},settingsShortcutOrderHint:{},
    settingsFrequentlyVisitedDescription:{},settingsFrequentlyVisitedCountLabel:{},settingsAutoSiteIcons:{},
    shortcutOrderMode:'',shortcutUsage:'',meta:{},lastSyncStatus:{},PRODUCT_NAME:'MosaicSync',
    deferredSettingsControlRefresh:false,
    deferredImport() {imports++; return deferredModule ? deferredModule.promise : Promise.resolve({settingsRefreshDomains});},
    ensureSecondaryStyles() {calls.push('styles'); return deferredStyles ? deferredStyles.promise : Promise.resolve();},
    isSettingsOpen() {return settingsDialog.hidden === false;},
    closeDropChoice:mark('closeDrop'),closeFolder:mark('closeFolder'),
    closeDialog(dialog) {dialog.hidden = true;calls.push('closeDialog');},
    localizeDocument:mark('localize'),refreshGridSettingsControls:mark('grid'),
    populateLanguageSelect:mark('language'),readShortcutOrderPreference:()=> 'manual',
    readShortcutUsage:()=>({}),t:()=> 'translated',refreshSpacesSettings:mark('spaces'),
    syncFrequentlyVisitedLocalsFromState:mark('syncFrequent'),
    refreshFrequentlyVisitedSettingsControls:mark('frequent'),
    refreshFrequentlyVisited:async()=>{},refreshBackgroundSettingsControls:mark('background'),
    updateSyncUi:mark('syncUi'),reconcileAndRefreshSyncStatus:async()=>{},
    refreshWebAccessUi:async()=>{},controlContainsActiveElement:()=>false,
    updateThemeToggle:mark('theme')
  };
  const context = vm.createContext(scope);
  vm.runInContext(code,context);
  return {context,calls,state,settingsDialog,settingsButton,
    open:() => context.openSettings(),
    refresh:before => [...context.externalRefresh(before)],
    get imports() {return imports;},
    get ownerLoaded() {return context.hasDiffOwner();}}
}

test('Slice 15 excludes large settings domain comparison from eager evaluation without changing the fixed ceiling', () => {
  const parsed = JSON.parse(execFileSync(process.execPath,['tools/critical-path-census.mjs','--json'],{encoding:'utf8'}));
  const staticGraph = parsed.moduleEvaluation.staticGraph;
  assert.equal(staticGraph.moduleCount,24);
  assert.ok(staticGraph.rawBytes < 718314, 'Slice 15 must measurably decrease eager source');
  assert.ok(staticGraph.rawBytes <= 725000);
  assert.ok(staticGraph.rawBytes <= 729000);
  assert.ok(staticGraph.modules.some(m=>m.path==='newtab/frequently-visited-preference.js'));
  assert.ok(!staticGraph.modules.some(m=>m.path==='newtab/settings-refresh-domains.js'));
  assert.ok(parsed.deferredModules.roots.some(m=>m.root==='newtab/settings-refresh-domains.js'));
});

test('Slice 15 retains exact previous pure preference and domain-classification behavior', () => {
  assert.equal(leanPreference,legacyPreference, 'single pure source, no duplicated settings interpretation');
  const states = [null,{}, {settings:{frequentlyVisitedEnabled:true,frequentlyVisitedCount:3}}, {spaces:{personal:{settings:{frequentlyVisitedEnabled:true,frequentlyVisitedCount:10}}}}];
  for (const state of states) assert.deepEqual(leanPreference(state),legacyPreference(state));
  const previous = {activeSpaceId:'personal',settings:{columns:5},spaces:{personal:{settings:{}},work:{settings:{}}}};
  const next = structuredClone(previous);
  next.settings.columns = 8;
  assert.deepEqual([...settingsRefreshDomains(previous,next)],['grid']);
});

test('Slice 15 does not import Settings domain logic during initial page bootstrap', () => {
  const h = makeHarness();
  assert.equal(h.imports,0);
  assert.equal(h.ownerLoaded,false);
  assert.equal(h.settingsDialog.hidden,true);
});

test('Slice 15 Settings stays closed until both secondary CSS and actual domain module resolve', async () => {
  const module = defer(), css = defer();
  const h = makeHarness({deferredModule:module,deferredStyles:css});
  const opening = h.open();
  assert.equal(h.imports,1);
  assert.equal(h.ownerLoaded,false);
  assert.equal(h.settingsDialog.hidden,true);
  module.resolve({settingsRefreshDomains});
  await Promise.resolve();
  assert.equal(h.settingsDialog.hidden,true,'cannot reveal with pending styles');
  css.resolve();
  await opening;
  assert.equal(h.ownerLoaded,true);
  assert.equal(h.settingsDialog.hidden,false);
  assert.equal(h.settingsDialog.attrs['aria-hidden'],'false');
  assert.equal(h.settingsButton.attrs['aria-expanded'],'true');
  assert.equal(h.calls.filter(x=>x==='syncUi').length,1);
});

test('Slice 15 duplicate clicks while importing share one import and one panel activation', async () => {
  const module = defer(), h = makeHarness({deferredModule:module});
  const first = h.open(), second = h.open();
  assert.equal(h.imports,1);
  module.resolve({settingsRefreshDomains});
  await Promise.all([first,second]);
  assert.equal(h.calls.filter(x=>x==='syncUi').length,1);
  assert.equal(h.settingsDialog.hidden,false);
  await h.open();
  assert.equal(h.settingsDialog.hidden,true,'normal subsequent click toggles closed');
  await h.open();
  assert.equal(h.settingsDialog.hidden,false);
  assert.equal(h.imports,1,'reopen does not reload the pure comparison module');
});

test('Slice 15 current Settings compares actual state before painting external changes', async () => {
  const h = makeHarness();
  assert.deepEqual(h.refresh({}),[],'closed panel is not touched');
  await h.open();
  const echo = structuredClone(h.state);
  const before = h.calls.length;
  assert.deepEqual(h.refresh(echo),[]);
  assert.equal(h.calls.length,before,'exact own-state echo never changes Settings DOM');
  const old = structuredClone(h.state);
  old.settings.backgroundColor = '#000000';
  assert.deepEqual(h.refresh(old),['background']);
  assert.equal(h.calls.filter(x=>x==='background').length,2,'one open initialization and exactly one background refresh');
  assert.equal(h.calls.filter(x=>x==='grid').length,1,'unrelated grid controls untouched');
});

test('Slice 15 failed deferred module import fails closed and cannot expose uninitialized Settings', async () => {
  const module = defer(), h = makeHarness({deferredModule:module});
  const opening = h.open();
  module.reject(new Error('missing settings chunk'));
  await assert.rejects(opening, /missing settings chunk/);
  assert.equal(h.settingsDialog.hidden,true);
  assert.equal(h.ownerLoaded,false);
  assert.equal(h.imports,1);
  await assert.rejects(h.open(), /missing settings chunk/);
  assert.equal(h.imports,1,'cached rejection does not cause repeated automatic downloads');
  assert.match(source,/openSettings\(\)\.catch\(error => showToast\(localizePresentationError\(error, "operationFailed"\)\)\)/);
});

test('Slice 15 registers new behavior in startup, New Tab, and release regression groups', () => {
  for (const name of ['startup','newtab','release'])
    assert.ok(testFilesForGroup(name).includes('tests/modernization-slice15-133097.test.mjs'),name);
});
