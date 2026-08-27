import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loaderHarness(browser = "firefox") {
  const source = fs.readFileSync(`dist/${browser}/newtab/secondary-style-bootstrap.js`, "utf8");
  const appended = [];
  const rafCallbacks = [];
  const timerCallbacks = [];
  const elements = new Map();

  const document = {
    head: {
      append(node) {
        appended.push(node);
        if (node?.id) elements.set(node.id, node);
        node.isConnected = true;
      }
    },
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) {
      assert.equal(tagName, "link");
      const listeners = new Map();
      return {
        id: "",
        rel: "",
        href: "",
        dataset: {},
        sheet: null,
        isConnected: false,
        addEventListener(type, handler) { listeners.set(type, handler); },
        dispatch(type) { listeners.get(type)?.({ type, target: this }); }
      };
    }
  };

  const context = {
    document,
    console: { error() {} },
    performance: { now: () => 123.5 },
    Date,
    requestAnimationFrame(callback) { rafCallbacks.push(callback); return rafCallbacks.length; },
    setTimeout(callback) { timerCallbacks.push(callback); return timerCallbacks.length; }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: `${browser}/secondary-style-bootstrap.js` });
  return { context, appended, rafCallbacks, timerCallbacks, elements };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.8 ${browser} secondary styles perform zero automatic startup insertion`, () => {
    const harness = loaderHarness(browser);
    assert.equal(harness.rafCallbacks.length, 0, "loader must not schedule requestAnimationFrame work");
    assert.equal(harness.timerCallbacks.length, 0, "loader must not schedule timer work");
    assert.equal(harness.appended.length, 0, "startup alone must not append a stylesheet link");
    assert.equal(harness.elements.has("mosaicsyncSecondaryStyles"), false);
    assert.equal(typeof harness.context.__mosaicsyncEnsureSecondaryStyles, "function");
  });

  test(`1.27.8.8 ${browser} secondary styles load exactly once on demand`, async () => {
    const harness = loaderHarness(browser);
    const ensure = harness.context.__mosaicsyncEnsureSecondaryStyles;
    const first = ensure();
    const concurrent = ensure();
    assert.strictEqual(first, concurrent, "concurrent callers must share one loader Promise");
    assert.equal(harness.appended.length, 1, "first demand must append exactly one link");
    const link = harness.appended[0];
    assert.equal(link.id, "mosaicsyncSecondaryStyles");
    assert.equal(link.rel, "stylesheet");
    assert.equal(link.href, "newtab-secondary.css");
    link.dispatch("load");
    assert.equal(await first, true);
    assert.equal(link.dataset.mosaicsyncLoaded, "true");
    const afterLoaded = ensure();
    assert.strictEqual(afterLoaded, first, "loaded state must retain the same idempotent Promise");
    assert.equal(await afterLoaded, true);
    assert.equal(harness.appended.length, 1, "repeated demand must never append another link");
  });

  test(`1.27.8.8 ${browser} packaged secondary-style load failure settles without retry storms`, async () => {
    const harness = loaderHarness(browser);
    const ensure = harness.context.__mosaicsyncEnsureSecondaryStyles;
    const first = ensure();
    assert.equal(harness.appended.length, 1);
    harness.appended[0].dispatch("error");
    assert.equal(await first, false);
    assert.strictEqual(ensure(), first, "a broken packaged stylesheet must not cause repeated insertion loops");
    assert.equal(harness.appended.length, 1);
  });

  test(`1.27.8.8 ${browser} gates launcher-reachable secondary UI and keeps automatic web-access prompt critical`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");
    const loader = fs.readFileSync(`dist/${browser}/newtab/secondary-style-bootstrap.js`, "utf8");
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");

    assert.doesNotMatch(loader, /requestAnimationFrame|setTimeout/, "secondary loader must have no unsolicited startup scheduler");
    assert.match(loader, /__mosaicsyncEnsureSecondaryStyles/);
    assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["'][^>]+href=["']newtab-secondary\.css["']/i);

    const ordered = [
      [/async function showFrequentSiteContextMenu[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?menu\.className = "mosaicsync-context-menu"/, "Frequently Visited context menu"],
      [/async function showDropChoice[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?dropChoice\.hidden = false/, "drop-choice menu"],
      [/async function openFolder[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?folderPopover\.hidden = false/, "folder popover"],
      [/async function openShortcutEditor[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?shortcutDialog\.showModal\(\)/, "shortcut editor"],
      [/async function openBookmarks[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?bookmarksDialog\.showModal\(\)/, "Bookmarks dialog"],
      [/async function openSettings[\s\S]*?await ensureSecondaryStyles\(\)[\s\S]*?settingsDialog\.hidden = false/, "Settings dialog"],
      [/function showToast[\s\S]*?ensureSecondaryStyles\(\)\.then[\s\S]*?toast\.classList\.add\("visible"\)/, "toast"]
    ];
    for (const [pattern, label] of ordered) assert.match(src, pattern, `${label} must wait for secondary CSS before becoming visible`);

    const brandBody = src.match(/function triggerBrandHello\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
    assert.doesNotMatch(brandBody, /ensureSecondaryStyles/, "first logo hover must never activate deferred CSS");
    assert.match(brandBody, /brandHelloButton\.classList\.add\("brand-hello-active"\)/, "brand animation must remain functional from critical CSS");

    assert.match(critical, /\.web-access-prompt\{/,
      "the permission prompt can appear automatically and therefore must be fully critical-styled");
    assert.equal(secondary.includes(".web-access-prompt{"), false,
      "automatic permission-prompt styling must not depend on a later secondary CSSOM insertion");
    const promptBody = src.match(/async function maybeShowWebAccessPrompt\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
    assert.doesNotMatch(promptBody, /ensureSecondaryStyles/,
      "automatic permission reconciliation must not force the secondary stylesheet into startup");
  });

  test(`1.27.8.8 ${browser} secondary stylesheet cannot restyle the already-painted launcher`, () => {
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");

    assert.match(critical, /button,\s*input,\s*select\{\s*font:\s*inherit;/, "form normalization must be critical");
    assert.match(critical, /button\{\s*color:\s*inherit;/, "button color normalization must be critical");
    assert.match(critical, /\[data-color-tag="red"\]\{--shortcut-tag-color:/, "launcher tag variables must be critical");

    assert.doesNotMatch(secondary, /(^|})\s*button\s*,\s*input\s*,\s*select\s*\{/m, "secondary CSS must not introduce a global form reset");
    assert.doesNotMatch(secondary, /(^|})\s*button\s*\{/m, "secondary CSS must not globally restyle launcher buttons");
    assert.doesNotMatch(secondary, /@keyframes\s+brand-(?:hello-pop|easter-wave)/, "brand animations are critical-only");
    assert.doesNotMatch(secondary, /\.edit-chip(?:[,:{\s]|$)/, "launcher edit-chip must be critical-only");
    assert.doesNotMatch(secondary, /\.tile\[data-color-tag\]/, "top-level tile color tags must be critical-only");
    assert.doesNotMatch(secondary, /\.folder-mosaic-cell\[data-color-tag\]/, "visible folder mosaic color tags must be critical-only");
    assert.doesNotMatch(secondary, /(^|})\s*\[data-color-tag=/m, "global tag variables must not arrive in secondary CSS");
    assert.doesNotMatch(secondary, /(^|})\s*\.sync-help-tooltip\s*\{/m, "launcher Sync tooltip must not receive an unscoped late width rule");
    assert.match(secondary, /\.settings-dialog \.sync-help-tooltip\{width:/, "Settings may retain its scoped tooltip width");
  });

  test(`1.27.8.8 ${browser} suppresses native appearance on every launcher button inserted around first paint`, () => {
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    for (const selector of [".settings-button", ".bookmarks-button", ".space-button", ".add-slot", ".edit-chip", ".empty-ghost-tile"]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rules = [...critical.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))].map(match => match[1]);
      assert.ok(rules.some(rule => /appearance\s*:\s*none/i.test(rule)), `${selector} must suppress native appearance in critical CSS`);
    }
  });
}
