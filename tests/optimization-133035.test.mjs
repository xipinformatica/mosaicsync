import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
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
const { parseImageDataUrl } = await import("../dist/firefox/core/image-data.js");
const {
  browserNativeFaviconFallbackNeeded,
  isAcceptedRasterArtworkDataUrl,
  learnedArtworkDisposition,
  learnedArtworkMayReplace
} = await import("../dist/firefox/core/artwork-policy.js");

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

function extractAsyncFunction(source, name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const c = source[index];
    const n = source[index + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; index += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; index += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

async function runNativeFaviconHydration(favicon) {
  const source = await fs.readFile(new URL("../src/shared/newtab/newtab.js", import.meta.url), "utf8");
  const normalizeBody = extractAsyncFunction(source, "normalizeDeviceFavicon");
  const hydrateBody = extractAsyncFunction(source, "hydrateDeviceFavicons");
  const state = {
    shortcuts: [{
      type: "shortcut",
      id: "native",
      title: "Native",
      url: "https://example.test/",
      image: "",
      imageSyncData: "",
      imageAssetId: "",
      imageSyncKind: "none",
      imageIsFallback: false,
      imageSourceKind: "none",
      imageSourceUrl: ""
    }]
  };
  let saves = 0;
  let patches = 0;
  let resolverRequests = 0;
  const context = {
    state,
    URL,
    Map,
    Set,
    parseImageDataUrl,
    browserNativeFaviconFallbackNeeded,
    isAcceptedRasterArtworkDataUrl,
    learnedArtworkDisposition,
    learnedArtworkMayReplace,
    hasTopSitesPermission: async () => true,
    getNativeTopSites: async () => [{ title: "Example", url: "https://example.test/", favicon }],
    findShortcutRecord: () => ({ parentFolder: null }),
    saveState: async () => { saves += 1; },
    patchVisibleShortcutArtwork: () => { patches += 1; },
    requestMissingSiteIcons: () => { resolverRequests += 1; },
    FAVICON_LOCAL_MAX_SIDE: 96,
    FAVICON_LOCAL_TARGET_BYTES: 12_000,
    REMOTE_IMAGE_INPUT_MAX_BYTES: 2_000_000,
    optimizeImageDataUrl: async value => value
  };
  vm.createContext(context);
  vm.runInContext(`${normalizeBody}\n${hydrateBody}\nthis.runHydration = hydrateDeviceFavicons;`, context);
  await context.runHydration();
  return { state, saves, patches, resolverRequests };
}

test("1.33.0.35 reader hydration prunes superseded verified assets so reintroduced IDs cross validation again", async () => {
  const first = projectedState([TINY_PNG_VARIANTS[0], TINY_PNG_VARIANTS[1], TINY_PNG_VARIANTS[2]]);
  seedProjection(first);
  local.getCalls = [];
  await storage.hydratePersistedState(first.state, { spaceIds: ["personal"] });
  assert.equal(assetReads()[0]?.length, 3, "initial state must validate all three assets");

  const second = projectedState([TINY_PNG_VARIANTS[0], TINY_PNG_VARIANTS[3], TINY_PNG_VARIANTS[2]]);
  seedProjection(second);
  local.getCalls = [];
  await storage.hydratePersistedState(second.state, { spaceIds: ["personal"] });
  assert.equal(assetReads()[0]?.length, 1, "replacement state should read only the new asset");

  // Reintroducing the superseded ID must not be satisfied by an indefinitely
  // retained reader-cache entry. It must cross the authoritative storage +
  // validation boundary again.
  seedProjection(first);
  local.getCalls = [];
  await storage.hydratePersistedState(first.state, { spaceIds: ["personal"] });
  const reintroducedReads = assetReads();
  assert.equal(reintroducedReads.length, 1, "reintroduced superseded artwork must be read again after cache pruning");
  assert.equal(reintroducedReads[0].length, 1, "only the reintroduced asset should need validation");
  const reintroducedId = first.state.spaces.personal.shortcuts[1].localImageAssetId;
  assert.deepEqual(reintroducedReads[0], [`${constants.LOCAL_ASSET_PREFIX}${reintroducedId}`]);
});


test("1.33.0.35 partial Space hydration does not prune whole-profile verified assets", async () => {
  const full = projectedState([TINY_PNG_VARIANTS[4], TINY_PNG_VARIANTS[5], TINY_PNG_VARIANTS[6]]);
  seedProjection(full);
  local.getCalls = [];
  await storage.hydratePersistedState(full.state, { spaceIds: ["personal"] });
  assert.equal(assetReads()[0]?.length, 3, "setup must verify the complete active-Space asset set");

  const partial = projectedState([TINY_PNG_VARIANTS[4], "", ""]);
  seedProjection(partial);
  local.getCalls = [];
  const normalizedPartial = model.normalizeState(partial.state);
  await storage.hydrateLocalAssetsForSpaceNormalized(normalizedPartial, "personal");

  seedProjection(full);
  local.getCalls = [];
  await storage.hydratePersistedState(full.state, { spaceIds: ["personal"] });
  assert.equal(assetReads().length, 0, "narrow Space hydration must not evict verified assets outside its partial projection");
});

test("1.33.0.35 native favicon hydration rejects unsupported SVG before it can enter a no-progress save loop", async () => {
  const svg = "data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><rect width='16' height='16'/></svg>").toString("base64");
  const firstStartup = await runNativeFaviconHydration(svg);
  const secondStartup = await runNativeFaviconHydration(svg);
  assert.equal(firstStartup.saves, 0, "unsupported native SVG must not trigger a local-cache save");
  assert.equal(secondStartup.saves, 0, "a later startup must not repeat a no-progress save for the same unsupported SVG");
  assert.equal(firstStartup.state.shortcuts[0].image, "", "unsupported SVG must never be adopted into shortcut state");
  assert.equal(secondStartup.state.shortcuts[0].image, "");
});

test("1.33.0.35 native favicon hydration still accepts supported raster data URLs", async () => {
  const raster = await runNativeFaviconHydration(TINY_PNG_VARIANTS[0]);
  assert.equal(raster.saves, 1, "supported browser-native raster favicon should still be saved");
  assert.equal(raster.state.shortcuts[0].image, TINY_PNG_VARIANTS[0]);
  assert.equal(raster.state.shortcuts[0].imageSourceKind, "firefox");
  assert.equal(raster.state.shortcuts[0].imageSyncKind, "device");
  assert.equal(raster.patches, 1);
  assert.equal(raster.resolverRequests, 1, "native fallback should still ask the background resolver for a quality upgrade");
});

test("1.33.0.35 optimization coverage is owned by New Tab, browser, core and release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["newtab", "browser", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/optimization-133035.test.mjs"), `${group} must own optimization-133035.test.mjs`);
  }
});
