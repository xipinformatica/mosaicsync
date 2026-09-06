import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function cssRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

test("1.31.4 separate Light/Dark wallpaper darkness controls reserve a full-width translated label row", () => {
  const css = read("src/shared/newtab/newtab-secondary.css");
  const row = cssRuleBody(css, ".theme-wallpaper-dim-row");
  const label = cssRuleBody(css, ".theme-wallpaper-dim-row > span");
  const range = cssRuleBody(css, '.theme-wallpaper-dim-row input[type="range"]');
  const output = cssRuleBody(css, ".theme-wallpaper-dim-row output");

  assert.match(row, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px/);
  assert.match(row, /grid-template-areas:\s*"label label"\s*"range value"/);
  assert.match(label, /grid-area:\s*label/);
  assert.match(label, /overflow-wrap:\s*anywhere/);
  assert.match(range, /grid-area:\s*range/);
  assert.match(output, /grid-area:\s*value/);
});

test("1.31.4 wallpaper darkness layout remains localization-safe for every shipped runtime language", async () => {
  const localeDir = path.join(root, "src/shared/core/i18n-locales");
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js")).sort();
  assert.equal(files.length, 33);

  const translations = [];
  for (const file of files) {
    const { MESSAGES } = await import(pathToFileURL(path.join(localeDir, file)).href);
    assert.equal(typeof MESSAGES.backgroundDarkness, "string", `${file}: missing backgroundDarkness`);
    assert.ok(MESSAGES.backgroundDarkness.trim(), `${file}: empty backgroundDarkness`);
    translations.push(MESSAGES.backgroundDarkness.trim());
  }

  assert.ok(translations.includes("Hintergrundabdunklung"), "German long compound regression fixture must remain covered");
});
