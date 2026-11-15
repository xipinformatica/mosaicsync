// @kind behavioral
// Private Slice 10: an artwork-only storage fast path must validate every
// Space before it can mutate any live artwork, and must respect Sync authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  sameBackgroundVisuals, collectWorkspaceShortcutRecords, sameShortcutCoreShape,
  copyDeviceArtwork, manualGridRenderEquivalent
} from '../src/shared/newtab/ui-utils.js';

const source = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const begin = source.indexOf('  function tryApplyDeviceArtworkOnlyChange(');
const end = source.indexOf('\n  browser.storage.onChanged.addListener(', begin);
assert.ok(begin >= 0 && end > begin, 'must execute the real production artwork fast path');
const actualFastPath = source.slice(begin, end);

function shortcut(id, image = '') {
  return {
    type: 'shortcut', id, title: id, url: `https://${id}.example/`,
    position: 0, createdAt: 10, modifiedAt: 20, image,
    localImageAssetId: '', imageSyncData: '', imageAssetId: '', imageSyncKind: 'none',
    imageSourceKind: 'none', imageSourceUrl: '', imageIsFallback: false,
    imageStyle: 'contain', source: 'manual', builtinIcon: '', colorTag: '', spaceMoveAt: 0
  };
}
function makeState() {
  const personal = { settings: { backgroundPreset: '' }, shortcuts: [shortcut('personal')] };
  const work = { settings: { backgroundPreset: '' }, shortcuts: [shortcut('work')] };
  return {
    activeSpaceId: 'personal', clock: 'trusted-clock', rawSignature: 'trusted-projection',
    spaces: { personal, work },
    // The public grid comparator operates on the active Space's projected list.
    shortcuts: personal.shortcuts, settings: {}
  };
}
function makeHarness(live = makeState()) {
  const patches = [], manifests = [];
  const context = {
    SPACE_IDS: ['personal', 'work'], state: live, meta: {},
    localStateSyncClockSignature: value => value?.clock,
    localStateSyncRawSignature: value => value?.rawSignature,
    sameBackgroundVisuals, collectWorkspaceShortcutRecords,
    sameShortcutCoreShape, copyDeviceArtwork,
    patchVisibleShortcutArtwork: (ids, folders) => patches.push({ ids: [...ids], folders: [...folders] }),
    refreshRenderManifestAfterArtworkChange: (...args) => manifests.push(args)
  };
  vm.createContext(context);
  vm.runInContext(`${actualFastPath}\nthis.applyFastPath = tryApplyDeviceArtworkOnlyChange;`, context);
  return { live, context, patches, manifests, apply: incoming => context.applyFastPath(incoming, live) };
}
function artworkChange(incoming, image = 'data:image/png;base64,NEW') {
  incoming.spaces.personal.shortcuts[0].image = image;
  incoming.spaces.personal.shortcuts[0].imageSourceKind = 'favicon';
  return incoming;
}

test('Slice 10 controller still imports the artwork utility used by its real fast path', () => {
  // VM harnesses inject helpers and cannot detect a missing browser module import.
  const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*[\"']\.\/ui-utils\.js[\"'];?/g)];
  assert.equal(imports.length, 1, 'expected exactly one existing eager ui-utils import');
  for (const name of ['sameBackgroundVisuals', 'collectWorkspaceShortcutRecords',
    'sameShortcutCoreShape', 'copyDeviceArtwork']) {
    assert.ok(imports[0][1].split(',').some(part => part.trim() === name),
      `missing runtime import for ${name}`);
  }
});

test('Slice 10 rejects later-Space wallpaper mismatches without mutating earlier active artwork', () => {
  const h = makeHarness();
  const before = structuredClone(h.live);
  const incoming = artworkChange(structuredClone(h.live));
  incoming.spaces.work.settings.backgroundPreset = 'different-preset';
  assert.equal(h.apply(incoming), false);
  assert.deepEqual(h.live, before, 'failed fast path must never mutate the live state');
  assert.equal(manualGridRenderEquivalent(h.live, incoming), false,
    'normal adoption must be able to detect the still-different visible artwork');
  assert.equal(h.patches.length, 0);
  assert.equal(h.manifests.length, 0);
});

test('Slice 10 rejects later-Space structural differences without partial artwork adoption', () => {
  for (const mutation of [
    incoming => { incoming.spaces.work.shortcuts[0].title = 'Changed structural title'; },
    incoming => { incoming.spaces.work.shortcuts = []; },
    incoming => { delete incoming.spaces.work; }
  ]) {
    const h = makeHarness();
    const before = structuredClone(h.live);
    const incoming = artworkChange(structuredClone(h.live));
    mutation(incoming);
    assert.equal(h.apply(incoming), false);
    assert.deepEqual(h.live, before, 'later failure leaked an earlier artwork update');
    assert.equal(h.patches.length, 0);
    assert.equal(h.manifests.length, 0);
  }
});

test('Slice 10 authority gates reject stale clocks, different Sync projections and active-Space changes', () => {
  for (const mutation of [
    (incoming) => { incoming.clock = 'future-clock'; },
    (incoming) => { incoming.rawSignature = 'different-structure'; },
    (incoming) => { incoming.activeSpaceId = 'work'; },
    (incoming, live) => { live.clock = 'newer-than-previous'; },
    (incoming, live) => { live.rawSignature = 'newer-projection'; }
  ]) {
    const h = makeHarness();
    const incoming = artworkChange(structuredClone(h.live));
    mutation(incoming, h.live);
    const before = structuredClone(h.live);
    assert.equal(h.apply(incoming), false, 'untrusted event bypassed an authority gate');
    assert.deepEqual(h.live, before, 'untrusted event changed live artwork');
    assert.equal(h.patches.length, 0);
    assert.equal(h.manifests.length, 0);
  }
});

test('Slice 10 successful multi-Space artwork updates copy only allowed image fields and patch active Space once', () => {
  const h = makeHarness();
  const incoming = artworkChange(structuredClone(h.live));
  incoming.spaces.personal.shortcuts[0].imageSourceUrl = 'https://personal.example/favicon.ico';
  incoming.spaces.work.shortcuts[0].image = 'data:image/png;base64,WORK';
  const personal = h.live.spaces.personal.shortcuts[0];
  const work = h.live.spaces.work.shortcuts[0];
  const originalUrl = personal.url;
  assert.equal(h.apply(incoming), true);
  assert.equal(personal.image, 'data:image/png;base64,NEW');
  assert.equal(personal.imageSourceUrl, 'https://personal.example/favicon.ico');
  assert.equal(work.image, 'data:image/png;base64,WORK');
  assert.equal(personal.url, originalUrl);
  assert.deepEqual(h.patches, [{ ids: ['personal'], folders: [] }]);
  assert.equal(h.manifests.length, 1);
  assert.equal(h.apply(incoming), true, 'exact echo should remain harmless');
  assert.equal(h.patches.length, 1, 'no new DOM patch on exact echo');
  assert.equal(h.manifests.length, 1, 'no new manifest work on exact echo');
});

test('Slice 10 rejects a later Space move while preserving live folder and artwork identity', () => {
  const h = makeHarness();
  const before = structuredClone(h.live);
  const incoming = artworkChange(structuredClone(h.live));
  incoming.spaces.work.shortcuts[0].spaceMoveAt = 101;
  assert.equal(h.apply(incoming), false);
  assert.deepEqual(h.live, before);
});
