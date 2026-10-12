// @kind behavioral
import test from 'node:test';
import { fetchShortcutTitleResponse } from '../src/shared/background/shortcut-title-redirects.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
const [background, newtab] = await Promise.all([
  readFile('src/shared/background/background-core.js', 'utf8'),
  readFile('src/shared/newtab/newtab.js', 'utf8')
]);

function titleHarness() {
  const start = background.indexOf('  async function fetchHtmlHead(');
  const end = background.indexOf('  async function discoverManifestIconCandidates(', start);
  assert.ok(start >= 0 && end > start);
  const ctx = {
    browser: {}, fetchShortcutTitleResponse, fetch, URL, Date, Math, TextDecoder, Uint8Array, Number, AbortController,
    REMOTE_HTML_HEAD_MAX_BYTES: 256_000,
    ICON_RECOVERY_FETCH_TIMEOUT_MS: 4_000,
    textDecoder: new TextDecoder(),
    canReadOrigin: async () => true,
    httpOriginPattern: () => '*://localhost/*',
    linkedFetchAbortController: (signal) => {
      const ctrl = new AbortController();
      if (signal?.aborted) ctrl.abort();
      else signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
      return { signal: ctrl.signal, cleanup() {}, callerAborted: () => Boolean(signal?.aborted) };
    }
  };
  runInNewContext(`${background.slice(start, end)}\nglobalThis.suggestTitle = suggestShortcutPageTitle;`, ctx);
  return ctx.suggestTitle;
}

async function withHtml(body, fn) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}/`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('54: bounded title extraction rejects an unclosed script containing a false title', async () => {
  const suggestTitle = titleHarness();
  const html = '<html><head><script>const fake = "<title>Script Brand</title>";' + 'x'.repeat(260_000);
  await withHtml(html, async url => {
    const result = await suggestTitle(url);
    assert.equal(result.ok, false);
    assert.equal(result.title, '');
  });
});

test('54: a </head> inside script text must not prematurely end the head fetch', async () => {
  const suggestTitle = titleHarness();
  const html = '<html><head><script>const fake = "<title>Script Brand</title></head>";</script><title>Actual Company</title></head><body>done</body>';
  await withHtml(html, async url => {
    const result = await suggestTitle(url);
    assert.equal(result.ok, true);
    assert.equal(result.title, 'Actual Company');
  });
});

test('54: a truncated raw-text block after a valid title cannot create a second false title', async () => {
  const suggestTitle = titleHarness();
  const html = '<html><head><title>Original Company</title><script>"<title>Injected Brand</title>";' + 'z'.repeat(260_000);
  await withHtml(html, async url => {
    const result = await suggestTitle(url);
    assert.equal(result.ok, true);
    assert.equal(result.title, 'Original Company');
  });
});

function settingsHarness() {
  const start = newtab.indexOf('  function isSettingsChildDialogOpen()');
  const afterKeydown = newtab.indexOf('    if (!event.altKey', start);
  assert.ok(start > 0 && afterKeydown > start);
  const events = new Map();
  const dialog = { open: true };
  let settingsOpen = true, closed = 0;
  const settingsDialog = { contains: () => false };
  const ctx = {
    document: { addEventListener: (key, listener) => events.set(key, listener) },
    wallpaperGalleryDialog: { open: false }, customBrandingDialog: { open: false }, recoveryCopiesDialog: { open: false },
    mosaicConfirmDialog: dialog,
    shortcutDialog: { open: false },
    bookmarksDialog: { open: false },
    frequentContextMenu: null,
    bookmarksController: { closeColorMenuIfOutside() {}, closeColorMenu() {} },
    backgroundColorPopover: { hidden: true },
    backgroundColorControl: null,
    dropChoice: { hidden: true },
    folderPopover: { hidden: true },
    activeFolderAnchorId: null,
    settingsButton: { contains: () => false },
    settingsDialog,
    isSettingsOpen: () => settingsOpen,
    closeSettingsPanel() { closed++; settingsOpen = false; },
    closeDialog() { closed++; settingsOpen = false; },
    closeFrequentContextMenu() {}, closeBackgroundColorPicker() {}, closeDropChoice() {},
  };
  // First half of Settings keydown handler is enough to check Escape behavior.
  const code = newtab.slice(start, afterKeydown) + '\n  });\n';
  runInNewContext(code, ctx);
  return { ctx, events, dialog, get closed() { return closed; }, get settingsOpen() { return settingsOpen; } };
}

for (const action of ['Cancel', 'Accept', 'Escape']) {
  test(`54: Settings stays open when child confirmation receives ${action}`, () => {
    const h = settingsHarness();
    // The pointerdown of Cancel and Accept bubbles through document while the
    // modal is still open. Native Escape is observed before dialog closes.
    if (action === 'Escape') h.events.get('keydown')({ key: 'Escape' });
    else h.events.get('pointerdown')({ target: { closest: () => null } });
    h.dialog.open = false; // browser <dialog> closes after handling the action
    assert.equal(h.closed, 0);
    assert.equal(h.settingsOpen, true);
    // Outside click after confirmation has fully closed still closes Settings.
    h.events.get('pointerdown')({ target: {} });
    assert.equal(h.closed, 1);
  });
}
