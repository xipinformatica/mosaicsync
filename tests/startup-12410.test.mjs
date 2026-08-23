import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

for (const browser of ['firefox', 'chrome']) {
  test(`${browser}: instant-start scripts are ordered before the heavy UI/module path`, async () => {
    const html = await readFile(resolve(root, `dist/${browser}/newtab/newtab.html`), 'utf8');
    const session = html.indexOf('session-bootstrap.js');
    const appearance = html.indexOf('appearance-bootstrap.js');
    const module = html.indexOf('type="module" src="newtab.js"');
    const gridBootstrap = html.indexOf('render-bootstrap.js');
    const firstDialog = html.indexOf('<dialog');
    assert.ok(session >= 0 && appearance > session && module > appearance);
    assert.ok(gridBootstrap >= 0 && firstDialog > gridBootstrap, 'grid bootstrap should run before hidden dialogs are parsed');
  });

  test(`${browser}: image optimizer is not a static New Tab dependency`, async () => {
    const js = await readFile(resolve(root, `dist/${browser}/newtab/newtab.js`), 'utf8');
    assert.doesNotMatch(js, /^import .*image-optimizer\.js/m);
    assert.match(js, /import\("\.\.\/core\/image-optimizer\.js"\)/);
    assert.match(js, /import\("\.\/render-manifest\.js"\)/);
  });
}

test('first-frame manifest preserves tiny previews by content-addressed identity', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
  };
  const preview = 'data:image/png;base64,AAAA';
  memory.set('mosaicsync.render-manifest.v1', JSON.stringify({
    version: 2,
    shortcuts: [{ type: 'shortcut', id: 'old', imageKey: 'asset-1', preview }]
  }));
  const moduleUrl = pathToFileURL(resolve(root, 'dist/firefox/newtab/render-manifest.js'));
  const manifest = await import(`${moduleUrl.href}?test=${Date.now()}`);
  manifest.seedRenderManifest(null);
  const ok = manifest.persistRenderManifest({
    activeSpaceId: 'personal', updatedAt: 10, settingsModifiedAt: 9,
    settings: { columns: 8, rows: 4, tileSize: 76, brandVisible: true },
    shortcuts: [{ type: 'shortcut', id: 'a', title: 'A', url: 'https://a.test/', position: 0, imageStyle: 'contain', localImageAssetId: 'asset-1' }]
  }, { onboardingCompleted: true });
  assert.equal(ok, true);
  const stored = JSON.parse(memory.get('mosaicsync.render-manifest.v1'));
  assert.equal(stored.version, 2);
  assert.equal(stored.shortcuts[0].preview, preview);
});
