import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { faviconPreferenceForCandidate } from "../src/shared/core/model.js";

import {
  DEFAULT_SETTINGS,
  STATE_SCHEMA_VERSION
} from "../dist/firefox/core/constants.js";
import {
  flattenState,
  mergeRecordMaps,
  normalizeState
} from "../dist/firefox/core/model.js";

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
  const tokens = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const token of tokens) {
    start = source.indexOf(token);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Function ${name} not found`);

  let paren = source.indexOf("(", start);
  let parenDepth = 0;
  let quote = "";
  let escaped = false;
  for (; paren < source.length; paren += 1) {
    const ch = source[paren];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) { paren += 1; break; }
    }
  }

  const brace = source.indexOf("{", paren);
  let depth = 0;
  quote = "";
  escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || "";
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i += 1; continue; }
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
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  toggle(value, enabled) { enabled ? this.values.add(value) : this.values.delete(value); }
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.className = "";
    this.dataset = Object.create(null);
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
  }
  get childElementCount() { return this.children.length; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  querySelectorAll(selector) {
    if (selector === ".detected-favicon-choice") return this.children.filter(child => child.className === "detected-favicon-choice");
    return [];
  }
  async dispatch(type, event = {}) {
    return await this.listeners.get(type)?.(event);
  }
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.9 ${browser} keeps automatic favicon winner selection separate from the manual chooser`, () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const resolver = extractFunction(source, "resolveFaviconForUrl");
    assert.match(resolver, /betterFaviconCandidate\(/, "automatic resolver must use the reviewed winner policy");
    assert.doesNotMatch(resolver, /discoverFaviconChoicesForUrl\(/, "automatic resolver must not depend on the manual picker");
    assert.match(source, /function faviconCandidateSuitability\(/, "general favicon suitability scoring must be explicit and auditable");
  });

  test(`1.27.3 ${browser} detected-favicon discovery is bounded, deduplicated and uses validated favicon primitives`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const body = extractFunction(source, "discoverFaviconChoicesForUrl");
    const cacheHelpers = [
      "faviconCandidateSuitability",
      "faviconCandidatePreference",
      "faviconChoiceResultChars",
      "cloneFaviconChoiceResult",
      "readCachedFaviconChoices",
      "rememberFaviconChoices"
    ].map(name => extractFunction(source, name)).join("\n");
    assert.doesNotMatch(body, /resolveFaviconForUrl\s*\(/, "manual chooser must not alter or piggyback on the automatic winner algorithm");

    let webAccess = true;
    const fetches = [];
    const images = new Map([
      ["https://site.example/favicon.ico", { image: "data:image/png;base64,ICO", sourceUrl: "https://site.example/favicon.ico", width: 32, height: 32 }],
      ["https://parent.example/favicon.ico", { image: "data:image/png;base64,PARENT", sourceUrl: "https://parent.example/favicon.ico", width: 64, height: 64, declared: true }],
      ["https://site.example/icon-256.png", { image: "data:image/png;base64,BIG", sourceUrl: "https://site.example/icon-256.png", width: 256, height: 256, declared: true }],
      ["https://site.example/icon-64.png", { image: "data:image/png;base64,PARENT", sourceUrl: "javascript:alert(1)", width: 64, height: 64, declared: true }]
    ]);
    const context = {
      URL,
      Date,
      Set,
      Math,
      Number,
      String,
      hasWebAccess: async () => webAccess,
      faviconQualitySide: candidate => Math.min(Number(candidate?.width) || Number(candidate?.qualitySide) || 0, Number(candidate?.height) || Number(candidate?.qualitySide) || 0),
      resolveBrowserCachedFavicon: async () => ({ image: "data:image/png;base64,NATIVE", sourceUrl: "", width: 16, height: 16, native: true }),
      parentHostFaviconUrl: () => "https://parent.example/favicon.ico",
      discoverPageIconInfo: async () => ({
        finalPageUrl: "https://site.example/page",
        candidates: [
          { url: "https://site.example/icon-256.png", sideHint: 256, source: "manifest" },
          { url: "https://site.example/icon-64.png", sideHint: 64, source: "link" }
        ]
      }),
      fetchImageDataUrlDetailed: async value => {
        fetches.push(value);
        return images.get(value) || { image: "", sourceUrl: "", width: 0, height: 0 };
      },
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_TTL_MS: 30_000,
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000
    };
    vm.createContext(context);
    vm.runInContext(`${cacheHelpers}\n${body}; this.discoverFaviconChoicesForUrl = discoverFaviconChoicesForUrl;`, context);
    const result = await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.equal(result.ok, true);
    assert.ok(result.candidates.length >= 3 && result.candidates.length <= 8);
    assert.equal(result.candidates[0].image, "data:image/png;base64,ICO", "the chooser should present the highest-suitability icon first, not simply the largest pixels");
    assert.ok(result.candidates.some(candidate => candidate.image === "data:image/png;base64,BIG"), "large validated alternatives should remain available to the user");
    assert.equal(new Set(result.candidates.map(candidate => candidate.image)).size, result.candidates.length, "identical retrieved pixels must be deduplicated");
    assert.ok(result.candidates.every(candidate => !candidate.sourceUrl || /^https?:/.test(candidate.sourceUrl)), "only HTTP(S) source metadata may cross the message boundary");
    assert.ok(fetches.includes("https://site.example/favicon.ico"));
    assert.ok(fetches.includes("https://site.example/icon-256.png"));

    webAccess = false;
    const denied = await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.deepEqual(JSON.parse(JSON.stringify(denied)), { ok: false, error: "permission", candidates: [] });
  });

  test(`1.27.3 ${browser} Recent dragover is a complete defensive no-drop boundary`, async () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const body = extractFunction(source, "createEmptySlot");
    const context = {
      shortcutOrderMode: "recent",
      dragId: "shortcut",
      frequentDragSite: { url: "https://site.example/" },
      crossSpaceDrag: null,
      state: { activeSpaceId: "personal" },
      document: { createElement: tag => new FakeElement(tag) },
      t: value => value,
      console
    };
    vm.createContext(context);
    vm.runInContext(`${body}; this.createEmptySlot = createEmptySlot;`, context);
    const slot = context.createEmptySlot(4);
    let stopped = 0;
    let prevented = 0;
    const dataTransfer = { dropEffect: "copy", getData() { return ""; } };
    await slot.dispatch("dragover", {
      stopPropagation() { stopped += 1; },
      preventDefault() { prevented += 1; },
      dataTransfer
    });
    assert.equal(stopped, 1);
    assert.equal(prevented, 0, "Recent mode must not opt into a browser drop");
    assert.equal(dataTransfer.dropEffect, "none");

    assert.doesNotMatch(source, /\bgrid\.addEventListener\(\s*["'](?:drop|dragover)["']/, "grid-gap drops must remain browser no-ops rather than a parent canonical-position handler");
  });

  test(`1.27.3 ${browser} same-tab usage recording persists recency without scheduling a wasted Recent render`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const functions = ["recordShortcutsOpened", "recordShortcutOpened"].map(name => extractFunction(source, name)).join("\n");
    const calls = { write: 0, render: 0 };
    const context = {
      shortcutUsage: Object.create(null),
      Date: { now: () => 123456 },
      Set,
      Array,
      writeShortcutUsage: () => { calls.write += 1; },
      scheduleRecentOrderRender: () => { calls.render += 1; }
    };
    vm.createContext(context);
    vm.runInContext(`${functions}; this.recordShortcutOpened = recordShortcutOpened;`, context);
    context.recordShortcutOpened("same-tab", { renderRecent: false });
    assert.equal(context.shortcutUsage["same-tab"], 123456);
    assert.equal(calls.write, 1);
    assert.equal(calls.render, 0);
    context.recordShortcutOpened("background");
    assert.equal(calls.write, 2);
    assert.equal(calls.render, 1);
    assert.ok((source.match(/renderRecent:\s*opensElsewhere/g) || []).length >= 2, "top-level and folder same-tab click paths must both use the optimization");
  });

  test(`1.27.3 ${browser} open folder follows scroll/resize through one rAF-throttled reposition path`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const body = extractFunction(source, "scheduleFolderPopoverReposition");
    let scheduled = null;
    let positioned = 0;
    const anchor = {};
    const context = {
      activeFolderId: "folder",
      folderPopover: { hidden: false },
      folderRepositionFrame: 0,
      requestAnimationFrame(callback) { scheduled = callback; return 7; },
      resolveLiveFolderAnchor: () => anchor,
      positionFolderPopover(value) { assert.equal(value, anchor); positioned += 1; }
    };
    vm.createContext(context);
    vm.runInContext(`${body}; this.scheduleFolderPopoverReposition = scheduleFolderPopoverReposition;`, context);
    context.scheduleFolderPopoverReposition();
    context.scheduleFolderPopoverReposition();
    assert.equal(context.folderRepositionFrame, 7, "repeated scroll events should coalesce into one frame");
    assert.equal(positioned, 0);
    scheduled();
    assert.equal(positioned, 1);
    assert.equal(context.folderRepositionFrame, 0);
    assert.match(source, /page\?\.addEventListener\("scroll", scheduleFolderPopoverReposition, \{ passive: true \}\)/);
    assert.match(source, /window\.addEventListener\("resize", \(\) => \{\s*scheduleFolderPopoverReposition\(\)/);
  });

  test(`1.27.3 ${browser} selecting a detected favicon stores the exact choice as explicit user artwork`, async () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const body = extractFunction(source, "renderDetectedFaviconChoices");
    const choices = new FakeElement("div");
    const picker = new FakeElement("div");
    const status = new FakeElement("p");
    const chooseButton = new FakeElement("button");
    const context = {
      detectedFaviconChoices: choices,
      detectedFaviconPicker: picker,
      detectedFaviconStatus: status,
      chooseDetectedFavicon: chooseButton,
      detectedFaviconPickerUrl: "https://site.example/",
      faviconPreferenceForCandidate,
      document: { createElement: tag => new FakeElement(tag) },
      t: key => key,
      normalizeShortcutUrl: value => value,
      shortcutUrl: { value: "https://site.example/" },
      resetDetectedFaviconPicker() {},
      showToast() {},
      shortcutSyncPrepareGeneration: 0,
      pendingShortcutBuiltinIcon: "star",
      pendingShortcutImage: "",
      pendingShortcutSyncData: "",
      pendingShortcutImageKind: "none",
      pendingShortcutImageSourceKind: "builtin",
      pendingShortcutImageSourceUrl: "",
      pendingShortcutFaviconPreference: "",
      pendingShortcutImageIsFallback: false,
      shortcutImageStyle: { value: "cover" },
      shortcutImageUrl: { value: "https://old.example/icon.png" },
      shortcutSyncImage: { checked: true },
      shortcutArtworkEdited: false,
      updateBuiltinShortcutIconSelection() {},
      updateImagePreview() {}
    };
    vm.createContext(context);
    vm.runInContext(`${body}; this.renderDetectedFaviconChoices = renderDetectedFaviconChoices;`, context);
    context.renderDetectedFaviconChoices([{ image: "data:image/png;base64,CHOICE", sourceUrl: "https://cdn.example/icon.png" }], "https://site.example/");
    assert.equal(choices.childElementCount, 1);
    await choices.children[0].dispatch("click");
    assert.equal(context.pendingShortcutImage, "data:image/png;base64,CHOICE");
    assert.equal(context.pendingShortcutBuiltinIcon, "");
    assert.equal(context.pendingShortcutImageSourceKind, "upload", "manual detected choice must be protected from automatic favicon replacement");
    assert.equal(context.pendingShortcutImageSourceUrl, "", "chosen pixels should not silently change later because a remote favicon URL changed");
    assert.match(context.pendingShortcutFaviconPreference, /^u:[0-9a-f]{8}:[0-9a-f]{8}$/, "manual choice should also retain compact cross-device favicon intent");
    assert.equal(context.shortcutSyncImage.checked, false, "existing opt-in Sync-this-image behavior remains explicit");
    assert.equal(context.shortcutArtworkEdited, true);
  });
}

test("1.27.3 built-in icon versus uploaded artwork conflict tests cover both chronological directions through mergeRecordMaps", () => {
  const uploadOlder = stateWith([shortcut("alpha", 0, {
    image: PNG, imageSyncData: PNG, imageSyncKind: "sync", imageSourceKind: "upload", modifiedAt: T
  })]);
  const builtinNewer = stateWith([shortcut("alpha", 0, {
    builtinIcon: "star", imageSourceKind: "builtin", modifiedAt: T + 100
  })]);
  let merged = mergeRecordMaps(flattenState(uploadOlder, "device-a"), flattenState(builtinNewer, "device-b"));
  assert.equal(merged.get("alpha").builtinIcon, "star");
  assert.equal(merged.get("alpha").imageSourceKind, "builtin");

  const uploadNewer = stateWith([shortcut("alpha", 0, {
    image: PNG, imageSyncData: PNG, imageSyncKind: "sync", imageSourceKind: "upload", modifiedAt: T + 200
  })]);
  const builtinOlder = stateWith([shortcut("alpha", 0, {
    builtinIcon: "star", imageSourceKind: "builtin", modifiedAt: T + 100
  })]);
  merged = mergeRecordMaps(flattenState(uploadNewer, "device-a"), flattenState(builtinOlder, "device-b"));
  assert.equal(merged.get("alpha").builtinIcon, undefined);
  assert.equal(merged.get("alpha").imageSourceKind, "upload");
  assert.equal(merged.get("alpha").imageKind, "sync");
});

test("1.27.3 editor keeps short-viewport overflow safety and localized favicon chooser strings exist in every locale", async () => {
  const localeDir = "dist/firefox/core/i18n-locales";
  for (const file of fs.readdirSync(localeDir).filter(name => name.endsWith(".js"))) {
    const module = await import(`../${localeDir}/${file}?v1273=${Date.now()}-${file}`);
    for (const key of ["chooseDetectedFavicon", "detectedFavicons", "detectingFavicons", "noDetectedFavicons", "faviconChoicesExpired"]) {
      assert.equal(typeof module.MESSAGES[key], "string", `${file} missing ${key}`);
      assert.ok(module.MESSAGES[key].trim().length > 0, `${file} has empty ${key}`);
    }
  }
  for (const browser of ["firefox", "chrome"]) {
    const css = [fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8"), fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8")].join("\n");
    assert.match(css, /\.dialog-card\s*\{[\s\S]*?overflow:\s*(?:auto|[^;}]*;[\s\S]*?overflow-y:\s*auto);/, "200% zoom/short viewport fallback must remain scrollable");
    assert.doesNotMatch(css, /#shortcutDialog\s+\.dialog-card\s*\{[^}]*overflow:\s*hidden/i, "shortcut editor must not hide localized content to suppress scrollbars");
  }
});
