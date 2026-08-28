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
  return {
    hidden: false,
    attrs: new Map(),
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
  };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.11 ${browser} Light/Dark selector previews its matching wallpaper immediately while the real page stays frozen`, async () => {
    const source = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const settingsDialog = makeDialog();
    const page = {
      style: makeStyle({
        backgroundColor: "#222222",
        backgroundImage: 'url("old-wallpaper.webp")',
        backgroundSize: "cover",
        backgroundPosition: "center center"
      })
    };
    const documentElement = { dataset: {}, style: makeStyle({ "--page-bg": "#222222", "--background-dim": "0.3" }) };
    const appearancePreviewLayer = { hidden: true, style: makeStyle() };
    const appearancePreviewImage = makeImage();
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
      settingsButton: { setAttribute() {} },
      closeBackgroundColorPicker() {},
      page,
      appearancePreviewLayer,
      appearancePreviewImage,
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
    vm.runInContext("var deferredAppearanceVisual = false; var deferredLauncherSettings = false; var deferredLauncherRender = false; var deferredSettingsControlRefresh = false; var backgroundUploadGeneration = 0;", context);

    for (const name of [
      "isSettingsOpen",
      "paintAppearancePreviewLayer",
      "clearAppearancePreviewLayer",
      "applyPageBackgroundVisual",
      "applyThemeSkinVisual",
      "applyThemeTransition",
      "commitDeferredLauncherVisual",
      "closeSettingsPanel"
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
    assert.equal(page.style.backgroundColor, "#222222", "real page color must stay frozen while Settings is open");
    assert.equal(page.style.backgroundImage, 'url("old-wallpaper.webp")', "real page wallpaper must stay frozen while Settings is open");
    assert.equal(documentElement.style["--page-bg"], "#222222");
    assert.equal(documentElement.style["--background-dim"], "0.3", "real root dim must stay frozen while Settings is open");
    assert.equal(appearancePreviewLayer.hidden, false, "isolated preview must become visible");
    assert.equal(appearancePreviewLayer.style.backgroundColor, "#f7f3fb");
    assert.equal(appearancePreviewLayer.style["--appearance-preview-dim"], "0.05");
    assert.equal(appearancePreviewImage.hidden, false);
    assert.equal(appearancePreviewImage.src, "extension:///light-wallpaper.webp");
    assert.equal(vm.runInContext("deferredAppearanceVisual", context), true);
    assert.equal(applySettingsCalls, 0, "theme selection must not invoke the broad Settings/grid renderer");

    // Other direct appearance work also updates only the preview while Settings is open.
    context.state.settings.theme = "dark";
    context.applyPageBackgroundVisual();
    assert.equal(page.style.backgroundImage, 'url("old-wallpaper.webp")', "authoritative page remains frozen under Settings");
    assert.equal(appearancePreviewLayer.style.backgroundColor, "#15101d");
    assert.equal(appearancePreviewLayer.style["--appearance-preview-dim"], "0.3");
    assert.equal(appearancePreviewImage.src, "extension:///dark-wallpaper.webp");
    assert.equal(vm.runInContext("deferredAppearanceVisual", context), true);

    // Execute the actual production Settings close path, then flush its rAF.
    context.closeSettingsPanel();
    assert.equal(raf.length, 1, "deferred ordinary work should commit on the next frame after close");
    raf.shift()();

    assert.equal(applySettingsCalls, 1, "deferred ordinary appearance should commit exactly once after close");
    assert.equal(hintRefreshCalls, 1);
    assert.equal(page.style.backgroundColor, "#15101d");
    assert.equal(page.style.backgroundImage, 'url("extension:///dark-wallpaper.webp")');
    assert.equal(documentElement.style["--page-bg"], "#15101d");
    assert.equal(documentElement.style["--background-dim"], "0.3");
    assert.equal(appearancePreviewLayer.hidden, true, "preview must clear after authoritative post-close commit");
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
      settingsButton: { setAttribute() {} },
      closeBackgroundColorPicker() {},
      requestAnimationFrame(fn) { raf.push(fn); return raf.length; },
      commitDeferredLauncherVisual() { commits += 1; }
    });
    vm.runInContext("var deferredAppearanceVisual = true; var deferredLauncherSettings = false; var deferredLauncherRender = false; var deferredSettingsControlRefresh = false; var backgroundUploadGeneration = 0;", context);
    vm.runInContext(extractFunction(source, "isSettingsOpen"), context);
    vm.runInContext(extractFunction(source, "closeSettingsPanel"), context);

    context.closeSettingsPanel();
    assert.equal(raf.length, 1);

    // User reopens Settings before Firefox reaches the deferred paint frame.
    settingsDialog.hidden = false;
    raf.shift()();
    assert.equal(commits, 0, "reopen-before-rAF must suppress the stale authoritative commit");

    // A later close may commit normally.
    context.closeSettingsPanel();
    raf.shift()();
    assert.equal(commits, 1);
  });
}
