import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

class Area {
  constructor(initial = {}) { this.data = structuredClone(initial); this.writes = []; }
  async get(keys = null) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    const wanted = Array.isArray(keys) ? keys : Object.keys(keys || {});
    const out = Array.isArray(keys) ? {} : structuredClone(keys || {});
    for (const key of wanted) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) { this.writes.push(structuredClone(items)); Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

async function modulesFor(browser, suffix) {
  const nonce = `${Date.now()}-${Math.random()}-${suffix}`;
  const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?130189-c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?130189-m=${nonce}`);
  const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?130189-s=${nonce}`);
  const manifest = await import(`${pathToFileURL(resolve(`dist/${browser}/newtab/render-manifest.js`)).href}?130189-r=${nonce}`);
  return { constants, model, storage, manifest };
}

function stateFor(constants, model, { name = "Home", activeSpaceId = "personal", modifiedAt = 10 } = {}) {
  return model.normalizeState({
    activeSpaceId,
    spaces: {
      personal: {
        shortcuts: [{ type:"shortcut", id:"p", title:"Portal", url:"https://portal.example/", position:0, createdAt:1, modifiedAt }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:name, frequentlyVisitedEnabled:true, frequentlyVisitedCount:5 },
        settingsModifiedAt:modifiedAt, updatedAt:modifiedAt
      },
      work: {
        shortcuts: [{ type:"shortcut", id:"w", title:"Work", url:"https://work.example/", position:0, createdAt:1, modifiedAt:modifiedAt+1 }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:"Office", frequentlyVisitedEnabled:true, frequentlyVisitedCount:5 },
        settingsModifiedAt:modifiedAt+1, updatedAt:modifiedAt+1
      }
    }
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.9 ${browser} stale FV presentation update cannot downgrade newer shared Space/grid state`, async () => {
    const previous = globalThis.browser;
    const local = new Area(), session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "session-owner");
      const older = stateFor(constants, model, { name:"A", modifiedAt:10 });
      const newer = stateFor(constants, model, { name:"B", modifiedAt:20 });
      await storage.writeLocalState(older);
      await storage.writeLocalState(newer);
      const before = structuredClone(session.data[constants.SESSION_RENDER_STATE_KEY]);
      assert.equal(before.firstPaint.spaceNames.personal, "B");
      await storage.updateSessionFrequentlyVisitedSnapshot({ enabled:true, count:5, sites:[{title:"Example",host:"example.com",url:"https://example.com/",favicon:""}] });
      const after = session.data[constants.SESSION_RENDER_STATE_KEY];
      assert.equal(after.firstPaint.spaceNames.personal, "B", "presentation-only FV update must not republish stale core state");
      assert.deepEqual(after.shortcuts, before.shortcuts, "FV owns no structural fields");
      assert.deepEqual(after, before, "FV publication must not rewrite the structural session key at all");
      assert.equal(session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY].sites[0].url, "https://example.com/");
    } finally { globalThis.browser = previous; }
  });

  test(`1.30.18.9 ${browser} active-Space persistence is the session owner`, async () => {
    const previous = globalThis.browser;
    const local = new Area(), session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browser, "active-owner");
      const state = stateFor(constants, model, { activeSpaceId:"personal", modifiedAt:30 });
      await storage.writeLocalState(state);
      await local.set({ [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId:"dev", onboardingCompleted:true } });
      await storage.writeActiveSpace("work");
      assert.equal(local.data[constants.LOCAL_ACTIVE_SPACE_KEY], "work");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].activeSpaceId, "work");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.activeSpaceId, "work");
    } finally { globalThis.browser = previous; }
  });

  test(`1.30.18.9 ${browser} persistent manifest contains no browser-derived Frequently Visited sites`, async () => {
    const previous = globalThis.localStorage;
    const map = new Map();
    globalThis.localStorage = { getItem:k=>map.get(k)??null, setItem:(k,v)=>map.set(k,String(v)), removeItem:k=>map.delete(k) };
    try {
      const { constants, model, manifest } = await modulesFor(browser, "manifest-fv");
      const state = stateFor(constants, model, { modifiedAt:40 });
      const frequent = { enabled:true, count:5, sites:[{title:"Sensitive",host:"sensitive.example",url:"https://sensitive.example/",favicon:""}] };
      assert.equal(manifest.persistRenderManifest(state, { onboardingCompleted:true }, null, frequent), true);
      const saved = JSON.parse(map.get(constants.RENDER_MANIFEST_KEY));
      assert.equal(saved.version, constants.RENDER_MANIFEST_SCHEMA_VERSION);
      assert.deepEqual(saved.firstPaint.frequent.sites, []);
      assert.doesNotMatch(JSON.stringify(saved), /sensitive\.example/);
    } finally { globalThis.localStorage = previous; }
  });
}

test("1.30.18.9 bootstrap constants are generated once from canonical constants", () => {
  for (const browser of ["firefox", "chrome"]) {
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const config = fs.readFileSync(`dist/${browser}/newtab/bootstrap-config.js`, "utf8");
    const session = fs.readFileSync(`dist/${browser}/newtab/session-bootstrap.js`, "utf8");
    const space = fs.readFileSync(`dist/${browser}/newtab/space-bootstrap.js`, "utf8");
    const render = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    assert.ok(html.indexOf('bootstrap-config.js') < html.indexOf('session-bootstrap.js'));
    assert.match(config, /renderManifestVersion":4/);
    assert.doesNotMatch(session, /mosaicsync\.session\.render-state/);
    assert.doesNotMatch(space, /\[2,\s*3\]|version\s*===\s*2/);
    assert.doesNotMatch(render, /\[2,\s*3\]|version\s*===\s*2/);
  }
});

test("1.30.18.9 page presentation refresh no longer republishes full shared session state", () => {
  const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const refreshStart = src.indexOf("function refreshFirstPaintCaches");
  const refreshEnd = src.indexOf("function scheduleRenderPreviewRefresh", refreshStart);
  const refresh = src.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(refresh, /warmSessionRenderCache|warmFirstPaintSessionCache/);
  const fvStart = src.indexOf("function updateFrequentRenderSnapshot");
  const fvEnd = src.indexOf("function readDeviceDefaultSpacePreference", fvStart);
  const fv = src.slice(fvStart, fvEnd);
  assert.match(fv, /updateSessionFrequentlyVisitedSnapshot/);
  assert.doesNotMatch(fv, /refreshFirstPaintCaches/);
});

test("1.30.18.9 every runtime persistent-manifest publication is gated by shared session structural truth", () => {
  const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const helperStart = src.indexOf("async function sharedSessionCoreMatchesState");
  const helperEnd = src.indexOf("function pageManifestStateStillCurrent", helperStart);
  const helperBlock = src.slice(helperStart, helperEnd);
  assert.match(helperBlock, /SESSION_RENDER_STATE_KEY/);
  assert.match(helperBlock, /sessionRenderCoreMatchesState/);

  const start = src.indexOf("function scheduleRenderManifestRefresh");
  const end = src.indexOf("let deferredBackgroundHydrationGeneration", start);
  const block = src.slice(start, end);
  assert.match(block, /sharedSessionCoreMatchesState\(stateSnapshot, \{ retryOnce: true \}\)/);
  assert.match(block, /shouldCommit: async \(\) =>[\s\S]*sharedSessionCoreMatchesState\(stateSnapshot\)/,
    "idle preview generation must use the same cross-context ownership guard");
  assert.match(block, /if \(refreshed \|\| !pageManifestStateStillCurrent[\s\S]*sharedSessionCoreMatchesState\(stateSnapshot\)[\s\S]*persistRenderManifest/,
    "artwork fallback publication must also be guarded");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.9 ${browser} permission remove/add events behaviorally toggle only the session tombstone`, () => {
    const run = spawnSync(process.execPath, [helper, browser, "top-sites-permission-session-lifecycle"], { cwd: root, encoding:"utf8", timeout:30000 });
    assert.equal(run.status, 0, `${browser} lifecycle failed\n${run.stdout}\n${run.stderr}`);
    const out = JSON.parse(run.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
    assert.equal(out.suppressed, true);
    assert.equal(out.cleared, true);
    assert.equal(out.prefBefore, true);
    assert.equal(out.afterRemove, true);
    assert.equal(out.afterAdd, true);
  });
}
