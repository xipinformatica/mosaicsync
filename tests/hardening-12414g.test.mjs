import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const profile = await import("../dist/firefox/core/profile.js");
const model = await import("../dist/firefox/core/model.js");
const localAssets = await import("../dist/firefox/core/local-assets.js");
const { installViewportTooltips } = await import("../dist/firefox/core/viewport-tooltip.js");
const constants = await import("../dist/firefox/core/constants.js");

test("1.24.14g profile pre-parse ceiling is abuse-only and boundary-testable without huge allocation", () => {
  assert.equal(profile.PROFILE_IMPORT_MAX_CHARS, 256 * 1024 * 1024);
  assert.equal(profile.isProfileImportTextLengthAllowed(profile.PROFILE_IMPORT_MAX_CHARS), true);
  assert.equal(profile.isProfileImportTextLengthAllowed(profile.PROFILE_IMPORT_MAX_CHARS + 1), false);
  assert.equal(profile.isProfileImportTextLengthAllowed(-1), false);
});

test("1.24.14g content-addressed projection fails closed on a synthetic same-transaction collision", () => {
  const imageA = `data:image/png;base64,${Buffer.from("asset-a".repeat(40)).toString("base64")}`;
  const imageB = `data:image/png;base64,${Buffer.from("asset-b".repeat(40)).toString("base64")}`;
  const forcedId = model.assetIdForDataUrl(imageA);
  const memo = new Map([[imageA, forcedId], [imageB, forcedId]]);
  const t = 1_700_000_000_000;
  const state = model.normalizeState({
    shortcuts: [
      { type: "shortcut", id: "a", title: "A", url: "https://a.example/", image: imageA, imageSyncKind: "device", imageSourceKind: "upload", imageStyle: "contain", position: 0, createdAt: t, modifiedAt: t, source: "manual" },
      { type: "shortcut", id: "b", title: "B", url: "https://b.example/", image: imageB, imageSyncKind: "device", imageSourceKind: "upload", imageStyle: "contain", position: 1, createdAt: t, modifiedAt: t, source: "manual" }
    ],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: t, updatedAt: t
  });

  assert.throws(
    () => localAssets.projectStateToLocalAssets(state, memo),
    error => error?.code === localAssets.LOCAL_ASSET_COLLISION_ERROR_CODE
  );
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
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
  append(child) { this.appendChild(child); }
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

test("1.24.14g portaled tooltip is removed when its original parent disappears", () => {
  const body = new FakeElement("body");
  const wrapper = new FakeElement("wrapper");
  const anchor = new FakeElement("anchor");
  const tooltip = new FakeElement("tooltip");
  tooltip.rect = { left: 0, right: 0, top: 0, bottom: 0, width: 180, height: 80 };
  wrapper.anchor = anchor;
  wrapper.tooltip = tooltip;
  wrapper.appendChild(anchor);
  wrapper.appendChild(tooltip);
  body.appendChild(wrapper);

  const doc = {
    nodeType: 9,
    body,
    activeElement: null,
    defaultView: {
      innerWidth: 800,
      innerHeight: 600,
      requestAnimationFrame(fn) { fn(); return 1; },
      cancelAnimationFrame() {},
      addEventListener() {},
      removeEventListener() {}
    },
    querySelectorAll() { return [wrapper]; },
    addEventListener() {},
    removeEventListener() {}
  };

  const cleanup = installViewportTooltips(doc);
  wrapper.listeners.get("pointerenter")();
  assert.equal(tooltip.parentNode, body, "visible tooltip should be portaled to body");
  wrapper.remove();
  wrapper.listeners.get("pointerleave")();
  assert.equal(tooltip.parentNode, null, "disconnected host must not leave a body-level orphan");
  cleanup();
});

test("1.24.14g read-only Sync status failures stay out of durable error state on both browsers", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser);
    assert.match(source, /function enqueue\(task, \{ persistSyncError = true \} = \{\}\)/);
    assert.match(source, /if \(!persistSyncError\) return;/);
    assert.match(source, /case "mosaicsync:get-sync-status":[\s\S]{0,160}enqueue\(getSyncStatus, \{ persistSyncError: false \}\)/);
  }
});

test("1.24.14g Firefox permission revocation clears all pending Sync recovery journals before disabling Sync", async () => {
  const source = readBackgroundSource("firefox");
  const start = source.indexOf("browser.permissions?.onRemoved?.addListener");
  const end = source.indexOf("const REMOTE_IMAGE_MAX_BYTES", start);
  const block = source.slice(start, end);
  const clearIndex = block.indexOf("await clearAllPendingSyncRecoveryState()");
  const metaIndex = block.indexOf("const meta = await readLocalMeta()");
  assert.ok(clearIndex >= 0 && metaIndex > clearIndex, "journal cleanup must happen before permission-disable metadata handling");
});
