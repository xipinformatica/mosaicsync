import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const brace = source.indexOf("{\n", start);
  assert.ok(brace >= 0, `${name} body missing`);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} unterminated`);
}

function extractSettingsCloseRegistration(source) {
  const start = source.indexOf('settingsDialog?.addEventListener("close", () => {');
  assert.ok(start >= 0, "Settings close listener missing");
  const end = source.indexOf("\n  });", start);
  assert.ok(end > start, "Settings close listener terminator missing");
  return source.slice(start, end + 6);
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.9 ${browser} mascot animation is complete in critical CSS and logo hover stays secondary-CSS-free`, () => {
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");
    const js = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const trigger = extractFunction(js, "triggerBrandHello");
    assert.match(critical, /@keyframes brand-hello-pop\{/);
    assert.match(critical, /@keyframes brand-easter-wave\{/);
    assert.match(critical, /\.brand-button\.brand-hello-active \.brand-easter-egg\{\s*animation:\s*brand-hello-pop 3600ms ease forwards;/);
    assert.match(trigger, /classList\.add\("brand-hello-active"\)/, "hover must positively activate the mascot");
    assert.doesNotMatch(trigger, /ensureSecondaryStyles|newtab-secondary/, "logo hover must never activate deferred CSS");
    assert.doesNotMatch(secondary, /brand-hello-pop|brand-easter-wave/, "brand animation ownership must stay critical-only");
  });

  test(`1.27.8.9 ${browser} Light appearance hint establishes the effective theme before main-module execution`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/appearance-bootstrap.js`, "utf8");
    const style = { values: Object.create(null), setProperty(name, value) { this.values[name] = String(value); } };
    const root = { dataset: Object.create(null), style };
    const hint = {
      theme: "light",
      effectiveTheme: "light",
      backgroundColor: "#2b0050",
      backgroundColorCustomized: false,
      defaultLightBackgroundColor: "#e9e2f1",
      backgroundDim: 0
    };
    const context = {
      document: { documentElement: root },
      localStorage: { getItem: () => JSON.stringify(hint) },
      matchMedia: () => ({ matches: false }),
      browser: { runtime: { getURL: value => value } },
      console
    };
    context.globalThis = context;
    vm.runInNewContext(source, context);
    assert.equal(root.dataset.effectiveTheme, "light");
    assert.equal(style.values["--page-bg"], "#e9e2f1");
  });

  test(`1.27.8.9 ${browser} external Settings-open state commits defer safely while direct Settings controls stay live`, async () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const context = vm.createContext({
      settingsDialog: { open: true, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); } },
      state: { settings: { columns: 8, rows: 4 } },
      settingsColumns: { value: "9" },
      settingsRows: { value: "5" },
      clampInt(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback; },
      markSettingsChanged() { context.markCalls += 1; },
      applyPageBackgroundVisual() { context.previewCalls += 1; context.deferredAppearanceVisual = true; },
      applySettings() { context.realApplyCalls += 1; },
      render() { context.realRenderCalls += 1; },
      saveState: async () => { context.saveCalls += 1; },
      showToast() {}, t: key => key,
      scheduleAppearanceHintRefresh() { context.hintCalls += 1; },
      requestAnimationFrame(fn) { context.raf.push(fn); return context.raf.length; },
      previewCalls: 0, hintCalls: 0, realApplyCalls: 0, realRenderCalls: 0, saveCalls: 0, markCalls: 0, raf: [],
      console
    });
    context.deferredAppearanceVisual = false;
    context.deferredLauncherSettings = false;
    context.deferredLauncherRender = false;
    vm.runInContext(extractFunction(source, "reconcileLauncherAfterExternalState"), context);
    vm.runInContext(extractFunction(source, "requestLauncherRenderAfterExternalState"), context);
    vm.runInContext(extractFunction(source, "commitDeferredLauncherVisual"), context);
    vm.runInContext(extractFunction(source, "applyGridLayoutControlsLive"), context);
    vm.runInContext(extractSettingsCloseRegistration(source), context);

    // The storage/Sync/background reconciliation path accepts the new model but
    // never rebuilds or repaints the launcher behind an open Settings surface.
    assert.equal(context.reconcileLauncherAfterExternalState(), false);
    assert.equal(context.previewCalls, 1);
    assert.equal(context.realApplyCalls, 0);
    assert.equal(context.realRenderCalls, 0);
    assert.equal(context.deferredLauncherSettings, true);
    assert.equal(context.deferredLauncherRender, true);
    assert.equal(context.requestLauncherRenderAfterExternalState(), false);
    assert.equal(context.realRenderCalls, 0);

    // Positive preservation: an intentional Settings grid edit still previews
    // immediately. The lifecycle guard is not a blanket applySettings/render ban.
    await context.applyGridLayoutControlsLive();
    assert.equal(context.state.settings.columns, 9);
    assert.equal(context.state.settings.rows, 5);
    assert.equal(context.realApplyCalls, 1, "direct Settings layout changes remain live");
    assert.equal(context.realRenderCalls, 1, "direct Settings layout changes still rebuild the preview grid");
    assert.equal(context.saveCalls, 1);

    // External work accumulated while Settings was open coalesces into one
    // authoritative settings commit + one render after the dialog is gone.
    context.realApplyCalls = 0;
    context.realRenderCalls = 0;
    context.settingsDialog.open = false;
    context.settingsDialog.listeners.get("close")();
    assert.equal(context.raf.length, 1);
    context.raf.shift()();
    assert.equal(context.realApplyCalls, 1);
    assert.equal(context.realRenderCalls, 1);
    assert.equal(context.hintCalls, 1);
    assert.equal(context.deferredLauncherSettings, false);
    assert.equal(context.deferredLauncherRender, false);

    // Wiring check: persisted state and wait-status callbacks use the guarded
    // external path instead of calling an unguarded apply+render pair.
    const listenerStart = source.indexOf("browser.storage.onChanged.addListener");
    const listener = source.slice(listenerStart);
    assert.match(listener, /writeBaseline = createWriteBaseline\(stateChange\.newValue\);\s*reconcileLauncherAfterExternalState\(\);/);
    assert.match(listener, /wasAwaitingRemote !== isAwaitingRemote\(meta\)\) requestLauncherRenderAfterExternalState\(\)/);
  });

  test(`1.27.8.9 ${browser} Catalan drop-choice text is refreshed from locale keys at open time`, async () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const show = extractFunction(source, "showDropChoice");
    const strongMove = { textContent: "Move here" }, smallMove = { textContent: "Switch their positions" };
    const strongFolder = { textContent: "Create folder" }, smallFolder = { textContent: "Put both shortcuts together" };
    const makeButton = (strong, small) => ({ hidden: false, querySelector(selector) { return selector === "strong" ? strong : small; } });
    const classList = { remove() {}, add() {} };
    const context = vm.createContext({
      getTopLevelItem(id) { return { id, type: "shortcut" }; },
      ensureSecondaryStyles: async () => {},
      pendingDrop: null,
      dropMoveButton: makeButton(strongMove, smallMove),
      dropFolderButton: makeButton(strongFolder, smallFolder),
      dropChoice: { hidden: true, classList, style: {} },
      t(key) { return ({ moveHere: "Mou aquí", switchPositions: "Intercanvia les posicions", createFolder: "Crea una carpeta", putTogether: "Agrupa les dues dreceres" })[key]; },
      window: { innerWidth: 1200, innerHeight: 800 },
      requestAnimationFrame(fn) { fn(); },
      addTopLevelShortcutToFolder: async () => {}, swapTopLevelItems: () => true, saveState: async () => {}, render() {}, showToast() {}
    });
    vm.runInContext(show, context);
    await context.showDropChoice("a", "b", { getBoundingClientRect: () => ({ left: 100, width: 80, bottom: 180, top: 100 }) });
    assert.equal(strongMove.textContent, "Mou aquí");
    assert.equal(smallMove.textContent, "Intercanvia les posicions");
    assert.equal(strongFolder.textContent, "Crea una carpeta");
    assert.equal(smallFolder.textContent, "Agrupa les dues dreceres");
  });

  test(`1.27.8.9 ${browser} favicon winner scoring values suitability over unbounded icon size`, () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const context = vm.createContext({ Math, Number, String });
    for (const name of ["faviconQualitySide", "faviconCandidateSuitability", "betterFaviconCandidate"]) {
      vm.runInContext(extractFunction(source, name), context);
    }
    const icon = (name, width, height, sourceKind, declared = true, extra = {}) => ({
      image: name, width, height, qualitySide: Math.min(width || 0, height || 0), sourceKind, declared, ...extra
    });
    const favicon32 = icon("favicon32", 32, 32, "favicon", false);
    const hugeManifest = icon("manifest512", 512, 512, "manifest", true);
    assert.equal(context.betterFaviconCandidate(favicon32, hugeManifest).image, "favicon32",
      "huge manifest art must not displace a crisp conventional favicon merely because it is larger");

    const favicon16 = icon("favicon16", 16, 16, "favicon", false);
    const touch180 = icon("touch180", 180, 180, "touch", true);
    assert.equal(context.betterFaviconCandidate(favicon16, touch180).image, "touch180",
      "a genuinely tiny legacy favicon should still be upgradeable by suitable high-resolution artwork");

    const wideLink = icon("wide", 256, 48, "link", true);
    const squareLink = icon("square", 64, 64, "link", true);
    assert.equal(context.betterFaviconCandidate(wideLink, squareLink).image, "square",
      "strongly non-square artwork must not outrank a square shortcut icon");
  });
}

test("1.27.8.9 every supported locale defines the complete drag-choice text set", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir("src/shared/core/i18n-locales")).filter(name => name.endsWith(".js")).sort();
  assert.equal(files.length, 32, "all supported UI locale catalogs must be present");
  for (const file of files) {
    const { MESSAGES } = await import(`../src/shared/core/i18n-locales/${file}?drag12789=${Date.now()}-${file}`);
    for (const key of ["moveHere", "switchPositions", "createFolder", "putTogether"]) {
      assert.equal(typeof MESSAGES[key], "string", `${file}:${key} must be a string`);
      assert.ok(MESSAGES[key].trim(), `${file}:${key} must not be empty`);
    }
  }
});
