// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { renderRecoveryCopiesView } from '../src/shared/newtab/recovery-copies-view.js';
import { testFilesForGroup } from '../tools/test-groups.mjs';

const page = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const view = fs.readFileSync('src/shared/newtab/recovery-copies-view.js', 'utf8');

class Node {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.events = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(name, fn) { this.events.set(name, fn); }
  *walk() { yield this; for (const child of this.children) yield* child.walk(); }
}

function fixture(model) {
  const el = () => new Node();
  const ctx = {
    document: { createElement: tag => new Node(tag) },
    recoveryCopiesList: el(), recoveryCopiesSummary: el(),
    recoverySafeCleanupTitle: el(), recoverySafeCleanupDetail: el(),
    recoverySafeCleanupButton: el(), recoverySafeCleanup: el(),
    recoveryCopiesFootnote: el(),
    t: (key, args = {}) => `${key}${args.count == null && args.size == null ? '' : JSON.stringify(args)}`,
    formatLocalizedBytes: value => `${value} bytes`,
    recoveryDeviceDisplayName: device => `${device.deviceName} (${device.deviceId})`,
    recoveryDeviceCopyCountText: n => `${n} copies`,
    formatSyncTime: value => `DATE(${value})`,
    confirmMosaic: async () => true,
    performRecoveryCleanup: () => {},
    setRecoveryCopiesBusy: () => {},
    isRecoveryCopiesBusy: () => false
  };
  renderRecoveryCopiesView(model, ctx);
  return ctx;
}

function functionBody(src, name, next) {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = src.indexOf(next, start);
  assert.ok(end > start, `missing end of ${name}`);
  return src.slice(start, end).trim();
}

test('Slice 11 Recovery DOM builder is a deferred presentation-only ESM, not an eager dependency', () => {
  assert.match(page, /recoveryCopiesRendererPromise \|\|= import\("\.\/recovery-copies-view\.js"\)/);
  assert.doesNotMatch(page, /^import .*recovery-copies-view/m);
  assert.doesNotMatch(page, /className = "recovery-device-card"/, 'Recovery DOM construction should not be duplicated in the eager controller');
  assert.match(view, /export function renderRecoveryCopiesView\(model, context\)/);
  assert.doesNotMatch(view, /browser\.|storage\.|runtime\.|sendSyncMessage|window\.|innerHTML|outerHTML|insertAdjacentHTML/);
  const parsed = JSON.parse(execFileSync(process.execPath, ['tools/critical-path-census.mjs', '--json'], {encoding:'utf8'}));
  // Slice 14 deferred the optional viewport-tooltip module from the Slice 11 25-module graph.
  assert.equal(parsed.moduleEvaluation.staticGraph.moduleCount, 24);
  assert.ok(parsed.moduleEvaluation.staticGraph.rawBytes <= 725000, 'extraction should reclaim at least 3.8 KB of eager source');
  assert.ok(parsed.moduleEvaluation.staticGraph.rawBytes <= 729000, 'original hard startup ceiling remains unchanged');
  assert.ok(!parsed.moduleEvaluation.staticGraph.modules.some(m=>m.path==='newtab/recovery-copies-view.js'));
  assert.ok(parsed.deferredModules.roots.some(m=>m.root==='newtab/recovery-copies-view.js'));
});

test('Slice 11 renders untrusted device metadata safely as text and retains protected generation actions', () => {
  const dangerousName = '<img src=x onerror=alert(1)>';
  const context = fixture({ managedBytes: 600, unmanagedBytes: 25, safeCleanupCount: 2, safeCleanupBytes: 140, devices: [{
    deviceId: 'bad', deviceName: dangerousName, bytes: 500, canRemoveDevice: true,
    generations: [{ latest: true, updatedAt: 100, bytes: 300, canDelete: false },
      { latest: false, updatedAt: 50, bytes: 200, canDelete: true, rootKey: 'previous' }]
  }] });
  assert.equal(context.recoveryCopiesList.children.length, 1);
  const nodes = [...context.recoveryCopiesList.walk()];
  assert.ok(nodes.some(n=>n.textContent.includes(dangerousName)), 'device name must be assigned as literal text');
  assert.ok(nodes.some(n=>n.textContent==='recoveryProtected'), 'latest copy must remain protected');
  assert.ok(nodes.some(n=>n.dataset.recoveryAction==='device'));
  assert.equal(nodes.filter(n=>n.dataset.recoveryAction==='generation').length, 1, 'only previous generation has Delete');
  assert.equal(context.recoverySafeCleanup.hidden, false);
  assert.equal(context.recoverySafeCleanupButton.dataset.recoveryAction,'superseded');
  assert.ok(context.recoveryCopiesSummary.textContent.includes('25 bytes'), 'unmanaged byte count remains visible');
});

test('Slice 11 preserves Recovery cleanup confirmations and payloads', async () => {
  const cleanup = [];
  const confirmations = [];
  const model = { devices: [{deviceId: 'old', deviceName: 'Old', bytes: 90, canRemoveDevice: true,
    generations: [{latest: false, canDelete:true, bytes:40, rootKey:'old-generation'}]}] };
  const ctx = fixture(model);
  ctx.performRecoveryCleanup = payload => cleanup.push(payload);
  ctx.confirmMosaic = async (message, options) => { confirmations.push({message,options}); return true; };
  ctx.recoveryCopiesList.replaceChildren();
  renderRecoveryCopiesView(model, ctx);
  const actions = [...ctx.recoveryCopiesList.walk()].filter(n=>n.events.has('click'));
  assert.equal(actions.length, 2);
  await actions[0].events.get('click')();
  await actions[1].events.get('click')();
  assert.deepEqual(cleanup,[{mode:'device',deviceId:'old'},{mode:'generation',rootKey:'old-generation'}]);
  assert.equal(confirmations.length,2);
  assert.ok(confirmations.every(c=>c.options.danger===true));
});

test('Slice 11 empty Recovery model replaces old rows and hides cleanup', () => {
  const ctx = fixture({ devices: [{deviceId:'x',deviceName:'X',generations:[]}] });
  assert.equal(ctx.recoveryCopiesList.children.length,1);
  renderRecoveryCopiesView({devices:[],safeCleanupCount:0,safeCleanupBytes:0},ctx);
  assert.equal(ctx.recoveryCopiesList.children.length,1);
  assert.equal(ctx.recoveryCopiesList.children[0].className,'recovery-copies-empty');
  assert.equal(ctx.recoverySafeCleanup.hidden,true);
});

test('Slice 11 lazy renderer rejects a previous session after import resolves, but current session renders', async () => {
  let release;
  const pending = new Promise(resolve => release = resolve);
  const calls = [];
  const context = vm.createContext({
    recoveryCopiesRendererPromise: null,
    recoveryCopiesSessionGeneration: 1,
    recoveryCopiesDialog: {open:true},
    deferredImport: () => pending,
    document: {},
    recoveryCopiesList: null, recoveryCopiesSummary: null, recoverySafeCleanupTitle: null,
    recoverySafeCleanupDetail: null, recoverySafeCleanupButton: null,
    recoverySafeCleanup: null, recoveryCopiesFootnote: null,
    t: key => key, formatLocalizedBytes: value => String(value),
    recoveryDeviceDisplayName: () => '', recoveryDeviceCopyCountText: () => '',
    formatSyncTime: () => '', confirmMosaic: async () => false,
    performRecoveryCleanup: () => {},
    setRecoveryCopiesBusy() {},
    recoveryCopiesBusy: false
  });
  const fn = functionBody(page,'renderRecoveryCopies','\n  async function loadRecoveryCopies');
  vm.runInContext(`${fn.replace('import("./recovery-copies-view.js")', 'deferredImport()')}; this.renderRecoveryCopies = renderRecoveryCopies;`,context);
  const old = context.renderRecoveryCopies({id:'OLD'},1);
  context.recoveryCopiesDialog.open=false;
  context.recoveryCopiesSessionGeneration=2;
  context.recoveryCopiesDialog.open=true;
  const fresh = context.renderRecoveryCopies({id:'FRESH'},2);
  release({renderRecoveryCopiesView:(model)=>calls.push(model.id)});
  await Promise.all([old,fresh]);
  assert.deepEqual(calls,['FRESH']);
  context.recoveryCopiesDialog.open=false;
  await context.renderRecoveryCopies({id:'CLOSED'},2);
  assert.deepEqual(calls,['FRESH']);
});

test('Slice 11 awaits the lazy renderer inside both load and cleanup before releasing busy guard', () => {
  const load = functionBody(page,'loadRecoveryCopies','\n  async function performRecoveryCleanup');
  assert.match(load,/await renderRecoveryCopies\(response, sessionGeneration\)/);
  const cleanup = functionBody(page,'performRecoveryCleanup','\n  function shortSyncId');
  assert.match(cleanup,/await renderRecoveryCopies\(response, sessionGeneration\)/);
  assert.match(cleanup,/finally \{[\s\S]*recoveryCopiesCleanupBusy = false/);
});

test('Slice 11 registers the new regressions in startup, New Tab and release test groups', () => {
  for (const group of ['startup','newtab','release']) {
    const list = testFilesForGroup(group);
    assert.ok(list.includes('tests/modernization-slice11-133097.test.mjs'),`missing ${group} registration`);
  }
});
