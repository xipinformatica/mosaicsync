import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

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

function sourceFor(browser, file) {
  const shared = `src/shared/newtab/${file}`;
  return fs.existsSync(shared) ? fs.readFileSync(shared, "utf8") : fs.readFileSync(`src/${browser}/newtab/${file}`, "utf8");
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.9 ${browser} external grid state refreshes untouched controls and one edit cannot overwrite its sibling`, async () => {
    const source = sourceFor(browser, "newtab.js");
    let context;
    context = vm.createContext({
      state: { settings: { columns: 10, rows: 4, tileSize: 76 } },
      settingsColumns: { value: "8" }, // stale before external refresh
      settingsRows: { value: "4" },
      settingsTileSize: { value: "76" },
      settingsTileSizeValue: { value: "76px", textContent: "76px" },
      document: { activeElement: null },
      pendingSettingsDraft: new Map(),
      Object, Math, Number, String,
      clampInt(value, min, max, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
      },
      markSettingsChanged() {},
      rememberPendingSettings(keys) { for (const key of keys) context.pendingSettingsDraft.set(key, context.state.settings[key]); },
      applySettings() {}, render() {},
      saveSettingsState: async () => {},
      showToast() {}, t: key => key,
      console
    });
    for (const name of ["controlContainsActiveElement", "refreshGridSettingsControls", "applyGridLayoutControlLive"]) {
      vm.runInContext(extractFunction(source, name), context);
    }
    context.refreshGridSettingsControls({ preserveActive: true });
    assert.equal(context.settingsColumns.value, "10", "untouched Columns control must visibly refresh to external state");
    context.settingsRows.value = "5";
    await context.applyGridLayoutControlLive("rows");
    assert.equal(context.state.settings.columns, 10, "editing Rows must preserve newer authoritative Columns");
    assert.equal(context.state.settings.rows, 5, "the field intentionally edited by the user must update");
  });

  test(`1.27.9 ${browser} dirty debounced settings survive external adoption and persist`, async () => {
    const source = sourceFor(browser, "newtab.js");
    let persistedTileSize = null;
    let context;
    context = vm.createContext({
      state: { settings: { tileSize: 76 }, settingsModifiedAt: 100, updatedAt: 100 },
      pendingSettingsDraft: new Map([["tileSize", 90]]),
      Object, Map,
      markSettingsChanged() { context.state.settingsModifiedAt += 1; context.state.updatedAt += 1; },
      async saveState() {
        persistedTileSize = context.state.settings.tileSize;
        context.settlePersistedSettingsDraft();
      },
      console
    });
    vm.runInContext(extractFunction(source, "applyPendingSettingsDraft"), context);
    vm.runInContext(extractFunction(source, "settlePersistedSettingsDraft"), context);
    vm.runInContext(extractFunction(source, "saveSettingsState"), context);
    context.applyPendingSettingsDraft();
    assert.equal(context.state.settings.tileSize, 90, "external state adoption must re-overlay the dirty local Tile Size");
    await context.saveSettingsState();
    assert.equal(persistedTileSize, 90, "debounced persistence must write the user's dirty Tile Size");
    assert.equal(context.pendingSettingsDraft.size, 0, "dirty value clears only after successful persistence");
    assert.match(source, /tileSizePersistTimer\s*=\s*setTimeout\([\s\S]*?saveSettingsState\(\)/,
      "Tile Size debounce must persist through the settings-draft-aware writer");
    assert.match(source, /writeBaseline\s*=\s*persisted\.compactBaseline;\s*settlePersistedSettingsDraft\(\);/,
      "any successful local-state write must advance the exact compact baseline and settle Settings draft values that reached storage");
  });

  test(`1.27.9 ${browser} background draft refresh preserves external wallpaper when user changes only dim`, () => {
    const source = sourceFor(browser, "newtab.js");
    const context = vm.createContext({
      state: {
        settings: {
          backgroundColor: "#2b0050", backgroundColorCustomized: false,
          backgroundPreset: "wallpaper-b", backgroundImage: "", backgroundLocalAssetId: "",
          backgroundImageKind: "none", backgroundAssetId: "", backgroundSourceKind: "none", backgroundSourceUrl: "",
          backgroundFit: "cover", backgroundPosition: "center center", backgroundDim: 40,
          themeWallpapersEnabled: false, lightBackgroundPreset: "", darkBackgroundPreset: ""
        },
        settingsModifiedAt: 100, updatedAt: 100
      },
      pendingSettingsDraft: new Map([["backgroundDim", 40]]),
      pendingBackgroundColorCustomized: false,
      pendingBackgroundPreset: "wallpaper-a",
      pendingBackgroundSourceKind: "none", pendingBackgroundSourceUrl: "", pendingBackgroundImage: "",
      backgroundColorControl: null,
      settingsBackgroundDim: { value: "10" },
      DEFAULT_STATE: { settings: { backgroundColor: "#2b0050" } },
      document: { activeElement: null },
      Object, Map, Number, Math,
      markSettingsChanged() {},
      controlContainsActiveElement() { return false; },
      setColorPickerFromHex() {}, effectiveBackgroundColor() { return "#2b0050"; }, closeBackgroundColorPicker() {},
      renderBackgroundPresets() {}, refreshThemeWallpaperControls() {}, updateBackgroundControlLabels() {},
      normalizeHexColor() { return "#2b0050"; },
      console
    });
    for (const name of ["applyPendingSettingsDraft", "refreshBackgroundSettingsControls", "collectBackgroundControlsIntoState"]) {
      vm.runInContext(extractFunction(source, name), context);
    }
    context.applyPendingSettingsDraft();
    context.refreshBackgroundSettingsControls({ preserveActive: true });
    assert.equal(context.pendingBackgroundPreset, "wallpaper-b", "non-dirty pending wallpaper must refresh from external state");
    context.collectBackgroundControlsIntoState();
    assert.equal(context.state.settings.backgroundPreset, "wallpaper-b", "changing only dim must not resurrect stale wallpaper A");
    assert.equal(context.state.settings.backgroundDim, 40);
  });

  test(`1.27.9 ${browser} quality resolver cannot stop on huge low-suitability manifest art`, async () => {
    const source = readBackgroundSource(browser, { built: false });
    const context = vm.createContext({
      Math, Number, String, URL, RegExp,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      
      hasWebAccess: async () => true,
      isProtectedChromeStoreUrl: () => false,
      isProtectedFaviconUrl: () => false,
      platformHasPermissionFreeFaviconSource: () => browser === "chrome",
      resolveBrowserCachedFavicon: async () => ({ image: "" }),
      parentHostFaviconUrl: () => "",
      discoverPageIconInfo: async () => ({
        finalPageUrl: "https://example.test/page", reason: "",
        candidates: [{ url: "https://example.test/manifest-512.png", sideHint: 512, source: "manifest" }]
      }),
      fetchImageDataUrlDetailed: async (url, options = {}) => {
        if (String(url).endsWith("manifest-512.png")) return { image: "manifest", sourceUrl: String(url), width: 512, height: 512, qualitySide: 512, declared: true, sourceKind: options.sourceKind || "manifest", reason: "" };
        if (String(url).endsWith("/favicon.ico")) return { image: "favicon32", sourceUrl: String(url), width: 32, height: 32, qualitySide: 32, declared: false, sourceKind: options.sourceKind || "favicon", reason: "" };
        return { image: "", sourceUrl: String(url), width: 0, height: 0, qualitySide: 0, declared: false, sourceKind: options.sourceKind || "", reason: "not-found" };
      },
      probeOriginalOriginDeclaredIcons: async (_origin, current) => ({ best: current, complete: true, qualityUnresolved: false, sawTimeout: false }),
      probeConventionalFaviconQualityUpgrade: async (_origin, current) => ({ best: current, complete: true, qualityUnresolved: false, sawTimeout: false }),
      probeConventionalFaviconFallbacks: async () => null,
      console
    });
    const constantMatch = source.match(/const FAVICON_AUTHORITATIVE_SUITABILITY\s*=\s*(\d+);/);
    assert.ok(constantMatch, "authoritative suitability threshold missing");
    context.FAVICON_AUTHORITATIVE_SUITABILITY = Number(constantMatch[1]);
    for (const name of ["faviconQualitySide", "faviconCandidateSuitability", "faviconCandidatePreference", "faviconCandidateIsAuthoritativelyGoodEnough", "betterFaviconCandidate", "resolveFaviconForUrl"]) {
      vm.runInContext(extractFunction(source, name), context);
    }
    const result = await context.resolveFaviconForUrl("https://example.test/page", { preferQuality: true, timeoutMs: 8000 });
    assert.equal(result.image, "favicon32", "huge manifest art must not terminate discovery before the better favicon is compared");
  });

  test(`1.27.9 ${browser} genuinely excellent preferred favicon may still terminate bounded discovery`, () => {
    const source = readBackgroundSource(browser, { built: false });
    const context = vm.createContext({ Math, Number, String });
    const constantMatch = source.match(/const FAVICON_AUTHORITATIVE_SUITABILITY\s*=\s*(\d+);/);
    assert.ok(constantMatch);
    context.FAVICON_AUTHORITATIVE_SUITABILITY = Number(constantMatch[1]);
    for (const name of ["faviconQualitySide", "faviconCandidateSuitability", "faviconCandidateIsAuthoritativelyGoodEnough"]) vm.runInContext(extractFunction(source, name), context);
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough({ image: "x", width: 64, height: 64, sourceKind: "link", declared: true }), true);
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough({ image: "x", width: 512, height: 512, sourceKind: "manifest", declared: true }), false,
      "raw size alone must never satisfy the early-stop policy");
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough({ image: "x", width: 128, height: 64, sourceKind: "favicon", declared: true }), false,
      "strong provenance cannot hide poor geometry");
  });

  test(`1.27.9 ${browser} runtime package excludes monolithic reference newtab.css`, () => {
    assert.equal(fs.existsSync(`dist/${browser}/newtab/newtab.css`), false,
      "runtime package must contain only critical + secondary New Tab CSS");
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const js = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.doesNotMatch(html, /(?:^|["'/])newtab\.css(?:["'?]|$)/m);
    assert.doesNotMatch(js, /(?:^|["'/])newtab\.css(?:["'?]|$)/m);
  });

  test(`1.27.9 ${browser} reduced-motion suppresses mascot and launcher animation`, () => {
    const critical = sourceFor(browser, "newtab-critical.css");
    assert.match(critical, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/i,
      "critical CSS must preserve reduced-motion animation suppression");
  });
}


test("1.27.9 GitHub-ready source packaging keeps repository inputs and excludes generated/local junk", () => {
  const script = `import importlib.util, json\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('pkg','tools/package.py')\nm=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\npaths=['README.md','src/shared/newtab/newtab.js','dist/firefox/manifest.json','tests/snow-leopard-1279.test.mjs','tools/__pycache__/package.pyc','artifacts/old.zip','node_modules/pkg/index.js','package-size-report.json']\nprint(json.dumps({p:m.should_include_source_path(m.ROOT / p) for p in paths}))`;
  const result = spawnSync("python3", ["-c", script], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const included = JSON.parse(result.stdout);
  for (const path of ["README.md", "src/shared/newtab/newtab.js", "dist/firefox/manifest.json", "tests/snow-leopard-1279.test.mjs"]) {
    assert.equal(included[path], true, `${path} must remain in the complete source archive`);
  }
  for (const path of ["tools/__pycache__/package.pyc", "artifacts/old.zip", "node_modules/pkg/index.js", "package-size-report.json"]) {
    assert.equal(included[path], false, `${path} must not leak into the complete source archive`);
  }
});
