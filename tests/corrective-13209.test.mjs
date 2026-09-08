import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEWTAB_PATH = path.join(ROOT, "src/shared/newtab/newtab.js");

function makeArea(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      if (keys === null) return structuredClone(data);
      if (typeof keys === "string") return Object.hasOwn(data, keys) ? { [keys]: structuredClone(data[keys]) } : {};
      const out = {};
      for (const key of Array.isArray(keys) ? keys : Object.keys(keys || {})) {
        if (Object.hasOwn(data, key)) out[key] = structuredClone(data[key]);
      }
      return out;
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    }
  };
}

function makeLocks() {
  return { request: async (_name, callback) => callback({ name: _name }) };
}

async function freshImport(file, tag) {
  return import(`${pathToFileURL(file).href}?${tag}=${Date.now()}-${Math.random()}`);
}

async function withBrowserEnvironment(local, callback) {
  const browserDescriptor = Object.getOwnPropertyDescriptor(globalThis, "browser");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "browser", {
    value: { storage: { local, session: makeArea() } }, configurable: true, writable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { locks: makeLocks() }, configurable: true, writable: true
  });
  try {
    return await callback();
  } finally {
    if (browserDescriptor) Object.defineProperty(globalThis, "browser", browserDescriptor);
    else delete globalThis.browser;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
}

function shortcut(id, title, url, position) {
  return { type: "shortcut", id, title, url, position, createdAt: 1, modifiedAt: 1, source: "manual" };
}

test("1.32.0.9 New Tab constructs cross-Space intent from user semantics, not cached Sync authority", () => {
  const source = fs.readFileSync(NEWTAB_PATH, "utf8");
  const gatedIntent = /meta\.syncEnabled\s*&&\s*meta\.syncInitialized\s*\?\s*createCrossSpaceSyncIntentNormalized/g;
  assert.equal((source.match(gatedIntent) || []).length, 0,
    "cross-Space intent construction must not be suppressed by stale cached Sync metadata");

  const createCalls = source.match(/createCrossSpaceSyncIntentNormalized\(beforeMove,\s*(?:next|movedState),\s*\{/g) || [];
  assert.equal(createCalls.length, 2,
    "both drag and shortcut-editor cross-Space paths must always describe semantic move intent");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.32.0.9 ${browser}: opposite-direction moves retain separate dedicated journals when durable Sync is active`, async () => {
    const constantsPath = path.join(ROOT, `dist/${browser}/core/constants.js`);
    const modelPath = path.join(ROOT, `dist/${browser}/core/model.js`);
    const storagePath = path.join(ROOT, `dist/${browser}/core/storage.js`);
    const constants = await freshImport(constantsPath, `${browser}-constants`);
    const model = await freshImport(modelPath, `${browser}-model`);
    const local = makeArea({
      [constants.LOCAL_META_KEY]: {
        ...constants.DEFAULT_META,
        deviceId: "device-13209",
        syncEnabled: true,
        syncInitialized: true
      }
    });

    await withBrowserEnvironment(local, async () => {
      const storage = await freshImport(storagePath, `${browser}-storage`);
      const base = model.normalizeState({
        schemaVersion: constants.STATE_SCHEMA_VERSION,
        activeSpaceId: "personal",
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true },
        spaces: {
          personal: {
            shortcuts: [shortcut("a", "A", "https://a.example/", 0)],
            settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true },
            updatedAt: 1,
            settingsModifiedAt: 1
          },
          work: {
            shortcuts: [shortcut("b", "B", "https://b.example/", 0)],
            settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true },
            updatedAt: 1,
            settingsModifiedAt: 1
          }
        },
        updatedAt: 1,
        settingsModifiedAt: 1
      });
      await storage.writeLocalState(base);

      const movedA = model.moveShortcutBetweenSpacesNormalized(base, {
        shortcutId: "a", fromSpaceId: "personal", toSpaceId: "work"
      });
      const intentA = model.createCrossSpaceSyncIntentNormalized(base, movedA, {
        fromSpaceId: "personal", toSpaceId: "work", shortcutIds: ["a"], deviceId: "device-13209"
      });
      assert.ok(intentA?.intentId);
      const persistedA = await storage.writeLocalState(movedA, {
        baseState: storage.createWriteBaseline(base),
        crossSpaceSyncIntent: intentA,
        recordSyncMutation: false
      });

      const movedB = model.moveShortcutBetweenSpacesNormalized(persistedA, {
        shortcutId: "b", fromSpaceId: "work", toSpaceId: "personal"
      });
      const intentB = model.createCrossSpaceSyncIntentNormalized(persistedA, movedB, {
        fromSpaceId: "work", toSpaceId: "personal", shortcutIds: ["b"], deviceId: "device-13209"
      });
      assert.ok(intentB?.intentId);
      await storage.writeLocalState(movedB, {
        baseState: storage.createWriteBaseline(persistedA),
        crossSpaceSyncIntent: intentB,
        recordSyncMutation: false
      });

      const crossKeys = Object.keys(local.data).filter(key => key.startsWith(constants.LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX));
      assert.equal(crossKeys.length, 2, "each semantic cross-Space move must retain its own durable transaction journal");
      assert.equal(Object.hasOwn(local.data, constants.LOCAL_PENDING_SYNC_MUTATION_KEY), false,
        "dedicated cross-Space intent must not collapse into the cumulative mutation journal");
      const intents = crossKeys.map(key => local.data[key]);
      assert.deepEqual(new Set(intents.map(intent => `${intent.fromSpaceId}->${intent.toSpaceId}`)),
        new Set(["personal->work", "work->personal"]));
    });
  });
}
