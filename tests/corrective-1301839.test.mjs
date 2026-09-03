import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/mosaicsync/adoedheeaigmimommakojmmlahcckjkh";

async function source(name) {
  return readFile(name, "utf8");
}

test("1.30.18.39 shortcut editor has a short-laptop layout and moves artwork explanations into an accessible info bubble", async () => {
  const [html, css] = await Promise.all([
    source("src/shared/newtab/newtab.html"),
    source("src/shared/newtab/newtab-secondary.css")
  ]);

  assert.match(html, /id="shortcutSyncImageInfo"[\s\S]*?>\?<\/button>[\s\S]*?role="tooltip"[\s\S]*?id="shortcutSyncImageHint"[\s\S]*?id="shortcutImageHint"/);
  assert.doesNotMatch(html, /<label id="shortcutSyncImageRow"[^>]*>[\s\S]*?<small id="shortcutSyncImageHint"/);
  assert.match(css, /@media \(min-width: 621px\) and \(max-height: 760px\)[\s\S]*?#shortcutDialog \.row-actions\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /@media \(min-width: 621px\) and \(max-height: 760px\)[\s\S]*?#shortcutDialog \.shortcut-visual-options\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.dialog-card\s*\{[^}]*overflow:\s*auto;/, "extremely short windows must retain safe scrolling");
});

test("1.30.18.39 hover keeps shortcut artwork at a stable raster size", async () => {
  const css = await source("src/shared/newtab/newtab-critical.css");
  const hoverRule = css.match(/\.shortcut-card:hover \.tile\s*\{([^}]*)\}/g)?.join("\n") || "";

  assert.ok(hoverRule, "shortcut hover rule must remain present");
  assert.doesNotMatch(hoverRule, /scale\(/, "hover must not fractionally resample the tile and favicon together");
  assert.match(hoverRule, /transform:\s*translateY\(-1px\)/, "the restrained hover lift must remain");
  assert.match(hoverRule, /filter:\s*brightness\(1\.065\)/, "the restrained hover highlight must remain");
  assert.doesNotMatch(css, /\.shortcut-card:hover[^}]*?(?:img|artwork-layer|fallback-icon)[^}]*transform:/s,
    "favicon and fallback artwork must not gain a hover transform");
});

test("1.30.18.39 README links both official browser stores", async () => {
  const readme = await source("README.md");
  assert.match(readme, /Firefox Add-ons:\s*https:\/\/addons\.mozilla\.org\/addon\/mosaicsync\//);
  assert.match(readme, new RegExp(`Chrome Web Store: ${CHROME_STORE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});
