import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const launcherOwnedSecondaryForbidden = [
  ".settings-button",
  ".bookmarks-button",
  ".brand",
  ".space-switcher",
  ".shortcut-grid",
  ".shortcut-slot",
  ".shortcut-card",
  ".shortcut-label",
  ".empty-state",
  ".frequent-sites",
  ".tile img",
  ".folder-mosaic-cell img",
  ".tile > img.artwork-layer",
  ".folder-mosaic-cell > img.artwork-layer"
];

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.5 ${browser} keeps launcher-visible CSS exclusively in the critical sheet`, () => {
    const critical = fs.readFileSync(`dist/${browser}/newtab/newtab-critical.css`, "utf8");
    const secondary = fs.readFileSync(`dist/${browser}/newtab/newtab-secondary.css`, "utf8");

    assert.match(critical, /\.settings-button\{/,
      "the launcher Settings control must remain fully styled by critical CSS");
    assert.match(critical, /\.tile img/);
    assert.match(critical, /\.folder-mosaic-cell img/);

    for (const selector of launcherOwnedSecondaryForbidden) {
      assert.equal(secondary.includes(selector), false,
        `${selector} is launcher-visible and must not be re-declared by deferred secondary CSS`);
    }

    assert.match(secondary, /\.folder-item-tile img\{/,
      "folder-popover image behavior remains in secondary UI CSS");
    assert.match(secondary, /\.folder-item-tile > img\.artwork-layer\{/,
      "folder-popover artwork layering remains in secondary UI CSS");
  });

  test(`1.27.8.5 ${browser} fences the vestigial monolithic stylesheet out of the runtime loading contract`, () => {
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    const loader = fs.readFileSync(`dist/${browser}/newtab/secondary-style-bootstrap.js`, "utf8");
    assert.doesNotMatch(html, /href=["']newtab\.css["']/,
      "New Tab must never link the vestigial monolithic stylesheet");
    assert.doesNotMatch(loader, /newtab\.css/,
      "the deferred loader must never fall back to the monolithic stylesheet");
    assert.match(loader, /newtab-secondary\.css/,
      "the deferred loader must load only the reviewed secondary stylesheet");
  });
}
