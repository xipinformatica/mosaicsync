// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { testFilesForGroup } from '../tools/test-groups.mjs';

const source = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const css = fs.readFileSync('src/shared/newtab/newtab-critical.css', 'utf8');
const marker = 'function activateViewportTooltipsOnFirstIntent() {';
const at = source.indexOf(marker);
const end = source.indexOf('\n  activateViewportTooltipsOnFirstIntent();', at);
assert.ok(at > 0 && end > at, 'extract actual production tooltip bootstrap');
const bootstrap = source.slice(at, end).replace('import("../core/viewport-tooltip.js")', 'deferredImport()');

function harness({ hover = false, focus = false, load = null } = {}) {
  const callbacks = new Map();
  const events = [];
  const anchor = { closest: () => wrapper };
  const wrapper = {
    matches(query) { assert.equal(query, ':hover'); return hover; },
    contains(node) { return focus && node === anchor; },
    dispatchEvent(event) { events.push(event.type); return true; }
  };
  const document = {
    activeElement: anchor,
    addEventListener(type, fn, capture) { assert.equal(capture, true); callbacks.set(type, fn); },
    removeEventListener(type, fn, capture) { assert.equal(capture, true); assert.equal(callbacks.get(type), fn); callbacks.delete(type); },
    querySelectorAll(selector) { assert.equal(selector, '.sync-help-wrap'); return [wrapper]; }
  };
  const installs = [];
  let imports = 0;
  const module = { installViewportTooltips(doc, options) { installs.push({doc, options}); } };
  const deferredImport = () => { imports++; return load ? load(module) : Promise.resolve(module); };
  const context = vm.createContext({ document, deferredImport, Event: class { constructor(type) { this.type = type; } } });
  vm.runInContext(`${bootstrap}\nactivateViewportTooltipsOnFirstIntent()`, context);
  return {
    callbacks, events, installs, wrapper, anchor,
    get imports() { return imports; },
    intent(kind = 'pointerover', target = anchor) { const fn = callbacks.get(kind); if (fn) fn({ target }); },
    move({ hovered = hover, focused = focus } = {}) { hover = hovered; focus = focused; }
  };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('Slice 14 removes tooltip portal logic from the eager graph, retaining original module bytes', () => {
  assert.doesNotMatch(source, /^import\s*\{\s*installViewportTooltips\s*\}\s*from/m);
  assert.match(source, /import\("\.\.\/core\/viewport-tooltip\.js"\)/);
  const census = JSON.parse(execFileSync(process.execPath, ['tools/critical-path-census.mjs', '--json'], { encoding: 'utf8' }));
  const graph = census.moduleEvaluation.staticGraph;
  assert.equal(graph.moduleCount, 24);
  assert.ok(graph.rawBytes <= 725000);
  assert.ok(graph.rawBytes <= 729000);
  assert.ok(!graph.modules.some(item => item.path === 'core/viewport-tooltip.js'));
  assert.ok(census.deferredModules.roots.some(item => item.root === 'core/viewport-tooltip.js'));
});

test('Slice 14 only loads on help control intent, not unrelated activity', async () => {
  const h = harness();
  assert.equal(h.imports, 0);
  assert.equal(h.installs.length, 0);
  h.intent('pointerover', { closest: () => null });
  h.intent('focusin', { closest: () => null });
  await settle();
  assert.equal(h.imports, 0);
  assert.equal(h.callbacks.size, 2);
});

test('Slice 14 first pointer intent installs the original portal and replays ongoing hover', async () => {
  const h = harness({hover:true});
  h.intent();
  assert.equal(h.imports,1);
  await settle();
  assert.equal(h.installs.length,1);
  assert.equal(h.installs[0].options.wrapperSelector, '.sync-help-wrap');
  assert.equal(h.installs[0].options.tooltipSelector, '.sync-help-tooltip');
  assert.deepEqual(h.events,['pointerenter']);
  assert.equal(h.callbacks.size,0);
});

test('Slice 14 keyboard focus intent replays ongoing focus for accessibility', async () => {
  const h = harness({focus:true});
  h.intent('focusin');
  await settle();
  assert.equal(h.imports,1);
  assert.equal(h.installs.length,1);
  assert.deepEqual(h.events,['focusin']);
});

test('Slice 14 never resurrects a tooltip after pointer/focus leaves during import', async () => {
  let resolve;
  const h = harness({hover:true, focus:true, load:() => new Promise(r => resolve=r)});
  h.intent();
  h.move({hovered:false,focused:false});
  resolve({installViewportTooltips:(doc, options)=>h.installs.push({doc,options})});
  await settle();
  assert.equal(h.installs.length,1);
  assert.deepEqual(h.events,[]);
});

test('Slice 14 concurrent input gestures start exactly one import', async () => {
  let resolve;
  const h = harness({hover:true,focus:true,load:() => new Promise(r => resolve=r)});
  h.intent('pointerover');
  h.intent('focusin');
  assert.equal(h.imports,1);
  resolve({installViewportTooltips:(doc, options)=>h.installs.push({doc,options})});
  await settle();
  assert.equal(h.installs.length,1);
  assert.deepEqual(h.events,['pointerenter','focusin']);
});

test('Slice 14 failed optional module import does not loop or block CSS fallback', async () => {
  const h = harness({hover:true, load: () => Promise.reject(new Error('missing chunk'))});
  h.intent();
  await settle();
  h.intent();
  assert.equal(h.imports,1);
  assert.equal(h.installs.length,0);
  assert.equal(h.callbacks.size,0);
  assert.match(css,/\.sync-help-wrap:hover \.sync-help-tooltip/);
  assert.match(css,/\.sync-help-wrap:focus-within \.sync-help-tooltip/);
});

test('Slice 14 new regression registered in startup, New Tab and release groups', () => {
  for (const group of ['startup','newtab','release']) {
    assert.ok(testFilesForGroup(group).includes('tests/modernization-slice14-133097.test.mjs'), group);
  }
});
