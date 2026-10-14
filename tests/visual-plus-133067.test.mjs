// @kind static
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
const css = read('src/shared/newtab/newtab-critical.css');
const html = read('src/shared/newtab/newtab.html');
const js = read('src/shared/newtab/newtab.js');
const shared = /\.plus-mark\s*\{([^}]*)\}/;
const geometry = css.match(shared);

test('both add controls use the same 22px font-independent shape', () => {
  assert.ok(geometry, 'both controls must use the same plus-mark geometry');
  assert.match(geometry[1], /position:\s*relative;/);
  assert.match(geometry[1], /display:\s*block;/);
  assert.match(geometry[1], /width:\s*22px;/);
  assert.match(geometry[1], /height:\s*22px;/);
  assert.match(geometry[1], /pointer-events:\s*none;/);
  assert.match(css, /\.plus-mark::before/);
  assert.doesNotMatch(geometry[1], /font-|margin|translateY|line-height/);
});

test('both perpendicular bars have a common geometric center and inherit color', () => {
  assert.match(css, /\.plus-mark::before,\s*\.plus-mark::after\s*\{([^}]*)\}/);
  const bar = css.match(/\.plus-mark::before,\s*\.plus-mark::after\s*\{([^}]*)\}/)[1];
  for (const rule of ['content: "";', 'position: absolute;', 'left: 50%;', 'top: 50%;', 'background: currentColor;', 'transform: translate(-50%, -50%);']) assert.ok(bar.replaceAll(/\s+/g, "").includes(rule.replaceAll(/\s+/g, "")), rule);
  assert.match(css, /\.plus-mark::before\s*\{\s*width:\s*22px;\s*height:\s*2px;/);
  assert.match(css, /\.plus-mark::after\s*\{\s*width:\s*2px;\s*height:\s*22px;/);
});

test('empty Personal and Work reuse one accessible onboarding button', () => {
  assert.match(html, /id="addFirstButton" class="empty-ghost-tile" type="button" aria-label="Add your first shortcut">\s*<span class="plus-mark" aria-hidden="true"><\/span>/);
  assert.match(js, /emptyState\.hidden = state\.shortcuts\.length !== 0/);
  assert.match(js, /addFirstButton\.addEventListener\("click", \(\) => openShortcutEditor\(\)\)/);
});

test('populated-grid add button remains accessible and clickable', () => {
  assert.match(js, /add\.className = "add-slot";/);
  assert.match(js, /add\.setAttribute\("aria-label", t\("addShortcut"\)\);/);
  assert.match(js, /plus\.className = "plus-mark";/);
  assert.match(js, /plus\.setAttribute\("aria-hidden", "true"\);/);
  assert.doesNotMatch(js, /plus\.textContent = "\+"/);
  assert.match(js, /add\.addEventListener\("click", \(\) => openShortcutEditor\(/);
});

test('hover, focus, drag and accessible labels remain present', () => {
  for (const token of ['.empty-slot:hover .add-slot', '.add-slot:focus-visible', '.empty-ghost-tile:focus-visible', '.empty-ghost-tile.drag-cross-space-target']) assert.ok(css.includes(token), token);
  assert.match(js, /addFirstButton\.addEventListener\("dragover"/);
  assert.match(js, /addFirstButton\.addEventListener\("drop"/);
  assert.match(js, /add\.addEventListener\("click"/);
});

test('both browsers ship the identical audited markup, CSS and script', () => {
  for (const browser of ['chrome','firefox']) {
    assert.equal(read(`dist/${browser}/newtab/newtab-critical.css`), css);
    assert.match(read(`dist/${browser}/newtab/newtab.html`), /id="addFirstButton" class="empty-ghost-tile" type="button" aria-label="Add your first shortcut">\s*<span class="plus-mark" aria-hidden="true"><\/span>/);
    assert.equal(read(`dist/${browser}/newtab/newtab.js`), js);
  }
});
