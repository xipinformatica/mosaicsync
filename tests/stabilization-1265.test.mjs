import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.9 ${browser} applies theme skin and effective wallpaper immediately while Settings is open`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");

    const skin = js.match(/function applyThemeSkinVisual\(\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(skin, `${browser}: live theme-skin helper missing`);
    assert.match(skin[1], /document\.documentElement\.dataset\.theme = configuredTheme;/);
    assert.match(skin[1], /document\.documentElement\.dataset\.effectiveTheme = theme;/);
    assert.match(skin[1], /document\.documentElement\.style\.colorScheme = theme;/);
    assert.match(skin[1], /updateThemeToggle\(\);/);
    assert.doesNotMatch(skin[1], /backgroundImage|backgroundColor|--page-bg|applySettings\s*\(/,
      `${browser}: theme-skin helper must remain independent from wallpaper painting`);

    const transition = js.match(/function applyThemeTransition\(\)\s*\{([\s\S]*?)\n  \}\n\n  function commitDeferredAppearanceVisual/);
    assert.ok(transition, `${browser}: appearance transition helper missing`);
    assert.match(transition[1], /if \(settingsDialog\?\.open\)[\s\S]*?applyThemeSkinVisual\(\);[\s\S]*?applyPageBackgroundVisual\(\);[\s\S]*?return;/,
      `${browser}: open Settings must receive both live theme skin and isolated wallpaper preview`);
    const openBranch = transition[1].split("return;")[0];
    assert.doesNotMatch(openBranch, /applySettings\s*\(/,
      `${browser}: live theme switching must not call the full renderer under Settings`);
  });

  test(`1.26.9 ${browser} previews active day/night wallpaper changes without touching the real page surface`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const helper = js.match(/function applyThemeWallpaperVisualSafely\(previousPresetId, previousImageValue\)\s*\{([\s\S]*?)\n  \}\n\n  function stampThemeWallpaperMutation/);
    assert.ok(helper, `${browser}: wallpaper paint guard missing`);
    assert.match(helper[1], /if \(settingsDialog\?\.open\)[\s\S]*?applyPageBackgroundVisual\(\);[\s\S]*?return;/,
      `${browser}: active wallpaper changes must use the isolated live preview under Settings`);
    const openBranch = helper[1].split("return;")[0];
    assert.doesNotMatch(openBranch, /applySettings\s*\(/,
      `${browser}: Settings-open wallpaper branch must not invoke the full renderer`);
  });

  test(`1.26.9 ${browser} background helper isolates Settings-open painting from .page`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const helper = js.match(/function applyPageBackgroundVisual\(\{ deferHeavyAssets = false \} = \{\}\)\s*\{([\s\S]*?)\n  \}\n\n  function applyThemeSkinVisual/);
    assert.ok(helper, `${browser}: safe page-background helper missing`);
    const body = helper[1];
    const openStart = body.indexOf("if (settingsDialog?.open)");
    const openReturn = body.indexOf("return;", openStart);
    assert.ok(openStart >= 0 && openReturn > openStart, `${browser}: Settings-open isolation branch missing`);
    const openBranch = body.slice(openStart, openReturn);
    assert.match(openBranch, /paintAppearancePreviewLayer\(/,
      `${browser}: Settings-open background must paint the isolated preview layer`);
    assert.match(openBranch, /deferredAppearanceVisual = true;/,
      `${browser}: real background commit must remain deferred`);
    assert.doesNotMatch(openBranch, /page\.style\.background(?:Image|Color)|--page-bg/,
      `${browser}: Settings-open branch must never mutate the real full-viewport page background`);

    const afterReturn = body.slice(openReturn + "return;".length);
    assert.match(afterReturn, /document\.documentElement\.style\.setProperty\("--page-bg"/);
    assert.match(afterReturn, /page\.style\.backgroundColor = renderedBackgroundColor;/);
    assert.match(afterReturn, /page\.style\.backgroundImage =/,
      `${browser}: closed-Settings path must still commit the authoritative page wallpaper`);
    assert.match(afterReturn, /clearAppearancePreviewLayer\(\);/,
      `${browser}: preview layer must be released after the authoritative commit`);
  });

  test(`1.26.9 ${browser} uses a paint-contained preview layer below canvas content`, async () => {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const css = await readFile(`dist/${browser}/newtab/newtab.css`, "utf8");
    assert.match(html, /<main id="page"[^>]*>\s*<div id="appearancePreviewLayer" class="appearance-preview-layer" hidden aria-hidden="true"><img id="appearancePreviewImage" class="appearance-preview-image" alt="" aria-hidden="true" hidden><\/div>/,
      `${browser}: isolated appearance preview layer must be the first page child`);
    const layer = css.match(/\.appearance-preview-layer\s*\{([\s\S]*?)\n\}/);
    assert.ok(layer, `${browser}: preview layer CSS missing`);
    assert.match(layer[1], /position:\s*fixed;/);
    assert.match(layer[1], /inset:\s*0;/);
    assert.match(layer[1], /z-index:\s*0;/);
    assert.match(layer[1], /pointer-events:\s*none;/);
    assert.match(layer[1], /contain:\s*paint;/,
      `${browser}: preview layer should isolate its paint invalidation`);
    assert.doesNotMatch(layer[1], /backdrop-filter|filter:|background-image/,
      `${browser}: preview layer must avoid compositor filters and CSS background-image mutation`);
    const image = css.match(/\.appearance-preview-image\s*\{([\s\S]*?)\n\}/);
    assert.ok(image, `${browser}: preview image CSS missing`);
    assert.match(image[1], /object-fit:\s*cover;/);
    assert.doesNotMatch(image[1], /filter:|backdrop-filter/,
      `${browser}: preview image must stay a plain image surface`);
  });

  test(`1.26.9 ${browser} applies the deferred authoritative appearance only after Settings closes and a frame boundary`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(js, /settingsDialog\?\.addEventListener\("close", \(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?!settingsDialog\?\.open\) commitDeferredAppearanceVisual\(\);/,
      `${browser}: deferred appearance must commit from the Settings close event on the next frame`);
    assert.match(js, /function commitDeferredAppearanceVisual\(\)[\s\S]*?if \(!deferredAppearanceVisual \|\| settingsDialog\?\.open\) return;[\s\S]*?deferredAppearanceVisual = false;[\s\S]*?applySettings\(\);/,
      `${browser}: deferred commit must refuse to repaint while Settings is still open`);

    const closeHelper = js.match(/function closeDialog\(dialog\)\s*\{([\s\S]*?)\n  \}/);
    assert.ok(closeHelper, `${browser}: closeDialog helper missing`);
    assert.doesNotMatch(closeHelper[1], /applySettings|commitDeferredAppearanceVisual/,
      `${browser}: closeDialog itself must not repaint in the same call/frame`);
  });

  test(`1.26.9 ${browser} does not retain failed theme-wallpaper timing/storage workarounds`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.doesNotMatch(js, /themeWallpaperVisualGeneration|scheduleThemeWallpaperVisualRefresh|themeWallpaperPersistGeneration|themeWallpaperPersistQueue|ignoredThemeWriteStateSignatures|mosaicsync:set-theme-wallpapers/,
      `${browser}: failed 1.26.1-1.26.3 special-case machinery must stay removed`);
  });
}
