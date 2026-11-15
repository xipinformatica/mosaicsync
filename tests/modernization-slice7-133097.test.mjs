// @kind behavioral
// Slice 7: one state owner for four explicitly chosen shortcut artwork paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync('src/shared/newtab/newtab.js', 'utf8');

function sharedArtworkSetter() {
  const start = source.indexOf('  function selectExplicitShortcutArtwork(');
  assert.ok(start >= 0, 'the manual artwork state owner must exist');
  const end = source.indexOf('\n  }\n', start);
  assert.ok(end > start, 'the shared function must have a lexical boundary');
  return source.slice(start, end + 5);
}

function createEditorContext() {
  const context = vm.createContext({
    pendingShortcutBuiltinIcon: 'old-icon',
    pendingShortcutImage: 'old-image',
    pendingShortcutSyncData: 'old-derivative',
    pendingShortcutImageKind: 'sync',
    pendingShortcutImageSourceKind: 'firefox',
    pendingShortcutImageSourceUrl: 'https://old.example/icon.png',
    pendingShortcutFaviconPreference: 'old-favicon',
    pendingShortcutImageIsFallback: true,
    shortcutSyncImage: { checked: true },
    shortcutArtworkEdited: false,
    shortcutSyncPrepareGeneration: 17,
    shortcutImageStyle: { value: 'cover' },
    shortcutImageUrl: { value: 'https://keep.example/image.png' }
  });
  vm.runInContext(`${sharedArtworkSetter()}\nthis.selectArtwork = selectExplicitShortcutArtwork;`, context);
  return context;
}

function checkSharedEffects(context, { builtinIcon = '', image = '', sourceKind, sourceUrl = '', faviconPreference = '' }) {
  assert.equal(context.pendingShortcutBuiltinIcon, builtinIcon);
  assert.equal(context.pendingShortcutImage, image);
  assert.equal(context.pendingShortcutSyncData, '');
  assert.equal(context.pendingShortcutImageKind, image ? 'device' : 'none');
  assert.equal(context.pendingShortcutImageSourceKind, sourceKind);
  assert.equal(context.pendingShortcutImageSourceUrl, sourceUrl);
  assert.equal(context.pendingShortcutFaviconPreference, faviconPreference);
  assert.equal(context.pendingShortcutImageIsFallback, false);
  assert.equal(context.shortcutSyncImage.checked, false);
  assert.equal(context.shortcutArtworkEdited, true);
  assert.equal(context.shortcutSyncPrepareGeneration, 17, 'callers retain generation ownership');
  assert.equal(context.shortcutImageStyle.value, 'cover', 'helper must not override image fit');
  assert.equal(context.shortcutImageUrl.value, 'https://keep.example/image.png', 'helper must not clear unrelated URL input');
}

test('Slice 7: built-in icon selection clears stale artwork and retains caller-owned UI fields', () => {
  const ctx = createEditorContext();
  ctx.selectArtwork({ builtinIcon: 'home', sourceKind: 'builtin' });
  checkSharedEffects(ctx, { builtinIcon: 'home', sourceKind: 'builtin' });
});

test('Slice 7: uploaded and detected favicon pixels remain local with distinct discovery preferences', () => {
  const ctx = createEditorContext();
  const pixels = 'data:image/png;base64,AQID';
  ctx.selectArtwork({ image: pixels, sourceKind: 'upload' });
  checkSharedEffects(ctx, { image: pixels, sourceKind: 'upload' });
  ctx.pendingShortcutImage = 'stale';
  ctx.pendingShortcutSyncData = 'stale';
  ctx.shortcutSyncImage.checked = true;
  ctx.selectArtwork({ image: pixels, sourceKind: 'upload', faviconPreference: 'site:example.com' });
  checkSharedEffects(ctx, { image: pixels, sourceKind: 'upload', faviconPreference: 'site:example.com' });
});

test('Slice 7: remote images retain exact source URL but do not auto-enable Sync', () => {
  const ctx = createEditorContext();
  const pixels = 'data:image/webp;base64,AAA';
  const url = 'https://cdn.example/icon.webp';
  ctx.selectArtwork({ image: pixels, sourceKind: 'remote', sourceUrl: url });
  checkSharedEffects(ctx, { image: pixels, sourceKind: 'remote', sourceUrl: url });
});

test('Slice 7: four existing editor paths delegate their identical artwork state but retain local UI work', () => {
  sharedArtworkSetter();
  const sections = [
    ['  function ensureBuiltinShortcutIconPicker()', '  function updateBuiltinShortcutIconSelection()', /selectExplicitShortcutArtwork\(\{ builtinIcon: key, sourceKind: "builtin" \}\)/, /shortcutImageStyle\.value = "contain"/],
    ['  function renderDetectedFaviconChoices(', '  function applyShortcutNamingMode()', /selectExplicitShortcutArtwork\(\{[\s\S]*?image: candidate\.image, sourceKind: "upload",[\s\S]*?faviconPreference: faviconPreferenceForCandidate\(candidate\)/, /for \(const choice of detectedFaviconChoices/],
    ['  shortcutImageFile.addEventListener("change", async () => {', '  function resetShortcutToAutomaticDiscovery()', /selectExplicitShortcutArtwork\(\{ image: optimized, sourceKind: "upload" \}\)/, /generation !== shortcutSyncPrepareGeneration/],
    ['  shortcutWebImageForm\?\.addEventListener("submit", event => {', '  shortcutSyncImage\?\.addEventListener("change",', /selectExplicitShortcutArtwork\(\{ image, sourceKind: "remote", sourceUrl: parsed\.href \}\)/, /generation !== shortcutSyncPrepareGeneration/]
  ];
  for (const [startText, endText, call, responsibility] of sections) {
    const start = source.indexOf(startText), end = source.indexOf(endText, start);
    assert.ok(start >= 0 && end > start, `editor operation must exist: ${startText}`);
    const block = source.slice(start, end);
    assert.match(block, call);
    assert.match(block, responsibility);
    assert.equal((block.match(/selectExplicitShortcutArtwork\(/g) || []).length, 1, 'one state transition per action');
  }
});
