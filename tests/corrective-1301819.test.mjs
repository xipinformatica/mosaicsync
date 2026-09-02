import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

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
  const rootNode = new FakeNode("html");
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
    documentElement: rootNode,
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
  return { rootNode, section, list };
}

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test("1.30.18.19 Frequently Visited first-frame reservation is visually invisible while preserving layout", () => {
  const { section, list } = runGeometryBootstrap({ enabled: "1", count: "10" });
  assert.equal(section.hidden, false, "reservation must occupy layout before shortcut paint");
  assert.equal(section.style.visibility, "hidden", "the whole reservation must be paint-hidden, not only aria-hidden");
  assert.equal(list.children.length, 10);
  for (const card of list.children) {
    assert.equal(card.style.visibility, "hidden", "placeholder cards must never flash their normal tile chrome");
  }
});

test("1.30.18.19 authoritative FV rendering pads sparse results to configured capacity without persisting history cardinality", () => {
  const main = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  assert.match(main, /function createFrequentLayoutPlaceholder\(/);
  assert.match(main, /function appendFrequentLayoutPlaceholders\(/);
  assert.match(main, /appendFrequentLayoutPlaceholders\(fragment, list\.length, visibleCount\)/,
    "real FV content must retain configured responsive row capacity when fewer sites are available");
  assert.match(main, /card\.style\.visibility = "hidden"/,
    "padding placeholders must be paint-hidden while retaining exact grid geometry");
  assert.match(main, /if \(list\.length === 0\)[\s\S]{0,300}appendFrequentLayoutPlaceholders\(capacityFragment, 0, visibleCount\)/,
    "enabled-but-empty FV must preserve its startup geometry rather than collapsing after hydration");
});

test("1.30.18.19 FV permission recovery reuses reserved geometry instead of adding a new flow row", () => {
  const main = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  assert.match(main, /frequentPermissionRecovery\.style\.position = "absolute"/);
  assert.match(main, /frequentPermissionRecovery\.style\.top = "50%"/);
  assert.match(main, /frequentPermissionRecovery\.style\.transform = "translateY\(-50%\)"/);
  assert.match(main, /frequentSitesList\.style\.visibility = "hidden"/,
    "permission UI must overlay the reserved FV capacity, not stack beneath it");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.19 ${browser} catastrophic-loss quarantine blocks a durable pending local mutation until recovery is authoritative`, () => {
    const out = runScenario(browser, "sync-loss-13019-pending-journal-quarantine");
    assert.equal(out.quarantinedBeforeReplay, true);
    assert.equal(out.pendingPreservedDuringQuarantine, true);
    assert.equal(out.replayedAfterRecovery, true);
    assert.equal(out.localPreserved, true);
  });
}

test("1.30.18.19 Recovery characterization retains previously-covered restart/corruption/fallback guards", () => {
  const recovery = fs.readFileSync("tests/corrective-13014.test.mjs", "utf8");
  const e2e = fs.readFileSync("tests/production-background-e2e-12617.test.mjs", "utf8");
  const cache = fs.readFileSync("tests/corrective-13010.test.mjs", "utf8");
  const quota = fs.readFileSync("tests/corrective-130185.test.mjs", "utf8");
  assert.match(recovery, /recovering worker restart respects persisted retry grace/);
  assert.match(e2e, /failed profile root flip preserves the previous complete generation/);
  assert.match(cache, /invalid validated\/decompression outcomes never populate the cache/);
  assert.match(quota, /failed replacement still preserves one verified recovery/);
});
