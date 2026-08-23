import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installViewportTooltips } from "../dist/firefox/core/viewport-tooltip.js";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(name) {
    this.name = name;
    this.nodeType = 1;
    this.dataset = {};
    this.style = { removeProperty(name) { delete this[name]; } };
    this.classList = new FakeClassList();
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.rect = { left: 10, right: 30, top: 30, bottom: 50, width: 20, height: 20 };
  }
  get isConnected() {
    let node = this;
    while (node) {
      if (node.name === "body") return true;
      node = node.parentNode;
    }
    return false;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? (this.parentNode.children[index + 1] || null) : null;
  }
  append(child) { return this.appendChild(child); }
  appendChild(child) {
    child.remove();
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  insertBefore(child, before) {
    child.remove();
    const index = this.children.indexOf(before);
    if (index < 0) return this.appendChild(child);
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some(child => child.contains?.(node));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  getBoundingClientRect() { return this.rect; }
  querySelector(selector) {
    if (selector === '[role="tooltip"]') return this.tooltip || null;
    if (selector === "button") return this.anchor || null;
    return null;
  }
}

test("1.24.14m1 localized brand greeting bubble grows with Japanese/Korean text", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = await readFile(`dist/${browser}/newtab/newtab.css`, "utf8");
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    assert.match(css, /\.brand-easter-bubble\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*52px;/);
    assert.match(css, /\.brand-easter-bubble-text\s*\{[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*52px;/);
    assert.match(html, /brand-easter-bubble-bg[^>]*preserveAspectRatio="none"/);
  }
});

test("1.24.14m1 viewport tooltip becomes non-renderable before Firefox restores its in-panel node", () => {
  const body = new FakeElement("body");
  const wrapper = new FakeElement("wrapper");
  const anchor = new FakeElement("anchor");
  const tooltip = new FakeElement("tooltip");
  tooltip.rect = { left: 0, right: 0, top: 0, bottom: 0, width: 240, height: 90 };
  wrapper.anchor = anchor;
  wrapper.tooltip = tooltip;
  wrapper.appendChild(anchor);
  wrapper.appendChild(tooltip);
  body.appendChild(wrapper);

  const raf = [];
  let nextRaf = 1;
  const doc = {
    nodeType: 9,
    body,
    activeElement: null,
    documentElement: { clientWidth: 800, clientHeight: 600 },
    defaultView: {
      innerWidth: 800,
      innerHeight: 600,
      requestAnimationFrame(fn) { const id = nextRaf++; raf.push({ id, fn }); return id; },
      cancelAnimationFrame(id) { const item = raf.find(entry => entry.id === id); if (item) item.cancelled = true; },
      addEventListener() {},
      removeEventListener() {}
    },
    querySelectorAll() { return [wrapper]; },
    addEventListener() {},
    removeEventListener() {}
  };

  const flushRaf = () => {
    const pending = raf.splice(0);
    for (const item of pending) if (!item.cancelled) item.fn();
  };

  const cleanup = installViewportTooltips(doc);
  wrapper.listeners.get("pointerenter")();
  assert.equal(tooltip.parentNode, body);
  assert.equal(tooltip.classList.contains("viewport-tooltip-active"), true);

  wrapper.listeners.get("pointerleave")();
  assert.equal(tooltip.parentNode, wrapper, "tooltip should already be restored to its wrapper");
  assert.equal(tooltip.classList.contains("viewport-tooltip-active"), false);
  assert.equal(tooltip.style.opacity, "0", "restored tooltip must be invisible before base positioning can paint");
  assert.equal(tooltip.style.visibility, "hidden");
  assert.equal(tooltip.style.transition, "none");

  flushRaf();
  assert.equal(Object.hasOwn(tooltip.style, "opacity"), false, "temporary no-flash guard should clear on the following frame");
  assert.equal(Object.hasOwn(tooltip.style, "visibility"), false);
  assert.equal(Object.hasOwn(tooltip.style, "transition"), false);
  cleanup();
});
