import { readBackgroundSource } from "./harness/background-source.mjs";
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

async function modulesFor(browser, suffix) {
  const nonce = `${Date.now()}-${Math.random()}-${suffix}`;
  const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?130187-c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?130187-m=${nonce}`);
  const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?130187-s=${nonce}`);
  return { constants, model, storage };
}

function stateWithFrequent(constants, model, { enabled = true, count = 5, personalName = "Home", workName = "Office" } = {}) {
  return model.normalizeState({
    activeSpaceId: "work",
    spaces: {
      personal: {
        shortcuts: [{ id: "p", title: "Personal", url: "https://personal.example/", position: 0 }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true, spaceName: personalName, frequentlyVisitedEnabled: enabled, frequentlyVisitedCount: count },
        settingsModifiedAt: 10, updatedAt: 10
      },
      work: {
        shortcuts: [{ id: "w", title: "Work", url: "https://work.example/", position: 0 }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true, spaceName: workName, frequentlyVisitedEnabled: enabled, frequentlyVisitedCount: count },
        settingsModifiedAt: 11, updatedAt: 11
      }
    }
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.7 ${browser} current visual-cache boot grid is reusable on a matching warm session path`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const fn = extractFunction(source, "canReuseBootGridForSession");
    const context = { RENDER_MANIFEST_SCHEMA_VERSION: 5, renderCacheGridMatchesState: (manifest, state) => manifest?.marker === state?.marker };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.canReuse=canReuseBootGridForSession;`, context);
    const bootManifest = { version: 5, marker: "same" };
    const sessionState = { marker: "same" };
    assert.equal(context.canReuse({ sessionAwaitingRemote: false, bootGridPainted: true, bootManifest, sessionState }), true);
    assert.equal(context.canReuse({ sessionAwaitingRemote: false, bootGridPainted: true, bootManifest: { ...bootManifest, version: 4 }, sessionState }), false,
      "an obsolete persistent-cache schema must never masquerade as the current reusable visual cache");
    assert.equal(context.canReuse({ sessionAwaitingRemote: false, bootGridPainted: true, bootManifest: { ...bootManifest, marker: "old" }, sessionState }), false);
    assert.equal(context.canReuse({ sessionAwaitingRemote: true, bootGridPainted: true, bootManifest, sessionState }), false);
  });

  test(`1.30.18.7 ${browser} synchronized FV disable overrides a stale enabled first-paint site snapshot`, async () => {
    const previousBrowser = globalThis.browser;
    globalThis.browser = { storage: { session: null } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "disable");
      const state = stateWithFrequent(constants, model, { enabled: false, count: 8 });
      const stale = { enabled: true, count: 5, sites: [{ title: "Old", host: "old.example", url: "https://old.example/", favicon: "" }] };
      const snapshot = storage.createRenderSnapshot(state, { frequentSnapshot: stale });
      assert.deepEqual(snapshot.firstPaint.frequent, { enabled: false, count: 8, sites: [] });
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.7 ${browser} enabled FV with no fresh device-local sites preserves an already truthful boot snapshot`, async () => {
    const previousBrowser = globalThis.browser;
    globalThis.browser = { storage: { session: null } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "preserve");
      const state = stateWithFrequent(constants, model, { enabled: true, count: 5 });
      const snapshot = storage.createRenderSnapshot(state);
      assert.equal(snapshot.firstPaint.frequent, null,
        "background/core state knows the synchronized preference but must not invent or erase a device-local site list");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.7 ${browser} reading a valid session snapshot then warming the identical snapshot performs zero writes`, async () => {
    const previousBrowser = globalThis.browser;
    const store = {};
    const writes = [];
    globalThis.browser = { storage: { session: {
      get: async keys => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(wanted.filter(key => Object.hasOwn(store, key)).map(key => [key, structuredClone(store[key])]));
      },
      set: async items => { writes.push(structuredClone(items)); Object.assign(store, structuredClone(items)); }
    } } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "dedupe");
      const state = stateWithFrequent(constants, model, { enabled: true, count: 5 });
      const frequent = { enabled: true, count: 5, sites: [{ title: "Example", host: "example.com", url: "https://example.com/", favicon: "" }] };
      const meta = { ...constants.DEFAULT_META, deviceId: "device-a", onboardingCompleted: true, syncEnabled: false };
      store[constants.SESSION_RENDER_STATE_KEY] = storage.createRenderSnapshot(state);
      store[constants.SESSION_RENDER_META_KEY] = structuredClone(meta);
      store[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY] = structuredClone(frequent);
      const read = await storage.readSessionRenderCache();
      assert.ok(read);
      writes.length = 0;
      const wrote = await storage.warmSessionRenderCache(state, meta, { frequentSnapshot: frequent });
      assert.equal(wrote, false);
      assert.equal(writes.length, 0, "startup refresh must not rewrite bytes it just read unchanged");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.7 ${browser} Top Sites permission invalidation clears session FV sites but preserves the Show preference`, async () => {
    const previousBrowser = globalThis.browser;
    const store = {};
    const writes = [];
    globalThis.browser = { storage: { session: {
      get: async keys => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(wanted.filter(key => Object.hasOwn(store, key)).map(key => [key, structuredClone(store[key])]));
      },
      set: async items => { writes.push(structuredClone(items)); Object.assign(store, structuredClone(items)); }
    } } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "permission");
      const state = stateWithFrequent(constants, model, { enabled: true, count: 5 });
      const frequent = { enabled: true, count: 5, sites: [{ title: "Private-ish history card", host: "example.com", url: "https://example.com/", favicon: "" }] };
      store[constants.SESSION_RENDER_STATE_KEY] = storage.createRenderSnapshot(state);
      store[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY] = structuredClone(frequent);
      const structuralBefore = structuredClone(store[constants.SESSION_RENDER_STATE_KEY]);
      const changed = await storage.clearSessionFrequentlyVisitedSnapshot();
      assert.equal(changed, true);
      assert.equal(writes.length, 1);
      assert.deepEqual(store[constants.SESSION_RENDER_STATE_KEY], structuralBefore, "permission removal must not rewrite structural session state");
      const next = store[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY];
      assert.equal(next.enabled, true, "permission removal must not rewrite the synchronized Show preference");
      assert.equal(next.count, 5);
      assert.deepEqual(next.sites, []);
      assert.equal(store[constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY], true);
      assert.equal(await storage.clearSessionFrequentlyVisitedSnapshot(), false, "already-cleared session state should not be rewritten again");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.7 ${browser} quota pressure remains the headline when recovery/artwork is also limited`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const code = ["syncLimitationKinds", "syncReadyHeadlineKey"].map(name => extractFunction(source, name)).join("\n");
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${code}; this.headline=syncReadyHeadlineKey;`, context);
    const both = { syncSkippedAssets: 2, syncProfileProtection: "limited" };
    assert.equal(context.headline(both, "critical"), "syncStorageAlmostFull");
    assert.equal(context.headline(both, "warning"), "syncStorageGettingFull");
    assert.equal(context.headline(both, "normal"), "syncReadyStorageLimited");
  });

  test(`1.30.18.7 ${browser} Sync usage buckets conserve bytes including legacy and generation recovery keys`, async () => {
    const source = readBackgroundSource(browser);
    const code = ["assetIdsByUsage", "isDeviceSnapshotKey", "syncUsageBreakdown"].map(name => extractFunction(source, name)).join("\n");
    const sizes = new Map([
      ["mosaicsync.sync.settings", 100],
      ["mosaicsync.sync.item.a", 200],
      ["mosaicsync.sync.asset.asset-a", 90],
      ["mosaicsync.sync.device.legacy-device", 140],
      ["mosaicsync.sync.device.legacy-device.a.chunk.0", 160],
      ["mosaicsync.sync.device.device-a.snapshot.commit-a", 180],
      ["mosaicsync.sync.device.device-a.snapshot.commit-a.chunk.0", 220],
      ["mosaicsync.sync.cleanup-marker", 50]
    ]);
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    const all = {
      "mosaicsync.sync.settings": {},
      "mosaicsync.sync.item.a": { kind: "shortcut", imageKind: "sync", imageAssetId: "asset-a" },
      "mosaicsync.sync.asset.asset-a": { kind: "asset", id: "asset-a" },
      "mosaicsync.sync.device.legacy-device": { kind: "legacy-root" },
      "mosaicsync.sync.device.legacy-device.a.chunk.0": { kind: "device-snapshot-chunk" },
      "mosaicsync.sync.device.device-a.snapshot.commit-a": { kind: "device-snapshot-manifest" },
      "mosaicsync.sync.device.device-a.snapshot.commit-a.chunk.0": { kind: "device-snapshot-chunk" },
      "mosaicsync.sync.cleanup-marker": { kind: "metadata" }
    };
    const context = {
      SYNC_PREFIX: "mosaicsync.sync.", SYNC_DEVICE_SNAPSHOT_PREFIX: "mosaicsync.sync.device.",
      SYNC_SETTINGS_KEY: "mosaicsync.sync.settings", SYNC_ITEM_PREFIX: "mosaicsync.sync.item.", WORK_SPACE_ID: "work", SYNC_QUOTA_BYTES: 102400,
      syncNamespace: () => ({ settingsKey: "mosaicsync.sync.space.work.settings", datasetKey: "mosaicsync.sync.space.work.dataset", itemPrefix: "mosaicsync.sync.space.work.item." }),
      browser: { storage: { sync: { getBytesInUse: async keys => keys.reduce((sum, key) => sum + (sizes.get(key) || 0), 0) } } }
    };
    vm.createContext(context); vm.runInContext(`${code}; this.breakdown=syncUsageBreakdown;`, context);
    const usage = await context.breakdown(all, total);
    assert.equal(usage.core, 300);
    assert.equal(usage.shortcutArtwork, 90);
    assert.equal(usage.recovery, 700, "legacy fixed-root and modern generation recovery bytes belong to Recovery safety copies");
    assert.equal(usage.overhead, 50);
    assert.equal(usage.core + usage.recovery + usage.shortcutArtwork + usage.overhead, usage.total);
    assert.equal(usage.total, total);
    assert.equal(usage.free, 102400 - total);
  });

  test(`1.30.18.7 ${browser} first-frame FV heading cannot expose static English before localization`, () => {
    const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
    const css = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
    const js = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
    assert.match(html, /frequent-sites-heading frequent-sites-heading-first-paint-pending/);
    assert.match(css, /\.frequent-sites-heading-first-paint-pending\s*\{\s*visibility:\s*hidden/);
    const localizedAt = js.indexOf('localizeDocument(document.getElementById("page") || document);');
    const revealAt = js.indexOf('classList.remove("frequent-sites-heading-first-paint-pending")');
    assert.ok(localizedAt >= 0 && revealAt > localizedAt, "heading copy must become visible only after the always-visible shell is localized");
  });

  test(`1.30.18.7 ${browser} background permission listener invalidates only the session FV projection`, () => {
    const source = readBackgroundSource(browser, { built: false });
    assert.match(source, /permissions\?\.onRemoved\?\.addListener/);
    assert.match(source, /permissionChangeAffectsTopSites\(change\)/);
    assert.match(source, /clearSessionFrequentlyVisitedSnapshot\(\)/);
  });
}

test("1.30.18.7 architecture contract is tied to the actual canonical projection functions", () => {
  const doc = fs.readFileSync("docs/ARCHITECTURE.md", "utf8");
  const manifest = fs.readFileSync("src/shared/newtab/render-manifest.js", "utf8");
  const storage = fs.readFileSync("src/shared/core/storage.js", "utf8");
  assert.match(doc, /First Paint is a semantic contract/i);
  assert.doesNotMatch(manifest, /createFirstPaintContract\(/, "persistent visual cache must not duplicate the semantic First-Paint Contract");
  assert.match(manifest, /projectRenderCacheItem/);
  assert.match(storage, /createFirstPaintContract\(/);
  assert.match(storage, /clearSessionFrequentlyVisitedSnapshot/);
});
