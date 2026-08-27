import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sharedNewtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);

  const openParen = source.indexOf("(", start);
  let parenDepth = 0, quote = "", escaped = false, line = false, block = false;
  let bodyBrace = -1;
  for (let i = openParen; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "(") parenDepth += 1;
    else if (c === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyBrace = source.indexOf("{", i + 1);
        break;
      }
    }
  }
  assert.ok(bodyBrace >= 0, `${name} body missing`);

  let depth = 0;
  quote = ""; escaped = false; line = false; block = false;
  for (let i = bodyBrace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} unterminated`);
}

test("1.30.5 locale refresh preserves the real outer Settings scroll owner", async () => {
  const settingsDialog = { hidden: false, scrollTop: 237 };
  const settingsForm = { scrollTop: 999 };
  const context = vm.createContext({
    settingsDialog,
    settingsForm,
    document: {},
    settingsLanguage: null,
    settingsShortcutOrderHint: null,
    settingsFrequentlyVisitedDescription: null,
    settingsFrequentlyVisitedCountLabel: null,
    frequentlyVisitedPermissionButton: null,
    wallpaperGalleryDialog: null,
    bookmarkTree: [],
    meta: {},
    lastSyncStatus: null,
    frequentlyVisitedStatusKey: "",
    PRODUCT_NAME: "MosaicSync",
    localizeDocument() {},
    populateLanguageSelect() {},
    t(key) { return key; },
    updateBuiltinShortcutIconSelection() {},
    updateShortcutColorSelection() {},
    renderBackgroundPresets() { settingsDialog.scrollTop = 0; },
    refreshSpacesSettings() {},
    refreshThemeWallpaperControls() {},
    render() {},
    updateSyncUi() {},
    setFrequentlyVisitedStatus() {},
    renderBookmarkSidebar() {},
    renderBookmarkBrowser() {},
    isSettingsOpen() { return settingsDialog.hidden !== true; },
    refreshWebAccessUi() { return Promise.resolve(); },
    requestAnimationFrame(callback) { callback(); return 1; },
    console
  });
  vm.runInContext(extractFunction(sharedNewtab, "refreshLocalizedUi"), context);
  context.refreshLocalizedUi();
  await Promise.resolve();
  assert.equal(settingsDialog.scrollTop, 237, "locale rebuild must restore the actual Settings scroller");
  assert.equal(settingsForm.scrollTop, 999, "normal-flow form scrollTop must not be used as the preservation target");

  const fn = extractFunction(sharedNewtab, "refreshLocalizedUi");
  assert.match(fn, /const settingsScrollTop = settingsDialog\?\.scrollTop \|\| 0;/);
  assert.match(fn, /settingsDialog\.scrollTop = settingsScrollTop;/);
  assert.doesNotMatch(fn, /settingsForm\?\.scrollTop|settingsForm\.scrollTop/);
});

test("1.30.5 Separate Wallpapers visibility-only path is idempotent under 100 toggles", () => {
  let choiceCalls = 0;
  let dimCalls = 0;
  const context = vm.createContext({
    settingsThemeWallpapersLabel: null,
    settingsThemeWallpapersDescription: null,
    settingsThemeWallpapers: { checked: false },
    themeWallpaperChoices: { hidden: true },
    backgroundDimControls: { hidden: false },
    settingsLightWallpaper: {}, settingsLightWallpaperLabel: {}, settingsLightWallpaperValue: {}, settingsLightWallpaperPreview: {},
    settingsDarkWallpaper: {}, settingsDarkWallpaperLabel: {}, settingsDarkWallpaperValue: {}, settingsDarkWallpaperPreview: {},
    state: { settings: { themeWallpapersEnabled: false, lightBackgroundPreset: "", darkBackgroundPreset: "" } },
    t(key) { return key; },
    refreshThemeWallpaperChoice() { choiceCalls += 1; },
    refreshThemeWallpaperDimControl() { dimCalls += 1; }
  });
  vm.runInContext(extractFunction(sharedNewtab, "refreshThemeWallpaperControls"), context);

  for (let i = 0; i < 100; i += 1) {
    const enabled = i % 2 === 0;
    context.state.settings.themeWallpapersEnabled = enabled;
    context.refreshThemeWallpaperControls({ refreshChoices: false });
    assert.equal(context.settingsThemeWallpapers.checked, enabled);
    assert.equal(context.themeWallpaperChoices.hidden, !enabled);
    assert.equal(context.backgroundDimControls.hidden, enabled);
  }

  assert.equal(choiceCalls, 0, "toggle stress must not repaint wallpaper choices in the visibility-only gesture");
  assert.equal(dimCalls, 0, "toggle stress must not rewrite Light/Dark dim controls in the visibility-only gesture");
  assert.equal(context.themeWallpaperChoices.hidden, true, "100th transition ends disabled");
  assert.equal(context.backgroundDimControls.hidden, false, "shared darkness row returns when separate wallpapers are disabled");
});

test("1.30.5 Frequently Visited expansion has one idempotent visibility owner under 100 toggles", () => {
  const frequentOptions = { hidden: true };
  const context = vm.createContext({ frequentOptions });
  vm.runInContext(extractFunction(sharedNewtab, "setFrequentlyVisitedOptionsVisibility"), context);

  for (let i = 0; i < 100; i += 1) {
    const enabled = i % 2 === 0;
    context.setFrequentlyVisitedOptionsVisibility(enabled);
    assert.equal(frequentOptions.hidden, !enabled);
  }
  assert.equal(frequentOptions.hidden, true);
  const fn = extractFunction(sharedNewtab, "setFrequentlyVisitedOptionsVisibility");
  assert.match(fn, /frequentOptions\.hidden = enabled !== true/);
  assert.doesNotMatch(fn, /frequentCountRow\.hidden/);
});

test("1.30.5 keeps the 1.30.4 single-scroll-owner isolation architecture unchanged", () => {
  const css = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");
  assert.match(css, /\.settings-dialog\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*\}/s);
  assert.match(css, /\.settings-dialog \.dialog-card\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;[^}]*\}/s);
  assert.doesNotMatch(css, /\.settings-dialog \.dialog-card\{[^}]*overflow-y:\s*auto;/s);
});
