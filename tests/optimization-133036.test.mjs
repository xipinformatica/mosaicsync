import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
import { TINY_PNG_VARIANTS } from "./harness/raster-fixtures.mjs";

globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.getCalls = []; }
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
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

const local = new Area();
globalThis.browser = {
  storage: { local, session: new Area() },
  i18n: { getUILanguage() { return "en-US"; }, getMessage() { return ""; } }
};

globalThis.navigator ||= { language: "en-US", languages: ["en-US"] };

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};

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

function twoSpaceProjection({ personalImage, workImage }) {
  const normalized = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [shortcut("personal-one", personalImage, 0)],
        settings: { ...constants.DEFAULT_SETTINGS },
        settingsModifiedAt: 20,
        updatedAt: 20
      },
      work: {
        shortcuts: [shortcut("work-one", workImage, 0)],
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

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(documentRef, tagName = "div") {
    this.ownerDocument = documentRef;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.className = "";
    this.classList = new FakeClassList();
    this.style = { setProperty() {}, removeProperty() {} };
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this.open = false;
    this.value = "";
    this.textContent = "";
    this.replaceChildrenCount = 0;
  }
  append(...nodes) {
    for (const node of nodes.flat()) {
      if (!node) continue;
      if (node.__fragment) { this.append(...node.children); continue; }
      this.children.push(node);
      if (typeof node === "object") node.parentNode = this;
    }
  }
  replaceChildren(...nodes) {
    this.replaceChildrenCount += 1;
    for (const child of this.children) if (child && typeof child === "object") child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  removeAttribute(name) { this.attributes.delete(String(name)); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, extra = {}) {
    const event = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const listener of this.listeners.get(type) || []) listener.call(this, event);
  }
  querySelector(selector) {
    const wanted = String(selector || "").toUpperCase();
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (node?.tagName === wanted) return node;
      stack.unshift(...(node?.children || []));
    }
    return null;
  }
  contains(node) {
    if (node === this) return true;
    const stack = [...this.children];
    while (stack.length) {
      const current = stack.pop();
      if (current === node) return true;
      stack.push(...(current?.children || []));
    }
    return false;
  }
  focus() {}
  showModal() { this.open = true; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
}

class FakeDocument {
  constructor() { this.createdByTag = new Map(); }
  createElement(tagName) {
    const tag = String(tagName).toLowerCase();
    this.createdByTag.set(tag, (this.createdByTag.get(tag) || 0) + 1);
    return new FakeElement(this, tag);
  }
  createDocumentFragment() {
    const fragment = new FakeElement(this, "fragment");
    fragment.__fragment = true;
    return fragment;
  }
}

function trackedBookmark(id, title, url, pathParts, reads) {
  return {
    id,
    get title() { reads.title += 1; return title; },
    get url() { reads.url += 1; return url; },
    get path() { reads.path += 1; return pathParts; }
  };
}

function makeBookmarkHarness() {
  const documentRef = new FakeDocument();
  globalThis.document = documentRef;
  const reads = { title: 0, url: 0, path: 0 };
  const items = [
    trackedBookmark("1", "Alpha manual", "https://alpha.example/docs", ["Toolbar"], reads),
    trackedBookmark("2", "Beta notes", "http://beta.example/reference", ["Toolbar"], reads),
    trackedBookmark("3", "Gamma page", "https://gamma.example/start", ["Archive"], reads)
  ];
  const root = { id: "root", title: "", children: [] };
  const folders = [
    { id: "root", title: "", depth: 0, parentId: "" },
    { id: "toolbar", title: "Toolbar", depth: 1, parentId: "root" },
    { id: "archive", title: "Archive", depth: 1, parentId: "root" }
  ];
  const api = {
    async hasBookmarksPermission() { return true; },
    async readBookmarkTree() { return [root]; },
    flattenBookmarkFolders() { return folders; },
    flattenBookmarks() { return items; },
    directChildFolders() { return []; },
    directFolderBookmarks() { return []; }
  };

  const bookmarksButton = new FakeElement(documentRef, "button");
  const bookmarksDialog = new FakeElement(documentRef, "dialog");
  const bookmarksPermissionState = new FakeElement(documentRef, "div");
  const bookmarksPermissionButton = new FakeElement(documentRef, "button");
  const bookmarksBrowser = new FakeElement(documentRef, "div");
  const bookmarksSearch = new FakeElement(documentRef, "input");
  const bookmarksCount = new FakeElement(documentRef, "span");
  const bookmarkFolderTree = new FakeElement(documentRef, "div");
  const bookmarkBreadcrumbs = new FakeElement(documentRef, "div");
  const bookmarkFolderCards = new FakeElement(documentRef, "div");
  const bookmarkItems = new FakeElement(documentRef, "div");
  const bookmarksEmpty = new FakeElement(documentRef, "div");
  bookmarksEmpty.append(new FakeElement(documentRef, "strong"), new FakeElement(documentRef, "span"));
  const bookmarksStatus = new FakeElement(documentRef, "div");

  return {
    documentRef,
    reads,
    items,
    api,
    elements: {
      bookmarksButton,
      bookmarksDialog,
      bookmarksPermissionState,
      bookmarksPermissionButton,
      bookmarksBrowser,
      bookmarksSearch,
      bookmarksCount,
      bookmarkFolderTree,
      bookmarkBreadcrumbs,
      bookmarkFolderCards,
      bookmarkItems,
      bookmarksEmpty,
      bookmarksStatus
    }
  };
}

async function openBookmarkHarness() {
  const moduleUrl = `${pathToFileURL(path.resolve("src/shared/newtab/bookmarks-controller.js")).href}?opt133036=${Date.now()}-${Math.random()}`;
  const { createBookmarksController } = await import(moduleUrl);
  const harness = makeBookmarkHarness();
  const controller = createBookmarksController({
    loadBookmarksModule: async () => harness.api,
    ensureSecondaryStyles: async () => true,
    closeDialog(dialog) { dialog.open = false; dialog.dispatch("close"); },
    positionFloatingMenu() {},
    graphemeSegmenter: null,
    elements: harness.elements
  });
  controller.bind();
  harness.elements.bookmarksButton.dispatch("click");
  for (let i = 0; i < 50 && harness.elements.bookmarkItems.children.length !== harness.items.length; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(harness.elements.bookmarkItems.children.length, harness.items.length, "bookmark fixture must finish initial render");
  return harness;
}

test("1.33.0.36 whole-profile cache pruning keeps verified assets referenced by the other Space", async () => {
  const first = twoSpaceProjection({ personalImage: TINY_PNG_VARIANTS[0], workImage: TINY_PNG_VARIANTS[1] });
  seedProjection(first);
  local.getCalls = [];
  await storage.hydratePersistedState(first.state, { spaceIds: ["personal"] });
  assert.equal(assetReads()[0]?.length, 1, "initial active-Space hydration should read Personal only");

  local.getCalls = [];
  const firstNormalized = model.normalizeState(first.state);
  await storage.hydrateLocalAssetsForSpaceNormalized(firstNormalized, "work");
  assert.equal(assetReads()[0]?.length, 1, "opening Work should verify its image once");

  const second = twoSpaceProjection({ personalImage: TINY_PNG_VARIANTS[2], workImage: TINY_PNG_VARIANTS[1] });
  seedProjection(second);
  local.getCalls = [];
  await storage.hydratePersistedState(second.state, { spaceIds: ["personal"] });
  assert.equal(assetReads()[0]?.length, 1, "incoming state should read only the changed Personal image");

  local.getCalls = [];
  const secondNormalized = model.normalizeState(second.state);
  await storage.hydrateLocalAssetsForSpaceNormalized(secondNormalized, "work");
  assert.equal(assetReads().length, 0, "whole-profile pruning must retain the unchanged Work asset across Personal-only adoption");
});

test("1.33.0.36 bookmark search precomputes searchable text instead of rebuilding it on every input", async () => {
  const harness = await openBookmarkHarness();
  harness.reads.title = 0;
  harness.reads.url = 0;
  harness.reads.path = 0;

  harness.elements.bookmarksSearch.value = "not-present-anywhere";
  harness.elements.bookmarksSearch.dispatch("input");

  assert.deepEqual(harness.reads, { title: 0, url: 0, path: 0 }, "search input must use the precomputed index rather than rereading bookmark fields");
  assert.equal(harness.elements.bookmarkItems.children.length, 0);
});

test("1.33.0.36 bookmark search does not let the common https scheme make punctuation queries match everything", async () => {
  const harness = await openBookmarkHarness();
  harness.elements.bookmarksSearch.value = ":";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 0, "transport syntax must not make every HTTPS bookmark a search result");
  assert.equal(harness.elements.bookmarksEmpty.hidden, false);
});

test("1.33.0.36 pasted full HTTP(S) bookmark URLs remain searchable", async () => {
  const harness = await openBookmarkHarness();

  harness.elements.bookmarksSearch.value = "https://alpha.example/docs";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1, "pasted HTTPS URL must find its bookmark");
  assert.equal(harness.elements.bookmarkItems.children[0]?.href, "https://alpha.example/docs");

  harness.elements.bookmarksSearch.value = "http://beta.example/reference";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1, "pasted HTTP URL must find its bookmark");
  assert.equal(harness.elements.bookmarkItems.children[0]?.href, "http://beta.example/reference");
});

test("1.33.0.36 shortening or editing a query rescans the full bookmark index", async () => {
  const harness = await openBookmarkHarness();

  harness.elements.bookmarksSearch.value = "alph";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1);

  harness.elements.bookmarksSearch.value = "a";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 3, "backspacing must restore matches excluded by the narrower query");

  harness.elements.bookmarksSearch.value = "al";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1);
  assert.equal(harness.elements.bookmarkItems.children[0]?.href, "https://alpha.example/docs");

  harness.elements.bookmarksSearch.value = "be";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1, "editing rather than extending must rescan the full index");
  assert.equal(harness.elements.bookmarkItems.children[0]?.href, "http://beta.example/reference");
});

test("1.33.0.36 bookmark search input does not rebuild the folder sidebar", async () => {
  const harness = await openBookmarkHarness();
  const before = harness.elements.bookmarkFolderTree.replaceChildrenCount;
  harness.elements.bookmarksSearch.value = "alpha";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkFolderTree.replaceChildrenCount, before, "typing in search must leave the unchanged folder sidebar alone");
});

test("1.33.0.36 narrowing a search without changing its result set does not rebuild bookmark item DOM", async () => {
  const harness = await openBookmarkHarness();
  harness.elements.bookmarksSearch.value = "alpha";
  harness.elements.bookmarksSearch.dispatch("input");
  assert.equal(harness.elements.bookmarkItems.children.length, 1);
  const beforeReplace = harness.elements.bookmarkItems.replaceChildrenCount;
  const beforeLinks = harness.documentRef.createdByTag.get("a") || 0;

  harness.elements.bookmarksSearch.value = "alph";
  harness.elements.bookmarksSearch.dispatch("input");

  assert.equal(harness.elements.bookmarkItems.replaceChildrenCount, beforeReplace, "same search result identities must reuse the existing result DOM");
  assert.equal(harness.documentRef.createdByTag.get("a") || 0, beforeLinks, "unchanged result sets must not recreate bookmark links");
});

test("1.33.0.36 optimization coverage is owned by New Tab, core and release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  for (const group of ["newtab", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/optimization-133036.test.mjs"), `${group} must own optimization-133036.test.mjs`);
  }
});
