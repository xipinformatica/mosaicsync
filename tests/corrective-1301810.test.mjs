import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

class Area {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
    this.writes = [];
    this.beforeGet = null;
    this.beforeSet = null;
  }
  async get(keys = null) {
    const snapshot = structuredClone(this.data);
    if (this.beforeGet) await this.beforeGet(keys, snapshot);
    if (keys == null) return snapshot;
    if (typeof keys === "string") return Object.hasOwn(snapshot, keys) ? { [keys]: snapshot[keys] } : {};
    const wanted = Array.isArray(keys) ? keys : Object.keys(keys || {});
    const out = Array.isArray(keys) ? {} : structuredClone(keys || {});
    for (const key of wanted) if (Object.hasOwn(snapshot, key)) out[key] = snapshot[key];
    return out;
  }
  async set(items) {
    if (this.beforeSet) await this.beforeSet(items);
    this.writes.push(structuredClone(items));
    Object.assign(this.data, structuredClone(items));
  }
  async remove(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

class LockManager {
  constructor() { this.tails = new Map(); }
  async request(name, callback) {
    const previous = this.tails.get(name) || Promise.resolve();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => held);
    this.tails.set(name, tail);
    await previous;
    try { return await callback(); }
    finally {
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function modulesFor(browser, suffix) {
  const nonce = `${Date.now()}-${Math.random()}-${suffix}`;
  const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?1301810-c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?1301810-m=${nonce}`);
  const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?1301810-s=${nonce}`);
  return { constants, model, storage };
}

function stateFor(constants, model, { name = "A", activeSpaceId = "personal", modifiedAt = 10 } = {}) {
  return model.normalizeState({
    activeSpaceId,
    spaces: {
      personal: {
        shortcuts: [{ type:"shortcut", id:"p", title:"Portal", url:"https://portal.example/", position:0, createdAt:1, modifiedAt }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:name, frequentlyVisitedEnabled:true, frequentlyVisitedCount:5 },
        settingsModifiedAt:modifiedAt,
        updatedAt:modifiedAt
      },
      work: {
        shortcuts: [{ type:"shortcut", id:"w", title:"Work", url:"https://work.example/", position:0, createdAt:1, modifiedAt:modifiedAt + 1 }],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled:true, spaceName:"Office", frequentlyVisitedEnabled:true, frequentlyVisitedCount:5 },
        settingsModifiedAt:modifiedAt + 1,
        updatedAt:modifiedAt + 1
      }
    }
  });
}

async function withRuntime(fn) {
  const previousBrowser = globalThis.browser;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const local = new Area();
  const session = new Area();
  const locks = new LockManager();
  globalThis.browser = { storage: { local, session } };
  Object.defineProperty(globalThis, "navigator", { configurable:true, value:{ locks } });
  try { return await fn({ local, session, locks }); }
  finally {
    globalThis.browser = previousBrowser;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.10 ${browser} structural session publication cannot escape the persistence lock and land stale`, async () => {
    await withRuntime(async ({ local, session }) => {
      const { constants, model, storage } = await modulesFor(browser, "structural-order");
      const older = stateFor(constants, model, { name:"A", modifiedAt:10 });
      const newer = stateFor(constants, model, { name:"B", modifiedAt:20 });
      const aReachedSession = deferred();
      const releaseA = deferred();
      let paused = false;
      session.beforeSet = async items => {
        const snap = items?.[constants.SESSION_RENDER_STATE_KEY];
        if (!paused && snap?.firstPaint?.spaceNames?.personal === "A") {
          paused = true;
          aReachedSession.resolve();
          await releaseA.promise;
        }
      };
      const writeA = storage.writeLocalState(older);
      await aReachedSession.promise;
      const writeB = storage.writeLocalState(newer);
      await new Promise(resolve => setTimeout(resolve, 15));
      assert.equal(local.data[constants.LOCAL_STATE_KEY].spaces.personal.settings.spaceName, "A",
        "newer transaction must not pass the older transaction while its session publication is paused under the same lock");
      releaseA.resolve();
      await Promise.all([writeA, writeB]);
      assert.equal(local.data[constants.LOCAL_STATE_KEY].spaces.personal.settings.spaceName, "B");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.spaceNames.personal, "B");
    });
  });

  test(`1.30.18.10 ${browser} concurrent active-Space writes keep local and session ownership identical`, async () => {
    await withRuntime(async ({ local, session }) => {
      const { constants, model, storage } = await modulesFor(browser, "active-order");
      await storage.writeLocalState(stateFor(constants, model, { activeSpaceId:"personal", modifiedAt:30 }));
      await local.set({ [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId:"dev", onboardingCompleted:true } });
      const aReachedSession = deferred();
      const releaseA = deferred();
      let paused = false;
      session.beforeSet = async items => {
        const snap = items?.[constants.SESSION_RENDER_STATE_KEY];
        if (!paused && snap?.activeSpaceId === "work") {
          paused = true;
          aReachedSession.resolve();
          await releaseA.promise;
        }
      };
      const a = storage.writeActiveSpace("work");
      await aReachedSession.promise;
      const b = storage.writeActiveSpace("personal");
      await new Promise(resolve => setTimeout(resolve, 15));
      assert.equal(local.data[constants.LOCAL_ACTIVE_SPACE_KEY], "work",
        "second active-Space transaction must wait for the first session publication under the shared lock");
      releaseA.resolve();
      await Promise.all([a, b]);
      assert.equal(local.data[constants.LOCAL_ACTIVE_SPACE_KEY], "personal");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].activeSpaceId, "personal");
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.activeSpaceId, "personal");
    });
  });

  test(`1.30.18.10 ${browser} interleaved FV update physically cannot overwrite newer structural session state`, async () => {
    await withRuntime(async ({ session }) => {
      const { constants, model, storage } = await modulesFor(browser, "fv-isolation");
      const older = stateFor(constants, model, { name:"A", modifiedAt:10 });
      const newer = stateFor(constants, model, { name:"B", modifiedAt:20 });
      await storage.writeLocalState(older);
      const fvRead = deferred();
      const resumeFv = deferred();
      let paused = false;
      session.beforeGet = async keys => {
        if (!paused && Array.isArray(keys) && keys.includes(constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY) && keys.includes(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)) {
          paused = true;
          fvRead.resolve();
          await resumeFv.promise;
        }
      };
      const fv = storage.updateSessionFrequentlyVisitedSnapshot({ enabled:true, count:5, sites:[{ title:"Example", host:"example.com", url:"https://example.com/", favicon:"" }] });
      await fvRead.promise;
      session.beforeGet = null;
      await storage.writeLocalState(newer);
      resumeFv.resolve();
      await fv;
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.spaceNames.personal, "B");
      assert.equal(session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY].sites[0].url, "https://example.com/");
      const fvWrites = session.writes.filter(items => Object.hasOwn(items, constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY));
      assert.ok(fvWrites.length > 0);
      assert.ok(fvWrites.every(items => !Object.hasOwn(items, constants.SESSION_RENDER_STATE_KEY)),
        "FV publication must never write the structural session key");
    });
  });

  test(`1.30.18.10 ${browser} permission clearing cannot overwrite a newer structural session snapshot`, async () => {
    await withRuntime(async ({ session }) => {
      const { constants, model, storage } = await modulesFor(browser, "permission-isolation");
      await storage.writeLocalState(stateFor(constants, model, { name:"A", modifiedAt:10 }));
      await storage.updateSessionFrequentlyVisitedSnapshot({ enabled:true, count:5, sites:[{ title:"Old", host:"old.example", url:"https://old.example/", favicon:"" }] });
      const permissionRead = deferred();
      const resumePermission = deferred();
      let paused = false;
      session.beforeGet = async keys => {
        if (!paused && Array.isArray(keys) && keys.length === 2 && keys.includes(constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY) && keys.includes(constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY)) {
          paused = true;
          permissionRead.resolve();
          await resumePermission.promise;
        }
      };
      const clear = storage.clearSessionFrequentlyVisitedSnapshot();
      await permissionRead.promise;
      session.beforeGet = null;
      await storage.writeLocalState(stateFor(constants, model, { name:"B", modifiedAt:20 }));
      resumePermission.resolve();
      await clear;
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.spaceNames.personal, "B");
      assert.equal(session.data[constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY], true);
      assert.deepEqual(session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY].sites, []);
    });
  });

  test(`1.30.18.10 ${browser} dedicated FV projection is composed into validated session startup state`, async () => {
    await withRuntime(async ({ local, session }) => {
      const { constants, model, storage } = await modulesFor(browser, "fv-compose");
      const state = stateFor(constants, model, { name:"Home", modifiedAt:40 });
      await local.set({ [constants.LOCAL_META_KEY]: { ...constants.DEFAULT_META, deviceId:"dev", onboardingCompleted:true } });
      await storage.writeLocalState(state);
      await storage.writeLocalMeta({ ...constants.DEFAULT_META, deviceId:"dev", onboardingCompleted:true });
      await storage.updateSessionFrequentlyVisitedSnapshot({ enabled:true, count:5, sites:[{ title:"Example", host:"example.com", url:"https://example.com/", favicon:"" }] });
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.frequent, null,
        "structural cache must carry no enabled FV candidate list");
      const read = await storage.readSessionRenderCache();
      assert.equal(read.state.firstPaint.frequent.sites[0].url, "https://example.com/");
    });
  });
}

test("1.30.18.10 FV session ownership is a generated canonical bootstrap key", () => {
  for (const browser of ["firefox", "chrome"]) {
    const config = fs.readFileSync(`dist/${browser}/newtab/bootstrap-config.js`, "utf8");
    const session = fs.readFileSync(`dist/${browser}/newtab/session-bootstrap.js`, "utf8");
    assert.match(config, /sessionFrequentProjectionKey/);
    assert.match(session, /config\.sessionFrequentProjectionKey/);
    assert.doesNotMatch(session, /mosaicsync\.session\.frequent-projection/);
  }
});

test("1.30.18.10 cold-start FV live acquisition no longer adds the generic 250ms delay", () => {
  const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const start = src.indexOf("function schedulePostPaintMaintenance");
  const end = src.indexOf("function stampImportedProfileState", start);
  const block = src.slice(start, end > start ? end : start + 6000);
  assert.match(block, /hasWarmFrequentSites/);
  assert.match(block, /scheduleFrequentlyVisitedRefresh\(frequentlyVisitedEnabled && !hasWarmFrequentSites \? 0 : 250\)/);
});
