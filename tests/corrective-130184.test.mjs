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
  querySelector(selector) {
    if (selector === '[data-space-id="personal"]') return this.children.find(child => child.dataset.spaceId === "personal") || null;
    if (selector === '[data-space-id="work"]') return this.children.find(child => child.dataset.spaceId === "work") || null;
    return null;
  }
}
function allElements(node) { return [node, ...(node?.children || []).flatMap(allElements)]; }

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.4 ${browser} static New Tab never exposes default Space names before custom names are known`, () => {
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const nav = html.match(/<nav id="spaceSwitcher"[\s\S]*?<\/nav>\s*<script src="space-bootstrap\.js"><\/script>/)?.[0] || "";
    assert.ok(nav, "Space switcher must be immediately followed by the synchronous label bootstrap");
    assert.doesNotMatch(nav, />Personal<|>Work</, "default names must not exist as visible static text");
    assert.match(nav, /space-switcher-first-paint-pending/);
  });

  test(`1.30.18.4 ${browser} synchronous Space bootstrap reveals only the saved custom names`, () => {
    const switcher = new FakeElement("nav"); switcher.className = "space-switcher space-switcher-first-paint-pending";
    const personal = new FakeElement("button"); personal.dataset.spaceId = "personal";
    const work = new FakeElement("button"); work.dataset.spaceId = "work";
    switcher.append(personal, work);
    const context = {
      document: { getElementById: id => id === "spaceSwitcher" ? switcher : null },
      localStorage: { getItem: () => JSON.stringify({
        version: 2, onboardingCompleted: true,
        firstPaint: { version: 1, activeSpaceId: "personal", multipleSpacesEnabled: true,
          spaceNames: { personal: "Home", work: "Office" }, frequent: null }
      }) }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(`dist/${browser}/newtab/space-bootstrap.js`, "utf8"), context);
    assert.equal(personal.textContent, "Home");
    assert.equal(work.textContent, "Office");
    assert.equal(switcher.classList.contains("space-switcher-first-paint-pending"), false);
  });

  test(`1.30.18.4 ${browser} known artwork never flashes a fallback letter when its tiny first-frame preview is missing`, () => {
    const root = new FakeElement("html"), grid = new FakeElement("div"), empty = new FakeElement("div"), brand = new FakeElement("header");
    const ids = new Map([["shortcutGrid", grid], ["emptyState", empty]]);
    const context = {
      console, URL,
      document: {
        documentElement: root,
        getElementById: id => ids.get(id) || null,
        querySelector: selector => selector === ".brand" ? brand : null,
        createElement: tag => new FakeElement(tag),
        createDocumentFragment: () => { const f = new FakeElement("fragment"); f.__fragment = true; return f; }
      },
      localStorage: { getItem: key => key === "mosaicsync.render-manifest.v1" ? JSON.stringify({
        version: 2, onboardingCompleted: true, activeSpaceId: "personal", updatedAt: 1, settingsModifiedAt: 1,
        columns: 6, rows: 2, tileSize: 76, brandVisible: true,
        firstPaint: { version: 1, activeSpaceId: "personal", multipleSpacesEnabled: true,
          spaceNames: { personal: "Home", work: "Office" }, frequent: null },
        shortcuts: [{ type: "shortcut", id: "meneame", title: "Meneame", url: "https://meneame.net/", position: 0, imageStyle: "contain", imageKey: "asset-known", preview: "" }]
      }) : (key.endsWith("hidden-domains.v1") ? "[]" : "{}") },
      performance: { now: () => 1 }, requestAnimationFrame: cb => { cb(); return 1; }, setTimeout: cb => { cb(); return 1; }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(`dist/${browser}/core/http-url-safety.js`, "utf8"), context);
    context.__mosaicsyncBuiltinIcons = { append: () => false, isValid: () => false };
    vm.runInContext(fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8"), context);
    assert.equal(allElements(grid).some(node => node.className === "fallback-icon"), false, "known favicon must not render an M first");

    // Preserve the useful letter fallback for a shortcut that genuinely has no artwork at all.
    const bootstrap = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    assert.match(bootstrap, /if \(typeof item\?\.imageKey === "string" && item\.imageKey\) return;[\s\S]*target\.append\(fallback/);
  });
}

test("1.30.18.4 render manifest stores custom Space names for synchronous first paint", async () => {
  const previous = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  try {
    const constants = await import(`${pathToFileURL(resolve("dist/firefox/core/constants.js")).href}?130184-constants=${Date.now()}`);
    const model = await import(`${pathToFileURL(resolve("dist/firefox/core/model.js")).href}?130184-model=${Date.now()}`);
    const module = await import(`${pathToFileURL(resolve("dist/firefox/newtab/render-manifest.js")).href}?130184-manifest=${Date.now()}`);
    const personalSettings = { ...constants.DEFAULT_SETTINGS, spaceName: "Home" };
    const workSettings = { ...constants.DEFAULT_SETTINGS, spaceName: "Office" };
    const state = model.normalizeState({ activeSpaceId: "personal", spaces: {
      personal: { shortcuts: [], settings: personalSettings, settingsModifiedAt: 1, updatedAt: 1 },
      work: { shortcuts: [], settings: workSettings, settingsModifiedAt: 1, updatedAt: 1 }
    } });
    assert.equal(module.persistRenderManifest(state, { onboardingCompleted: true }), true);
    const manifest = JSON.parse(data.get(constants.RENDER_MANIFEST_KEY));
    assert.deepEqual(manifest.firstPaint.spaceNames, { personal: "Home", work: "Office" });
    assert.equal(manifest.firstPaint.multipleSpacesEnabled, true);
  } finally { globalThis.localStorage = previous; }
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.4 ${browser} recovery cleanup keeps the logically newest generation even when its wall clock is behind`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = ["compareDeviceSnapshotGenerationRecency", "pruneSupersededDeviceSnapshotGenerations"].map(name => extractFunction(src, name)).join("\n");
    const roots = [
      { key: "root-a", deviceId: "clone", commitId: "a", updatedAt: 100, publishedAt: 300 },
      { key: "root-b", deviceId: "clone", commitId: "b", updatedAt: 200, publishedAt: 400 },
      { key: "root-c", deviceId: "clone", commitId: "c", updatedAt: 300, publishedAt: 100 }
    ];
    const all = {};
    for (const root of roots) { all[root.key] = { ...root, kind: "root" }; all[`${root.key}.chunk.0`] = { data: root.key }; }
    const removed = [];
    const context = {
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2,
      compareStableText: (a, b) => String(a).localeCompare(String(b)),
      deviceRootDescriptor: (key, value) => value?.kind === "root" ? { ...value, key } : null,
      removeSyncItems: async keys => { removed.push(...keys); for (const key of keys) delete all[key]; }
    };
    vm.createContext(context); vm.runInContext(`${code}; this.prune=pruneSupersededDeviceSnapshotGenerations;`, context);
    await context.prune(all, "clone", { protectRootKey: "root-c" });
    assert.ok(all["root-c"], "freshly committed newest logical recovery must survive its own cleanup");
    assert.ok(all["root-b"]);
    assert.equal(all["root-a"], undefined);
    assert.ok(removed.includes("root-a"));
  });

  test(`1.30.18.4 ${browser} quota-aware recovery rotation keeps one verified fallback while making room for the new copy`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = ["compareDeviceSnapshotGenerationRecency", "deviceSnapshotKeysForRoot", "syncItemsFitInSnapshot", "prepareDeviceSnapshotPublicationCapacity"]
      .map(name => extractFunction(src, name)).join("\n");
    const pad = size => "x".repeat(size);
    const all = {
      "core": { data: pad(120) },
      "root-a": { data: pad(160) }, "root-a.chunk.0": { data: pad(160) },
      "root-b": { data: pad(160) }, "root-b.chunk.0": { data: pad(160) }
    };
    const publication = { rootKey: "root-c", rootValue: { data: pad(140) }, chunkWrites: { "root-c.chunk.0": { data: pad(140) } } };
    const snapshots = [
      { rootKey: "root-b", deviceId: "clone", profileComplete: true, updatedAt: 20, publishedAt: 20, commitId: "b" },
      { rootKey: "root-a", deviceId: "clone", profileComplete: true, updatedAt: 10, publishedAt: 10, commitId: "a" }
    ];
    const removed = [];
    const entryBytes = (key, value) => Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value));
    const context = {
      SYNC_QUOTA_BYTES: 1000, SYNC_QUOTA_MAX_ITEMS: 100,
      syncEntryBytes: entryBytes,
      compareStableText: (a, b) => String(a).localeCompare(String(b)),
      readDeviceSnapshots: async () => snapshots,
      removeSyncItems: async keys => removed.push(...keys)
    };
    vm.createContext(context); vm.runInContext(`${code}; this.prepare=prepareDeviceSnapshotPublicationCapacity; this.fits=syncItemsFitInSnapshot;`, context);
    const items = { ...publication.chunkWrites, [publication.rootKey]: publication.rootValue };
    assert.equal(context.fits(all, items), false, "three full generations should exceed the synthetic quota");
    const prepared = await context.prepare(all, "clone", publication);
    assert.equal(prepared["root-a"], undefined, "oldest verified fallback may be retired only when necessary");
    assert.ok(prepared["root-b"], "one complete fallback must remain before staging the new copy");
    assert.equal(context.fits(prepared, items), true);
    assert.deepEqual(new Set(removed), new Set(["root-a", "root-a.chunk.0"]));
  });

  test(`1.30.18.4 ${browser} abandoned recovery chunks are reclaimed only after a safe grace period`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const fn = extractFunction(src, "maybeGarbageCollectStaleDeviceSnapshots");
    let now = 10_000_000;
    const oldRoot = "mosaicsync.sync.device.dev.snapshot.old";
    const freshRoot = "mosaicsync.sync.device.dev.snapshot.fresh";
    const legacyRoot = "mosaicsync.sync.device.dev.snapshot.legacy";
    const store = {
      [`${oldRoot}.chunk.0`]: { publishedAt: now - 10_000, data: "old" },
      [`${freshRoot}.chunk.0`]: { publishedAt: now, data: "fresh" },
      [`${legacyRoot}.chunk.0`]: { data: "legacy-3" }
    };
    const context = {
      console, PRODUCT_NAME: "MosaicSync", Date: { now: () => now },
      DEVICE_SNAPSHOT_GC_INTERVAL_MS: 1000, DEVICE_SNAPSHOT_ORPHAN_GRACE_MS: 5000, DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES: 2,
      DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE: 2, DEVICE_SNAPSHOT_MAX_RECENT_DEVICES: 8,
      DEVICE_SNAPSHOT_RETENTION_MS: 999999999, DEVICE_SNAPSHOT_CAP_MIN_AGE_MS: 999999999,
      browser: { storage: { sync: { get: async () => structuredClone(store) } } },
      deviceRootDescriptor: () => null,
      compareDeviceSnapshotGenerationRecency: () => 0,
      compareStableText: (a, b) => String(a).localeCompare(String(b)),
      isDeviceSnapshotChunkKey: key => key.includes(".chunk."),
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      writeLocalMeta: async value => value
    };
    vm.createContext(context); vm.runInContext(`${fn}; this.gc=maybeGarbageCollectStaleDeviceSnapshots;`, context);
    let meta = { syncEnabled: true, deviceId: "dev", lastDeviceSnapshotGcAt: 0, deviceSnapshotGcPass: 0, deviceSnapshotRootSeenPass: {}, deviceSnapshotOrphanSeenAt: {}, deviceSnapshotOrphanSeenPass: {} };
    meta = await context.gc(meta, { force: true });
    assert.ok(store[`${oldRoot}.chunk.0`], "even an apparently old orphan must first be observed locally before deletion");
    assert.ok(store[`${freshRoot}.chunk.0`], "an in-flight recent generation must not be touched");
    assert.ok(store[`${legacyRoot}.chunk.0`], "a pre-.4 orphan without timestamp must first be observed, not guessed stale");
    assert.ok(meta.deviceSnapshotOrphanSeenAt[oldRoot]);
    assert.ok(meta.deviceSnapshotOrphanSeenAt[legacyRoot]);

    // Model the fresh in-flight publication completing before the next cleanup.
    store[freshRoot] = { completed: true };
    now += 6000;
    meta = await context.gc(meta, { force: true });
    assert.ok(store[`${oldRoot}.chunk.0`], "a second observation is still not enough to reclaim a potentially in-flight generation");
    assert.ok(store[`${legacyRoot}.chunk.0`]);
    now += 1000;
    meta = await context.gc(meta, { force: true });
    assert.equal(store[`${oldRoot}.chunk.0`], undefined, "an orphan still rootless across two later GC observations should be reclaimed");
    assert.equal(store[`${legacyRoot}.chunk.0`], undefined, "a legacy orphan that remains rootless across repeated observations should eventually be reclaimed");
    assert.ok(store[`${freshRoot}.chunk.0`], "chunks whose root subsequently arrives must be preserved");
  });

  test(`1.30.18.4 ${browser} snapshot publication reuses its initial full Sync read`, () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const publish = extractFunction(src, "publishProfileDeviceSnapshot");
    assert.match(publish, /let all = await browser\.storage\.sync\.get\(null\);[\s\S]*readOwnDeviceSnapshot\(meta\.deviceId, all\)/);
    assert.doesNotMatch(publish, /readOwnDeviceSnapshot\(meta\.deviceId\);[\s\S]*storage\.sync\.get\(null\)/,
      "do not perform the old back-to-back duplicate full reads");
  });
}
