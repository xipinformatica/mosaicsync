import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

function createSvgNode(tag) {
  return {
    tag,
    attributes: new Map(),
    children: [],
    classList: { values: [], add(value) { this.values.push(value); } },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    append(child) { this.children.push(child); }
  };
}

test('Step 8 runtime-executes builtin-icons twice and preserves one immutable working API', () => {
  const source = fs.readFileSync('src/shared/newtab/builtin-icons.js', 'utf8');
  const context = {
    document: { createElementNS(_ns, tag) { return createSvgNode(tag); } }
  };
  context.globalThis = context;
  vm.createContext(context);

  vm.runInContext(source, context);
  const first = context.__mosaicsyncBuiltinIcons;
  assert.ok(first, 'classic helper must install the global API');
  assert.equal(first.isValid('home'), true);
  const target = { children: [], append(child) { this.children.push(child); } };
  assert.equal(first.append(target, 'home'), true);
  assert.equal(target.children.length, 1);
  assert.equal(target.children[0].tag, 'svg');

  vm.runInContext(source, context);
  assert.strictEqual(context.__mosaicsyncBuiltinIcons, first, 'second evaluation must be a true no-op');
  const descriptor = Object.getOwnPropertyDescriptor(context, '__mosaicsyncBuiltinIcons');
  assert.equal(descriptor?.writable, false);
  assert.equal(descriptor?.configurable, false);
});

test('Step 8 serializes rapid Bookmarks open attempts at the final showModal boundary', async () => {
  const source = fs.readFileSync('src/shared/newtab/bookmarks-controller.js', 'utf8');
  const fn = extractFunction(source, 'open');
  const styles = deferred();
  const moduleGate = deferred();
  let showCalls = 0;
  const context = {
    bookmarksDialog: {
      open: false,
      showModal() {
        showCalls += 1;
        if (this.open) throw new Error('InvalidStateError');
        this.open = true;
      }
    },
    closeDialog(dialog) { dialog.open = false; },
    ensureSecondaryStyles() { return styles.promise; },
    loadBookmarksModule() { return moduleGate.promise; },
    bookmarksApi: null,
    localizeDocument() {},
    bookmarksDialogGeneration: 0,
    async loadBookmarksIntoDialog() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.openBookmarks = open;`, context);

  const a = context.openBookmarks();
  const b = context.openBookmarks();
  styles.resolve();
  await Promise.resolve();
  moduleGate.resolve({});
  const results = await Promise.allSettled([a, b]);

  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  assert.equal(showCalls, 1, 'two same-session open attempts must produce one modal open');
  assert.equal(context.bookmarksDialog.open, true);
});

test('Step 8 serializes rapid Wallpaper Gallery open attempts at the final showModal boundary', async () => {
  const source = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
  const fn = extractFunction(source, 'openWallpaperGallery');
  const styles = deferred();
  const moduleGate = deferred();
  let showCalls = 0;
  const dialog = {
    open: false,
    showModal() {
      showCalls += 1;
      if (this.open) throw new Error('InvalidStateError');
      this.open = true;
    }
  };
  const context = {
    settingsDialog: { __mosaicOwnershipGeneration: 11 },
    ensureSecondaryStyles() { return styles.promise; },
    wallpaperGalleryModulePromise: moduleGate.promise,
    isSettingsOpen() { return true; },
    wallpaperGalleryDialog: dialog,
    wallpaperGalleryGrid: {},
    wallpaperGalleryTarget: 'main',
    localizeDocument() {},
    renderWallpaperGallery() {},
    document: {},
    console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.openGallery = openWallpaperGallery;`, context);

  const a = context.openGallery('main');
  const b = context.openGallery('main');
  styles.resolve();
  await Promise.resolve();
  moduleGate.resolve({ mountWallpaperGalleryShell() { return { dialog, grid: {} }; } });
  const results = await Promise.allSettled([a, b]);

  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  assert.equal(showCalls, 1, 'two same-session open attempts must produce one modal open');
  assert.equal(dialog.open, true);
});

test('Step 8 evidence freezes Snow Leopard II on the final corrective only', () => {
  const evidence = JSON.parse(fs.readFileSync('docs/SNOW-LEOPARD-II-STEP8-1.33.0.18.json', 'utf8'));
  const roadmap = fs.readFileSync('docs/SNOW-LEOPARD-II.md', 'utf8');
  assert.equal(evidence.version, '1.33.0.18');
  assert.equal(evidence.step, 8);
  assert.equal(evidence.status, 'DONE');
  assert.equal(evidence.corrective.bookmarksRapidOpen, true);
  assert.equal(evidence.corrective.wallpaperGalleryRapidOpen, true);
  assert.equal(evidence.corrective.builtinIconsRuntimeTest, true);
  assert.equal(evidence.optimizationPolicy.additionalPerformanceChanges, false);
  assert.match(roadmap, /Step 8 — Freeze and adversarial performance audit: DONE in 1\.33\.0\.18/);
  assert.match(roadmap, /Snow Leopard II.*COMPLETE/i);
});
