import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import {
  BUILTIN_SHORTCUT_ICON_KEYS,
  DEFAULT_SETTINGS,
  SHORTCUT_COLOR_TAG_KEYS,
  STATE_SCHEMA_VERSION
} from "../dist/firefox/core/constants.js";
import {
  flattenState,
  normalizeState,
  stateFromRecords
} from "../dist/firefox/core/model.js";
import {
  sortTopLevelByRecent,
  visibleTextBottom
} from "../dist/firefox/newtab/ui-utils.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const T = 1_800_000_000_000;

function shortcut(id, position, extras = {}) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`,
    image: "", imageSyncData: "", imageAssetId: "", localImageAssetId: "",
    imageSyncKind: "none", imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", position, createdAt: T, modifiedAt: T, source: "manual",
    ...extras
  };
}

function stateWith(items) {
  const personal = {
    shortcuts: items,
    settings: { ...DEFAULT_SETTINGS },
    settingsModifiedAt: T,
    updatedAt: T
  };
  const work = {
    shortcuts: [],
    settings: { ...DEFAULT_SETTINGS, spaceName: "Work" },
    settingsModifiedAt: T,
    updatedAt: T
  };
  return normalizeState({
    schemaVersion: STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: { personal, work },
    shortcuts: personal.shortcuts,
    settings: personal.settings,
    settingsModifiedAt: T,
    updatedAt: T
  });
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { for (const name of names) this.values.add(name); }
  remove(...names) { for (const name of names) this.values.delete(name); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.listeners = new Map();
    this.children = [];
    this.dataset = Object.create(null);
    this.classList = new FakeClassList();
    this.className = "";
    this.attributes = new Map();
    this.style = Object.create(null);
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  async dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    if (!handler) return undefined;
    return await handler({
      preventDefault() {}, stopPropagation() {},
      dataTransfer: { getData() { return ""; }, setData() {}, dropEffect: "", effectAllowed: "" },
      ...event
    });
  }
}

function loadCreateEmptySlot(browser, mode, { frequent = null, drag = null } = {}) {
  const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
  const calls = { addEditor: [], frequent: [], save: 0, render: 0, move: 0, extract: 0 };
  const context = {
    shortcutOrderMode: mode,
    dragId: drag,
    frequentDragSite: frequent,
    crossSpaceDrag: null,
    state: { activeSpaceId: "personal" },
    document: { createElement: tag => new FakeElement(tag) },
    t: value => value,
    openShortcutEditor: (...args) => calls.addEditor.push(args),
    addFrequentSiteToMosaicSync: async (...args) => { calls.frequent.push(args); return true; },
    commitCrossSpaceDrag: async () => {},
    moveTopLevelItemToPosition: () => { calls.move += 1; return true; },
    findShortcutRecord: () => ({ parentFolder: { id: "folder" } }),
    moveShortcutOutOfFolder: value => { calls.extract += 1; return value; },
    closeFolder() {},
    saveState: async () => { calls.save += 1; },
    render: () => { calls.render += 1; },
    showToast() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(source, "createEmptySlot")}; this.createEmptySlot = createEmptySlot;`, context);
  return { context, calls, createEmptySlot: context.createEmptySlot };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.2 ${browser} Recent mode blocks top-level visual-slot drops and keeps Add canonical`, async () => {
    const frequent = { title: "Example", url: "https://example.com/" };
    const { context, calls, createEmptySlot } = loadCreateEmptySlot(browser, "recent", { frequent, drag: "child-id" });
    const slot = createEmptySlot(5);
    assert.equal(slot.children.length, 1);

    // A visual slot in Recent mode must never become a persisted Manual position.
    await slot.dispatch("dragover");
    await slot.dispatch("drop");
    assert.equal(calls.frequent.length, 0, "Frequent-site drag-to-grid must not mutate canonical layout in Recent mode");
    assert.equal(calls.move, 0, "top-level/folder-child drop must not use a Recent visual slot");
    assert.equal(calls.extract, 0, "folder-child extraction to the top-level grid must be blocked in Recent mode");
    assert.equal(calls.save, 0);
    assert.equal(calls.render, 0);
    assert.equal(context.frequentDragSite, null, "stale Frequent drag payload should be cleared on a defensive Recent-mode drop");

    await slot.children[0].dispatch("click");
    assert.deepEqual(calls.addEditor, [[null, null, null]], "Add shortcut must choose a canonical free Manual position, not visual slot 5");
  });

  test(`1.27.2 ${browser} Manual mode keeps exact empty-slot drop behavior`, async () => {
    const frequent = { title: "Example", url: "https://example.com/" };
    const { calls, createEmptySlot } = loadCreateEmptySlot(browser, "manual", { frequent });
    const slot = createEmptySlot(5);
    await slot.dispatch("drop");
    assert.equal(calls.frequent.length, 1);
    assert.equal(calls.frequent[0][1].position, 5);
    await slot.children[0].dispatch("click");
    assert.deepEqual(calls.addEditor, [[null, null, 5]]);
  });
}

test("1.27.2 malformed builtin source kind without a valid icon normalizes back to none", () => {
  const normalized = stateWith([shortcut("orphan", 0, { imageSourceKind: "builtin", builtinIcon: "" })]);
  assert.equal(normalized.shortcuts[0].builtinIcon, "");
  assert.equal(normalized.shortcuts[0].imageSourceKind, "none");

  const hostileRecord = new Map([["orphan", {
    schemaVersion: 10, kind: "shortcut", id: "orphan", parentId: null,
    title: "orphan", url: "https://orphan.example/", imageAssetId: "", imageKind: "none",
    imageSourceKind: "builtin", imageSourceUrl: "", imageStyle: "contain", position: 0,
    createdAt: T, modifiedAt: T, source: "manual", deviceId: "remote"
  }]]);
  const rebuilt = stateFromRecords(hostileRecord, null, stateWith([]), new Map());
  assert.equal(rebuilt.shortcuts[0].builtinIcon, "");
  assert.equal(rebuilt.shortcuts[0].imageSourceKind, "none");
});

test("1.27.2 deliberate remote built-in icon remains last-writer-wins over local uploaded artwork", () => {
  const local = stateWith([shortcut("alpha", 0, {
    image: PNG,
    imageSyncData: PNG,
    imageSyncKind: "sync",
    imageSourceKind: "upload",
    modifiedAt: T
  })]);
  const remote = stateWith([shortcut("alpha", 0, {
    builtinIcon: "star",
    colorTag: "violet",
    imageSourceKind: "builtin",
    modifiedAt: T + 100
  })]);
  const records = flattenState(remote, "device-b");
  const rebuilt = stateFromRecords(records, null, local, new Map());
  const item = rebuilt.shortcuts[0];
  assert.equal(item.builtinIcon, "star");
  assert.equal(item.colorTag, "violet");
  assert.equal(item.image, "");
  assert.equal(item.imageSyncData, "");
  assert.equal(item.imageSyncKind, "none");
  assert.equal(item.imageSourceKind, "builtin");
  assert.equal(Object.prototype.polluted, undefined);
});

test("1.27.2 render manifest fails closed for hostile built-in icon/color metadata at projection time", async () => {
  const writes = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) { return writes.get(key) ?? null; },
    setItem(key, value) { writes.set(key, String(value)); },
    removeItem(key) { writes.delete(key); }
  };
  try {
    const module = await import(`../dist/firefox/newtab/render-manifest.js?hardening1272=${Date.now()}`);
    const raw = stateWith([
      shortcut("top", 0),
      {
        type: "folder", id: "folder", title: "Folder", position: 1, createdAt: T, modifiedAt: T,
        items: [shortcut("child", 0), shortcut("child-two", 1)]
      }
    ]);
    // Deliberately bypass normalizeState after construction: projectItem is itself
    // now a trust-reducing projection and must not rely on an earlier normalizer.
    raw.shortcuts[0].builtinIcon = "javascript:alert(1)";
    raw.shortcuts[0].colorTag = "chartreuse";
    raw.shortcuts[1].items[0].builtinIcon = "<svg onload=alert(1)>";
    raw.shortcuts[1].items[0].colorTag = "url(javascript:alert(1))";
    assert.equal(module.persistRenderManifest(raw, { onboardingCompleted: true }), true);
    const stored = JSON.parse(writes.get("mosaicsync.render-manifest.v1"));
    assert.equal(stored.shortcuts[0].builtinIcon, "");
    assert.equal(stored.shortcuts[0].colorTag, "");
    assert.equal(stored.shortcuts[1].items[0].builtinIcon, "");
    assert.equal(stored.shortcuts[1].items[0].colorTag, "");
    assert.ok(BUILTIN_SHORTCUT_ICON_KEYS.includes("star"));
    assert.ok(SHORTCUT_COLOR_TAG_KEYS.includes("violet"));
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

function folderPositionHarness(browser, { lineRects, innerWidth = 800, innerHeight = 900, tileRect, labelRect = { top: 200, bottom: 234, left: 280, right: 380, width: 100, height: 34 }, itemCount = 3 }) {
  const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
  const panel = { style: Object.create(null) };
  const popover = {
    hidden: false,
    style: Object.create(null),
    querySelector(selector) { return selector === ".folder-panel" ? panel : null; }
  };
  const label = { getBoundingClientRect: () => labelRect };
  const tile = { getBoundingClientRect: () => tileRect };
  const anchor = {
    querySelector(selector) {
      if (selector === ".folder-tile") return tile;
      if (selector === ".shortcut-label") return label;
      return null;
    },
    getBoundingClientRect: () => tileRect
  };
  const doc = {
    createRange() {
      return {
        selectNodeContents() {},
        getClientRects() { return lineRects; },
        detach() {}
      };
    }
  };
  const context = {
    folderPopover: popover,
    window: { innerWidth, innerHeight },
    activeFolderId: "folder",
    getTopLevelItem: () => ({ type: "folder", items: Array.from({ length: itemCount }, (_, i) => ({ id: `c${i}` })) }),
    visibleTextBottom: element => visibleTextBottom(element, doc),
    console
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction(source, "positionFolderPopover")}; this.positionFolderPopover = positionFolderPopover;`, context);
  context.positionFolderPopover(anchor);
  return { popover, panel };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.2 ${browser} folder popover integration uses rendered text, 3px gap, clamp and flip`, () => {
    const oneLine = folderPositionHarness(browser, {
      lineRects: [{ top: 200, bottom: 216, width: 72, height: 16 }],
      tileRect: { top: 145, bottom: 195, left: 300, right: 350, width: 50, height: 50 },
      innerWidth: 800,
      innerHeight: 1000,
      itemCount: 3
    });
    assert.equal(oneLine.popover.style.top, "219px", "one-line title should be followed by only the 3px visual gap");
    assert.equal(oneLine.panel.style.width, "390px");

    const twoLine = folderPositionHarness(browser, {
      lineRects: [
        { top: 200, bottom: 216, width: 90, height: 16 },
        { top: 216, bottom: 232, width: 62, height: 16 },
        { top: 232, bottom: 248, width: 40, height: 16 }
      ],
      tileRect: { top: 145, bottom: 195, left: 0, right: 50, width: 50, height: 50 },
      innerWidth: 500,
      innerHeight: 1000,
      itemCount: 3
    });
    assert.equal(twoLine.popover.style.top, "235px", "clipped third line must not push the panel away");
    assert.equal(twoLine.popover.style.left, "12px", "left edge must remain viewport-clamped");

    const flipped = folderPositionHarness(browser, {
      lineRects: [{ top: 760, bottom: 776, width: 72, height: 16 }],
      labelRect: { top: 760, bottom: 794, left: 695, right: 795, width: 100, height: 34 },
      tileRect: { top: 705, bottom: 755, left: 720, right: 770, width: 50, height: 50 },
      innerWidth: 800,
      innerHeight: 820,
      itemCount: 9
    });
    // estimatedHeight = min(430, 140 + ceil(9/3)*96) = 428; above = 705 - 428 - 3 = 274
    assert.equal(flipped.popover.style.top, "274px");
    assert.equal(flipped.popover.style.left, "398px", "right edge must remain viewport-clamped");
  });
}

test("1.27.2 classic first-paint Recent ordering stays equivalent to authoritative ordering", () => {
  const source = fs.readFileSync("dist/firefox/newtab/render-bootstrap.js", "utf8");
  const storage = new Map();
  const context = {
    SHORTCUT_USAGE_KEY: "mosaicsync.shortcut-usage.v1",
    localStorage: { getItem: key => storage.get(key) ?? null },
    console
  };
  vm.createContext(context);
  for (const name of ["readShortcutUsage", "lastOpenedAt", "recentOrder"]) {
    vm.runInContext(extractFunction(source, name), context);
  }

  let seed = 0x1272;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let round = 0; round < 80; round += 1) {
    const count = 2 + Math.floor(random() * 18);
    const items = [];
    const usage = Object.create(null);
    for (let i = 0; i < count; i += 1) {
      if (i % 5 === 0 && i + 1 < count) {
        const childA = shortcut(`f${round}-${i}-a`, 0);
        const childB = shortcut(`f${round}-${i}-b`, 1);
        items.push({ type: "folder", id: `folder-${round}-${i}`, title: "F", position: i, items: [childA, childB] });
        if (random() > 0.35) usage[childA.id] = 1 + Math.floor(random() * 100000);
        if (random() > 0.35) usage[childB.id] = 1 + Math.floor(random() * 100000);
      } else {
        const item = shortcut(`s${round}-${i}`, i);
        items.push(item);
        if (random() > 0.35) usage[item.id] = 1 + Math.floor(random() * 100000);
      }
    }
    storage.set("mosaicsync.shortcut-usage.v1", JSON.stringify(usage));
    const bootstrapIds = vm.runInContext("recentOrder", context)(structuredClone(items)).map(item => item.id);
    const authoritativeIds = sortTopLevelByRecent(items, usage).map(item => item.id);
    assert.deepEqual(Array.from(bootstrapIds), authoritativeIds, `Recent ordering drift in round ${round}`);
  }
});

test("1.27.2 shortcut editor compact rules cover normal desktop-height viewports without removing short-screen overflow safety", () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = fs.readFileSync(`dist/${browser}/newtab/newtab.css`, "utf8");
    assert.match(css, /@media \(min-width: 621px\)/);
    assert.match(css, /#shortcutDialog \.dialog-card \{ padding: 18px 24px; \}/);
    assert.match(css, /#shortcutDialog \.image-preview \{ width: 80px; height: 80px; \}/);
    assert.match(css, /#shortcutDialog \.dialog-actions \{ margin-top: 11px; \}/);
    assert.match(css, /\.dialog-card \{[\s\S]*?overflow: auto;/, "generic dialog overflow fallback must remain available on genuinely short viewports");
  }
});
