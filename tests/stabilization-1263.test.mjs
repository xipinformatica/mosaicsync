import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.3 ${browser} colored bookmark folders use the full chosen color`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const css = await readFile(`dist/${browser}/newtab/newtab.css`, "utf8");
    assert.match(js, /--bookmark-folder-contrast[\s\S]*?hexLuminance\(color\)/,
      `${browser}: folder colors must select a readable text contrast`);
    assert.match(css, /\.bookmark-folder-button\.has-folder-color,[\s\S]*?background:\s*var\(--bookmark-folder-color\);[\s\S]*?color:\s*var\(--bookmark-folder-contrast\);/,
      `${browser}: the full folder surface must use the chosen color`);
    assert.match(css, /\.bookmark-folder-button\.has-folder-color\.selected[\s\S]*?box-shadow:/,
      `${browser}: colored selected folders must retain a visible selection state`);
  });

  test(`1.26.3 ${browser} separate wallpapers use visual buttons instead of native selects`, async () => {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const css = await readFile(`dist/${browser}/newtab/newtab.css`, "utf8");
    assert.match(html, /id="settingsLightWallpaper" class="theme-wallpaper-choice"/);
    assert.match(html, /id="settingsDarkWallpaper" class="theme-wallpaper-choice"/);
    assert.doesNotMatch(html, /<select id="settings(?:Light|Dark)Wallpaper"/,
      `${browser}: native theme wallpaper selects must not return`);
    assert.match(css, /\.theme-wallpaper-choice-preview\s*\{/,
      `${browser}: theme choices must expose a visual wallpaper preview`);
  });

  test(`1.26.5 ${browser} theme wallpaper persistence reuses the ordinary audited state path`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const bg = await readFile(`dist/${browser}/background/background.js`, "utf8");
    const storage = await readFile(`dist/${browser}/core/storage.js`, "utf8");
    assert.match(js, /function queueThemeWallpaperPersistence\(\)[\s\S]*?scheduleBackgroundPersist\(180\)/,
      `${browser}: theme wallpaper changes should use the existing debounced save path`);
    assert.doesNotMatch(js, /mosaicsync:set-theme-wallpapers|ignoredThemeWriteStateSignatures|persistThemeWallpaperSettingsNow|scheduleThemeWallpaperPersist/,
      `${browser}: obsolete special-case UI persistence must stay removed`);
    assert.doesNotMatch(bg, /mosaicsync:set-theme-wallpapers|setThemeWallpaperSettingsFromUi|writeThemeWallpaperSettings/,
      `${browser}: obsolete background message/writer route must stay removed`);
    assert.doesNotMatch(storage, /export async function writeThemeWallpaperSettings/,
      `${browser}: storage must not regain the duplicate three-field writer`);
  });

  test(`1.26.3 ${browser} project links include the canonical GitHub repository between MPL and Support`, async () => {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    assert.match(html, /#license"[^>]*>MPL 2\.0<\/a>\s*<a href="https:\/\/github\.com\/xipinformatica\/mosaicsync"[^>]*>GitHub<\/a>\s*<a id="settingsSupportLink"/,
      `${browser}: Settings project links must contain the canonical GitHub link in the requested position`);
  });
}

test("1.26.3 welcome project links also expose the canonical GitHub repository", async () => {
  const html = await readFile("dist/firefox/welcome/welcome.html", "utf8");
  assert.match(html, /#license"[^>]*>MPL 2\.0<\/a>\s*<a href="https:\/\/github\.com\/xipinformatica\/mosaicsync"[^>]*>GitHub<\/a>\s*<a id="welcomeSupportLink"/);
});
