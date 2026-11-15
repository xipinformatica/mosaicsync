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

test('Slice 16 requires a callable Settings comparator export before opening', async () => {
  const module = defer(), h = makeHarness({deferredModule:module});
  const attempt = h.open();
  module.resolve({});
  await assert.rejects(attempt, /translated/);
  assert.equal(h.settingsDialog.hidden,true, 'invalid namespace must never reveal Settings');
  assert.equal(h.ownerLoaded,false, 'do not retain an unusable export');
  assert.equal(h.calls.includes('syncUi'),false, 'no partial Settings activation');
  assert.deepEqual(h.refresh({}),[], 'closed panel stays inert');
  await assert.rejects(h.open(), /translated/);
  assert.equal(h.imports,1, 'failed contract is cached until reload');
});

test('Slice 16 rejects present but non-callable Settings export', async () => {
  for (const invalid of [null, undefined, false, 0, '', {}, []]) {
    const module = defer(), h = makeHarness({deferredModule:module});
    const attempt = h.open();
    module.resolve({settingsRefreshDomains:invalid});
    await assert.rejects(attempt, /translated/);
    assert.equal(h.settingsDialog.hidden,true);
    assert.equal(h.ownerLoaded,false);
    assert.equal(h.calls.includes('syncUi'),false);
  }
});

test('Slice 16 valid function export still opens after CSS and refreshes using real comparator', async () => {
  const module = defer(), css = defer();
  const h = makeHarness({deferredModule:module,deferredStyles:css});
  const first = h.open(), second = h.open();
  module.resolve({settingsRefreshDomains});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.settingsDialog.hidden,true, "module readiness alone must never reveal Settings while CSS is pending");
  css.resolve();
  await Promise.all([first,second]);
  assert.equal(h.ownerLoaded,true);
  assert.equal(h.settingsDialog.hidden,false);
  assert.equal(h.imports,1);
  assert.equal(h.calls.filter(x => x==='syncUi').length,1);
  const echo=structuredClone(h.state);
  const count=h.calls.length;
  assert.deepEqual(h.refresh(echo), []);
  assert.equal(h.calls.length,count,'own-state echo does not paint');
  const before=structuredClone(h.state);
  before.settings.backgroundColor='#000000';
  assert.deepEqual(h.refresh(before),['background']);
  assert.equal(h.calls.filter(x => x==='background').length,2);
});

test('Slice 16 remains deferred, retains same version, and does not raise static source ceiling', () => {
  const parsed=JSON.parse(execFileSync(process.execPath,['tools/critical-path-census.mjs','--json'],{encoding:'utf8'}));
  assert.equal(parsed.moduleEvaluation.staticGraph.moduleCount,24);
  assert.ok(parsed.moduleEvaluation.staticGraph.rawBytes < 725000);
  assert.ok(parsed.moduleEvaluation.staticGraph.rawBytes <= 729000);
  assert.ok(!parsed.moduleEvaluation.staticGraph.modules.some(m=>m.path==='newtab/settings-refresh-domains.js'));
  assert.ok(parsed.deferredModules.roots.some(m=>m.root==='newtab/settings-refresh-domains.js'));
  const constants=readFileSync('src/shared/core/constants.js','utf8');
  assert.match(constants,/export const VERSION = "1\.33\.0\.98";/);
});

test('Slice 16 preserves Settings click error-to-toast path and original comparator source', async () => {
  assert.match(source,/openSettings\(\)\.catch\(error => showToast\(localizePresentationError\(error, "operationFailed"\)\)\)/);
  const {settingsRefreshDomains:exported}=await import('../src/shared/newtab/settings-refresh-domains.js');
  assert.equal(exported,settingsRefreshDomains);
  assert.equal(typeof exported,'function');
});

test('Slice 16 is registered for startup, New Tab, and release regression groups', () => {
  for (const name of ['startup','newtab','release'])
    assert.ok(testFilesForGroup(name).includes('tests/modernization-slice16-133097.test.mjs'),name);
});
