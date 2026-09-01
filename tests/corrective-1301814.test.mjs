import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

class MemoryLocalStorage {
  constructor(entries = {}) { this.data = new Map(Object.entries(entries)); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return String(this.owner.className || "").split(/\s+/).filter(Boolean); }
  contains(value) { return this.values().includes(value); }
  add(value) { this.owner.className = [...new Set([...this.values(), value])].join(" "); }
  remove(value) { this.owner.className = this.values().filter(item => item !== value).join(" "); }
}
class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.className = ""; this.classList = new FakeClassList(this);
    this.style = { setProperty() {} }; this.hidden = false; this.inert = false; this.attributes = new Map(); this.textContent = ""; this.title = ""; this.href = "";
  }
  append(...nodes) { for (const node of nodes) if (node) this.children.push(...(node.__fragment ? node.children : [node])); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}
function allElements(node) { return [node, ...(node?.children || []).flatMap(allElements)]; }

async function modules(tag = "base") {
  const nonce = `${Date.now()}-${tag}-${Math.random()}`;
  const constants = await import(`${pathToFileURL(resolve("dist/firefox/core/constants.js")).href}?14c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve("dist/firefox/core/model.js")).href}?14m=${nonce}`);
  const projection = await import(`${pathToFileURL(resolve("dist/firefox/newtab/ui-utils.js")).href}?14p=${nonce}`);
  const manifest = await import(`${pathToFileURL(resolve("dist/firefox/newtab/render-manifest.js")).href}?14r=${nonce}`);
  return { constants, model, projection, manifest };
}

function shortcut(id, position, overrides = {}) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image: "", builtinIcon: "", colorTag: "", imageStyle: "contain",
    localImageAssetId: "", imageAssetId: "", position, createdAt: 1, modifiedAt: 1, source: "manual", ...overrides
  };
}

function makeState(constants, model, activeSpaceId = "personal") {
  const personal = {
    shortcuts: [shortcut("personal", 0)],
    settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true, spaceName: "Home", columns: 6, rows: 2, tileSize: 76 },
    settingsClock: {}, settingsModifiedAt: 11, updatedAt: 12
  };
  const work = {
    shortcuts: [shortcut("secret-work", 0, { title: "Secret Work", url: "https://secret.work.example/" })],
    settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true, spaceName: "Office", columns: 8, rows: 3, tileSize: 90 },
    settingsClock: {}, settingsModifiedAt: 21, updatedAt: 22
  };
  return model.normalizeState({ activeSpaceId, spaces: { personal, work } });
}

test("1.30.18.14 persistent render schema v5 is presentation-only", async () => {
  const previous = globalThis.localStorage;
  const store = new MemoryLocalStorage(); globalThis.localStorage = store;
  try {
    const { constants, model, manifest } = await modules("visual-only");
    const state = makeState(constants, model, "personal");
    assert.equal(constants.RENDER_MANIFEST_SCHEMA_VERSION, 5);
    assert.equal(manifest.persistRenderManifest(state, { onboardingCompleted: true }), true);
    const saved = JSON.parse(store.getItem(constants.RENDER_MANIFEST_KEY));
    const serialized = JSON.stringify(saved);
    assert.equal(saved.version, 5);
    assert.equal(saved.paintSpaceId, "personal");
    assert.ok(saved.layout && Array.isArray(saved.shortcuts));
    for (const forbidden of ["activeSpaceId", "updatedAt", "settingsModifiedAt", "firstPaint"]) assert.equal(Object.hasOwn(saved, forbidden), false);
    assert.doesNotMatch(serialized, /https?:\/\//i, "persistent visual cache must contain no navigation URL");
    assert.doesNotMatch(serialized, /frequent/i, "persistent visual cache must contain no FV state");
  } finally { globalThis.localStorage = previous; }
});

test("1.30.18.14 active Work persists only Space-label presentation, never Work grid structure", async () => {
  const previous = globalThis.localStorage;
  const store = new MemoryLocalStorage(); globalThis.localStorage = store;
  try {
    const { constants, model, manifest } = await modules("work-label-only");
    const state = makeState(constants, model, "work");
    assert.equal(manifest.persistRenderManifest(state, { onboardingCompleted: true }), true);
    const saved = JSON.parse(store.getItem(constants.RENDER_MANIFEST_KEY));
    assert.equal(saved.paintSpaceId, "work");
    assert.equal(saved.layout, null);
    assert.deepEqual(saved.shortcuts, []);
    assert.deepEqual(saved.spaceSwitcher, { visible: true, personal: "Home", work: "Office" });
    assert.doesNotMatch(JSON.stringify(saved), /Secret Work|secret\.work/i);
  } finally { globalThis.localStorage = previous; }
});

test("1.30.18.14 visual equivalence ignores clocks and URLs but rejects visual identity changes", async () => {
  const previous = globalThis.localStorage;
  const store = new MemoryLocalStorage(); globalThis.localStorage = store;
  try {
    const { constants, model, manifest, projection } = await modules("equivalence");
    const state = makeState(constants, model, "personal");
    assert.equal(manifest.persistRenderManifest(state, { onboardingCompleted: true }), true);
    const saved = JSON.parse(store.getItem(constants.RENDER_MANIFEST_KEY));
    const sameVisual = structuredClone(state);
    sameVisual.updatedAt += 9999; sameVisual.settingsModifiedAt += 9999; sameVisual.shortcuts[0].url = "https://different.example/";
    assert.equal(projection.renderCacheGridMatchesState(saved, sameVisual), true,
      "revision clocks and navigation targets must not make the presentation-only cache authoritative");
    const staleTitle = structuredClone(sameVisual); staleTitle.shortcuts[0].title = "Changed";
    assert.equal(projection.renderCacheGridMatchesState(saved, staleTitle), false);
    const stalePosition = structuredClone(sameVisual); stalePosition.shortcuts[0].position = 1;
    assert.equal(projection.renderCacheGridMatchesState(saved, stalePosition), false);
    const staleLayout = structuredClone(sameVisual); staleLayout.settings.tileSize = 90;
    assert.equal(projection.renderCacheGridMatchesState(saved, staleLayout), false);
  } finally { globalThis.localStorage = previous; }
});

test("1.30.18.14 corrupt preview cannot authorize reuse over immediately drawable session artwork", async () => {
  const { projection } = await modules("bad-preview");
  const state = { activeSpaceId: "personal", settings: { columns: 6, rows: 2, tileSize: 76, brandVisible: true }, shortcuts: [shortcut("a", 0, { image: "data:image/png;base64,AAAA" })] };
  const visual = projection.projectRenderCacheItem(state.shortcuts[0], () => "javascript:not-an-image");
  const manifest = { paintSpaceId: "personal", layout: { columns: 6, rows: 2, tileSize: 76, brandVisible: true }, shortcuts: [visual] };
  assert.equal(projection.renderCacheGridMatchesState(manifest, state), false);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.14 ${browser} persistent bootstrap paints inert cards with no href and ignores v4 cache`, () => {
    const root = new FakeElement("html"), grid = new FakeElement("div"), empty = new FakeElement("div"), brand = new FakeElement("header");
    const ids = new Map([["shortcutGrid", grid], ["emptyState", empty]]);
    const run = (manifestValue, extra = {}) => {
      root.dataset = {}; grid.children = []; empty.children = [];
      const store = new MemoryLocalStorage({ "mosaicsync.render-manifest.v1": JSON.stringify(manifestValue), ...extra });
      const context = {
        console, document: { documentElement: root, getElementById: id => ids.get(id) || null, querySelector: s => s === ".brand" ? brand : null,
          createElement: tag => new FakeElement(tag), createDocumentFragment: () => { const f = new FakeElement("fragment"); f.__fragment = true; return f; } },
        localStorage: store, performance: { now: () => 1 }, requestAnimationFrame: cb => { cb(); return 1; }, setTimeout: cb => { cb(); return 1; },
        __mosaicsyncBuiltinIcons: { append: () => false, isValid: () => false },
        __mosaicsyncBootstrapConfig: { renderManifestKey: "mosaicsync.render-manifest.v1", renderManifestVersion: 5 }
      };
      context.globalThis = context; vm.createContext(context);
      vm.runInContext(fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8"), context);
      return { context, store };
    };
    const current = { version: 5, ready: true, paintSpaceId: "personal", spaceSwitcher: { visible: true, personal: "Home", work: "Office" },
      layout: { columns: 6, rows: 2, tileSize: 76, brandVisible: true }, shortcuts: [{ type: "shortcut", id: "a", title: "A", position: 0, imageStyle: "contain", imageKey: "", preview: "" }] };
    run(current);
    assert.equal(root.dataset.bootGrid, "true");
    const anchors = allElements(grid).filter(node => node.tagName === "A");
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].getAttribute("href"), null);
    run({ ...current, version: 4 });
    assert.equal(root.dataset.bootGrid, undefined, "obsolete structural manifest must fail closed");
  });

  test(`1.30.18.14 ${browser} default Work preference blocks a cached Personal grid`, () => {
    const html = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    assert.match(html, /defaultSpace === "work"/);
    assert.match(html, /manifest\.spaceSwitcher\?\.visible === true/);
  });
}

test("1.30.18.14 persistent manifest API has no FV side door and no semantic First-Paint projection", () => {
  const source = fs.readFileSync("src/shared/newtab/render-manifest.js", "utf8");
  assert.match(source, /persistRenderManifest\(currentState, currentMeta, extraPreviews = null\)/);
  assert.doesNotMatch(source, /frequentSnapshot|createFirstPaintContract\(/);
  assert.match(source, /projectRenderCacheItem/);
});

test("1.30.18.14 classic persistent bootstrap no longer loads URL safety solely for cache navigation", () => {
  for (const browser of ["firefox", "chrome"]) {
    const html = fs.readFileSync(`src/${browser}/newtab/newtab.html`, "utf8");
    assert.match(html, /<script src="render-bootstrap\.js"><\/script>/);
    assert.doesNotMatch(html, /<script src="\.\.\/core\/http-url-safety\.js"><\/script>/);
  }
});

test("1.30.18.14 switching to Work invalidates the Personal persistent grid synchronously", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = source.indexOf("async function switchActiveSpace(spaceId)");
  const end = source.indexOf("async function saveState", start);
  const fn = source.slice(start, end);
  const remove = fn.indexOf("localStorage.removeItem(RENDER_MANIFEST_KEY)");
  const refresh = fn.indexOf("refreshFirstPaintCaches(state, meta)");
  assert.ok(remove >= 0 && refresh > remove, "Work switch must invalidate the Personal visual cache before deferred cache refresh");
});

test("1.30.18.14 Step 2.3 source boundary is explicitly presentation-only", () => {
  const manifest = fs.readFileSync("src/shared/newtab/render-manifest.js", "utf8");
  const projection = fs.readFileSync("src/shared/newtab/ui-utils.js", "utf8");
  const bootstrap = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8");
  assert.match(manifest, /presentation only/i);
  assert.match(projection, /presentation-only/i);
  assert.match(bootstrap, /presentation-only/i);
  assert.doesNotMatch(bootstrap, /card\.href\s*=|item\?\.url|item\.url/);
});
