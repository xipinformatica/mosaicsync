import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { for (const name of names) this.values.add(name); }
  remove(...names) { for (const name of names) this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(documentRef, tagName) {
    this.ownerDocument = documentRef;
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = "";
    this._id = "";
  }
  set id(value) {
    this._id = String(value || "");
    if (this._id) this.ownerDocument.registry.set(this._id, this);
  }
  get id() { return this._id; }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "id") this.id = text;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      this.children.push(node);
      node.parentNode = this;
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatchEvent(event) {
    const payload = { ...event, target: event?.target || this, currentTarget: this };
    for (const listener of this.listeners.get(payload.type) || []) listener.call(this, payload);
  }
  querySelector(selector) {
    if (!selector?.startsWith("#")) return null;
    const target = selector.slice(1);
    const stack = [...this.children];
    while (stack.length) {
      const node = stack.shift();
      if (node.id === target) return node;
      stack.unshift(...node.children);
    }
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.registry = new Map();
    this.body = new FakeElement(this, "body");
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  createElementNS(_namespace, tagName) { return new FakeElement(this, tagName); }
  getElementById(id) { return this.registry.get(String(id)) || null; }
}

function descendantElementCount(node) {
  let count = 0;
  const stack = [...(node?.children || [])];
  while (stack.length) {
    const current = stack.pop();
    count += 1;
    stack.push(...(current.children || []));
  }
  return count;
}

function addWallpaperChoices(documentRef, grid, count = 30) {
  for (let index = 0; index < count; index += 1) {
    const button = documentRef.createElement("button");
    const thumb = documentRef.createElement("span");
    const label = documentRef.createElement("span");
    button.addEventListener("click", () => index);
    button.append(thumb, label);
    grid.append(button);
  }
}

async function loadShell() {
  const url = `${pathToFileURL("dist/firefox/newtab/wallpaper-gallery-shell.js").href}?lifetime=${Date.now()}-${Math.random()}`;
  return import(url);
}

test("1.33.0.13 releases Wallpaper Gallery dynamic choices on close", async () => {
  const { mountWallpaperGalleryShell } = await loadShell();
  const documentRef = new FakeDocument();
  const { dialog, grid } = mountWallpaperGalleryShell(documentRef, () => {});
  addWallpaperChoices(documentRef, grid, 30);
  assert.equal(descendantElementCount(grid), 90, "fixture should retain 30 three-element choices while open");
  dialog.dispatchEvent({ type: "close" });
  assert.equal(descendantElementCount(grid), 0, "closed gallery must release all dynamic choice nodes");
});

test("1.33.0.13 repeated Wallpaper Gallery cycles converge to shell-only retention", async () => {
  const { mountWallpaperGalleryShell } = await loadShell();
  const documentRef = new FakeDocument();
  let firstDialog = null;
  for (let cycle = 0; cycle < 50; cycle += 1) {
    const { dialog, grid } = mountWallpaperGalleryShell(documentRef, () => {});
    firstDialog ||= dialog;
    assert.equal(dialog, firstDialog, "gallery shell should be reused rather than multiplied");
    addWallpaperChoices(documentRef, grid, 30);
    dialog.dispatchEvent({ type: "close" });
    assert.equal(descendantElementCount(grid), 0, `cycle ${cycle + 1} must return to shell-only retention`);
  }
  assert.equal(documentRef.body.children.length, 1, "exactly one gallery shell should remain mounted");
});

test("1.33.0.13 lifetime evidence records the closed-gallery retention reduction", () => {
  const evidence = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP6A-1.33.0.13.json", "utf8"));
  assert.equal(evidence.version, "1.33.0.13");
  assert.equal(evidence.wallpaperGallery.fixtureChoices, 30);
  assert.equal(evidence.wallpaperGallery.before.retainedDynamicElementsAfterClose, 90);
  assert.equal(evidence.wallpaperGallery.after.retainedDynamicElementsAfterClose, 0);
  assert.equal(evidence.wallpaperGallery.after.repeatedCycles, 50);
  assert.equal(evidence.wallpaperGallery.after.shellInstances, 1);
});

test("1.33.0.13 Step 6 remains lifecycle-focused and does not claim full memory completion", () => {
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 6 — Lifetime and memory: (?:IN PROGRESS|DONE)/);
  assert.match(tracker, /Step 6A/);
  assert.match(tracker, /Wallpaper Gallery/);
  assert.match(tracker, /Step 7 — Runtime loading\/dead work/);
});
