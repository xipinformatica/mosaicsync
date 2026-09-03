import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] || ".");
const browserName = process.argv[3] || "firefox";
if (!new Set(["firefox", "chrome"]).has(browserName)) throw new Error(`unsupported browser ${browserName}`);
const scheme = browserName === "chrome" ? "chrome-extension" : "moz-extension";
const html = await fs.readFile(path.join(root, `dist/${browserName}/newtab/newtab.html`), "utf8");

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); }
  getPropertyValue(name) { return this.values.get(name) || ""; }
}

class FakeClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  sync() { this.owner.className = [...this.values].join(" "); }
  setFromText(value) { this.values = new Set(String(value || "").split(/\s+/).filter(Boolean)); this.sync(); }
  add(...names) { for (const name of names) this.values.add(name); this.sync(); }
  remove(...names) { for (const name of names) this.values.delete(name); this.sync(); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name); else this.values.delete(name);
    this.sync();
    return next;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = new FakeStyle();
    this.className = "";
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.open = false;
    this.files = [];
    this.listeners = new Map();
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.clientHeight = 100;
    this.clientWidth = 100;
    this.offsetWidth = 100;
    this.offsetHeight = 100;
    this.complete = true;
    this.naturalWidth = 32;
    this.naturalHeight = 32;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== listener));
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }
  click() { this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} }); }
  append(...nodes) {
    for (const node of nodes.flat()) {
      if (node == null) continue;
      if (node.__fragment) { this.append(...node.children); continue; }
      this.children.push(node);
      if (typeof node === "object") node.parentElement = this;
    }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  replaceWith(node) {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1, node);
  }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(value => value !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  matches() { return false; }
  contains(node) { return node === this || this.children.includes(node); }
  focus() { globalThis.document.activeElement = this; }
  blur() {}
  showModal() { this.open = true; this.hidden = false; }
  close() { this.open = false; }
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }; }
  cloneNode() { return new FakeElement(this.localName, this.id); }
  async decode() {}
  getContext() { return { clearRect() {}, drawImage() {}, fillRect() {}, getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {} }; }
  toDataURL() { return "data:image/png;base64,AAAA"; }
}

class StorageArea {
  constructor(initial = {}) { this.data = structuredClone(initial); }
  async get(keys = null) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    const out = {};
    for (const [key, fallback] of Object.entries(keys || {})) out[key] = Object.hasOwn(this.data, key) ? structuredClone(this.data[key]) : fallback;
    return out;
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
  async clear() { this.data = {}; }
  async getBytesInUse() { return Buffer.byteLength(JSON.stringify(this.data)); }
}

class WebStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
  clear() { this.data.clear(); }
  key(index) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

const byId = new Map();
for (const match of html.matchAll(/<([a-zA-Z0-9-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const [, tagName, attrs, id] = match;
  const element = new FakeElement(tagName, id);
  const className = attrs.match(/\bclass="([^"]*)"/)?.[1] || "";
  element.classList.setFromText(className);
  element.hidden = /(?:^|\s)hidden(?:\s|=|$)/.test(attrs);
  element.checked = /(?:^|\s)checked(?:\s|=|$)/.test(attrs);
  element.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || "";
  byId.set(id, element);
}
const swatches = [...html.matchAll(/data-color-swatch="([^"]+)"/g)].map((match, index) => {
  const element = new FakeElement("button", `smoke-swatch-${index}`);
  element.dataset.colorSwatch = match[1];
  return element;
});

const documentElement = new FakeElement("html", "html");
const body = new FakeElement("body", "body");
const head = new FakeElement("head", "head");
const document = {
  documentElement,
  body,
  head,
  activeElement: body,
  readyState: "complete",
  fonts: { ready: Promise.resolve() },
  getElementById(id) { return byId.get(id) || null; },
  querySelector(selector) {
    if (selector.startsWith("#")) return byId.get(selector.slice(1)) || null;
    if (selector === ".brand") return byId.get("brand") || new FakeElement("div");
    if (selector.includes("frequent-sites-heading")) return new FakeElement("div");
    return null;
  },
  querySelectorAll(selector) { return selector === "[data-color-swatch]" ? swatches : []; },
  createElement(tagName) { return new FakeElement(tagName); },
  createDocumentFragment() { const fragment = new FakeElement("fragment"); fragment.__fragment = true; return fragment; },
  createTextNode(text) { const node = new FakeElement("#text"); node.textContent = String(text); return node; },
  addEventListener() {},
  removeEventListener() {}
};

globalThis.document = document;
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.localStorage = new WebStorage();
globalThis.sessionStorage = new WebStorage();
globalThis.location = { href: `${scheme}://test/newtab/newtab.html`, protocol: `${scheme}:`, reload() {}, replace(value) { this.href = String(value); } };
globalThis.history = { replaceState() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue() { return ""; }, color: "rgb(255,255,255)", backgroundColor: "rgb(0,0,0)" });
globalThis.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, "_"), supports: () => true };
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.requestIdleCallback = callback => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
globalThis.cancelIdleCallback = id => clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.Image = class extends FakeElement {
  constructor() { super("img"); }
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src || ""; }
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "en-US", languages: ["en-US"], hardwareConcurrency: 4, locks: { request: async (_name, callback) => callback() } }
});

globalThis.confirm = () => false;
globalThis.alert = () => {};
globalThis.prompt = () => null;
globalThis.open = () => null;
globalThis.__mosaicsyncEnsureSecondaryStyles = async () => true;
globalThis.__mosaicsyncStartupTiming = { version: 1, phases: {} };
globalThis.__mosaicsyncBootGrid = { manifest: null, painted: false };

const listeners = { storageChanged: [], permissionsAdded: [], permissionsRemoved: [], runtimeMessage: [] };
let topSitesCalls = 0;
let topSitesZeroArgCalls = 0;
let topSitesOptionCalls = 0;
const local = new StorageArea();
const session = new StorageArea();
const sync = new StorageArea();
const noOpEvent = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });
globalThis.browser = {
  storage: { local, session, sync, onChanged: { addListener(listener) { listeners.storageChanged.push(listener); } } },
  permissions: {
    async contains() { return true; }, async request() { return true; }, async remove() { return true; },
    onAdded: { addListener(listener) { listeners.permissionsAdded.push(listener); } },
    onRemoved: { addListener(listener) { listeners.permissionsRemoved.push(listener); } }
  },
  topSites: { async get(...args) {
    topSitesCalls += 1;
    if (args.length === 0) topSitesZeroArgCalls += 1;
    else topSitesOptionCalls += 1;
    if (browserName === "chrome" && args.length !== 0) {
      throw new TypeError("Chrome topSites.get() accepts no arguments");
    }
    return [{ title: "Example", url: "https://example.test/", favicon: "data:image/png;base64,QUFBQQ==" }];
  } },
  bookmarks: { async getTree() { return []; }, async search() { return []; }, async getChildren() { return []; }, onCreated: noOpEvent(), onChanged: noOpEvent(), onMoved: noOpEvent(), onRemoved: noOpEvent() },
  tabs: { async query() { return []; }, async create() { return {}; }, async update() { return {}; }, onUpdated: noOpEvent() },
  runtime: {
    id: "mosaicsync-smoke",
    getURL: value => `${scheme}://test/${value}`,
    async getPlatformInfo() { return { os: "linux" }; },
    async sendMessage() { return { ok: true, meta: local.data["mosaicsync.meta"] || {}, status: "ok" }; },
    onMessage: { addListener(listener) { listeners.runtimeMessage.push(listener); } },
    getManifest() { return { version: "smoke" }; }
  },
  i18n: { getUILanguage() { return "en-US"; }, getMessage() { return ""; } }
};

const constants = await import(`${pathToFileURL(path.join(root, `dist/${browserName}/core/constants.js`)).href}?smoke-seed=${process.pid}`);
const seededState = structuredClone(constants.DEFAULT_STATE);
seededState.spaces.personal.settings.frequentlyVisitedEnabled = true;
seededState.spaces.personal.settings.frequentlyVisitedCount = 5;
seededState.spaces.personal.shortcuts = [{
  type: "shortcut",
  id: "m38-native-cache-shortcut",
  title: "Example",
  url: "https://example.test/",
  image: "",
  imageSyncData: "",
  imageAssetId: "",
  localImageAssetId: "",
  imageSyncKind: "none",
  imageSourceKind: "none",
  imageSourceUrl: "",
  imageIsFallback: false,
  modifiedAt: 1
}];
seededState.shortcuts = seededState.spaces.personal.shortcuts;
seededState.settings = seededState.spaces.personal.settings;
local.data[constants.LOCAL_STATE_KEY] = seededState;
local.data[constants.LOCAL_META_KEY] = {
  ...structuredClone(constants.DEFAULT_META),
  onboardingCompleted: true,
  onboardingVersion: "smoke",
  deviceId: "smoke-device",
  deviceName: "Smoke Device"
};

const failures = [];
const consoleErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => { consoleErrors.push(args.map(value => String(value?.stack || value)).join(" ")); };
process.on("uncaughtException", error => failures.push(error));
process.on("unhandledRejection", error => failures.push(error));

try {
  await import(`${pathToFileURL(path.join(root, `dist/${browserName}/newtab/newtab.js`)).href}?smoke=${process.pid}`);
  await new Promise(resolve => setTimeout(resolve, 320));
  byId.get("settingsButton")?.click();
  await new Promise(resolve => setTimeout(resolve, 40));

  const frequentToggle = byId.get("settingsFrequentlyVisited");
  if (frequentToggle) {
    frequentToggle.checked = false;
    frequentToggle.dispatchEvent({ type: "change", preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setTimeout(resolve, 80));
    globalThis.__mosaicsyncSmokeFrequentDisabled = {
      optionsHidden: byId.get("frequentOptions")?.hidden === true,
      sectionHidden: byId.get("frequentSitesSection")?.hidden === true
    };
    frequentToggle.checked = true;
    frequentToggle.dispatchEvent({ type: "change", preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setTimeout(resolve, 120));
    globalThis.__mosaicsyncSmokeFrequentReenabled = {
      optionsVisible: byId.get("frequentOptions")?.hidden === false,
      sectionVisible: byId.get("frequentSitesSection")?.hidden === false
    };
  }
} catch (error) {
  failures.push(error);
}
console.error = originalConsoleError;

const result = {
  browserName,
  failures: failures.map(error => String(error?.stack || error)),
  consoleErrors,
  interactionReady: Number.isFinite(globalThis.__mosaicsyncStartupTiming?.phases?.interactionReady),
  settingsClickListeners: (byId.get("settingsButton")?.listeners.get("click") || []).length,
  settingsOpened: byId.get("settingsDialog")?.hidden === false,
  swatchClickListeners: (swatches[0]?.listeners.get("click") || []).length,
  storageListeners: listeners.storageChanged.length,
  topSitesCalls,
  topSitesZeroArgCalls,
  topSitesOptionCalls,
  frequentlyVisitedVisible: byId.get("frequentSitesSection")?.hidden === false,
  frequentlyVisitedChangeListeners: (byId.get("settingsFrequentlyVisited")?.listeners.get("change") || []).length,
  frequentDisabled: globalThis.__mosaicsyncSmokeFrequentDisabled || null,
  frequentReenabled: globalThis.__mosaicsyncSmokeFrequentReenabled || null,
  phases: globalThis.__mosaicsyncStartupTiming?.phases || {}
};

const ok = result.failures.length === 0 && result.consoleErrors.length === 0 && result.interactionReady &&
  result.settingsClickListeners > 0 && result.settingsOpened && result.swatchClickListeners > 0 &&
  result.storageListeners > 0 && result.topSitesCalls > 1 &&
  (browserName === "chrome" ? result.topSitesOptionCalls === 0 : result.topSitesOptionCalls > 0) &&
  result.frequentlyVisitedVisible &&
  result.frequentlyVisitedChangeListeners > 0 && result.frequentDisabled?.optionsHidden && result.frequentDisabled?.sectionHidden &&
  result.frequentReenabled?.optionsVisible && result.frequentReenabled?.sectionVisible;
console.log(JSON.stringify(result));
process.exit(ok ? 0 : 1);
