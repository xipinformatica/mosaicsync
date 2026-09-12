import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing function body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`timeout waiting for ${label}`);
}

const newtabSource = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.33.0.15 Recovery close/reopen gives the new session its own fresh request", async () => {
  const requests = [deferred(), deferred()];
  const rendered = [];
  let calls = 0;
  const context = vm.createContext({
    recoveryCopiesBusy: false,
    recoveryCopiesSessionGeneration: 1,
    recoveryCopiesLoadInFlightGeneration: 0,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesDialog: { open: true },
    recoveryCopiesSummary: { textContent: "" },
    setRecoveryCopiesBusy(value) { context.recoveryCopiesBusy = Boolean(value); },
    async sendSyncMessage() { return requests[calls++].promise; },
    renderRecoveryCopies(value) { rendered.push(value.tag); },
    t(key) { return key; }
  });
  vm.runInContext(`${extractFunction(newtabSource, "loadRecoveryCopies")}; this.loadRecoveryCopies = loadRecoveryCopies;`, context);

  const oldLoad = context.loadRecoveryCopies();
  await waitFor(() => calls === 1, "old Recovery request");
  context.recoveryCopiesDialog.open = false;
  context.recoveryCopiesSessionGeneration += 1;
  context.recoveryCopiesDialog.open = true;
  context.recoveryCopiesSessionGeneration += 1;
  const freshLoad = context.loadRecoveryCopies();
  await waitFor(() => calls === 2, "fresh Recovery request after reopen");

  requests[0].resolve({ ok: true, tag: "OLD" });
  await oldLoad;
  assert.deepEqual(rendered, [], "superseded Recovery response must not render into the reopened session");

  requests[1].resolve({ ok: true, tag: "FRESH" });
  await freshLoad;
  assert.deepEqual(rendered, ["FRESH"], "reopened Recovery session must render only its own fresh response");
});

test("1.33.0.15 a cleanup that finishes after close/reopen completes but refreshes the current Recovery session", async () => {
  const cleanup = deferred();
  const rendered = [];
  const reloaded = [];
  let busy = false;
  const context = vm.createContext({
    recoveryCopiesBusy: false,
    recoveryCopiesSessionGeneration: 1,
    recoveryCopiesLoadInFlightGeneration: 0,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesDialog: { open: true },
    setRecoveryCopiesBusy(value) { busy = Boolean(value); context.recoveryCopiesBusy = busy; },
    async sendSyncMessage() { return cleanup.promise; },
    renderRecoveryCopies(value) { rendered.push(value.tag); },
    showSyncFeedback() {},
    t(key) { return key; },
    formatBytes(value) { return String(value); },
    async refreshSyncStatus() {},
    async loadRecoveryCopies(generation) { reloaded.push(generation); }
  });
  vm.runInContext(`${extractFunction(newtabSource, "performRecoveryCleanup")}; this.performRecoveryCleanup = performRecoveryCleanup;`, context);

  const operation = context.performRecoveryCleanup({ mode: "superseded" });
  await waitFor(() => busy, "Recovery cleanup busy state");
  context.recoveryCopiesDialog.open = false;
  context.recoveryCopiesSessionGeneration += 1;
  context.recoveryCopiesDialog.open = true;
  context.recoveryCopiesSessionGeneration += 1;
  cleanup.resolve({ ok: true, tag: "OLD-CLEANUP", removedBytes: 1024, removedGenerations: 1 });
  await operation;

  assert.deepEqual(rendered, [], "superseded cleanup response must not render into the reopened session");
  assert.deepEqual(reloaded, [3], "successful background cleanup must trigger a fresh model load for the current reopened session");
  assert.equal(busy, false, "cleanup must release the busy state before current-session refresh");
});

test("1.33.0.15 Bookmarks close/reopen rejects the old tree and adopts only the current session tree", async () => {
  const moduleUrl = `${pathToFileURL(path.resolve("src/shared/newtab/bookmarks-controller.js")).href}?aba=${Date.now()}`;
  const { createBookmarksController } = await import(moduleUrl);
  const reads = [deferred(), deferred()];
  let readCalls = 0;
  let staleAdoptions = 0;
  let freshAdoptions = 0;
  const listeners = new Map();
  const dialog = {
    open: false,
    addEventListener(type, fn) { const current = listeners.get(type) || []; current.push(fn); listeners.set(type, current); },
    showModal() { this.open = true; }
  };
  const button = {
    handler: null,
    addEventListener(type, fn) { if (type === "click") this.handler = fn; },
    click() { this.handler?.(); }
  };
  const permissionButton = { addEventListener() {}, focus() {} };
  const search = { value: "", addEventListener() {}, focus() {} };
  const permissionState = { hidden: false };
  const browser = { hidden: true };
  const status = { textContent: "" };
  const api = {
    async hasBookmarksPermission() { return true; },
    async readBookmarkTree() { return reads[readCalls++].promise; },
    flattenBookmarkFolders(tree) {
      if (tree?.[0]?.tag === "OLD") staleAdoptions += 1;
      if (tree?.[0]?.tag === "FRESH") freshAdoptions += 1;
      throw new Error("stop-after-adoption");
    },
    flattenBookmarks() { return []; }
  };
  const closeDialog = value => {
    value.open = false;
    for (const fn of listeners.get("close") || []) fn({ type: "close", target: value });
  };
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  try {
    const controller = createBookmarksController({
      loadBookmarksModule: async () => api,
      ensureSecondaryStyles: async () => true,
      closeDialog,
      positionFloatingMenu() {},
      graphemeSegmenter: null,
      elements: {
        bookmarksButton: button,
        bookmarksDialog: dialog,
        bookmarksPermissionState: permissionState,
        bookmarksPermissionButton: permissionButton,
        bookmarksBrowser: browser,
        bookmarksSearch: search,
        bookmarksStatus: status
      }
    });
    controller.bind();
    button.click();
    await waitFor(() => readCalls === 1, "old bookmark read");
    closeDialog(dialog);
    button.click();
    await waitFor(() => readCalls === 2, "fresh bookmark read after reopen");

    reads[0].resolve([{ tag: "OLD" }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(staleAdoptions, 0, "superseded bookmark tree must not be adopted after close/reopen");

    reads[1].resolve([{ tag: "FRESH" }]);
    await waitFor(() => freshAdoptions === 1, "fresh bookmark response adoption");
    assert.equal(freshAdoptions, 1);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test("1.33.0.15 Bookmarks permission completion cannot mutate a superseded dialog session", async () => {
  const moduleUrl = `${pathToFileURL(path.resolve("src/shared/newtab/bookmarks-controller.js")).href}?permission=${Date.now()}`;
  const { createBookmarksController } = await import(moduleUrl);
  const permission = deferred();
  const listeners = new Map();
  let requestCalls = 0;
  const dialog = {
    open: false,
    addEventListener(type, fn) { const current = listeners.get(type) || []; current.push(fn); listeners.set(type, current); },
    showModal() { this.open = true; }
  };
  const button = { handler: null, addEventListener(type, fn) { if (type === "click") this.handler = fn; }, click() { this.handler?.(); } };
  const permissionButton = { handler: null, addEventListener(type, fn) { if (type === "click") this.handler = fn; }, click() { this.handler?.(); }, focus() {} };
  const search = { value: "", addEventListener() {}, focus() {} };
  const permissionState = { hidden: false };
  const browser = { hidden: true };
  const status = { textContent: "" };
  const api = {
    async hasBookmarksPermission() { return false; },
    requestBookmarksPermissionFromGesture() { requestCalls += 1; return permission.promise; }
  };
  const closeDialog = value => {
    value.open = false;
    for (const fn of listeners.get("close") || []) fn({ type: "close", target: value });
  };
  const controller = createBookmarksController({
    loadBookmarksModule: async () => api,
    ensureSecondaryStyles: async () => true,
    closeDialog,
    positionFloatingMenu() {},
    graphemeSegmenter: null,
    elements: {
      bookmarksButton: button,
      bookmarksDialog: dialog,
      bookmarksPermissionState: permissionState,
      bookmarksPermissionButton: permissionButton,
      bookmarksBrowser: browser,
      bookmarksSearch: search,
      bookmarksStatus: status
    }
  });
  controller.bind();
  button.click();
  await waitFor(() => dialog.open && permissionState.hidden === false, "Bookmarks permission UI");
  permissionButton.click();
  await waitFor(() => requestCalls === 1, "Bookmarks permission request");
  closeDialog(dialog);
  button.click();
  await waitFor(() => dialog.open, "reopened Bookmarks dialog");
  permission.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(status.textContent, "permissionGranted", "old permission completion must not write status into the reopened session");
});

test("1.33.0.15 lifecycle corrective is documented as session ownership, not Recovery authority", () => {
  const guide = fs.readFileSync("DEVELOPER-GUIDE.md", "utf8");
  const roadmap = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(guide, /1\.33\.0\.15[\s\S]*Recovery[\s\S]*Bookmarks[\s\S]*(generation|session)/i);
  assert.match(roadmap, /1\.33\.0\.15[\s\S]*(Recovery|Bookmarks)[\s\S]*(generation|session)/i);
  assert.match(roadmap, /Step 6[\s\S]*(?:IN PROGRESS|DONE)/i);
});
