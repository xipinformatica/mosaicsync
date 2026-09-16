import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(...names) { for (const name of names) this.values.add(name); }
  remove(...names) { for (const name of names) this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = "";
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.style = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) {
    this.children = [];
    for (const node of nodes) {
      if (node?.isFragment) this.children.push(...node.children);
      else if (node != null) this.children.push(node);
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

function runGeometryBootstrap({ enabled = "1", count = "10" } = {}) {
  const root = new FakeNode("html");
  const section = new FakeNode("section");
  section.hidden = true;
  const list = new FakeNode("div");
  const ids = new Map([
    ["frequentSitesSection", section],
    ["frequentSitesList", list]
  ]);
  const storage = new Map([
    ["mosaicsync.frequently-visited.v1", enabled],
    ["mosaicsync.frequently-visited-count.v1", count]
  ]);
  const document = {
    documentElement: root,
    getElementById: id => ids.get(id) || null,
    createElement: tag => new FakeNode(tag),
    createDocumentFragment: () => {
      const fragment = new FakeNode("fragment");
      fragment.isFragment = true;
      return fragment;
    }
  };
  const context = {
    document,
    localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null },
    globalThis: null
  };
  context.globalThis = context;
  context.__mosaicsyncBootstrapConfig = Object.freeze({
    frequentPrefKey: "mosaicsync.frequently-visited.v1",
    frequentCountPrefKey: "mosaicsync.frequently-visited-count.v1"
  });
  const source = fs.readFileSync("dist/firefox/newtab/frequent-geometry-bootstrap.js", "utf8");
  vm.createContext(context);
  vm.runInContext(source, context);
  return { root, section, list };
}

test("1.30.18.18 enabled Frequently Visited reserves its final row geometry before the shortcut bootstrap paints", () => {
  const { root, section, list } = runGeometryBootstrap({ enabled: "1", count: "10" });
  assert.equal(section.hidden, false, "FV must occupy layout space before the cached shortcut grid can paint");
  assert.equal(section.classList.contains("frequent-sites-first-paint-reserved"), true);
  assert.equal(section.getAttribute("aria-hidden"), "true", "the invisible geometry reservation must not enter the accessibility tree");
  assert.equal(root.dataset.bootFrequentGeometry, "10");
  assert.equal(list.children.length, 10, "configured FV count should drive responsive placeholder row geometry");
  for (const card of list.children) {
    assert.equal(card.classList.contains("frequent-site-first-paint-placeholder"), true);
    assert.equal(card.getAttribute("aria-hidden"), "true");
    assert.equal(card.children.length, 1, "placeholder must carry the same 24px row-height anchor as a real favicon card");
    assert.equal(card.children[0].classList.contains("frequent-site-fallback"), true);
  }
});

test("1.30.18.18 disabled Frequently Visited preserves the old zero-space first frame", () => {
  const { root, section, list } = runGeometryBootstrap({ enabled: "0", count: "10" });
  assert.equal(section.hidden, true);
  assert.equal(section.classList.contains("frequent-sites-first-paint-reserved"), false);
  assert.equal(section.getAttribute("aria-hidden"), null);
  assert.equal(root.dataset.bootFrequentGeometry, undefined);
  assert.equal(list.children.length, 0);
});

test("1.30.18.18 geometry bootstrap is privacy-safe and runs before the synchronous shortcut painter", () => {
  const html = fs.readFileSync("dist/firefox/newtab/newtab.html", "utf8");
  const bootstrap = fs.readFileSync("dist/firefox/newtab/frequent-geometry-bootstrap.js", "utf8");
  const css = fs.readFileSync("dist/firefox/newtab/newtab-critical.css", "utf8");
  const main = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  const config = fs.readFileSync("dist/firefox/newtab/bootstrap-config.js", "utf8");

  assert.ok(html.indexOf('src="frequent-geometry-bootstrap.js"') >= 0);
  assert.ok(html.indexOf('src="frequent-geometry-bootstrap.js"') < html.indexOf('src="render-bootstrap.js"'),
    "FV geometry must be established before the synchronous shortcut cache can become visible");
  assert.match(css, /\.frequent-sites-heading-first-paint-pending\s*\{[^}]*visibility\s*:\s*hidden/i);
  assert.match(bootstrap, /classList\.add\("frequent-sites-first-paint-reserved", "frequent-sites-heading-first-paint-pending"\)/);
  assert.match(config, /frequentPrefKey/);
  assert.match(config, /frequentCountPrefKey/);
  const executable = bootstrap.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(executable, /browser\.|storage\.(?:session|local)|tabs\.|topSites|\.url\b|\.favicon\b/i,
    "the synchronous geometry hint must never read or embed browser-history-derived site data");
  assert.match(main, /frequentSitesList\.replaceChildren\(fragment\)[\s\S]*?classList\.remove\("frequent-sites-first-paint-reserved", "frequent-sites-heading-first-paint-pending"\)[\s\S]*?frequentSitesSection\.hidden = false/,
    "real decoded FV cards must replace the reservation atomically before visibility is released");
});
