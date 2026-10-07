import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { TINY_PNG_VARIANTS } from "./harness/raster-fixtures.mjs";

globalThis.crypto ||= webcrypto;

class Area {
  constructor() {
    this.data = {};
    this.getCalls = [];
  }
  async get(keys) {
    this.getCalls.push(structuredClone(keys));
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    const out = { ...(keys || {}) };
    for (const key of Object.keys(keys || {})) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) {
    Object.assign(this.data, structuredClone(items));
  }
  async remove(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

const local = new Area();
globalThis.browser = { storage: { local, session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const localAssets = await import("../dist/firefox/core/local-assets.js");
const storage = await import("../dist/firefox/core/storage.js");

function shortcut(id, image, position) {
  return {
    type: "shortcut",
    id,
    title: id,
    url: `https://${id}.example/`,
    image,
    imageSyncKind: "device",
    imageSourceKind: "favicon",
    imageSourceUrl: `https://${id}.example/favicon.ico`,
    imageIsFallback: false,
    imageStyle: "contain",
    builtinIcon: "",
    colorTag: "",
    position,
    createdAt: 10,
    modifiedAt: 20,
    spaceMoveAt: 0,
    source: "manual"
  };
}

function projectedState(images) {
  const [first, second, wallpaper] = images;
  const normalized = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [shortcut("one", first, 0), shortcut("two", second, 1)],
        settings: { ...constants.DEFAULT_SETTINGS, backgroundImage: wallpaper },
        settingsModifiedAt: 20,
        updatedAt: 20
      },
      work: {
        shortcuts: [],
        settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Work" },
        settingsModifiedAt: 20,
        updatedAt: 20
      }
    }
  });
  return localAssets.projectStateToLocalAssets(normalized);
}

function seedProjection(projection) {
  local.data = { [constants.LOCAL_STATE_KEY]: structuredClone(projection.state) };
  for (const [id, value] of projection.assets) local.data[`${constants.LOCAL_ASSET_PREFIX}${id}`] = value;
}

function assetReads() {
  return local.getCalls.filter(call => Array.isArray(call) && call.some(key => String(key).startsWith(constants.LOCAL_ASSET_PREFIX)));
}

test("1.33.0.34 repeated hydration reuses exact assets already verified in this context and reads only new IDs", async () => {
  const first = projectedState([TINY_PNG_VARIANTS[0], TINY_PNG_VARIANTS[1], TINY_PNG_VARIANTS[2]]);
  seedProjection(first);
  local.getCalls = [];

  const hydratedFirst = await storage.hydratePersistedState(first.state, { spaceIds: ["personal"] });
  const firstReads = assetReads();
  assert.equal(firstReads.length, 1, "first encounter must read the authoritative local asset keys");
  assert.equal(firstReads[0].length, 3, "first encounter must validate every referenced active-Space asset");
  assert.equal(hydratedFirst.spaces.personal.shortcuts[0].image, TINY_PNG_VARIANTS[0]);
  assert.equal(hydratedFirst.spaces.personal.shortcuts[1].image, TINY_PNG_VARIANTS[1]);
  assert.equal(hydratedFirst.spaces.personal.settings.backgroundImage, TINY_PNG_VARIANTS[2]);

  const second = projectedState([TINY_PNG_VARIANTS[0], TINY_PNG_VARIANTS[3], TINY_PNG_VARIANTS[2]]);
  seedProjection(second);
  local.getCalls = [];

  const hydratedSecond = await storage.hydratePersistedState(second.state, { spaceIds: ["personal"] });
  const changedReads = assetReads();
  assert.equal(changedReads.length, 1, "a state event with one new asset should perform one asset read");
  assert.equal(changedReads[0].length, 1, "only the newly referenced asset ID should be read and validated");
  const changedId = second.state.spaces.personal.shortcuts[1].localImageAssetId;
  assert.deepEqual(changedReads[0], [`${constants.LOCAL_ASSET_PREFIX}${changedId}`]);
  assert.equal(hydratedSecond.spaces.personal.shortcuts[0].image, TINY_PNG_VARIANTS[0], "unchanged verified favicon must hydrate from the context cache");
  assert.equal(hydratedSecond.spaces.personal.shortcuts[1].image, TINY_PNG_VARIANTS[3]);
  assert.equal(hydratedSecond.spaces.personal.settings.backgroundImage, TINY_PNG_VARIANTS[2], "unchanged verified wallpaper must hydrate from the context cache");

  local.getCalls = [];
  const hydratedThird = await storage.hydratePersistedState(second.state, { spaceIds: ["personal"] });
  assert.equal(assetReads().length, 0, "an identical later state event must not re-read already verified asset values");
  assert.equal(hydratedThird.spaces.personal.shortcuts[0].image, TINY_PNG_VARIANTS[0]);
  assert.equal(hydratedThird.spaces.personal.shortcuts[1].image, TINY_PNG_VARIANTS[3]);
  assert.equal(hydratedThird.spaces.personal.settings.backgroundImage, TINY_PNG_VARIANTS[2]);
});

test("1.33.0.34 asset-read optimization is owned by New Tab, core and release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["newtab", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/optimization-133034.test.mjs"), `${group} must own optimization-133034.test.mjs`);
  }
});
