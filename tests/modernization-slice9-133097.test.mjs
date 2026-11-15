// @kind behavioral
// Private modernization Slice 9: device-artwork UI cache utilities are directly
// testable; the controller alone retains storage authority and DOM ownership.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath = '../src/shared/newtab/ui-utils.js';
const source = () => fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const utilities = async () => import(modulePath);
const shortcut = (overrides = {}) => ({
  type: 'shortcut', id: 'card', title: 'Card', url: 'https://example.org/',
  position: 0, createdAt: 5, modifiedAt: 7, imageStyle: 'contain', source: 'manual',
  builtinIcon: '', colorTag: '', spaceMoveAt: 0, image: '', imageSyncData: '',
  localImageAssetId: '', imageAssetId: '', imageSyncKind: 'none',
  imageSourceKind: 'none', imageSourceUrl: '', imageIsFallback: false, ...overrides
});

// Actual exported code is called in all cases, not source-extracted copies.
test('Slice 9 keeps the artwork fast-path helpers independently callable without the page', async () => {
  const m = await utilities();
  for (const name of [
    'workspaceBackgroundVisualSignature', 'sameBackgroundVisuals',
    'collectWorkspaceShortcutRecords', 'sameShortcutCoreShape', 'copyDeviceArtwork'
  ]) assert.equal(typeof m[name], 'function', `missing ${name}`);
  assert.match(source(), /tryApplyDeviceArtworkOnlyChange\(incoming, state\)/);
});

test('Slice 9 compares every wallpaper visual field while ignoring unrelated settings', async () => {
  const { sameBackgroundVisuals, workspaceBackgroundVisualSignature } = await utilities();
  const fields = ['backgroundImage', 'backgroundAssetId', 'backgroundImageKind', 'backgroundSourceKind',
    'backgroundSourceUrl', 'backgroundPreset', 'themeWallpapersEnabled',
    'lightBackgroundPreset', 'darkBackgroundPreset'];
  const base = { settings: {} };
  const baseline = workspaceBackgroundVisualSignature(base);
  assert.equal(baseline.length, fields.length);
  assert.equal(sameBackgroundVisuals(base, { settings: { tileSize: 92 } }), true);
  for (const key of fields) {
    const altered = { settings: { [key]: key === 'themeWallpapersEnabled' ? true : 'different' } };
    assert.equal(sameBackgroundVisuals(base, altered), false, `${key} not compared`);
  }
});

test('Slice 9 wallpaper defaults preserve the old null, empty and false equivalence', async () => {
  const { sameBackgroundVisuals, workspaceBackgroundVisualSignature } = await utilities();
  assert.equal(sameBackgroundVisuals(null, { settings: { backgroundImageKind: 'none', backgroundSourceKind: 'none' } }), true);
  assert.equal(sameBackgroundVisuals({ settings: { themeWallpapersEnabled: false } }, { settings: {} }), true);
  assert.deepEqual(workspaceBackgroundVisualSignature(null), workspaceBackgroundVisualSignature({ settings: {} }));
});

test('Slice 9 flattens top-level and folder children with the same parent ownership', async () => {
  const { collectWorkspaceShortcutRecords } = await utilities();
  const top = shortcut({ id: 'top' });
  const child = shortcut({ id: 'child' });
  const folder = { type: 'folder', id: 'folder', title: 'Folder', items: [child] };
  const records = collectWorkspaceShortcutRecords({ shortcuts: [top, folder] });
  assert.equal(records.size, 3);
  assert.equal(records.get('top').parentFolderId, '');
  assert.equal(records.get('folder').type, 'folder');
  assert.equal(records.get('child').type, 'shortcut');
  assert.equal(records.get('child').parentFolderId, 'folder');
  assert.strictEqual(records.get('child').item, child);
});

test('Slice 9 rejects folder moves, structural edits and clock changes', async () => {
  const { sameShortcutCoreShape } = await utilities();
  const first = shortcut();
  assert.equal(sameShortcutCoreShape(first, { ...first, image: 'new image' }, '', ''), true);
  assert.equal(sameShortcutCoreShape(first, { ...first }, '', 'folder'), false);
  for (const key of ['id','title','url','position','createdAt','modifiedAt','builtinIcon',
    'colorTag','spaceMoveAt','imageStyle','source']) {
    const candidate = { ...first, [key]: typeof first[key] === 'number' ? first[key] + 1 : `different-${key}` };
    assert.equal(sameShortcutCoreShape(first, candidate, '', ''), false, `structural ${key} changed`);
  }
});

test('Slice 9 retains folder-child count comparison independent of visual image fields', async () => {
  const { sameShortcutCoreShape } = await utilities();
  const folder = { type: 'folder', id: 'folder', title: 'Folder', position: 0,
    createdAt: 5, modifiedAt: 7, items: [shortcut()] };
  assert.equal(sameShortcutCoreShape(folder, { ...folder, items: [shortcut({ image: 'replaced' })] }, '', ''), true);
  assert.equal(sameShortcutCoreShape(folder, { ...folder, items: [] }, '', ''), false);
  assert.equal(sameShortcutCoreShape(folder, shortcut({ id: 'folder' }), '', ''), false);
});

test('Slice 9 copies exactly the original eight disposable artwork fields', async () => {
  const { copyDeviceArtwork } = await utilities();
  const before = shortcut();
  const next = shortcut({
    title: 'not-authoritative', url: 'https://new.example/', image: 'data:image/png;base64,AA',
    localImageAssetId: 'local-1', imageSyncData: 'sync-1', imageAssetId: 'remote-1',
    imageSyncKind: 'device', imageSourceKind: 'favicon',
    imageSourceUrl: 'https://example.org/favicon.ico', imageIsFallback: true
  });
  assert.equal(copyDeviceArtwork(before, next), true);
  for (const key of ['image','localImageAssetId','imageSyncData','imageAssetId',
    'imageSyncKind','imageSourceKind','imageSourceUrl','imageIsFallback']) assert.equal(before[key], next[key]);
  assert.equal(before.title, 'Card');
  assert.equal(before.url, 'https://example.org/');
  assert.equal(copyDeviceArtwork(before, next), false, 'second copy must be a no-op');
});

test('Slice 9 keeps authority checks and visible-DOM patching inside the controller', async () => {
  await utilities();
  const controller = source();
  assert.match(controller, /localStateSyncClockSignature\(rawIncoming\)/);
  assert.match(controller, /localStateSyncRawSignature\(rawIncoming\)/);
  assert.match(controller, /sameBackgroundVisuals\(currentWorkspace, incomingWorkspace\)/);
  assert.match(controller, /copyDeviceArtwork\(currentRecord\.item, incomingRecord\.item\)/);
  assert.match(controller, /patchVisibleShortcutArtwork\(changedActiveShortcuts, changedActiveFolders\)/);
  assert.match(controller, /refreshRenderManifestAfterArtworkChange\(state, meta\)/);
});
