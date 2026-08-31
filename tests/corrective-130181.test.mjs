import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

class Area {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    return {};
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

class MemoryLocalStorage {
  constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  contains(name) { return String(this.owner.className || "").split(/\s+/).includes(name); }
  add(name) {
    const set = new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean));
    set.add(name); this.owner.className = [...set].join(" ");
  }
  remove(name) {
    this.owner.className = String(this.owner.className || "").split(/\s+/).filter(v => v && v !== name).join(" ");
  }
  toggle(name, force) { if (force === false) this.remove(name); else this.add(name); }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.hidden = false;
    this.inert = false;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.textContent = "";
    this.href = "";
    this.rel = "";
    this.title = "";
    this.type = "";
    this.draggable = false;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      if (node.__fragment) this.children.push(...node.children);
      else this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) {
    if (name === "href") return this.href || null;
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

function fakeBootstrapDocument() {
  const root = new FakeElement("html");
  const grid = new FakeElement("div");
  const empty = new FakeElement("div");
  const frequentSection = new FakeElement("section");
  const frequentList = new FakeElement("div");
  const brand = new FakeElement("header");
  const byId = new Map([
    ["shortcutGrid", grid], ["emptyState", empty], ["frequentSitesSection", frequentSection], ["frequentSitesList", frequentList]
  ]);
  return {
    document: {
      documentElement: root,
      getElementById: id => byId.get(id) || null,
      querySelector: selector => selector === ".brand" ? brand : null,
      createElement: tag => new FakeElement(tag),
      createDocumentFragment: () => { const fragment = new FakeElement("fragment"); fragment.__fragment = true; return fragment; }
    },
    root, grid, empty, frequentSection, frequentList
  };
}

function runBootstrap(manifest, extraStorage = {}) {
  const dom = fakeBootstrapDocument();
  const storage = new MemoryLocalStorage({
    "mosaicsync.render-manifest.v1": JSON.stringify(manifest),
    "mosaicsync.frequently-visited-hidden-domains.v1": "[]",
    "mosaicsync.shortcut-usage.v1": "{}",
    ...extraStorage
  });
  const source = fs.readFileSync("dist/firefox/newtab/render-bootstrap.js", "utf8");
  const context = {
    console,
    URL,
    document: dom.document,
    localStorage: storage,
    performance: { now: () => 1 },
    requestAnimationFrame: callback => { callback(); return 1; },
    setTimeout: callback => { callback(); return 1; },
    __mosaicsyncSafeShortcutNavigationUrl: safeUrl,
    __mosaicsyncBuiltinIcons: { append: () => false, isValid: () => false }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { ...dom, context, storage };
}

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  const brace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i], next = source[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function shortcut(id, position, overrides = {}) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image: "", builtinIcon: "",
    colorTag: "", imageStyle: "contain", localImageAssetId: "", imageAssetId: "",
    imageSourceKind: "none", imageSourceUrl: "", position, createdAt: 1, modifiedAt: 1, source: "manual",
    ...overrides
  };
}

const previousBrowser = globalThis.browser;
globalThis.browser = { storage: { local: new Area(), session: new Area() } };
const constants = await import(`${pathToFileURL(resolve("dist/firefox/core/constants.js")).href}?130181=${Date.now()}`);
const model = await import(`${pathToFileURL(resolve("dist/firefox/core/model.js")).href}?130181=${Date.now()}`);
const storageModule = await import(`${pathToFileURL(resolve("dist/firefox/core/storage.js")).href}?130181=${Date.now()}`);

process.on("exit", () => { globalThis.browser = previousBrowser; });

test("1.30.18.1 raw local Spaces authority is shared with materialization semantics", () => {
  assert.equal(storageModule.rawStateMultipleSpacesEnabled({ spaces: { personal: { settings: { multipleSpacesEnabled: false } } } }), false);
  assert.equal(storageModule.rawStateMultipleSpacesEnabled({ spaces: { personal: { settings: { multipleSpacesEnabled: true } } } }), true);
  assert.equal(storageModule.rawStateMultipleSpacesEnabled({ shortcuts: [] }), true, "legacy/pre-Spaces state must preserve compatibility");
});

test("1.30.18.1 render-manifest persistence projects Personal while Multiple Spaces is disabled", async () => {
  const previousLocalStorage = globalThis.localStorage;
  const localStorage = new MemoryLocalStorage();
  globalThis.localStorage = localStorage;
  try {
    const url = `${pathToFileURL(resolve("dist/firefox/newtab/render-manifest.js")).href}?130181-manifest=${Date.now()}`;
    const manifestModule = await import(url);
    const personal = {
      shortcuts: [shortcut("personal-item", 0)],
      settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: false, columns: 6, rows: 2, tileSize: 76 },
      settingsClock: {}, settingsModifiedAt: 100, updatedAt: 100
    };
    const work = {
      shortcuts: [shortcut("work-item", 0)],
      settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: false, columns: 8, rows: 3, tileSize: 90 },
      settingsClock: {}, settingsModifiedAt: 200, updatedAt: 200
    };
    const state = model.normalizeState({ activeSpaceId: "work", spaces: { personal, work } });
    assert.equal(state.activeSpaceId, "work");
    assert.equal(manifestModule.persistRenderManifest(state, { onboardingCompleted: true }), true);
    const stored = JSON.parse(localStorage.getItem(constants.RENDER_MANIFEST_KEY));
    assert.equal(stored.activeSpaceId, "personal");
    assert.deepEqual(stored.shortcuts.map(item => item.id), ["personal-item"]);
    assert.equal(stored.columns, 6);
    assert.equal(stored.rows, 2);
    assert.equal(stored.tileSize, 76);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("1.30.18.1 synchronous boot manifest refuses the Work grid while global Frequently Visited remains visual-only", () => {
  const base = {
    version: 2,
    onboardingCompleted: true,
    updatedAt: 10,
    settingsModifiedAt: 10,
    columns: 6,
    rows: 2,
    tileSize: 76,
    brandVisible: true,
    shortcuts: [{ type: "shortcut", id: "a", title: "A", url: "https://a.example/", position: 0, imageStyle: "contain" }]
  };

  const frequent = { enabled: true, count: 3, sites: [{ title: "Site", host: "site.example", url: "https://site.example/", favicon: "" }] };
  const firstPaint = activeSpaceId => ({ version: 1, activeSpaceId, multipleSpacesEnabled: true, spaceNames: { personal: "Home", work: "Office" }, frequent });

  const work = runBootstrap({ ...base, activeSpaceId: "work", firstPaint: firstPaint("work") });
  assert.equal(work.root.dataset.bootGrid, undefined);
  assert.equal(work.grid.children.length, 0, "Work cache must not synchronously paint shortcut slots");
  assert.equal(work.frequentSection.hidden, false);
  assert.equal(work.root.dataset.bootFrequent, "true", "global Frequently Visited should paint even while the Work grid stays gated");

  const personal = runBootstrap({ ...base, activeSpaceId: "personal", firstPaint: firstPaint("personal") });
  assert.equal(personal.root.dataset.bootGrid, "true");
  assert.equal(personal.grid.inert, true);
  assert.equal(personal.empty.inert, true);
  assert.equal(personal.frequentSection.inert, true);
  assert.equal(personal.root.dataset.bootFrequent, "true");
  assert.ok(personal.grid.children.length > 0, "Personal boot grid should retain synchronous visual acceleration");
});

test("1.30.18.1 boot folder adoption rejects stale cached child title or URL", () => {
  const source = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "bootGridMatchesState");

  const makeSlot = (folderTitle, childId) => {
    const label = { textContent: folderTitle };
    const cell = { dataset: { id: childId } };
    const card = {
      classList: { contains: name => name === "folder-card" },
      querySelector: selector => selector.includes("shortcut-label") ? label : null,
      querySelectorAll: selector => selector === ".folder-mosaic-cell" ? [cell] : []
    };
    return {
      dataset: { id: "folder" },
      classList: { contains: name => name === "folder-slot" },
      querySelector: selector => selector.includes("shortcut-card") ? card : null
    };
  };
  const emptySlot = { classList: { contains: name => name === "empty-slot" }, dataset: {}, querySelector: () => null };
  const currentChild = shortcut("child", 0, { title: "Current child", url: "https://current.example/" });
  const state = {
    activeSpaceId: "personal",
    updatedAt: 10,
    settingsModifiedAt: 10,
    settings: { columns: 6, rows: 2, tileSize: 76, brandVisible: true },
    shortcuts: [{ type: "folder", id: "folder", title: "Folder", position: 0, items: [currentChild] }]
  };
  const baseManifest = {
    version: 2, activeSpaceId: "personal", updatedAt: 10, settingsModifiedAt: 10,
    columns: 6, rows: 2, tileSize: 76, brandVisible: true,
    shortcuts: [{ type: "folder", id: "folder", title: "Folder", position: 0, items: [{ id: "child", title: "Current child", url: "https://current.example/" }] }]
  };
  const slots = [makeSlot("Folder", "child"), ...Array.from({ length: 11 }, () => emptySlot)];
  const makeContext = manifest => ({
    bootRenderManifest: manifest,
    document: { documentElement: { dataset: { bootGrid: "true" } } },
    meta: {},
    isAwaitingRemote: () => false,
    shortcutOrderMode: "manual",
    recentGridItems: () => [],
    grid: { children: slots },
    shortcutNavigationUrl: item => safeUrl(item?.url),
    safeShortcutNavigationUrl: safeUrl,
    Map,
    Number,
    String,
    Array,
    Boolean
  });

  let ctx = makeContext(structuredClone(baseManifest));
  vm.createContext(ctx); vm.runInContext(`${fn}; this.check=bootGridMatchesState;`, ctx);
  assert.equal(ctx.check(state), true, "exact cached folder child should be adoptable");

  const staleTitle = structuredClone(baseManifest);
  staleTitle.shortcuts[0].items[0].title = "Old child";
  ctx = makeContext(staleTitle); vm.createContext(ctx); vm.runInContext(`${fn}; this.check=bootGridMatchesState;`, ctx);
  assert.equal(ctx.check(state), false, "stale child title must reject adoption");

  const staleUrl = structuredClone(baseManifest);
  staleUrl.shortcuts[0].items[0].url = "https://old.example/";
  ctx = makeContext(staleUrl); vm.createContext(ctx); vm.runInContext(`${fn}; this.check=bootGridMatchesState;`, ctx);
  assert.equal(ctx.check(state), false, "stale child URL must reject adoption");
});

test("1.30.18.1 cached Frequently Visited unlocks independently only on authoritative repaint", () => {
  const source = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "renderFrequentlyVisited");
  const section = { hidden: false, inert: true };
  let clears = 0;
  const list = { replaceChildren: () => { clears += 1; }, append() {} };
  const ctx = {
    frequentSitesSection: section,
    frequentSitesList: list,
    frequentlyVisitedEnabled: false,
    frequentlyVisitedCount: 5,
    document: { documentElement: { dataset: { bootFrequent: "true" } }, createDocumentFragment: () => ({ append() {} }) }
  };
  vm.createContext(ctx); vm.runInContext(`${fn}; this.renderFrequentlyVisited=renderFrequentlyVisited;`, ctx);
  ctx.renderFrequentlyVisited([], { authoritative: false });
  assert.equal(section.inert, true, "cached refresh must not unlock boot Frequent cards");
  assert.equal(ctx.document.documentElement.dataset.bootFrequent, "true");
  ctx.renderFrequentlyVisited([]);
  assert.equal(section.inert, false, "authoritative Frequent refresh owns its own unlock");
  assert.equal(ctx.document.documentElement.dataset.bootFrequent, undefined);
  assert.equal(clears, 2);
});

test("1.30.18.1 fatal startup fallback discards still-unverified cached targets instead of unlocking them", () => {
  const source = fs.readFileSync("dist/firefox/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "discardUnverifiedStartupCaches");
  let gridClears = 0;
  let frequentClears = 0;
  const ctx = {
    grid: { inert: true, hidden: false, replaceChildren: () => { gridClears += 1; } },
    emptyState: { inert: true, hidden: false },
    frequentSitesSection: { inert: true, hidden: false },
    frequentSitesList: { replaceChildren: () => { frequentClears += 1; } }
  };
  vm.createContext(ctx); vm.runInContext(`${fn}; this.discard=discardUnverifiedStartupCaches;`, ctx);
  ctx.discard();
  assert.equal(ctx.grid.hidden, true);
  assert.equal(ctx.emptyState.hidden, true);
  assert.equal(ctx.frequentSitesSection.hidden, true);
  assert.equal(gridClears, 1);
  assert.equal(frequentClears, 1);
  assert.equal(ctx.grid.inert, true, "failure path must not make stale grid actionable");
});

test("1.30.18.1 production startup gates non-Personal session paint on raw local authority and keeps cache inert", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /sessionCache\.state\?\.activeSpaceId !== "personal"[\s\S]*?rawLocal = await localRawPromise;[\s\S]*?sessionBlockedByAuthoritativeSpaces = !rawStateMultipleSpacesEnabled\(rawLocal\?\.result\?\.\[LOCAL_STATE_KEY\]\)/);
  assert.match(source, /keepLauncherCacheVisualOnly\(\);[\s\S]*?paintLoadedState\(sessionCache/,
    "any session-cache render must remain visual-only until authoritative reconciliation");
  assert.match(source, /launcherAuthorityVerified = true;[\s\S]*?reconcileAuthoritativeLocal|reconcileAuthoritativeLocal[\s\S]*?launcherAuthorityVerified = true;/);
  assert.match(source, /stateVisualHydrationSignature\(chosenState\)[\s\S]*?!manualGridRenderEquivalent\(chosenState, state\)/,
    "authoritative reconciliation must use the exact Manual-grid comparator as an additional fail-closed check");
  assert.match(source, /\.catch\(error => \{[\s\S]*?discardUnverifiedStartupCaches\(\);[\s\S]*?showToast\(t\("localDataLoadFailed"\)\)/);
});
