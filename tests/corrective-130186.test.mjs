import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = source.indexOf("{\n", start);
  if (brace < 0) brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return String(this.owner.className || "").split(/\s+/).filter(Boolean); }
  contains(name) { return this.values().includes(name); }
  add(name) { this.owner.className = [...new Set([...this.values(), name])].join(" "); }
  remove(name) { this.owner.className = this.values().filter(value => value !== name).join(" "); }
  toggle(name, force) { if (force) this.add(name); else this.remove(name); }
}
class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.children = []; this.className = ""; this.classList = new FakeClassList(this);
    this.dataset = {}; this.hidden = false; this.inert = false; this.textContent = ""; this.attributes = new Map();
    this.style = { setProperty() {} }; this.href = ""; this.rel = ""; this.title = ""; this.type = "";
  }
  append(...nodes) { for (const node of nodes) if (node) this.children.push(...(node.__fragment ? node.children : [node])); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener() {}
  querySelector() { return null; }
}

function makeState(constants, model, { activeSpaceId = "work" } = {}) {
  return model.normalizeState({
    activeSpaceId,
    spaces: {
      personal: {
        shortcuts: [{ id: "p", title: "Personal site", url: "https://personal.example/", position: 0 }],
        settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Home", multipleSpacesEnabled: true, frequentlyVisitedEnabled: true, frequentlyVisitedCount: 5 },
        settingsModifiedAt: 10, updatedAt: 10
      },
      work: {
        shortcuts: [{ id: "w", title: "Work site", url: "https://work.example/", position: 0 }],
        settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Office", multipleSpacesEnabled: true, frequentlyVisitedEnabled: true, frequentlyVisitedCount: 5 },
        settingsModifiedAt: 11, updatedAt: 11
      }
    }
  });
}

const frequent = {
  enabled: true,
  count: 5,
  sites: [{ title: "Example", host: "example.com", url: "https://example.com/", favicon: "" }]
};

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.9 ${browser} persistent Work manifest no longer paints browser-derived Frequently Visited sites`, () => {
    const root = new FakeElement("html");
    const grid = new FakeElement("div");
    const empty = new FakeElement("div");
    const brand = new FakeElement("header");
    const frequentSection = new FakeElement("section"); frequentSection.hidden = true;
    const frequentList = new FakeElement("div");
    const ids = new Map([
      ["shortcutGrid", grid], ["emptyState", empty],
      ["frequentSitesSection", frequentSection], ["frequentSitesList", frequentList]
    ]);
    const manifest = {
      version: 4, onboardingCompleted: true, activeSpaceId: "work", updatedAt: 11, settingsModifiedAt: 11,
      columns: 6, rows: 2, tileSize: 76, brandVisible: true,
      firstPaint: {
        version: 1, activeSpaceId: "work", multipleSpacesEnabled: true,
        spaceNames: { personal: "Home", work: "Office" }, frequent
      },
      shortcuts: [{ type: "shortcut", id: "w", title: "Work", url: "https://work.example/", position: 0, imageStyle: "contain", imageKey: "", preview: "" }]
    };
    const context = {
      console, URL,
      document: {
        documentElement: root,
        getElementById: id => ids.get(id) || null,
        querySelector: selector => selector === ".brand" ? brand : null,
        createElement: tag => new FakeElement(tag),
        createDocumentFragment: () => { const f = new FakeElement("fragment"); f.__fragment = true; return f; }
      },
      localStorage: {
        getItem: key => key === "mosaicsync.render-manifest.v1"
          ? JSON.stringify(manifest)
          : (key.endsWith("hidden-domains.v1") ? "[]" : "{}")
      },
      performance: { now: () => 1 },
      requestAnimationFrame: cb => { cb(); return 1; },
      setTimeout: cb => { cb(); return 1; },
      __mosaicsyncBootstrapConfig: { renderManifestKey: "mosaicsync.render-manifest.v1", renderManifestVersion: 4 }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(`dist/${browser}/core/http-url-safety.js`, "utf8"), context);
    context.__mosaicsyncBuiltinIcons = { append: () => false, isValid: () => false };
    vm.runInContext(fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8"), context);

    assert.equal(frequentSection.hidden, true, "persistent manifest must not resurrect browser-derived Frequently Visited sites");
    assert.equal(frequentList.children.length, 0);
    assert.notEqual(root.dataset.bootFrequent, "true");
    assert.notEqual(root.dataset.bootGrid, "true", "Work grid safety gate must remain intact");
  });

  test(`1.30.18.9 ${browser} obsolete v2 persistent manifest bridge is retired`, () => {
    const root = new FakeElement("html");
    const grid = new FakeElement("div");
    const empty = new FakeElement("div");
    const brand = new FakeElement("header");
    const frequentSection = new FakeElement("section"); frequentSection.hidden = true;
    const frequentList = new FakeElement("div");
    const ids = new Map([["shortcutGrid", grid], ["emptyState", empty], ["frequentSitesSection", frequentSection], ["frequentSitesList", frequentList]]);
    const legacy = {
      version: 2, onboardingCompleted: true, activeSpaceId: "work", updatedAt: 11, settingsModifiedAt: 11,
      columns: 6, rows: 2, tileSize: 76, brandVisible: true, multipleSpacesEnabled: true,
      spaceNames: { personal: "Home", work: "Office" }, frequent, shortcuts: []
    };
    const context = {
      console, URL, document: {
        documentElement: root, getElementById: id => ids.get(id) || null,
        querySelector: selector => selector === ".brand" ? brand : null,
        createElement: tag => new FakeElement(tag), createDocumentFragment: () => { const f = new FakeElement("fragment"); f.__fragment = true; return f; }
      },
      localStorage: { getItem: key => key === "mosaicsync.render-manifest.v1" ? JSON.stringify(legacy) : (key.endsWith("hidden-domains.v1") ? "[]" : "{}") },
      performance: { now: () => 1 }, requestAnimationFrame: cb => { cb(); return 1; }, setTimeout: cb => { cb(); return 1; },
      __mosaicsyncBootstrapConfig: { renderManifestKey: "mosaicsync.render-manifest.v1", renderManifestVersion: 4 }
    };
    context.globalThis = context; vm.createContext(context);
    vm.runInContext(fs.readFileSync(`dist/${browser}/core/http-url-safety.js`, "utf8"), context);
    context.__mosaicsyncBuiltinIcons = { append: () => false, isValid: () => false };
    vm.runInContext(fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8"), context);
    assert.notEqual(root.dataset.bootFrequent, "true");
    assert.equal(frequentList.children.length, 0);
    assert.notEqual(root.dataset.bootGrid, "true");
  });

  test(`1.30.18.9 ${browser} persistent manifest shares structural first-paint truth while FV sites are session-owned`, async () => {
    const previous = globalThis.localStorage;
    const data = new Map();
    globalThis.localStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: key => data.delete(key)
    };
    try {
      const nonce = `${Date.now()}-${browser}`;
      const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?130186-c=${nonce}`);
      const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?130186-m=${nonce}`);
      const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?130186-s=${nonce}`);
      const manifestModule = await import(`${pathToFileURL(resolve(`dist/${browser}/newtab/render-manifest.js`)).href}?130186-r=${nonce}`);
      const state = makeState(constants, model);
      const session = storage.createRenderSnapshot(state, { frequentSnapshot: frequent });
      assert.equal(manifestModule.persistRenderManifest(state, { onboardingCompleted: true }, null, frequent), true);
      const manifest = JSON.parse(data.get(constants.RENDER_MANIFEST_KEY));
      assert.equal(manifest.version, constants.RENDER_MANIFEST_SCHEMA_VERSION);
      assert.deepEqual(manifest.firstPaint.spaceNames, session.firstPaint.spaceNames);
      assert.equal(manifest.firstPaint.activeSpaceId, session.firstPaint.activeSpaceId);
      assert.equal(manifest.firstPaint.multipleSpacesEnabled, session.firstPaint.multipleSpacesEnabled);
      assert.deepEqual(manifest.firstPaint.frequent?.sites || [], [], "persistent manifest must never retain browser-derived site candidates");
      assert.equal(session.firstPaint.frequent.sites[0].url, "https://example.com/", "session layer remains the device-local FV owner");
    } finally { globalThis.localStorage = previous; }
  });

  test(`1.30.18.6 ${browser} Sync usage reports recovery safety copies separately from layout and settings`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = ["assetIdsByUsage", "syncUsageBreakdown"].map(name => extractFunction(src, name)).join("\n");
    const sizes = new Map([
      ["mosaicsync.sync.settings", 100],
      ["mosaicsync.sync.item.a", 200],
      ["mosaicsync.sync.device.device-a.snapshot.commit-a", 300],
      ["mosaicsync.sync.device.device-a.snapshot.commit-a.chunk.0", 400],
      ["mosaicsync.sync.cleanup-marker", 50]
    ]);
    const context = {
      SYNC_PREFIX: "mosaicsync.sync.", SYNC_SETTINGS_KEY: "mosaicsync.sync.settings",
      SYNC_ITEM_PREFIX: "mosaicsync.sync.item.", WORK_SPACE_ID: "work", SYNC_QUOTA_BYTES: 102400,
      syncNamespace: () => ({ settingsKey: "mosaicsync.sync.space.work.settings", datasetKey: "mosaicsync.sync.space.work.dataset", itemPrefix: "mosaicsync.sync.space.work.item." }),
      isDeviceSnapshotKey: key => key.startsWith("mosaicsync.sync.device."),
      browser: { storage: { sync: { getBytesInUse: async keys => keys.reduce((sum, key) => sum + (sizes.get(key) || 0), 0) } } }
    };
    vm.createContext(context); vm.runInContext(`${code}; this.breakdown=syncUsageBreakdown;`, context);
    const all = Object.fromEntries([...sizes.keys()].map(key => [key, {}]));
    const usage = await context.breakdown(all, 1050);
    assert.equal(usage.core, 300);
    assert.equal(usage.recovery, 700);
    assert.equal(usage.overhead, 50);
    assert.equal(usage.shortcutArtwork, 0);
  });

  test(`1.30.18.6 ${browser} Sync quota warning thresholds match the user-facing policy`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const fn = extractFunction(src, "syncStoragePressure");
    const context = { SYNC_QUOTA_WARNING_FREE_BYTES: 25 * 1024, SYNC_QUOTA_CRITICAL_FREE_BYTES: 10 * 1024 };
    vm.createContext(context); vm.runInContext(`${fn}; this.pressure=syncStoragePressure;`, context);
    assert.equal(context.pressure(26 * 1024), "normal");
    assert.equal(context.pressure(25 * 1024), "warning");
    assert.equal(context.pressure(10 * 1024), "warning");
    assert.equal(context.pressure(10 * 1024 - 1), "critical");
  });
}

test("1.30.18.6 all locale catalogs contain the new Sync-storage UX strings", async () => {
  const localeFiles = fs.readdirSync("src/shared/core/i18n-locales").filter(name => name.endsWith(".js"));
  const required = [
    "recoverySafetyCopies", "syncRecoveryLimitedWarning", "syncReadyRecoveryLimited", "syncReadyStorageLimited",
    "syncStorageGettingFull", "syncStorageAlmostFull", "syncStorageFreeRemaining", "syncStorageFull", "syncStorageFullLocalSafe"
  ];
  assert.ok(localeFiles.length >= 30);
  for (const name of localeFiles) {
    const source = fs.readFileSync(`src/shared/core/i18n-locales/${name}`, "utf8");
    for (const key of required) assert.match(source, new RegExp(`\\"${key}\\"\\s*:`), `${name} missing ${key}`);
  }
});

test("1.30.18.6 architecture document defines the maintainability boundaries and first-paint contract", () => {
  const doc = fs.readFileSync("docs/ARCHITECTURE.md", "utf8");
  for (const phrase of ["Authoritative state", "Normal Sync", "Recovery", "Artwork", "First Paint", "Browser adapters", "Import / export", "device-local", "synchronized"]) {
    assert.match(doc, new RegExp(phrase, "i"), `architecture document should explain ${phrase}`);
  }
});
