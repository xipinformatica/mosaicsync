import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Step 7 keeps the built-in icon helper on the classic first-paint path', async () => {
  const html = await read('src/shared/newtab/newtab.html');
  const helper = '<script src="builtin-icons.js"></script>';
  const render = '<script src="render-bootstrap.js"></script>';
  assert.ok(html.includes(helper));
  assert.ok(html.indexOf(helper) < html.indexOf(render), 'built-in icon helper must execute before first-paint render bootstrap');
});

test('Step 7 removes duplicate built-in icon evaluation from the main ES-module graph', async () => {
  const source = await read('src/shared/newtab/newtab.js');
  assert.doesNotMatch(source, /import\s*["']\.\/builtin-icons\.js["'];?/,
    'newtab.js must rely on the already-executed classic first-paint helper instead of evaluating it again as a module');
});

test('authoritative New Tab still consumes the packaged built-in icon global', async () => {
  const source = await read('src/shared/newtab/newtab.js');
  assert.match(source, /globalThis\.__mosaicsyncBuiltinIcons\?\.append/);
});

test('built-in icon helper remains packaged and protected by first-paint coverage', async () => {
  const source = await read('src/shared/newtab/builtin-icons.js');
  assert.match(source, /__mosaicsyncBuiltinIcons/);
  assert.match(source, /Object\.defineProperty\(globalThis, GLOBAL_KEY/);
});


test('Step 7 evidence closes runtime-loading/dead-work phase on the measured duplicate only', async () => {
  const evidence = JSON.parse(await read('docs/SNOW-LEOPARD-II-STEP7-1.33.0.17.json'));
  const roadmap = await read('docs/SNOW-LEOPARD-II.md');
  assert.equal(evidence.version, '1.33.0.17');
  assert.equal(evidence.before.staticModuleCount, 23);
  assert.equal(evidence.after.staticModuleCount, 22);
  assert.equal(evidence.delta.staticModuleCount, -1);
  assert.equal(evidence.delta.staticModuleBytes, -4151);
  assert.equal(evidence.reachabilityAfter.highConfidenceUnreachableSharedModules, 0);
  assert.match(roadmap, /Step 7 — Runtime loading\/dead work: DONE in 1\.33\.0\.17/);
  assert.match(roadmap, /Step 8 — Freeze and adversarial performance audit/);
});
