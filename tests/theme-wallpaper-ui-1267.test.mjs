import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const browser of ['firefox','chrome']) {
  test(`1.26.7 ${browser} theme wallpaper cards declare explicit light/dark appearances`, async () => {
    const html = await readFile(new URL(`../src/${browser}/newtab/newtab.html`, import.meta.url), 'utf8');
    assert.match(html, /id="settingsLightWallpaper" class="theme-wallpaper-choice" data-appearance="light"/);
    assert.match(html, /id="settingsDarkWallpaper" class="theme-wallpaper-choice" data-appearance="dark"/);
  });

  test(`1.26.7 ${browser} theme wallpaper card styling distinguishes light and dark cards`, async () => {
    const css = await readFile(new URL(`../src/${browser}/newtab/newtab.css`, import.meta.url), 'utf8');
    assert.match(css, /\.theme-wallpaper-choice\[data-appearance="light"\]\s*\{/);
    assert.match(css, /\.theme-wallpaper-choice\[data-appearance="dark"\]\s*\{/);
    assert.match(css, /\.theme-wallpaper-choice\[data-appearance="light"\] \.theme-wallpaper-choice-preview\s*\{/);
    assert.match(css, /\.theme-wallpaper-choice\[data-appearance="dark"\] \.theme-wallpaper-choice-preview\s*\{/);
  });
}
