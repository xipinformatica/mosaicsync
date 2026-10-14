// @kind static
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const source = read("src/shared/newtab/newtab-critical.css");

// The former optical-offset regression is now superseded by a shared
// geometric plus; preserve the original grid centering and Space parity.
test("empty onboarding tile uses a font-independent plus shape", () => {
  assert.match(source, /\.empty-ghost-tile\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/);
  assert.match(source, /\.plus-mark\s*\{[^}]*position:\s*relative;/);
  assert.doesNotMatch(source, /\.empty-ghost-tile span\s*\{[^}]*translateY\(/);
});

test("normal add-slot shares the centered shape", () => {
  assert.match(source, /\.add-slot\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/);
  assert.match(source, /\.plus-mark::before,\s*\.plus-mark::after/);
  assert.doesNotMatch(source, /\.add-slot span\s*\{[^}]*margin-top/);
});

test("Personal and Work share the same empty-state plus markup and CSS in both builds", () => {
  const html = read("src/shared/newtab/newtab.html");
  assert.match(html, /id="addFirstButton" class="empty-ghost-tile"[^>]*>\s*<span class="plus-mark" aria-hidden="true"><\/span>/);
  const js = read("src/shared/newtab/newtab.js");
  assert.match(js, /emptyState\.hidden = state\.shortcuts\.length !== 0/);
  for (const browser of ["chrome", "firefox"]) {
    assert.equal(read(`dist/${browser}/newtab/newtab-critical.css`), source, `${browser}: runtime CSS must be the tested CSS`);
    assert.match(read(`dist/${browser}/newtab/newtab.html`), /id="addFirstButton" class="empty-ghost-tile"[^>]*>\s*<span class="plus-mark" aria-hidden="true"><\/span>/, `${browser}: runtime must keep the same onboarding tile`);
  }
});
