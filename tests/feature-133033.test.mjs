import test from "node:test";
import assert from "node:assert/strict";
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
    this.className = "";
    this.textContent = "";
    this.removed = false;
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
  getBoundingClientRect() {
    if (String(this.className).split(/\s+/).includes("folder-discovery-callout")) {
      return { left: 0, top: 0, width: 320, height: 72, right: 320, bottom: 72 };
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  }
}

function environment() {
  const timers = new Map(); let timerId = 0;
  const animationCalls = [];
  const win = new FakeElement("window");
  win.innerWidth = 900; win.innerHeight = 700;
  win.setTimeout = fn => { const id = ++timerId; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.matchMedia = () => ({ matches: false });
  win.MutationObserver = class { observe() {} disconnect() {} };

  const body = new FakeElement("body");
  const doc = new FakeElement("document");
  doc.body = body;
  doc.createElement = tag => {
    const element = new FakeElement(tag);
    element.animate = (keyframes, options) => {
      animationCalls.push({ element, keyframes, options });
      return { cancel() {} };
    };
    return element;
  };

  const slots = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = new FakeElement("div");
    slot.className = "shortcut-slot";
    slot.dataset.id = `s${i}`;
    const card = new FakeElement("a");
    const tile = new FakeElement("span");
    tile.className = "tile";
    const icon = new FakeElement("span");
    icon.className = "fallback-icon";
    icon.textContent = String(i + 1);
    tile.append(icon);
    tile.getBoundingClientRect = () => ({ left: 70 + i * 105, top: 130, width: 88, height: 88, right: 158 + i * 105, bottom: 218 });
    const label = new FakeElement("span");
    label.className = "shortcut-label";
    label.textContent = `Shortcut ${i + 1}`;
    card.append(tile, label);
    slot.append(card);
    slot.querySelector = selector => selector === ".tile" ? tile : selector === ".shortcut-label" ? label : null;
    slots.push(slot);
  }
  const grid = new FakeElement("div");
  grid.children = slots.slice();
  for (const slot of grid.children) slot.parentNode = grid;
  grid.querySelectorAll = selector => selector.includes("shortcut-slot") ? slots : [];

  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const runTimers = async () => {
    for (const [id, fn] of [...timers]) {
      timers.delete(id);
      fn();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    }
  };
  return { win, doc, body, grid, storage, animationCalls, runTimers };
}

const snapshot = () => ({
  activeShortcutCount: 6,
  anyFolder: false,
  orderMode: "manual",
  visible: true,
  idle: true,
  renderReady: true,
  awaitingRemote: false
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

function hasClass(element, className) {
  return String(element?.className || "").split(/\s+/).includes(className);
}

function callFor(calls, className, index = 0) {
  return calls.filter(call => hasClass(call.element, className))[index] || null;
}

function offsetOf(frame, index, frames) {
  if (Number.isFinite(frame?.offset)) return Number(frame.offset);
  if (frames.length <= 1) return 1;
  return index / (frames.length - 1);
}

function atMs(call, frameIndex) {
  return offsetOf(call.keyframes[frameIndex], frameIndex, call.keyframes) * Number(call.options?.duration || 0);
}

async function mountedMotionHint() {
  const env = environment();
  const controller = createFolderDiscoveryHint({
    grid: env.grid,
    snapshot,
    ensureStyles: async () => true,
    translate,
    flagKey: "hint",
    storage: env.storage,
    documentRef: env.doc,
    windowRef: env.win,
    delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  assert.equal(controller.mounted, true);
  return { env, controller };
}

test("1.33.0.33 staged folder tutorial preserves keyframe offsets as real wall-clock timing", async () => {
  const { env } = await mountedMotionHint();
  const calls = env.animationCalls;
  assert.equal(calls.length, 8, "the complete motion sequence must remain exactly eight animations");

  const expectedClasses = new Map([
    ["folder-discovery-ghost", 1],
    ["folder-discovery-target-ring", 1],
    ["folder-discovery-choice", 1],
    ["folder-discovery-choice-folder", 1],
    ["folder-discovery-fake-folder", 1],
    ["folder-discovery-fake-folder-panel", 1],
    ["folder-discovery-callout", 2]
  ]);
  for (const [className, count] of expectedClasses) {
    assert.equal(calls.filter(call => hasClass(call.element, className)).length, count, `${className} animation count`);
  }

  for (const call of calls) {
    assert.ok(call.options?.easing == null || call.options.easing === "linear", "iteration-level easing must not warp staged offsets");
    for (const frame of call.keyframes) {
      for (const key of Object.keys(frame)) {
        assert.ok(["transform", "opacity", "offset", "easing"].includes(key), `unexpected animated property ${key}`);
      }
    }
  }

  const ghost = callFor(calls, "folder-discovery-ghost");
  const choice = callFor(calls, "folder-discovery-choice");
  const folderRow = callFor(calls, "folder-discovery-choice-folder");
  const fakeFolder = callFor(calls, "folder-discovery-fake-folder");
  const panel = callFor(calls, "folder-discovery-fake-folder-panel");
  assert.ok(ghost && choice && folderRow && fakeFolder && panel);

  const finalGhostTransform = ghost.keyframes.at(-1).transform;
  const ghostArrivalIndex = ghost.keyframes.findIndex(frame => frame.transform === finalGhostTransform);
  assert.ok(ghostArrivalIndex >= 0);
  const ghostArrivalMs = atMs(ghost, ghostArrivalIndex);

  const choiceOpaqueIndexes = choice.keyframes.map((frame, index) => frame.opacity === 1 ? index : -1).filter(index => index >= 0);
  assert.ok(choiceOpaqueIndexes.length >= 2);
  const choiceFullStartMs = atMs(choice, choiceOpaqueIndexes[0]);
  const choiceFullEndMs = atMs(choice, choiceOpaqueIndexes.at(-1));
  const choiceFadeInStartIndex = choiceOpaqueIndexes[0] - 1;
  const choiceFadeInStartMs = atMs(choice, choiceFadeInStartIndex);
  assert.ok(ghostArrivalMs <= choiceFadeInStartMs, "ghost must reach the target before the choice popover starts appearing");
  assert.ok(choiceFullEndMs - choiceFullStartMs >= 900, "choice popover must remain fully readable for at least 900 ms");

  const pulsingFrames = folderRow.keyframes
    .map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => frame.transform && frame.transform !== "scale(1)");
  assert.ok(pulsingFrames.length >= 2);
  for (const { index } of pulsingFrames) {
    const time = atMs(folderRow, index);
    assert.ok(time >= choiceFullStartMs && time <= choiceFullEndMs, "Create folder emphasis must occur while the popover is fully visible");
  }

  const choiceLastOpaqueIndex = choice.keyframes.map((frame, index) => frame.opacity === 1 ? index : -1).filter(index => index >= 0).at(-1);
  const choiceFadeOutStartMs = atMs(choice, choiceLastOpaqueIndex);
  const folderFirstVisibleIndex = fakeFolder.keyframes.findIndex((frame, index) => index > 0 && frame.opacity === 1);
  const folderFadeInStartMs = atMs(fakeFolder, Math.max(0, folderFirstVisibleIndex - 1));
  assert.ok(folderFadeInStartMs >= choiceFadeOutStartMs, "fake folder must not start appearing before the choice popover starts fading out");

  const panelFirstVisibleIndex = panel.keyframes.findIndex((frame, index) => index > 0 && frame.opacity === 1);
  const panelFadeInStartMs = atMs(panel, Math.max(0, panelFirstVisibleIndex - 1));
  assert.ok(panelFadeInStartMs > folderFadeInStartMs, "opened folder panel must appear after the fake folder begins appearing");
});

test("1.33.0.33 motion callout moves above the demonstrated pair when there is room", async () => {
  const { env } = await mountedMotionHint();
  const layer = env.body.children[0];
  const callout = layer.children.find(child => hasClass(child, "folder-discovery-callout"));
  assert.ok(callout, "callout must exist");
  const top = Number.parseFloat(callout.style.top);
  assert.ok(Number.isFinite(top));
  assert.ok(top < 130, `callout top ${top} must be above pair top 130`);
  assert.ok(top >= 12, "callout must remain inside the viewport margin");
});

test("1.33.0.33 timing corrective is owned by New Tab, browser and release groups", () => {
  for (const group of ["newtab", "browser", "release"]) {
    assert.ok(testFilesForGroup(group).includes("tests/feature-133033.test.mjs"), `${group} must own feature-133033.test.mjs`);
  }
});
