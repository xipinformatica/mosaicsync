import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.2 ${browser} applies theme skin and selected Light/Dark wallpaper live without invoking the broad renderer`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");

    const skin = js.match(/function applyThemeSkinVisual\(\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(skin, `${browser}: live theme-skin helper missing`);
    assert.match(skin[1], /document\.documentElement\.dataset\.theme = configuredTheme;/);
    assert.match(skin[1], /document\.documentElement\.dataset\.effectiveTheme = theme;/);
    assert.match(skin[1], /document\.documentElement\.style\.colorScheme = theme;/);
    assert.match(skin[1], /updateThemeToggle\(\);/);
    assert.doesNotMatch(skin[1], /backgroundImage|backgroundColor|--page-bg|applySettings\s*\(/,
      `${browser}: theme-skin helper must remain independent from wallpaper painting`);

    const transition = js.match(/function applyThemeTransition\(\)\s*\{([\s\S]*?)\n  \}\n\n  function commitDeferredLauncherVisual/);
    assert.ok(transition, `${browser}: appearance transition helper missing`);
    assert.match(transition[1], /if \(isSettingsOpen\(\)\)[\s\S]*?applyThemeSkinVisual\(\);[\s\S]*?applyPageBackgroundVisual\(\);[\s\S]*?return;/,
      `${browser}: explicit Light/Dark selection must paint the matching wallpaper preview immediately`);
    const openBranch = transition[1].split("return;")[0];
    assert.doesNotMatch(openBranch, /applySettings\s*\(/,
      `${browser}: live theme switching must not call the full renderer under Settings`);
  });

  test(`1.30.11 ${browser} previews active day/night wallpaper changes without touching the real page`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const helper = js.match(/function applyThemeWallpaperVisualSafely\(previousPresetId, previousImageValue, previousDim\)\s*\{([\s\S]*?)\n  \}\n\n  function stampThemeWallpaperMutation/);
    assert.ok(helper, `${browser}: wallpaper paint guard missing`);
    assert.match(helper[1], /if \(isSettingsOpen\(\)\)[\s\S]*?applyPageBackgroundVisual\(\);[\s\S]*?return;/,
      `${browser}: active wallpaper changes must route through the isolated preview under Settings`);
    const openBranch = helper[1].split("return;")[0];
    assert.doesNotMatch(openBranch, /applySettings\s*\(/,
      `${browser}: Settings-open wallpaper branch must not invoke the broad renderer`);
  });

  test(`1.26.9 ${browser} background helper isolates Settings-open painting from .page`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const helper = js.match(/function applyPageBackgroundVisual\(\{ deferHeavyAssets = false \} = \{\}\)\s*\{([\s\S]*?)\n  \}\n\n  function applyThemeSkinVisual/);
    assert.ok(helper, `${browser}: safe page-background helper missing`);
    const body = helper[1];
    const openStart = body.indexOf("if (isSettingsOpen())");
    const openReturn = body.indexOf("return;", openStart);
    assert.ok(openStart >= 0 && openReturn > openStart, `${browser}: Settings-open isolation branch missing`);
    const openBranch = body.slice(openStart, openReturn);
    assert.match(openBranch, /paintAppearancePreviewLayer\(renderedBackgroundColor, resolvedBackground, \{ deferCustomBackground \}\);/);
    assert.match(openBranch, /deferredAppearanceVisual = true;/,
      `${browser}: real background commit must remain deferred`);
    assert.doesNotMatch(openBranch, /page\.style\.background(?:Image|Color)|--page-bg/,
      `${browser}: Settings-open branch must never mutate the real full-viewport page background`);

    const afterReturn = body.slice(openReturn + "return;".length);
    assert.match(afterReturn, /document\.documentElement\.style\.setProperty\("--page-bg"/);
    assert.match(afterReturn, /page\.style\.backgroundColor = renderedBackgroundColor;/);
    assert.match(afterReturn, /page\.style\.backgroundImage =/,
      `${browser}: closed-Settings path must still commit the authoritative page wallpaper`);
  });

  test(`1.30.11 ${browser} restores the isolated Settings appearance preview surface outside critical CSS`, async () => {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const critical = await readFile(`src/shared/newtab/newtab-critical.css`, "utf8");
    const secondary = await readFile(`src/shared/newtab/newtab-secondary.css`, "utf8");
    assert.match(html, /id="appearancePreviewLayer"[\s\S]*?id="appearancePreviewImage"/);
    assert.doesNotMatch(critical, /appearance-preview-layer|appearance-preview-image/,
      `${browser}: Settings-only preview CSS must stay off the first-frame critical sheet`);
    assert.match(secondary, /\.appearance-preview-layer\{[\s\S]*?contain:\s*paint;/);
    assert.match(secondary, /\.appearance-preview-image\{[\s\S]*?object-fit:\s*cover;/);
  });

  test(`1.26.9 ${browser} applies the deferred authoritative appearance only after Settings closes and a frame boundary`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(js, /function closeSettingsPanel\(\)[\s\S]*?settingsDialog\.hidden = true;[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?!isSettingsOpen\(\)\) commitDeferredLauncherVisual\(\);/,
      `${browser}: deferred appearance must commit from the Settings close event on the next frame`);
    assert.match(js, /function commitDeferredLauncherVisual\(\)[\s\S]*?if \(isSettingsOpen\(\)\) return;[\s\S]*?deferredAppearanceVisual = false;[\s\S]*?if \(needsSettings\) \{[\s\S]*?applySettings\(\);/,
      `${browser}: deferred commit must refuse to repaint while Settings is still open`);

    const closeHelper = js.match(/function closeDialog\(dialog\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(closeHelper, `${browser}: closeDialog helper missing`);
    assert.doesNotMatch(closeHelper[1], /applySettings|commitDeferredLauncherVisual/,
      `${browser}: closeDialog itself must not repaint in the same call/frame`);
  });

  test(`1.26.9 ${browser} does not retain failed theme-wallpaper timing/storage workarounds`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.doesNotMatch(js, /themeWallpaperVisualGeneration|scheduleThemeWallpaperVisualRefresh|themeWallpaperPersistGeneration|themeWallpaperPersistQueue|ignoredThemeWriteStateSignatures|mosaicsync:set-theme-wallpapers/,
      `${browser}: failed 1.26.1-1.26.3 special-case machinery must stay removed`);
  });
}
