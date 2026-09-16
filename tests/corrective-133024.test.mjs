import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  FIRST_PAINT_GEOMETRY_OWNERSHIP,
  FIRST_PAINT_PARITY_PROBES,
  assertOwnershipComplete
} from "./helpers/first-paint-geometry-contract.mjs";



function makeStyleRecorder(styles) {
  return { setProperty(name, value) { styles.set(String(name), String(value)); } };
}

function runBootstrapGeometry(tileSize, columns, source = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8")) {
  const styles = new Map();
  class FakeElement {
    constructor() {
      this.hidden = false;
      this.inert = false;
      this.dataset = {};
      this.children = [];
      this.style = makeStyleRecorder(styles);
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
      querySelector() { return null; },
      createDocumentFragment() { return new FakeElement(); },
      createElement() { return new FakeElement(); }
    },
    requestAnimationFrame(fn) { fn(); },
    setTimeout(fn) { fn(); },
    Set, Map, JSON, Number, Math, String, Object, Array, Date, console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return styles;
}

function runAuthoritativeGeometry(tileSize, columns, source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8")) {
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
    document: { documentElement: { style: makeStyleRecorder(styles) } },
    applyPageBackgroundVisual() {}, applyThemeSkinVisual() {}, brand: { hidden: false },
    Math, Number, String, Object, Array, console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(snippet, context);
  context.__applySettings({ deferHeavyAssets: true });
  return styles;
}


function observedGeometry(sourceOverrides = {}) {
  const authoritativeProperties = new Set();
  const bootstrapProperties = new Set();
  for (const tileSize of [60, 68, 76, 84, 96]) {
    for (const columns of [6, 9, 12]) {
      for (const property of runAuthoritativeGeometry(tileSize, columns, sourceOverrides.authoritative).keys()) authoritativeProperties.add(property);
      for (const property of runBootstrapGeometry(tileSize, columns, sourceOverrides.bootstrap).keys()) bootstrapProperties.add(property);
    }
  }
  return { authoritativeProperties, bootstrapProperties };
}

test("1.33.0.24 first-paint geometry ownership is complete, exclusive and executable", () => {
  const observed = observedGeometry();
  assertOwnershipComplete(observed);
  assert.deepEqual(
    [...observed.authoritativeProperties].sort(),
    [...FIRST_PAINT_GEOMETRY_OWNERSHIP.PARITY_REQUIRED].sort(),
    "current authoritative geometry should be entirely parity-owned"
  );
});

test("1.33.0.24 a newly introduced authoritative first-paint property cannot escape classification", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const needle = '      document.documentElement.style.setProperty("--row-gap", `${Math.round(26 * scale)}px`);';
  assert.ok(source.includes(needle), "mutation anchor must exist in authoritative geometry");
  const mutated = source.replace(needle, `${needle}\n      document.documentElement.style.setProperty(${JSON.stringify(FIRST_PAINT_PARITY_PROBES.AUTHORITATIVE_ONLY)}, "12px");`);
  const observed = observedGeometry({ authoritative: mutated });
  assert.throws(
    () => assertOwnershipComplete(observed),
    new RegExp(`${FIRST_PAINT_PARITY_PROBES.AUTHORITATIVE_ONLY} is authoritative first-paint geometry but has no ownership classification`),
    "a future authoritative property must fail until its ownership is explicitly classified"
  );
});

test("1.33.0.24 a bootstrap-only first-paint property cannot escape authoritative parity ownership", () => {
  const source = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8");
  const needle = '    root.style.setProperty("--row-gap", `${Math.round(26 * scale)}px`);';
  assert.ok(source.includes(needle), "mutation anchor must exist in synchronous bootstrap geometry");
  const mutated = source.replace(needle, `${needle}\n    root.style.setProperty(${JSON.stringify(FIRST_PAINT_PARITY_PROBES.BOOTSTRAP_ONLY)}, "1px");`);
  const observed = observedGeometry({ bootstrap: mutated });
  assert.throws(
    () => assertOwnershipComplete(observed),
    new RegExp(`${FIRST_PAINT_PARITY_PROBES.BOOTSTRAP_ONLY} is written by synchronous bootstrap without PARITY_REQUIRED ownership`),
    "bootstrap may not silently claim a new first-paint geometry responsibility"
  );
});
