import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeFaviconPreference } from "../src/shared/core/model.js";

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

const sharedNewtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.3 ${browser} Settings uses a fixed ARIA dialog surface instead of a native modeless dialog`, () => {
    const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
    assert.match(html, /<aside\s+id="settingsDialog"[^>]*\brole="dialog"[^>]*\baria-modal="false"[^>]*\baria-labelledby="settingsDialogTitle"[^>]*\bhidden\b/i);
    assert.doesNotMatch(html, /<dialog\s+id="settingsDialog"/i, "the compositor-sensitive Settings surface must not be native <dialog>");
    assert.match(html, /id="settingsButton"[^>]*aria-controls="settingsDialog"[^>]*aria-expanded="false"/i);
  });

  test(`1.30.3 ${browser} Settings lifecycle opens/closes the fixed panel without native show/close`, () => {
    const open = extractFunction(sharedNewtab, "openSettings");
    const close = extractFunction(sharedNewtab, "closeSettingsPanel");
    assert.match(open, /settingsDialog\.hidden = false;/);
    assert.match(open, /settingsDialog\.setAttribute\("aria-hidden", "false"\)/);
    assert.match(open, /settingsButton\?\.setAttribute\("aria-expanded", "true"\)/);
    assert.doesNotMatch(open, /settingsDialog\.show\(|settingsDialog\.showModal\(/);
    assert.match(close, /settingsDialog\.hidden = true;/);
    assert.match(close, /settingsButton\?\.setAttribute\("aria-expanded", "false"\)/);
    assert.doesNotMatch(close, /settingsDialog\.close\(/);
    assert.match(sharedNewtab, /if \(event\.key === "Escape"\)[\s\S]*?if \(isSettingsOpen\(\) && !wallpaperGalleryDialog\?\.open\) closeSettingsPanel\(\);/,
      "non-native Settings must retain Escape-to-close semantics");
  });

  test(`1.30.3 ${browser} Separate Light/Dark checkbox expands prepared cards without repainting preview images`, () => {
    const refresh = extractFunction(sharedNewtab, "refreshThemeWallpaperControls");
    const persist = extractFunction(sharedNewtab, "persistThemeWallpaperControls");
    const calls = [];
    const context = vm.createContext({
      settingsThemeWallpapersLabel: null,
      settingsThemeWallpapersDescription: null,
      settingsThemeWallpapers: { checked: false },
      themeWallpaperChoices: { hidden: false },
      backgroundDimControls: { hidden: false },
      settingsLightWallpaper: {}, settingsLightWallpaperLabel: {}, settingsLightWallpaperValue: {}, settingsLightWallpaperPreview: {},
      settingsDarkWallpaper: {}, settingsDarkWallpaperLabel: {}, settingsDarkWallpaperValue: {}, settingsDarkWallpaperPreview: {},
      state: { settings: { themeWallpapersEnabled: false, lightBackgroundPreset: "a", darkBackgroundPreset: "b" } },
      t: key => key,
      refreshThemeWallpaperChoice() { calls.push("choice"); },
      refreshThemeWallpaperDimControl() { calls.push("dim"); }
    });
    vm.runInContext(refresh, context);
    context.refreshThemeWallpaperControls({ refreshChoices: false });
    assert.deepEqual(calls, [], "visibility-only checkbox refresh must not rewrite preview imagery/dim controls");
    assert.equal(context.themeWallpaperChoices.hidden, true);
    assert.equal(context.backgroundDimControls.hidden, false);
    assert.match(persist, /refreshThemeWallpaperControls\(\{ refreshChoices: false \}\)/,
      "checkbox path must use the visibility-only refresh contract");
  });

  test(`1.30.3 ${browser} Space switching is blocked at the function boundary while Settings is open`, async () => {
    const context = vm.createContext({ settingsDialog: { hidden: false }, touched: 0 });
    vm.runInContext(extractFunction(sharedNewtab, "isSettingsOpen"), context);
    vm.runInContext(extractFunction(sharedNewtab, "switchActiveSpace"), context);
    await context.switchActiveSpace("work");
    assert.equal(context.touched, 0);
    const fn = extractFunction(sharedNewtab, "switchActiveSpace");
    assert.match(fn, /if \(isSettingsOpen\(\)\) return;/);
  });

  test(`1.30.3 ${browser} shortcut artwork jobs are invalidated by editor close and guarded after awaits`, () => {
    const uploadStart = sharedNewtab.indexOf('shortcutImageFile.addEventListener("change", async () => {');
    const uploadEnd = sharedNewtab.indexOf('\n  clearShortcutImage.addEventListener', uploadStart);
    const upload = sharedNewtab.slice(uploadStart, uploadEnd);
    assert.match(upload, /const generation = \+\+shortcutSyncPrepareGeneration;/);
    assert.match(upload, /const editorShortcutId = shortcutId\.value;/);
    assert.match(upload, /await optimizeImageFile[\s\S]*?generation !== shortcutSyncPrepareGeneration[\s\S]*?!shortcutDialog\?\.open[\s\S]*?shortcutId\.value !== editorShortcutId/);

    const remoteStart = sharedNewtab.indexOf('useShortcutImageUrl?.addEventListener("click", () => {');
    const remoteEnd = sharedNewtab.indexOf('\n  chooseDetectedFavicon?.addEventListener', remoteStart);
    const remote = sharedNewtab.slice(remoteStart, remoteEnd);
    for (const awaited of ["permissionPromise", "saveState", "fetchBoundedRemoteImageBlob", "imageBlobToDataUrl"]) {
      assert.match(remote, new RegExp(`await ${awaited.replace('.', '\\.')}`), `remote artwork path must await ${awaited}`);
    }
    assert.match(remote, /generation !== shortcutSyncPrepareGeneration \|\| !shortcutDialog\?\.open \|\| shortcutId\.value !== editorShortcutId/g);
    assert.match(sharedNewtab, /shortcutDialog\?\.addEventListener\("close", \(\) => \{\s*shortcutSyncPrepareGeneration \+= 1;[\s\S]*?resetDetectedFaviconPicker\(\);/);
  });

  test(`1.30.3 ${browser} custom wallpaper optimization is generation, Space and Settings guarded`, () => {
    const start = sharedNewtab.indexOf('settingsBackgroundFile.addEventListener("change", async () => {');
    const end = sharedNewtab.indexOf('\n  settingsBackgroundColorButton', start);
    const handler = sharedNewtab.slice(start, end);
    assert.match(handler, /const generation = \+\+backgroundUploadGeneration;/);
    assert.match(handler, /const spaceId = state\.activeSpaceId;/);
    assert.match(handler, /await optimizeImageFile[\s\S]*?generation !== backgroundUploadGeneration \|\| state\.activeSpaceId !== spaceId \|\| !isSettingsOpen\(\)/);
    assert.match(extractFunction(sharedNewtab, "closeSettingsPanel"), /backgroundUploadGeneration \+= 1;/);
  });

  test(`1.30.3 ${browser} System theme resolution is last-result-wins and never speculatively paints media-only state`, async () => {
    let resolveA, resolveB;
    const a = new Promise(resolve => { resolveA = resolve; });
    const b = new Promise(resolve => { resolveB = resolve; });
    let call = 0;
    const paints = [];
    const context = vm.createContext({
      systemThemeResolutionGeneration: 0,
      systemThemeMedia: { matches: false },
      browser: { theme: { getCurrent: async () => (++call === 1 ? a : b) } },
      firefoxThemeLooksDark(info) { return info.dark; },
      resolvedSystemTheme: "light",
      state: { settings: { theme: "system" } },
      applyThemeTransition() { paints.push(context.resolvedSystemTheme); }
    });
    vm.runInContext(extractFunction(sharedNewtab, "refreshResolvedSystemTheme"), context);
    const first = context.refreshResolvedSystemTheme();
    context.systemThemeMedia.matches = true;
    const second = context.refreshResolvedSystemTheme();
    resolveB({ dark: false });
    await second;
    resolveA({ dark: false });
    await first;
    assert.equal(context.resolvedSystemTheme, "dark");
    assert.deepEqual(paints, ["dark"], "older async theme result must not repaint after the newer result");
    const listener = sharedNewtab.slice(sharedNewtab.indexOf('systemThemeMedia.addEventListener?.("change"'), sharedNewtab.indexOf('themeToggle?.querySelectorAll', sharedNewtab.indexOf('systemThemeMedia.addEventListener?.("change"')));
    assert.match(listener, /void refreshResolvedSystemTheme\(\)/);
    assert.doesNotMatch(listener, /resolvedSystemTheme\s*=|applyThemeTransition\(/, "media listener must not perform a speculative paint before reconciliation");
  });

  test(`1.30.3 ${browser} final slider interactions persist immediately`, () => {
    for (const target of ["settingsLightWallpaperDim", "settingsDarkWallpaperDim", "settingsTileSize", "backgroundColorHue"]) {
      assert.match(sharedNewtab, new RegExp(`${target.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\?*\\.addEventListener\\(\\"change\\"[\\s\\S]{0,220}?saveSettingsState\\(\\)`), `${target} needs a final change persistence path`);
    }
    assert.match(sharedNewtab, /backgroundColorPlane\?\.addEventListener\("pointerup"[\s\S]{0,320}?saveSettingsState\(\)/);
    assert.match(sharedNewtab, /backgroundColorPlane\?\.addEventListener\("lostpointercapture"[\s\S]{0,180}?colorPlaneDragging = false;[\s\S]{0,180}?colorPlaneRect = null;/);
  });

  test(`1.30.3 ${browser} conventional favicon timeout keeps the quality scan incomplete`, async () => {
    const source = readBackgroundSource(browser, { built: false });
    const fn = extractFunction(source, "probeConventionalFaviconQualityUpgrade");
    let index = 0;
    const context = vm.createContext({
      Date,
      fetchImageDataUrlDetailed: async (url) => {
        index += 1;
        if (index === 1) return { image: "png", sourceUrl: url, reason: "", width: 128, height: 128 };
        if (index === 2) return { image: "", sourceUrl: url, reason: "timeout" };
        return { image: "svg", sourceUrl: url, reason: "", width: 192, height: 192 };
      },
      betterFaviconCandidate: (_a, b) => b
    });
    vm.runInContext(fn, context);
    const result = await context.probeConventionalFaviconQualityUpgrade("https://example.test", { image: "base" }, { deadlineAt: Date.now() + 10_000 });
    assert.equal(result.complete, false);
    assert.equal(result.qualityUnresolved, true);
    assert.equal(result.sawTimeout, true);
  });

  test(`1.30.3 ${browser} recovery queue rejects non-finite persisted timestamps`, () => {
    const source = readBackgroundSource(browser, { built: false });
    const context = vm.createContext({ ICON_RECOVERY_QUEUE_VERSION: 2, ICON_RECOVERY_MAX_ATTEMPTS: 5, Number, Math, Set, normalizeFaviconPreference });
    vm.runInContext(extractFunction(source, "normalizeIconRecoveryQueue"), context);
    const normalized = context.normalizeIconRecoveryQueue({
      version: 2,
      updatedAt: Infinity,
      items: [{ id: "a", url: "https://example.test/", attempts: 1, nextAttemptAt: Infinity, lastAttemptAt: -Infinity }]
    });
    assert.equal(normalized.updatedAt, 0);
    assert.equal(normalized.items[0].nextAttemptAt, 0);
    assert.equal(normalized.items[0].lastAttemptAt, 0);
  });

  test(`1.30.3 ${browser} serialized recovery queue mutations preserve concurrent additions`, async () => {
    const source = readBackgroundSource(browser, { built: false });
    let stored = { version: 2, items: [] };
    const context = vm.createContext({
      Promise,
      readIconRecoveryQueue: async () => structuredClone(stored),
      writeIconRecoveryQueue: async next => { stored = structuredClone(next); return next; }
    });
    vm.runInContext(`let iconRecoveryQueueMutationTail = Promise.resolve();\n${extractFunction(source, "mutateIconRecoveryQueue")}`, context);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = context.mutateIconRecoveryQueue(async current => {
      await gate;
      return { ...current, items: [...current.items, { id: "a" }] };
    });
    const second = context.mutateIconRecoveryQueue(current => ({ ...current, items: [...current.items, { id: "b" }] }));
    release();
    await Promise.all([first, second]);
    assert.deepEqual(stored.items.map(item => item.id), ["a", "b"]);
  });
}

test("release packaging emits exactly the browser-labelled Firefox/Chrome/GitHub ZIP names", () => {
  const source = fs.readFileSync("tools/package.py", "utf8");
  assert.match(source, /f"mosaicsync-\{version\}-firefox\.zip" if browser == "firefox" else f"mosaicsync-\{version\}-chrome\.zip"/);
  assert.match(source, /f"mosaicsync-\{version\}-github-ready\.zip"/);
  assert.doesNotMatch(source, /f"mosaicsync-\{version\}\.zip" if browser == "firefox"/);
  assert.doesNotMatch(source, /mosaicsync-\{version\}-source\.zip/);
});
