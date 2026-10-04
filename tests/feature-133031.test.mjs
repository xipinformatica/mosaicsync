import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { testFilesForGroup } from "../tools/test-groups.mjs";
import {
  folderDiscoveryEligible,
  chooseFolderDiscoveryPair,
  folderDiscoveryReducedMotion,
  createFolderDiscoveryHint
} from "../src/shared/newtab/folder-discovery-hint.js";

const eligible = (overrides = {}) => ({
  activeShortcutCount: 6,
  anyFolder: false,
  orderMode: "manual",
  visible: true,
  idle: true,
  renderReady: true,
  awaitingRemote: false,
  ...overrides
});

test("1.33.0.31 folder discovery eligibility is narrow, current-Space counted and fail-closed", () => {
  assert.equal(folderDiscoveryEligible(eligible()), true);
  assert.equal(folderDiscoveryEligible(eligible({ activeShortcutCount: 5 })), false);
  assert.equal(folderDiscoveryEligible(eligible({ anyFolder: true })), false);
  assert.equal(folderDiscoveryEligible(eligible({ orderMode: "recent" })), false);
  assert.equal(folderDiscoveryEligible(eligible({ visible: false })), false);
  assert.equal(folderDiscoveryEligible(eligible({ idle: false })), false);
  assert.equal(folderDiscoveryEligible(eligible({ renderReady: false })), false);
  assert.equal(folderDiscoveryEligible(eligible({ awaitingRemote: true })), false);
  assert.equal(folderDiscoveryEligible(null), false);
});

test("1.33.0.31 pair selection prefers an adjacent pair near the row centre and requires full viewport visibility", () => {
  const make = (id, left, top, width = 90, height = 90) => ({ id, rect: { left, top, width, height, right: left + width, bottom: top + height } });
  const pair = chooseFolderDiscoveryPair([
    make("a", 40, 100), make("b", 150, 100), make("c", 260, 100), make("d", 370, 100),
    make("e", 40, 230), make("f", 150, 230)
  ], { width: 520, height: 500 });
  assert.deepEqual(pair?.map(item => item.id), ["b", "c"]);

  const clipped = chooseFolderDiscoveryPair([
    make("a", -5, 100), make("b", 100, 100)
  ], { width: 520, height: 500 });
  assert.equal(clipped, null);
});

test("1.33.0.31 reduced-motion detection is explicit JavaScript policy", () => {
  assert.equal(folderDiscoveryReducedMotion(query => ({ matches: query.includes("reduce") })), true);
  assert.equal(folderDiscoveryReducedMotion(() => ({ matches: false })), false);
  assert.equal(folderDiscoveryReducedMotion(null), false);
});

test("1.33.0.31 tutorial module is presentation-only and cannot reach MosaicSync state mutation subsystems", () => {
  const source = fs.readFileSync("src/shared/newtab/folder-discovery-hint.js", "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\.\/core\/(?:model|storage|permissions|profile|recovery)/);
  assert.doesNotMatch(source, /browser\.storage|saveState\(|writeLocalState|recordSyncMutation|runtime\.sendMessage/);
  assert.match(source, /cloneNode\(true\)/);
  assert.match(source, /\.tile/);
  assert.doesNotMatch(source, /cloneNode\(true\)[\s\S]{0,120}shortcut-slot/);
  assert.match(source, /pointer-events:\s*none|pointerEvents\s*=\s*["']none["']/);
  assert.match(source, /aria-hidden/);
});

test("1.33.0.31 New Tab integration lazy-loads the hint and does not advertise it in recent order", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /import\("\.\/folder-discovery-hint\.js"\)/);
  assert.match(source, /FOLDER_DISCOVERY_HINT_KEY/);
  assert.match(source, /shortcutOrderMode\s*!==\s*["']recent["']/);
  assert.match(source, /state\.spaces/);
});

test("1.33.0.31 folder discovery copy exists in every reviewed locale", async () => {
  const dir = "src/shared/core/i18n-locales";
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".js"));
  assert.equal(files.length, 33);
  for (const file of files) {
    const module = await import(`../${dir}/${file}?133031=${Date.now()}-${file}`);
    assert.ok(String(module.MESSAGES.folderDiscoveryTitle || "").trim(), `${file} title`);
    assert.ok(String(module.MESSAGES.folderDiscoveryBody || "").includes("{action}"), `${file} body keeps action placeholder`);
  }
});


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
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); if (name === "data-id") delete this.dataset.id; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
  remove() { this.removed = true; this.parentNode?.children && (this.parentNode.children = this.parentNode.children.filter(x => x !== this)); }
  addEventListener(type, fn, options) { const list = this.listeners.get(type) || []; list.push({ fn, options }); this.listeners.set(type, list); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(entry => entry.fn !== fn)); }
  dispatch(type, event = {}) {
    const entries = [...(this.listeners.get(type) || [])];
    for (const entry of entries) {
      entry.fn({ type, target: this, ...event });
      if (entry.options && typeof entry.options === "object" && entry.options.once) {
        this.removeEventListener(type, entry.fn);
      }
    }
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  cloneNode() { const copy = new FakeElement(this.tagName.toLowerCase()); copy.className = this.className; return copy; }
}

function fakeHintEnvironment({ reduced = true } = {}) {
  const timers = new Map(); let timerId = 0;
  const win = new FakeElement("window");
  win.innerWidth = 800; win.innerHeight = 600;
  win.setTimeout = fn => { const id = ++timerId; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.matchMedia = () => ({ matches: reduced });
  const observers = [];
  win.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.target = null; this.options = null; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options || {}; }
    disconnect() { this.disconnected = true; }
    deliver(record) {
      if (this.disconnected || !this.target || record?.type !== "childList" || !this.options?.childList) return;
      let matches = record.target === this.target;
      if (!matches && this.options.subtree) {
        for (let node = record.target; node; node = node.parentNode) {
          if (node === this.target) { matches = true; break; }
        }
      }
      if (matches) this.callback([record], this);
    }
  };
  const body = new FakeElement("body");
  const doc = new FakeElement("document");
  doc.body = body;
  doc.createElement = tag => new FakeElement(tag);
  const slots = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = new FakeElement("div");
    slot.dataset.id = `s${i}`;
    const tile = new FakeElement("span");
    tile.className = "tile";
    tile.getBoundingClientRect = () => ({ left: 60 + i * 105, top: 120, width: 88, height: 88, right: 148 + i * 105, bottom: 208 });
    slot.querySelector = selector => selector === ".tile" ? tile : null;
    slot.append(tile);
    slots.push(slot);
  }
  const grid = new FakeElement("div");
  grid.append(...slots);
  grid.querySelectorAll = selector => selector.includes("shortcut-slot") ? slots : [];
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
  const runTimers = async () => {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); await Promise.resolve(); await Promise.resolve(); }
  };
  return { win, doc, body, grid, slots, storage, store, observers, runTimers };
}

test("1.33.0.31 reduced-motion mount is overlay-only, writes only the seen flag, and cancels cleanly", async () => {
  const env = fakeHintEnvironment({ reduced: true });
  const beforeSlots = env.grid.querySelectorAll('.shortcut-slot[data-interactive="true"]:not(.folder-slot)').slice();
  const controller = createFolderDiscoveryHint({
    grid: env.grid,
    snapshot: () => eligible(),
    ensureStyles: async () => true,
    translate: (key, vars) => key === "createFolder" ? "Create folder" : key === "folderDiscoveryTitle" ? "Organize with folders" : `Drop then ${vars.action}`,
    flagKey: "mosaicsync.folder-hint.v1",
    storage: env.storage,
    documentRef: env.doc,
    windowRef: env.win,
    delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  assert.equal(controller.mounted, true);
  assert.equal(env.store.get("mosaicsync.folder-hint.v1"), "1");
  assert.equal(env.body.children.length, 1);
  assert.deepEqual(env.grid.querySelectorAll('.shortcut-slot[data-interactive="true"]:not(.folder-slot)'), beforeSlots);
  assert.equal(env.body.children[0].attributes.get("aria-hidden"), "true");
  assert.equal(env.body.children[0].style.pointerEvents, "none");
  env.doc.dispatch("pointerdown");
  assert.equal(controller.mounted, false);
  assert.equal(env.body.children.length, 0);
});

test("1.33.0.31 stale eligibility is rechecked immediately before mount", async () => {
  const env = fakeHintEnvironment();
  let snapshot = eligible();
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot: () => snapshot, ensureStyles: async () => true, translate: key => key,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  snapshot = eligible({ anyFolder: true });
  await env.runTimers();
  assert.equal(controller.mounted, false);
  assert.equal(env.store.get("hint"), "1", "observing a real folder permanently suppresses the tutorial");
  assert.equal(env.body.children.length, 0);
});

test("1.33.0.31 feature is owned by New Tab, browser and release certification groups", () => {
  for (const group of ["newtab", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/feature-133031.test.mjs"), `${group} must include feature-133031.test.mjs`);
  }
});


test("1.33.0.31 nested artwork mutations do not burn the one-time hint, while a real grid replacement cancels it", async () => {
  const env = fakeHintEnvironment({ reduced: true });
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot: () => eligible(), ensureStyles: async () => true, translate: key => key,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  assert.equal(controller.mounted, true);
  assert.equal(env.observers.length, 1);

  const tile = env.slots[5].querySelector(".tile");
  env.observers[0].deliver({ type: "childList", target: tile });
  assert.equal(controller.mounted, true, "favicon/preview replacement inside a tile must not consume the tutorial");

  env.observers[0].deliver({ type: "childList", target: env.grid });
  assert.equal(controller.mounted, false, "replacing grid children must still cancel the tutorial");
});

test("1.33.0.31 interaction or explicit cancel while tutorial CSS is loading prevents a late mount", async () => {
  for (const cancelKind of ["pointerdown", "controller"]) {
    const env = fakeHintEnvironment({ reduced: true });
    let resolveStyles;
    const styles = new Promise(resolve => { resolveStyles = resolve; });
    const controller = createFolderDiscoveryHint({
      grid: env.grid, snapshot: () => eligible(), ensureStyles: () => styles, translate: key => key,
      flagKey: `hint-${cancelKind}`, storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
    });
    controller.arm({ immediate: true });
    await env.runTimers();
    if (cancelKind === "pointerdown") env.doc.dispatch("pointerdown");
    else controller.cancel();
    resolveStyles(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(controller.mounted, false, `${cancelKind} must invalidate the pending mount`);
    assert.equal(env.store.get(`hint-${cancelKind}`), undefined, `${cancelKind} must not burn the seen flag`);
  }
});

test("1.33.0.31 temporary ineligibility re-arms pointer discovery instead of losing the page opportunity", async () => {
  const env = fakeHintEnvironment({ reduced: true });
  let current = eligible({ idle: false });
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot: () => current, ensureStyles: async () => true, translate: key => key,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  env.grid.dispatch("pointermove");
  await env.runTimers();
  assert.equal(controller.mounted, false);
  current = eligible({ idle: true });
  env.grid.dispatch("pointermove");
  await env.runTimers();
  assert.equal(controller.mounted, true, "a later pointer move should get another chance after a temporary failure");
});

test("1.33.0.31 pair selection rejects huge Manual-layout gaps and uses a genuinely neighbouring pair", () => {
  const make = (id, left, top, width = 90, height = 90) => ({ id, rect: { left, top, width, height, right: left + width, bottom: top + height } });
  const pair = chooseFolderDiscoveryPair([
    make("far-left", 20, 80), make("far-right", 920, 80),
    make("near-left", 300, 220), make("near-right", 410, 220)
  ], { width: 1200, height: 600 });
  assert.deepEqual(pair?.map(item => item.id), ["near-left", "near-right"]);
});

test("1.33.0.31 motion animation touches overlay elements only and uses compositor-friendly properties", async () => {
  const env = fakeHintEnvironment({ reduced: false });
  const calls = [];
  const originalCreate = env.doc.createElement;
  env.doc.createElement = tag => {
    const element = originalCreate(tag);
    element.animate = (keyframes, options) => {
      calls.push({ element, keyframes, options });
      return { cancel() {} };
    };
    return element;
  };
  const controller = createFolderDiscoveryHint({
    grid: env.grid, snapshot: () => eligible(), ensureStyles: async () => true, translate: key => key,
    flagKey: "hint", storage: env.storage, documentRef: env.doc, windowRef: env.win, delayMs: 0
  });
  controller.arm({ immediate: true });
  await env.runTimers();
  assert.equal(controller.mounted, true);
  assert.ok(calls.length >= 4, "the original motion path and any later presentation-only stages must remain animated only inside the overlay");
  const layer = env.body.children[0];
  const belongsToLayer = element => {
    for (let node = element; node; node = node.parentNode) if (node === layer) return true;
    return false;
  };
  for (const call of calls) {
    assert.equal(belongsToLayer(call.element), true, "every animated node must belong to the inert overlay");
    for (const frame of call.keyframes) {
      for (const key of Object.keys(frame)) assert.ok(["transform", "opacity", "offset"].includes(key), `unexpected animated property ${key}`);
    }
  }
});
