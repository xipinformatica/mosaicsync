import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  DEFAULT_META,
  DEFAULT_STATE
} from "../src/shared/core/constants.js";
import {
  faviconPreferenceForCandidate,
  faviconPreferenceMatchesCandidate,
  flattenStateNormalized,
  normalizeFaviconPreference,
  normalizeState
} from "../src/shared/core/model.js";

const root = resolve(import.meta.dirname, "..");

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (line) { if (char === "\n") line = false; continue; }
    if (block) { if (char === "*" && next === "/") { block = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { line = true; index += 1; continue; }
    if (char === "/" && next === "*") { block = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing block ${startMarker}`);
  return source.slice(start, end).trim();
}

function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

class FakeNode {
  constructor(tag = "") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this.hidden = false;
    this.inert = false;
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes.flatMap(node => node?.isFragment ? node.children : [node]).filter(Boolean); }
  setAttribute() {}
  addEventListener() {}
  replaceWith(node) { this.replacedWith = node; }
}

function makeFrequentDom(decodeGate) {
  const section = new FakeNode("section");
  section.hidden = true;
  const list = new FakeNode("div");
  const documentElement = { dataset: { bootFrequent: "true" } };
  const document = {
    documentElement,
    querySelectorAll: () => [],
    createDocumentFragment() { const fragment = new FakeNode("fragment"); fragment.isFragment = true; return fragment; },
    createElement(tag) {
      const node = new FakeNode(tag);
      if (tag === "img") {
        node.decode = () => decodeGate.promise;
        node.complete = false;
        node.naturalWidth = 32;
      }
      return node;
    }
  };
  return { section, list, document };
}

test("1.30.18.12 slow FV decode cannot resurrect a strip after disable/empty render", async () => {
  const source = fs.readFileSync(resolve(root, "dist/firefox/newtab/newtab.js"), "utf8");
  const gate = deferred();
  const { section, list, document } = makeFrequentDom(gate);
  const context = {
    frequentSitesSection: section,
    frequentSitesList: list,
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 5,
    frequentRenderCommitGeneration: 0,
    shortcutOrderMode: "manual",
    frequentDragSite: null,
    document,
    frequentHostLabel: () => "example.test",
    showFrequentSiteContextMenu: () => {},
    frequentFallbackFor: () => new FakeNode("span"),
    settleFrequentIconBeforeCommit: async icon => {
      try { await icon.decode(); return true; } catch { return false; }
    },
    Promise
  };
  vm.createContext(context);
  vm.runInContext(`${extractBetween(source, "async function renderFrequentlyVisited", "function setFrequentlyVisitedOptionsVisibility")}; this.renderFrequentlyVisited = renderFrequentlyVisited;`, context);

  const oldRender = context.renderFrequentlyVisited([{ title:"Example", url:"https://example.test/", favicon:"data:image/png;base64,AAAA" }]);
  await Promise.resolve();
  assert.equal(section.hidden, true, "detached slow-decode render must not be visible yet");

  await context.renderFrequentlyVisited([], { enabled:false });
  assert.equal(section.hidden, true);
  assert.equal(list.children.length, 0);

  gate.resolve();
  assert.equal(await oldRender, false, "older render must report that its commit lost authority");
  assert.equal(section.hidden, true, "disabled FV must stay hidden after older decode resolves");
  assert.equal(list.children.length, 0, "stale detached cards must never be committed");
});

test("1.30.18.12 live FV rendering keeps original favicon when session derivative preparation fails", async () => {
  const source = fs.readFileSync(resolve(root, "dist/firefox/newtab/newtab.js"), "utf8");
  const original = "data:image/png;base64," + "A".repeat(7000);
  const site = { title:"Example", url:"https://example.test/", favicon:original };
  let rendered = null;
  let projected = null;
  const context = {
    frequentRefreshGeneration: 0,
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 5,
    frequentLiveSites: [],
    state: { spaces:{ personal:{ shortcuts:[] }, work:{ shortcuts:[] } } },
    stateMutationGeneration: 0,
    hasTopSitesPermission: async () => true,
    setFrequentlyVisitedPermissionActionVisible: () => {},
    setFrequentlyVisitedPermissionRecoveryVisible: () => {},
    frequentExplicitHostsForState: () => new Set(),
    frequentCandidates: async () => [site],
    canonicalSiteHost: () => "example.test",
    isFrequentHostHidden: () => false,
    prepareFrequentlyVisitedSites: async sites => sites.map(value => ({ ...value, favicon:"" })),
    renderFrequentlyVisited: async sites => { rendered = structuredClone(sites); return true; },
    updateFrequentRenderSnapshot: sites => { projected = structuredClone(sites); },
    setFrequentlyVisitedStatus: () => {},
    frequentRenderSnapshot: null,
    Promise,
    structuredClone
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(source, "refreshFrequentlyVisited")}; this.refreshFrequentlyVisited = refreshFrequentlyVisited;`, context);
  await context.refreshFrequentlyVisited();
  assert.equal(rendered[0].favicon, original, "live strip must decode/render the rich browser candidate");
  assert.equal(projected[0].favicon, "", "failed disposable derivative may be absent only from the session projection");
});

class Area {
  constructor(initial = {}) { this.data = structuredClone(initial); }
  async get(keys = null) {
    const snapshot = structuredClone(this.data);
    if (keys == null) return snapshot;
    if (typeof keys === "string") return Object.hasOwn(snapshot, keys) ? { [keys]: snapshot[keys] } : {};
    const out = {};
    for (const key of Array.isArray(keys) ? keys : Object.keys(keys || {})) if (Object.hasOwn(snapshot, key)) out[key] = snapshot[key];
    return out;
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}
class Locks {
  constructor() { this.tail = Promise.resolve(); }
  request(_name, callback) {
    const run = this.tail.then(callback);
    this.tail = run.catch(() => {});
    return run;
  }
}

async function withStorageRuntime(browserName, fn) {
  const previousBrowser = globalThis.browser;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const local = new Area(), session = new Area();
  globalThis.browser = { storage:{ local, session } };
  Object.defineProperty(globalThis, "navigator", { configurable:true, value:{ locks:new Locks() } });
  const nonce = `${Date.now()}-${Math.random()}`;
  try {
    const constants = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/constants.js`)).href}?c=${nonce}`);
    const storage = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/storage.js`)).href}?s=${nonce}`);
    return await fn({ constants, storage, local, session });
  } finally {
    globalThis.browser = previousBrowser;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else delete globalThis.navigator;
  }
}

for (const browserName of ["firefox", "chrome"]) {
  test(`1.30.18.12 ${browserName} stale full-record Sync meta cannot restore newer onboarding intent`, async () => {
    await withStorageRuntime(browserName, async ({ constants, storage, local, session }) => {
      await storage.writeLocalMeta({
        ...constants.DEFAULT_META,
        deviceId:"meta-device",
        onboardingCompleted:true,
        onboardingVersion:"1.30.18.11",
        syncEnabled:true,
        syncStatus:"ready"
      });
      const stale = await storage.readLocalMeta();
      await storage.updateLocalMeta({ onboardingCompleted:false, onboardingVersion:"" });
      const result = await storage.writeLocalMeta({ ...stale, syncStatus:"syncing", lastSyncError:"" });
      assert.equal(result.onboardingCompleted, false);
      assert.equal(result.onboardingVersion, "");
      assert.equal(result.syncStatus, "syncing");
      assert.equal(result.deviceId, "meta-device");
      assert.equal(local.data[constants.LOCAL_META_KEY].onboardingCompleted, false);
      assert.equal(session.data[constants.SESSION_RENDER_META_KEY].onboardingCompleted, false,
        "session meta must publish the record that actually won the transaction");
    });
  });
}

test("1.30.18.12 manually selected Browser favicon gets exact compact identity without syncing pixels", () => {
  const image = "data:image/png;base64," + "Q".repeat(1200);
  const preference = faviconPreferenceForCandidate({ image, source:"browser" });
  assert.match(preference, /^i:[0-9a-f]{8}$/);
  assert.notEqual(preference, "b");

  const state = normalizeState({
    ...DEFAULT_STATE,
    shortcuts:[{
      type:"shortcut", id:"browser-choice", title:"Chosen", url:"https://chosen.example/",
      faviconPreference:"b", image, imageSyncData:"", imageAssetId:"", localImageAssetId:"",
      imageSyncKind:"device", imageSourceKind:"upload", imageSourceUrl:"", imageIsFallback:false,
      imageStyle:"contain", position:0, createdAt:10, modifiedAt:20, source:"manual"
    }]
  });
  const record = flattenStateNormalized(state, "home-device").get("browser-choice");
  assert.match(record.favPref, /^i:[0-9a-f]{8}$/, "legacy coarse Browser preference should upgrade from available selected local pixels");
  assert.equal(record.imageKind, "device");
  assert.equal(record.imageAssetId, "");
  assert.equal(JSON.stringify(record).includes("data:image"), false, "exact choice instruction must still sync zero favicon bytes");
});

for (const browserName of ["firefox", "chrome"]) {
  test(`1.30.18.12 ${browserName} exact image preference chooses matching detected favicon rather than this device's different browser fallback`, async () => {
    const source = readBackgroundSource(browserName);
    const chosen = "data:image/png;base64,CHOSEN";
    const wrong = "data:image/png;base64,WRONG";
    const wanted = faviconPreferenceForCandidate({ image:chosen, source:"browser" });
    const context = {
      normalizeFaviconPreference,
      faviconPreferenceMatchesCandidate,
      resolveBrowserCachedFavicon: async () => ({ image:wrong, sourceUrl:"", sourceKind:"browser" }),
      hasWebAccess: async () => true,
      discoverFaviconChoicesForUrl: async () => ({ ok:true, candidates:[
        { image:wrong, sourceUrl:"", source:"browser" },
        { image:chosen, sourceUrl:"https://chosen.example/icon.png", source:"link", width:64, height:64 }
      ] }),
      ICON_RECOVERY_FETCH_TIMEOUT_MS:8000
    };
    vm.createContext(context);
    vm.runInContext(`${extractBetween(source, "async function resolveFaviconForUrlWithPreference", "function flattenShortcuts")}; this.resolvePreferred = resolveFaviconForUrlWithPreference;`, context);
    const result = await context.resolvePreferred("https://chosen.example/", wanted);
    assert.equal(result.image, chosen);
    assert.equal(result.preferenceMatched, true);
  });

  test(`1.30.18.12 ${browserName} exact image preference can resolve permission-free when this browser already has the selected pixels`, async () => {
    const source = readBackgroundSource(browserName);
    const chosen = "data:image/png;base64,CHOSEN";
    const wanted = faviconPreferenceForCandidate({ image:chosen, source:"browser" });
    let discoveryCalled = false;
    const context = {
      normalizeFaviconPreference,
      faviconPreferenceMatchesCandidate,
      resolveBrowserCachedFavicon: async () => ({ image:chosen, sourceUrl:"", sourceKind:"browser" }),
      hasWebAccess: async () => false,
      discoverFaviconChoicesForUrl: async () => { discoveryCalled = true; return { ok:false, candidates:[] }; },
      ICON_RECOVERY_FETCH_TIMEOUT_MS:8000
    };
    vm.createContext(context);
    vm.runInContext(`${extractBetween(source, "async function resolveFaviconForUrlWithPreference", "function flattenShortcuts")}; this.resolvePreferred = resolveFaviconForUrlWithPreference;`, context);
    const result = await context.resolvePreferred("https://chosen.example/", wanted);
    assert.equal(result.image, chosen);
    assert.equal(result.preferenceMatched, true);
    assert.equal(discoveryCalled, false);
  });
}

test("1.30.18.12 structural warm call site no longer carries dead FV plumbing", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const start = source.indexOf("function warmFirstPaintSessionCache");
  const end = source.indexOf("function refreshFirstPaintCaches", start);
  const block = source.slice(start, end);
  assert.match(block, /warmSessionRenderCache\(currentState, currentMeta\)/);
  assert.doesNotMatch(block, /frequentSnapshot/);
});
