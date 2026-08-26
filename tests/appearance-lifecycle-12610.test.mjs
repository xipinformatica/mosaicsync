import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} missing`);
  // These are top-level functions inside the New Tab IIFE and are consistently
  // indented by two spaces. Slice to the next top-level declaration instead of
  // trying to hand-parse JavaScript template-literal interpolation.
  const next = source.indexOf("\n  function ", start + marker.length);
  assert.ok(next > start, `${name} terminator missing`);
  return source.slice(start, next).trimEnd();
}

function makeStyle(initial = {}) {
  const style = { ...initial };
  Object.defineProperties(style, {
    setProperty: { value(name, value) { style[name] = String(value); }, enumerable: false },
    removeProperty: { value(name) { delete style[name]; }, enumerable: false }
  });
  return style;
}

function makeImage() {
  return {
    hidden: true,
    src: "",
    removeAttribute(name) {
      if (name === "src") this.src = "";
    }
  };
}

function makeDialog() {
  const listeners = new Map();
  return {
    open: true,
    listeners,
    addEventListener(type, fn) { listeners.set(type, fn); }
  };
}

function extractSettingsCloseRegistration(source) {
  const start = source.indexOf('settingsDialog?.addEventListener("close", () => {');
  assert.ok(start >= 0, "Settings close listener missing");
  const endMarker = "\n  });";
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, "Settings close listener terminator missing");
  return source.slice(start, end + endMarker.length);
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.11 ${browser} live appearance lifecycle keeps the real page frozen until Settings closes`, async () => {
    const source = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const settingsDialog = makeDialog();
    const appearancePreviewLayer = { hidden: true, style: makeStyle() };
    const appearancePreviewImage = makeImage();
    const page = {
      style: makeStyle({
        backgroundColor: "#222222",
        backgroundImage: 'url("old-wallpaper.webp")',
        backgroundSize: "cover",
        backgroundPosition: "center center"
      })
    };
    const documentElement = { dataset: {}, style: makeStyle({ "--page-bg": "#222222", "--background-dim": "0.3" }) };
    const raf = [];
    let applySettingsCalls = 0;
    let hintRefreshCalls = 0;
    let toggleCalls = 0;

    const context = vm.createContext({
      state: {
        settings: {
          theme: "dark",
          backgroundImageDeferred: false
        }
      },
      settingsDialog,
      appearancePreviewLayer,
      appearancePreviewImage,
      page,
      document: { documentElement },
      effectiveBackgroundColor(settings) { return settings.theme === "light" ? "#f7f3fb" : "#15101d"; },
      effectiveBackgroundPresetId(settings) { return settings.theme === "light" ? "light-wallpaper" : "dark-wallpaper"; },
      effectiveBackgroundImageValue() { return ""; },
      effectiveBackgroundDim(settings) { return settings.theme === "light" ? 5 : 30; },
      resolveBackgroundImage(presetId) { return `extension:///${presetId}.webp`; },
      effectiveCanvasText() { return context.state.settings.theme === "light" ? "dark" : "light"; },
      cssUrl(value) { return `"${String(value)}"`; },
      effectiveTheme() { return context.state.settings.theme; },
      updateThemeToggle() { toggleCalls += 1; },
      scheduleAppearanceHintRefresh() { hintRefreshCalls += 1; },
      requestAnimationFrame(fn) { raf.push(fn); return raf.length; },
      console
    });
    vm.runInContext("var deferredAppearanceVisual = false; var deferredLauncherSettings = false; var deferredLauncherRender = false;", context);

    for (const name of [
      "paintAppearancePreviewLayer",
      "clearAppearancePreviewLayer",
      "applyPageBackgroundVisual",
      "applyThemeSkinVisual",
      "applyThemeTransition",
      "commitDeferredLauncherVisual"
    ]) {
      vm.runInContext(extractFunction(source, name), context);
    }

    context.applySettings = () => {
      applySettingsCalls += 1;
      context.applyPageBackgroundVisual();
      context.applyThemeSkinVisual();
    };

    // Simulate moving the visible Settings toggle from Dark to Light.
    context.state.settings.theme = "light";
    context.applyThemeTransition();

    assert.equal(documentElement.dataset.effectiveTheme, "light", "theme skin should switch immediately");
    assert.equal(documentElement.style.colorScheme, "light");
    assert.equal(toggleCalls, 1);
    assert.equal(appearancePreviewLayer.hidden, false, "live wallpaper preview should be visible while Settings is open");
    assert.equal(appearancePreviewLayer.style.backgroundColor, "#f7f3fb");
    assert.equal(appearancePreviewImage.hidden, false);
    assert.equal(appearancePreviewImage.src, "extension:///light-wallpaper.webp");
    assert.equal(page.style.backgroundColor, "#222222", "real page color must remain frozen under Settings");
    assert.equal(page.style.backgroundImage, 'url("old-wallpaper.webp")', "real page wallpaper must remain frozen under Settings");
    assert.equal(documentElement.style["--page-bg"], "#222222");
    assert.equal(documentElement.style["--background-dim"], "0.3", "real page darkness must remain frozen while Settings is open");
    assert.equal(appearancePreviewLayer.style["--appearance-preview-dim"], "0.05", "isolated Settings preview should show the matching wallpaper darkness");
    assert.equal(vm.runInContext("deferredAppearanceVisual", context), true);
    assert.equal(applySettingsCalls, 0, "open-Settings live switching must not invoke the full renderer");

    // Register and execute the actual production close listener, then flush its rAF.
    vm.runInContext(extractSettingsCloseRegistration(source), context);
    settingsDialog.open = false;
    settingsDialog.listeners.get("close")();
    assert.equal(raf.length, 1, "close should defer authoritative repaint by one frame");
    raf.shift()();

    assert.equal(applySettingsCalls, 1, "authoritative appearance should commit exactly once after close");
    assert.equal(hintRefreshCalls, 1);
    assert.equal(page.style.backgroundColor, "#f7f3fb");
    assert.equal(page.style.backgroundImage, 'url("extension:///light-wallpaper.webp")');
    assert.equal(documentElement.style["--page-bg"], "#f7f3fb");
    assert.equal(documentElement.style["--background-dim"], "0.05", "authoritative wallpaper darkness commits after Settings closes");
    assert.equal(appearancePreviewLayer.hidden, true, "preview layer should be released after authoritative commit");
    assert.equal(appearancePreviewImage.hidden, true);
    assert.equal(appearancePreviewImage.src, "");
    assert.equal(vm.runInContext("deferredAppearanceVisual", context), false);
  });

  test(`1.26.11 ${browser} reopening Settings before the deferred frame cannot commit a stale real background`, async () => {
    const source = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const settingsDialog = makeDialog();
    const raf = [];
    let commits = 0;
    const context = vm.createContext({
      settingsDialog,
      requestAnimationFrame(fn) { raf.push(fn); return raf.length; },
      commitDeferredLauncherVisual() { commits += 1; }
    });
    vm.runInContext("var deferredAppearanceVisual = true; var deferredLauncherSettings = false; var deferredLauncherRender = false;", context);

    vm.runInContext(extractSettingsCloseRegistration(source), context);
    settingsDialog.open = false;
    settingsDialog.listeners.get("close")();
    assert.equal(raf.length, 1);

    // User reopens Settings before Firefox reaches the deferred paint frame.
    settingsDialog.open = true;
    raf.shift()();
    assert.equal(commits, 0, "reopen-before-rAF must suppress the stale authoritative commit");

    // A later close may commit normally.
    settingsDialog.open = false;
    settingsDialog.listeners.get("close")();
    raf.shift()();
    assert.equal(commits, 1);
  });
}
