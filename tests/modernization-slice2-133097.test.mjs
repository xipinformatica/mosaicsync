// @kind behavioral
// Slice 2: first-frame manifest sharing, FV startup render ownership, hidden Sync settings work.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = file => fs.readFileSync(file, "utf8");
const newtab = read("src/shared/newtab/newtab.js");

class Element {
  constructor(name = "div") {
    this.name = name;
    this.dataset = {};
    this.children = [];
    this.className = "";
    this.hidden = false;
    this.inert = false;
    this.style = { setProperty() {} };
    this.classList = { remove() {}, add() {} };
  }
  append(...children) { for (const child of children) this.children.push(...(child?.fragment ? child.children : [child])); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute() {}
  querySelector(selector) {
    if (selector.includes('"personal"')) return this.personal;
    if (selector.includes('"work"')) return this.work;
    return null;
  }
}

function boot({ replacement = null, noSwitcher = false, invalid = false } = {}) {
  const manifest = {
    version: 5, ready: true, paintSpaceId: "personal",
    spaceSwitcher: { visible: true, personal: "Home", work: "Office" },
    layout: { columns: 6, rows: 2, tileSize: 76, brandVisible: true },
    shortcuts: [{ id: "first", type: "shortcut", position: 0, title: "Original", preview: "" }],
    padding: "X".repeat(200_000)
  };
  let raw = invalid ? "{broken" : JSON.stringify(manifest);
  const newer = { ...manifest, shortcuts: [{ ...manifest.shortcuts[0], title: "Updated" }] };
  const root = new Element("html");
  const grid = new Element("grid");
  const empty = new Element("empty");
  const switcher = noSwitcher ? null : new Element("nav");
  if (switcher) { switcher.personal = new Element("button"); switcher.work = new Element("button"); }
  let parses = 0;
  const context = {
    JSON: { parse(value) { parses += 1; return JSON.parse(value); } },
    __mosaicsyncBootstrapConfig: { renderManifestKey: "render-manifest", renderManifestVersion: 5 },
    localStorage: { getItem: key => key === "render-manifest" ? raw : null },
    document: {
      documentElement: root,
      getElementById: id => ({ spaceSwitcher: switcher, shortcutGrid: grid, emptyState: empty })[id] ?? null,
      querySelector: () => new Element("brand"),
      createElement: tag => new Element(tag),
      createDocumentFragment: () => { const el = new Element("fragment"); el.fragment = true; return el; }
    },
    performance: { now: () => 1 },
    requestAnimationFrame() {},
    setTimeout() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("src/shared/newtab/space-bootstrap.js"), context);
  if (replacement) raw = JSON.stringify(newer);
  vm.runInContext(read("src/shared/newtab/render-bootstrap.js"), context);
  return { parses, painted: context.__mosaicsyncBootGrid?.manifest, switcher, context };
}

test("Slice 2: unchanged first-paint manifest is parsed once across both classic bootstraps", () => {
  const result = boot();
  assert.equal(result.parses, 1, "the same 200-KB JSON must not be parsed twice");
  assert.equal(result.painted?.shortcuts?.[0]?.title, "Original");
  assert.equal(result.switcher.personal.textContent, "Home");
  assert.equal(result.switcher.work.textContent, "Office");
  assert.equal(result.context.__mosaicsyncFirstPaintManifest, undefined, "temporary shared cache must be released");
});

test("Slice 2: a modified manifest between scripts is reread and reparsed", () => {
  const result = boot({ replacement: true });
  assert.equal(result.parses, 2);
  assert.equal(result.painted?.shortcuts?.[0]?.title, "Updated");
});

test("Slice 2: grid bootstrap still works independently without a Space switcher", () => {
  const result = boot({ noSwitcher: true });
  assert.equal(result.parses, 1);
  assert.equal(result.painted?.shortcuts?.[0]?.title, "Original");
});

test("Slice 2: corrupt disposable manifest remains harmless", () => {
  const result = boot({ invalid: true });
  assert.equal(result.painted, undefined);
});

function sourceBetween(start, end) {
  const begin = newtab.indexOf(start);
  const finish = newtab.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `missing function ${start}`);
  return newtab.slice(begin, finish);
}
const paintFunction = sourceBetween("  function paintLoadedState(", "  function stateVisualHydrationSignature(");
const maintenanceFunction = sourceBetween("  function schedulePostPaintMaintenance()", "  const devicePlatformInfoPromise");

function frequentStartup({ preferenceEnabled = true, preferenceCount = 5, snapshotCount = 5, competingRender = false, updatedSnapshot = false } = {}) {
  const calls = [];
  const snap = { enabled: true, count: snapshotCount, sites: [{ url: "https://example.test", title: "Example" }] };
  const state = { settings: {}, firstPaint: { frequent: snap } };
  const context = {
    state, meta: { syncEnabled: false }, frequentRenderSnapshot: null, frequentLiveSites: [],
    frequentRenderCommitGeneration: 0, lastStartupFrequentRender: null,
    frequentlyVisitedEnabled: preferenceEnabled, frequentlyVisitedCount: preferenceCount,
    settingsFrequentlyVisited: null, settingsFrequentlyVisitedCount: null,
    performance: { now: () => 0 }, startupStartedAt: 0,
    applySettings() {}, render() {}, adoptBootGridInPlace: () => false,
    updateSyncUi() {}, updateSpaceSwitcher() {}, scheduleRenderReady() {}, scheduleAppearanceHintRefresh() {},
    refreshFirstPaintCaches() {}, scheduleRenderPreviewRefresh() {},
    renderFrequentlyVisited(sites, options) { calls.push({ sites, options }); context.frequentRenderCommitGeneration += 1; return Promise.resolve(true); },
    syncFrequentlyVisitedLocalsFromState() { context.frequentlyVisitedEnabled = preferenceEnabled; context.frequentlyVisitedCount = preferenceCount; },
    readShortcutOrderPreference: () => "manual", readShortcutUsage: () => ({}),
    readHiddenFrequentDomains: () => [], readDeviceDefaultSpacePreference: () => "last",
    scheduleFrequentlyVisitedRefresh() {}, scheduleFrequentlyVisitedPermissionReconciliation() {},
    maybeShowSyncedFrequentlyVisitedPermissionStep: async () => false,
    scheduleIdleWork() {}, preloadBackgroundForSettings() {},
    normalizeMeta: value => value
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${paintFunction}\n${maintenanceFunction}\nthis.paint=paintLoadedState;this.maintain=schedulePostPaintMaintenance;`, context);
  context.paint({ state, meta: context.meta }, {}, {});
  const initial = calls.length;
  if (competingRender) context.frequentRenderCommitGeneration += 1;
  if (updatedSnapshot) context.frequentRenderSnapshot = { ...context.frequentRenderSnapshot };
  context.maintain();
  return { calls, initial };
}

test("Slice 2: post-paint work does not re-decode already rendered identical Frequent Sites", () => {
  const { calls, initial } = frequentStartup();
  assert.equal(initial, 1);
  assert.equal(calls.length, 1);
});

test("Slice 2: a changed Frequent Sites capacity still triggers corrective rendering", () => {
  const { calls } = frequentStartup({ preferenceCount: 8, snapshotCount: 5 });
  assert.equal(calls.length, 2);
});

test("Slice 2: intervening Frequent Sites render generation demands a corrective pass", () => {
  const { calls } = frequentStartup({ competingRender: true });
  assert.equal(calls.length, 2);
});

test("Slice 2: newly supplied Frequent Sites snapshot demands a corrective pass", () => {
  const { calls } = frequentStartup({ updatedSnapshot: true });
  assert.equal(calls.length, 2);
});

test("Slice 2: disabling Frequent Sites still clears the cached strip", () => {
  const { calls } = frequentStartup({ preferenceEnabled: false });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].sites.length, 0);
});

test("Slice 2: hidden Settings preserves Sync metadata without touching its DOM", () => {
  const ui = sourceBetween("  function updateSyncUi(", "  async function refreshSyncStatus()");
  const context = {
    meta: {}, lastSyncStatus: null,
    normalizeMeta: value => ({ ...value, normalized: true }),
    settingsDialog: { hidden: true },
    syncStatusText: { set textContent(_) { throw new Error("hidden Sync DOM was written"); } }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${ui}\nthis.update=updateSyncUi;`, context);
  const status = { remoteState: "none" };
  context.update({ syncEnabled: true, syncStatus: "waiting" }, status);
  assert.equal(context.meta.normalized, true);
  assert.equal(context.meta.syncStatus, "waiting");
  assert.equal(context.lastSyncStatus, status);
});

test("Slice 2: opening Settings immediately renders the retained Sync status before async refresh", async () => {
  const open = sourceBetween("  async function openSettings()", "  function updateBackgroundControlLabels()");
  const calls = [];
  const dialog = { hidden: true, setAttribute() {} };
  const context = {
    settingsDialog: dialog,
    settingsButton: { setAttribute() {} },
    settingsAutoSiteIcons: { checked: false },
    state: { settings: { autoSiteIcons: true } },
    meta: { syncStatus: "waiting" }, lastSyncStatus: { remoteState: "partial" },
    isSettingsOpen: () => !dialog.hidden,
    closeDropChoice() {}, closeFolder() {},
    ensureSecondaryStyles: async () => {}, loadSettingsRefreshDomains: async () => {}, localizeDocument() {},
    refreshGridSettingsControls() {}, populateLanguageSelect() {},
    readShortcutOrderPreference: () => "manual", readShortcutUsage: () => ({}),
    refreshSpacesSettings() {}, syncFrequentlyVisitedLocalsFromState() {},
    refreshFrequentlyVisitedSettingsControls() {}, refreshFrequentlyVisited: async () => {},
    refreshBackgroundSettingsControls() {},
    updateSyncUi: (meta, status) => calls.push({ meta, status }),
    reconcileAndRefreshSyncStatus: async () => {}, refreshWebAccessUi: async () => {},
    console, PRODUCT_NAME: "MosaicSync",
    settingsLanguage: null, settingsShortcutOrder: null, settingsShortcutOrderHint: null,
    settingsFrequentlyVisitedDescription: null, settingsFrequentlyVisitedCountLabel: null,
    deferredSettingsControlRefresh: false
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${open}\nthis.open=openSettings;`, context);
  await context.open();
  assert.equal(dialog.hidden, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].meta.syncStatus, "waiting");
  assert.equal(calls[0].status.remoteState, "partial");
});
