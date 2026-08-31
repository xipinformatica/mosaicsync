import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.3 ${browser} bookmark color menu stays inside the active modal before entering top layer`, async () => {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    const match = js.match(/function showBookmarkFolderColorMenu\(event, folder\)\s*\{([\s\S]*?)\n  \}\n\n  function createBookmarkFolderButton/);
    assert.ok(match, `${browser}: bookmark color menu implementation missing`);
    const body = match[1];
    assert.match(body, /menu\.setAttribute\("popover",\s*"manual"\)[\s\S]*?bookmarksDialog\?\.append\(menu\)[\s\S]*?menu\.showPopover\(\)/,
      `${browser}: palette must remain a dialog descendant before top-layer promotion`);
    assert.doesNotMatch(body, /document\.body\.append\(menu\)/,
      `${browser}: modal palette must never be appended outside the modal dialog`);
    assert.match(body, /bookmarkFolderColors\[folderId\]\s*=\s*colorKey[\s\S]*?writeBookmarkFolderColors\(\)[\s\S]*?renderBookmarkBrowser\(\)/,
      `${browser}: clicking a swatch must persist and visibly rerender the folder color`);
    assert.match(js, /bookmarkColorMenu\.hidePopover\?\.\(\)/,
      `${browser}: bookmark color popover must be safely hidden during teardown`);
    assert.match(css, /\.bookmark-color-menu\[popover\]\s*\{[\s\S]*?margin:\s*0;[\s\S]*?inset:\s*auto;/,
      `${browser}: popover UA geometry must be reset before viewport positioning`);
    assert.match(css, /\.bookmark-folder-button\.has-folder-color,[\s\S]*?background:\s*var\(--bookmark-folder-color\)/,
      `${browser}: chosen folder color must fill the folder surface`);
  });

  test(`1.26.3 ${browser} light/dark wallpaper panel retains stable Settings spacing`, async () => {
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    assert.match(css, /\.theme-wallpaper-settings\s*\{[\s\S]*?margin-bottom:\s*10px;/,
      `${browser}: wallpaper panel must remain separated from the action row`);
  });

}
