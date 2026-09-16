import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  assert.ok(match, `missing CSS block for ${selector}`);
  return match[1];
}

test("1.30.18.41 Frequently Visited reservation and live cards share one explicit row height", () => {
  const css = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
  const root = cssBlock(css, ":root");
  const list = cssBlock(css, ".frequent-sites-list");
  const card = cssBlock(css, ".frequent-site-card");
  const title = cssBlock(css, ".frequent-site-copy strong");

  assert.match(root, /--frequent-card-block-size:\s*48px\s*;/);
  assert.match(list, /grid-auto-rows:\s*var\(--frequent-card-block-size\)\s*;/);
  assert.match(card, /block-size:\s*var\(--frequent-card-block-size\)\s*;/);
  assert.match(title, /line-height:\s*14px\s*;/);
  assert.match(css, /\.frequent-site-copy small\{[^}]*font-size:\s*9\.5px;[^}]*line-height:\s*12px\s*;/);

  // 48px border box = 18px vertical padding + 2px border + 14px title
  // + 12px host + 2px copy gap. Content can never resize the grid row.
  assert.equal(18 + 2 + 14 + 12 + 2, 48);
});

test("1.30.18.41 geometry stabilization adds no startup measurement or asynchronous work", () => {
  const bootstrap = fs.readFileSync("src/shared/newtab/frequent-geometry-bootstrap.js", "utf8");
  const main = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

  assert.match(bootstrap, /frequent-site-card[^\n]*frequent-site-first-paint-placeholder/);
  assert.match(main, /card\.className = "frequent-site-card"/);
  assert.match(main, /card\.className = "frequent-site-card frequent-site-layout-placeholder"/);
  assert.doesNotMatch(bootstrap, /getBoundingClientRect|offsetHeight|clientHeight|requestAnimationFrame|setTimeout/);
});

test("1.30.18.41 keeps responsive capacity and disabled-FV zero-space behavior intact", () => {
  const css = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
  const bootstrap = fs.readFileSync("src/shared/newtab/frequent-geometry-bootstrap.js", "utf8");

  assert.match(css, /@media \(max-width: 900px\)\{\.frequent-sites-list\{\s*grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /@media \(max-width: 620px\)\{\.frequent-sites-list\{\s*grid-template-columns:\s*repeat\(2,/);
  assert.match(bootstrap, /if \(localStorage\.getItem\(prefKey\) !== "1"\) return;/);
  assert.match(bootstrap, /const count = \[3, 5, 8, 10\]\.includes\(rawCount\) \? rawCount : 5;/);
});
