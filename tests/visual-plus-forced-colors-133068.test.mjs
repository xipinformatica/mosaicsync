// @kind static
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/shared/newtab/newtab-critical.css', 'utf8');
const both = source.match(/\.plus-mark::before,\s*\.plus-mark::after\s*\{([^}]*)\}/)?.[1];
const horizontal = source.match(/\.plus-mark::before\s*\{([^}]*)\}/)?.[1];
const vertical = source.match(/}\s*\.plus-mark::after\s*\{([^}]*)\}/)?.[1];

test('High Contrast: plus bars use borders rather than overridden backgrounds', () => {
  assert.ok(both && horizontal && vertical, 'both plus bars must exist');
  assert.match(both, /border:\s*0\s+solid\s*;/);
  assert.doesNotMatch(both, /background(?:-color)?\s*:/);
  assert.doesNotMatch(horizontal + vertical, /background(?:-color)?\s*:/);
});

test('both perpendicular bars retain symmetric 22px by 2px geometry', () => {
  assert.match(horizontal, /width:\s*22px;/);
  assert.match(horizontal, /border-top-width:\s*2px;/);
  assert.match(vertical, /height:\s*22px;/);
  assert.match(vertical, /border-left-width:\s*2px;/);
  assert.match(both, /left:\s*50%;\s*top:\s*50%;/);
  assert.match(both, /transform:\s*translate\(-50%,\s*-50%\);/);
});

test('High Contrast fix is present in both Chrome and Firefox runtime CSS', () => {
  for (const browser of ['chrome', 'firefox']) {
    const shipped = readFileSync(`dist/${browser}/newtab/newtab-critical.css`, 'utf8');
    assert.equal(shipped, source);
  }
});
