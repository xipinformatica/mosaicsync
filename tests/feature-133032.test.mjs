import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createFolderDiscoveryHint
} from "../src/shared/newtab/folder-discovery-hint.js";
import { testFilesForGroup } from "../tools/test-groups.mjs";

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.removed = false;
    this.className = "";
    this.textContent = "";
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); if (name === "data-id") delete this.dataset.id; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
  remove() { this.removed = true; if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
  addEventListener(type, fn, options) { const list = this.listeners.get(type) || []; list.push({ fn, options }); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.fn !== fn)); }
  querySelector(selector) {
    if (selector === ".tile") return this.children.find(child => String(child.className).split(/\s+/).includes("tile")) || null;
    if (selector === ".shortcut-label") return this.children.find(child => String(child.className).split(/\s+/).includes("shortcut-label")) || null;
    return null;
  }
  querySelectorAll() { return []; }
  cloneNode(deep = false) {
    const copy = new FakeElement(this.tagName.toLowerCase());
    copy.className = this.className;
    copy.textContent = this.textContent;
    copy.dataset = { ...this.dataset };
    if (deep) copy.append(...this.children.map(child => child.cloneNode?.(true) || child));
    return copy;
  }
}

function walk(root) {
  const out = [];
  const visit = node => { out.push(node); for (const child of node?.children || []) visit(child); };
  visit(root);
  return out;
}

function byClass(root, className) {
  return walk(root).filter(node => String(node.className || "").split(/\s+/).includes(className));
}

function environment({ reduced = false } = {}) {
  const timers = new Map(); let timerId = 0;
  const win = new FakeElement("window");
  win.innerWidth = 900; win.innerHeight = 700;
  win.setTimeout = fn => { const id = ++timerId; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.matchMedia = () => ({ matches: reduced });
  win.MutationObserver = class { observe() {} disconnect() {} };
  const body = new FakeElement("body");
  const doc = new FakeElement("document");
  doc.body = body;
  doc.createElement = tag => new FakeElement(tag);

  const slots = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = new FakeElement("div");
    slot.className = "shortcut-slot";
    slot.dataset.id = `s${i}`;
    const card = new FakeElement("a");
    const tile = new FakeElement("span");
    tile.className = "tile";
    const icon = new FakeElement("span"); icon.className = "fallback-icon"; icon.textContent = String(i + 1);
    tile.append(icon);
    tile.getBoundingClientRect = () => ({ left: 70 + i * 105, top: 130, width: 88, height: 88, right: 158 + i * 105, bottom: 218 });
    const label = new FakeElement("span"); label.className = "shortcut-label"; label.textContent = `Shortcut ${i + 1}`;
    card.append(tile, label); slot.append(card);
    slot.querySelector = selector => selector === ".tile" ? tile : selector === ".shortcut-label" ? label : null;
    slots.push(slot);
  }
  const grid = new FakeElement("div");
  grid.children = slots.slice(); for (const slot of grid.children) slot.parentNode = grid;
  grid.querySelectorAll = selector => selector.includes("shortcut-slot") ? slots : [];
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const runTimers = async () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
  };
  return { win, doc, body, grid, slots, storage, store, runTimers };
}

const snapshot = () => ({
  activeShortcutCount: 6, anyFolder: false, orderMode: "manual", visible: true,
  idle: true, renderReady: true, awaitingRemote: false
});

const translations = {
  folderDiscoveryTitle: "Organize with folders",
  folderDiscoveryBody: 'Drop one shortcut onto another, then choose "Create folder".',
  createFolder: "Create folder",
  putTogether: "Put both shortcuts together",
  moveHere: "Move here",
  switchPositions: "Switch their positions",
  folder: "Folder"
};
const translate = key => translations[key] || key;

test("1.33.0.32 motion tutorial demonstrates the real choice then a fake folder outcome without touching the grid", async () => {
  const env = environment({ reduced: false });
  const originalChildren = env.grid.children.slice();
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot, ensureStyles: async () => true, translate,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  assert.equal(controller.mounted, true);
  assert.deepEqual(env.grid.children, originalChildren, "real launcher children must remain unchanged");
  assert.equal(env.body.children.length, 1);
  const layer = env.body.children[0];
  assert.equal(byClass(layer, "folder-discovery-choice").length, 1, "fake two-choice popover must exist");
  assert.equal(byClass(layer, "folder-discovery-choice-folder").length, 1, "Create folder row must be represented");
  assert.equal(byClass(layer, "folder-discovery-fake-folder").length, 1, "fake folder tile must exist");
  assert.equal(byClass(layer, "folder-discovery-fake-folder-panel").length, 1, "fake folder must visibly open");
  assert.equal(byClass(layer, "folder-discovery-fake-folder-item").length, 2, "opened fake folder must contain both shortcuts");
  assert.equal(env.store.get("hint"), "1");
});

test("1.33.0.32 fake teaching UI is inert and contains no real shortcut identity or focusable controls", async () => {
  const env = environment({ reduced: false });
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot, ensureStyles: async () => true, translate,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  const layer = env.body.children[0];
  assert.equal(layer.attributes.get("aria-hidden"), "true");
  assert.equal(layer.style.pointerEvents, "none");
  for (const node of walk(layer)) {
    assert.notEqual(node.tagName, "BUTTON");
    assert.notEqual(node.tagName, "A");
    assert.equal(node.attributes?.has?.("data-id"), false);
    assert.equal(node.dataset?.id, undefined);
  }
});

test("1.33.0.32 fake choice mirrors the existing localized production actions", async () => {
  const env = environment({ reduced: false });
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot, ensureStyles: async () => true, translate,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  const text = walk(env.body.children[0]).map(node => node.textContent || "").join("\n");
  for (const expected of ["Move here", "Switch their positions", "Create folder", "Put both shortcuts together", "Folder"]) {
    assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("1.33.0.32 reduced-motion path remains static and does not play the staged fake popover/folder sequence", async () => {
  const env = environment({ reduced: true });
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot, ensureStyles: async () => true, translate,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  const layer = env.body.children[0];
  assert.equal(byClass(layer, "folder-discovery-arrow").length, 1);
  assert.equal(byClass(layer, "folder-discovery-choice").length, 0);
  assert.equal(byClass(layer, "folder-discovery-fake-folder").length, 0);
  assert.equal(byClass(layer, "folder-discovery-fake-folder-panel").length, 0);
});

test("1.33.0.32 visual-sequence feature is owned by New Tab, browser and release groups", () => {
  for (const group of ["newtab", "browser", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/feature-133032.test.mjs"), `${group} must own feature-133032.test.mjs`);
  }
});

test("1.33.0.32 public source keeps the visual tutorial isolated from mutation APIs", () => {
  const source = fs.readFileSync("src/shared/newtab/folder-discovery-hint.js", "utf8");
  for (const forbidden of ["saveState(", "browser.storage", "runtime.sendMessage", "createFolderFromShortcuts(", "showDropChoice("]) {
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
