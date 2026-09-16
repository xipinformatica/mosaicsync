import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { testFilesForGroup } from "../tools/test-groups.mjs";
import { assertParityValues } from "./helpers/first-paint-geometry-contract.mjs";

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, ["tests/harness/background-runtime-scenario.mjs", browser, scenario], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
}

function runBootstrap(tileSize, columns) {
  const source = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8");
  const styles = new Map();
  class FakeElement {
    constructor() {
      this.hidden = false;
      this.inert = false;
      this.dataset = {};
      this.children = [];
      this.style = { setProperty(name, value) { styles.set(name, String(value)); } };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    setAttribute() {}
  }
  const root = new FakeElement();
  const grid = new FakeElement();
  const emptyState = new FakeElement();
  const store = new Map([
    ["render-manifest", JSON.stringify({
      version: 1, ready: true, paintSpaceId: "personal",
      layout: { columns, rows: 4, tileSize, brandVisible: true }, shortcuts: []
    })],
    ["mosaicsync.default-space.v1", "last"]
  ]);
  const context = {
    __mosaicsyncBootstrapConfig: { renderManifestKey: "render-manifest", renderManifestVersion: 1 },
    performance: { now: () => 1 },
    localStorage: { getItem: key => store.get(key) ?? null },
    document: {
      documentElement: root,
      getElementById(id) { return id === "shortcutGrid" ? grid : id === "emptyState" ? emptyState : null; },
      querySelector() { return null; }, createDocumentFragment() { return new FakeElement(); }, createElement() { return new FakeElement(); }
    },
    requestAnimationFrame(fn) { fn(); }, setTimeout(fn) { fn(); },
    Set, Map, JSON, Number, Math, String, Object, Array, Date, console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return styles;
}

function runAuthoritativeGeometry(tileSize, columns) {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = source.indexOf('  let lastAppliedGeometryKey = "";');
  const end = source.indexOf("\n  function paintAppearancePreviewLayer", start);
  assert.ok(start >= 0 && end > start, "could not extract authoritative applySettings geometry owner");
  const snippet = `${source.slice(start, end)}\n  globalThis.__applySettings = applySettings;`;
  const styles = new Map();
  const context = {
    state: { settings: { tileSize, columns, brandVisible: true } },
    clampInt(value, min, max, fallback) {
      const number = Number(value);
      return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
    },
    document: { documentElement: { style: { setProperty(name, value) { styles.set(name, String(value)); } } } },
    applyPageBackgroundVisual() {}, applyThemeSkinVisual() {}, brand: { hidden: false },
    Math, Number, String, Object, Array, console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(snippet, context);
  context.__applySettings({ deferHeavyAssets: true });
  return styles;
}



test("1.33.0.23 healthy Sync-watch uses one targeted liveness probe plus one authoritative full read", () => {
  for (const browser of ["firefox", "chrome"]) {
    const routine = runScenario(browser, "snow-step5b-sync-watch-routine");
    assert.equal(routine.storage.sync.getCalls, 2, `${browser} routine should keep two total Sync reads`);
    assert.equal(routine.storage.sync.getAllCalls, 1, `${browser} routine should perform only the authoritative full namespace read`);

    const gcDue = runScenario(browser, "snow-step5b-sync-watch-gc-due");
    assert.equal(gcDue.storage.sync.getCalls, 3, `${browser} GC-due should keep three total Sync reads`);
    assert.equal(gcDue.storage.sync.getAllCalls, 2, `${browser} GC-due should use one authoritative and one maintenance full read`);
  }
});

test("1.33.0.23 positive-only catastrophic liveness probe cannot replace negative confirmation", () => {
  const source = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const start = source.indexOf("async function beginOrContinueCatastrophicSyncRecovery");
  const end = source.indexOf("\n  async function", start + 20);
  const body = source.slice(start, end > start ? end : source.length);
  assert.match(source, /function liveSyncCoreProbeKeys\(\)[\s\S]*SYNC_RESET_INTENT_KEY[\s\S]*SYNC_SETTINGS_KEY[\s\S]*SYNC_DATASET_KEY[\s\S]*workNamespace\.settingsKey[\s\S]*workNamespace\.datasetKey/s,
    "probe must contain only the fixed live-core keys plus reset intent");
  assert.match(body, /storage\.sync\.get\(liveSyncCoreProbeKeys\(\)\)/,
    "healthy path must begin with the targeted fixed-core/reset probe");
  assert.match(body, /if \(hasLiveSyncCoreSignal\([^)]*\)\) return null;[\s\S]*storage\.sync\.get\(null\)[\s\S]*storage\.sync\.get\(null\)/s,
    "probe uncertainty must fall through to the original two independent full negative confirmations");
});

test("1.33.0.23 synchronous bootstrap geometry equals the real authoritative applySettings owner", () => {
  for (const tileSize of [60, 68, 76, 84, 96]) {
    for (const columns of [6, 9, 12]) {
      const bootstrap = runBootstrap(tileSize, columns);
      const authoritative = runAuthoritativeGeometry(tileSize, columns);
      assertParityValues(bootstrap, authoritative, `${tileSize}px/${columns} columns`);
    }
  }
});


function makeArtworkElement(tagName = "div") {
  return {
    tagName: String(tagName).toLowerCase(),
    className: "", textContent: "", children: [], dataset: {}, style: {},
    classList: { add() {} },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, addEventListener() {}, remove() { this.removed = true; }
  };
}

function artworkOutcome(container) {
  const child = container.children[0];
  if (!child) return "deferred";
  if (child.tagName === "img") return "artwork";
  if (child.className === "builtin-marker") return "builtin";
  if (child.className === "fallback-icon") return "fallback";
  return child.className || child.tagName || "unknown";
}

function runBootstrapArtwork(item) {
  let source = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8");
  source = source.replace("\n  try {\n    if (!KEY ||", "\n  globalThis.__appendPreviewOrFallback = appendPreviewOrFallback;\n  try {\n    if (!KEY ||");
  const root = makeArtworkElement("html");
  root.style = { setProperty() {} };
  const grid = makeArtworkElement("div");
  const emptyState = makeArtworkElement("div");
  const context = {
    __mosaicsyncBootstrapConfig: { renderManifestKey: "missing-manifest", renderManifestVersion: 1 },
    __mosaicsyncBuiltinIcons: {
      append(target, icon) {
        if (!icon) return false;
        const marker = makeArtworkElement("span"); marker.className = "builtin-marker"; target.append(marker); return true;
      }
    },
    performance: { now: () => 1 }, localStorage: { getItem: () => null },
    document: {
      documentElement: root,
      getElementById(id) { return id === "shortcutGrid" ? grid : id === "emptyState" ? emptyState : null; },
      querySelector() { return null; }, createElement: makeArtworkElement, createDocumentFragment() { return makeArtworkElement("fragment"); }
    },
    Set, Map, JSON, Number, Math, String, Object, Array, Date, console
  };
  context.globalThis = context;
  vm.createContext(context); vm.runInContext(source, context);
  const target = makeArtworkElement("span");
  context.__appendPreviewOrFallback(target, item);
  return artworkOutcome(target);
}

function runAuthoritativeArtwork({ image = "", builtinIcon = "", imageDeferred = false } = {}) {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = source.indexOf("  function createArtworkImage");
  const end = source.indexOf("\n  // ---------------------------------------------------------------------------\n  // Layout mutation", start);
  assert.ok(start >= 0 && end > start, "could not extract authoritative artwork owner");
  const snippet = `${source.slice(start, end)}\n  globalThis.__appendImageOrFallback = appendImageOrFallback;`;
  const context = {
    bootArtworkPreviewFor() { return ""; }, graphemeSegmenter: null,
    __mosaicsyncBuiltinIcons: {
      append(target, icon) {
        if (!icon) return false;
        const marker = makeArtworkElement("span"); marker.className = "builtin-marker"; target.append(marker); return true;
      }
    },
    document: { createElement: makeArtworkElement },
    requestAnimationFrame(fn) { fn(); }, String, Symbol, console
  };
  context.globalThis = context;
  vm.createContext(context); vm.runInContext(snippet, context);
  const target = makeArtworkElement("span");
  context.__appendImageOrFallback(target, image, "Alpha", builtinIcon, { imageDeferred });
  return artworkOutcome(target);
}

test("1.33.0.23 first-paint artwork ownership preserves the same four semantic states", () => {
  const preview = "data:image/png;base64,AA==";
  const cases = [
    ["artwork", runBootstrapArtwork({ title: "Alpha", preview }), runAuthoritativeArtwork({ image: preview })],
    ["builtin", runBootstrapArtwork({ title: "Alpha", builtinIcon: "home" }), runAuthoritativeArtwork({ builtinIcon: "home" })],
    ["deferred", runBootstrapArtwork({ title: "Alpha", imageKey: "asset-known" }), runAuthoritativeArtwork({ imageDeferred: true })],
    ["fallback", runBootstrapArtwork({ title: "Alpha" }), runAuthoritativeArtwork({})]
  ];
  for (const [expected, bootstrap, authoritative] of cases) {
    assert.equal(bootstrap, expected, `bootstrap ${expected} semantic state`);
    assert.equal(authoritative, expected, `authoritative ${expected} semantic state`);
  }
});

test("1.33.0.23 permanent coverage belongs to every affected engineering group", () => {
  for (const group of ["startup", "newtab", "sync", "recovery", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133023.test.mjs"), `${group} must include corrective-133023.test.mjs`);
  }
});

test("1.33.0.23 ambiguous dynamic-item-only live core falls back instead of false-quarantining", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "corrective-133023-probe-dynamic-item-only");
    assert.equal(result.lossState, "none");
    assert.ok(result.storage.sync.getAllCalls >= 1);
  }
});

test("1.33.0.23 empty namespace still requires two independent full negative confirmations", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "corrective-133023-probe-empty-namespace");
    assert.equal(result.reason, "remote-loss-quarantine");
    assert.equal(result.storage.sync.getAllCalls, 2);
  }
});

test("1.33.0.23 targeted probe failure is optimization-only and preserves the full-read authority path", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "corrective-133023-probe-read-failure");
    assert.equal(result.lossState, "none");
    assert.ok(result.storage.sync.getAllCalls >= 2);
  }
});
