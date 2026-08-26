import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function cssRulesForSelector(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(pattern)].map(match => match[1]);
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.8 ${browser} suppresses native widget appearance on custom launcher buttons before first paint`, () => {
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");

    const customButtons = [
      [".settings-button", /<button[^>]+class="settings-button"/],
      [".bookmarks-button", /<button[^>]+class="bookmarks-button"/],
      [".space-button", /<button[^>]+class="space-button"/]
    ];

    for (const [selector, htmlPattern] of customButtons) {
      assert.match(html, htmlPattern, `${selector} must remain a real button in launcher markup`);
      const rules = cssRulesForSelector(critical, selector);
      assert.ok(rules.length >= 1, `${selector} must be present in critical CSS`);
      assert.ok(rules.some(rule => /(?:^|;)\s*appearance\s*:\s*none\s*;?/i.test(`;${rule}`)),
        `${selector} must include appearance:none in critical CSS so native browser chrome can never flash`);
    }

    assert.match(html, /<span[^>]+class="brand-button"/,
      "brand-button is not a native button and must not be treated as one by the launcher reset contract");
  });

  test(`1.27.8.8 ${browser} keeps the native-appearance fix off the deferred secondary stylesheet`, () => {
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");
    for (const selector of [".settings-button", ".bookmarks-button", ".space-button"]) {
      assert.equal(secondary.includes(selector), false,
        `${selector} must remain exclusively owned by critical CSS rather than being patched later`);
    }
  });
}
