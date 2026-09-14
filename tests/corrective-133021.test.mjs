import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../dist/firefox/core/constants.js";
import { createRenderSnapshot } from "../dist/firefox/core/storage.js";
import { normalizeState } from "../dist/firefox/core/model.js";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = source.indexOf(") {", start);
  if (brace >= 0) brace += 2;
  else brace = source.indexOf("{\n", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.style = {};
  }
  append(...children) { this.children.push(...children); }
  remove() {}
  addEventListener() {}
}

function artworkRenderer() {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const code = ["validBootArtworkPreview", "bootArtworkPreviewFor", "createArtworkImage", "appendImageOrFallback", "createFallback", "firstGrapheme"]
    .map(name => extractFunction(source, name)).join("\n");
  const context = {
    RENDER_PREVIEW_MAX_CHARS: 16_000,
    bootArtworkPreviews: new Map(),
    graphemeSegmenter: null,
    document: { createElement(tag) { return new FakeElement(tag); } },
    requestAnimationFrame(fn) { fn(); },
    globalThis: null
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${code}; this.appendArtwork = appendImageOrFallback;`, context);
  return context;
}

test("1.33.0.21 deferred session artwork never flashes a fallback letter", () => {
  const ctx = artworkRenderer();
  const target = new FakeElement();
  ctx.appendArtwork(target, "", "Google", "", {
    id: "google",
    localImageAssetId: "asset-google",
    imageDeferred: true
  });
  assert.equal(target.children.length, 0, "known deferred artwork should stay empty until authoritative pixels arrive");
});

test("1.33.0.21 genuinely iconless and corrupt-authoritative shortcuts still get a fallback letter", () => {
  const ctx = artworkRenderer();
  const iconless = new FakeElement();
  ctx.appendArtwork(iconless, "", "Google", "", { id: "google", imageDeferred: false });
  assert.equal(iconless.children.length, 1);
  assert.equal(iconless.children[0].className, "fallback-icon");
  assert.equal(iconless.children[0].textContent, "G");

  const missingAsset = new FakeElement();
  ctx.appendArtwork(missingAsset, "", "Reddit", "", {
    id: "reddit",
    localImageAssetId: "missing-asset",
    imageSourceKind: "favicon"
  });
  assert.equal(missingAsset.children.length, 1, "authoritative missing assets must not stay blank forever");
  assert.equal(missingAsset.children[0].textContent, "R");
});

test("1.33.0.21 render snapshots mark both top-level and folder-child omitted artwork as deferred", () => {
  const largeImage = `data:image/png;base64,${"A".repeat(30_000)}`;
  const shortcut = id => ({
    type: "shortcut", id, title: id, url: `https://${id}.example/`, position: 0,
    createdAt: 1, modifiedAt: 1, image: largeImage, localImageAssetId: `asset-${id}`,
    imageSyncData: "", imageAssetId: "", imageSyncKind: "device", imageSourceKind: "favicon",
    imageSourceUrl: "", imageIsFallback: false, imageStyle: "contain", source: "manual", builtinIcon: "", colorTag: "", spaceMoveAt: 0
  });
  const top = shortcut("top");
  const child = { ...shortcut("child"), position: 0 };
  const folder = { type: "folder", id: "folder", title: "Folder", position: 1, createdAt: 1, modifiedAt: 1, items: [child] };
  const state = structuredClone(DEFAULT_STATE);
  state.spaces.personal.shortcuts = [top, folder];
  state.shortcuts = state.spaces.personal.shortcuts;
  const snapshot = createRenderSnapshot(state);
  assert.equal(snapshot.shortcuts[0].image, "");
  assert.equal(snapshot.shortcuts[0].imageDeferred, true);
  assert.equal(snapshot.shortcuts[1].items[0].image, "");
  assert.equal(snapshot.shortcuts[1].items[0].imageDeferred, true);
});

test("1.33.0.21 artwork-aware save chooses one preview-aware manifest refresh instead of the ordinary writer", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "saveState");
  const calls = { ordinary: 0, artwork: 0 };
  const state = { schemaVersion: 1, settings: {}, shortcuts: [], updatedAt: 1 };
  const context = {
    state,
    meta: {},
    DEFAULT_STATE: { schemaVersion: 1 },
    writeBaseline: {},
    stateMutationGeneration: 0,
    nextMutationTime: value => Number(value || 0) + 1,
    repairTopLevelPositionsWithinCapacity: shortcuts => shortcuts,
    visibleTopLevelCapacity: () => 44,
    async writeLocalStateWithBaseline(value) { return { state: value, compactBaseline: { ok: true } }; },
    settlePersistedSettingsDraft() {},
    scheduleAppearanceHintRefresh() {},
    refreshFirstPaintCaches() { calls.ordinary += 1; },
    refreshRenderManifestAfterArtworkChange() { calls.artwork += 1; }
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.save = saveState;`, context);
  await context.save({ localCacheOnly: true, artworkChanged: true });
  assert.deepEqual(calls, { ordinary: 0, artwork: 1 });
});

test("1.33.0.21 device and remote artwork hydration opt into the artwork-aware save path", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  for (const name of ["hydrateDeviceFavicons", "hydrateRemoteImageSources"]) {
    const body = extractFunction(source, name);
    assert.match(body, /saveState\(\{\s*localCacheOnly:\s*true,\s*artworkChanged:\s*true\s*\}\)/,
      `${name} must publish a preview-aware first-frame manifest`);
  }
});

test("1.33.0.21 no-color swatch uses a CSS-drawn centered cross instead of a font glyph", () => {
  const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
  const css = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");
  const button = html.match(/<button[^>]*class="shortcut-color-choice no-color[^>]*>[\s\S]*?<\/button>/)?.[0] || "";
  assert.ok(button);
  assert.doesNotMatch(button, /×/);
  assert.match(css, /\.shortcut-color-choice\.no-color::before/);
  assert.match(css, /\.shortcut-color-choice\.no-color::after/);
  assert.match(css, /translate\(-50%,\s*-50%\) rotate\(45deg\)/);
  assert.match(css, /translate\(-50%,\s*-50%\) rotate\(-45deg\)/);
  assert.match(css, /\.shortcut-color-choice\.no-color\[aria-pressed="true"\]/,
    "no-color selected border must not be overridden by the base no-color rule");
});

test("1.33.0.21 fresh installs default to Solar Drift on Light and Blueglow on Dark", () => {
  assert.equal(DEFAULT_SETTINGS.themeWallpapersEnabled, true);
  assert.equal(DEFAULT_SETTINGS.lightBackgroundPreset, "solarDrift");
  assert.equal(DEFAULT_SETTINGS.darkBackgroundPreset, "blueglow");
  assert.equal(DEFAULT_STATE.settings.lightBackgroundPreset, "solarDrift");
  assert.equal(DEFAULT_STATE.settings.darkBackgroundPreset, "blueglow");
});

test("1.33.0.21 fresh wallpaper defaults do not silently opt existing stored settings into theme wallpapers", () => {
  const legacySettings = {
    columns: 11, rows: 4, tileSize: 76, theme: "system", backgroundColor: "#2b0050",
    backgroundPreset: "", backgroundImage: "", backgroundDim: 0, brandVisible: true, autoSiteIcons: true,
    frequentlyVisitedEnabled: false, frequentlyVisitedCount: 5, multipleSpacesEnabled: true
  };
  const state = normalizeState({ settings: legacySettings, shortcuts: [], updatedAt: 1, settingsModifiedAt: 1 });
  assert.equal(state.settings.themeWallpapersEnabled, false);
  assert.equal(state.settings.lightBackgroundPreset, "");
  assert.equal(state.settings.darkBackgroundPreset, "");
});

test("1.33.0.21 Developer Guide is evergreen architecture, not a duplicate changelog", () => {
  const guide = fs.readFileSync("DEVELOPER-GUIDE.md", "utf8");
  assert.match(guide, /^# MosaicSync Developer Guide\n/);
  assert.doesNotMatch(guide, /^## 1\.\d/m, "release-number headings belong in README-DEVELOPMENT/CHANGELOG, not the developer guide");
  for (const invariant of [
    "completeRemoteDescriptor()",
    "completeLiveRemoteDescriptor()",
    "frozen target",
    "shortcutDialog.open",
    "recoveryCopiesSessionGeneration",
    "bookmarksDialogGeneration",
    "builtin-icons.js",
    "folderItems.replaceChildren()",
    "frequentLiveRefreshVerified",
    "createPersistedWriteBaseline()",
    "LOCAL_SYNC_CONTINUITY_KEY",
    "lastDeviceSnapshotGcAt",
    "normalizeLogicalTime()"
  ]) assert.match(guide, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `missing evergreen invariant: ${invariant}`);
});
