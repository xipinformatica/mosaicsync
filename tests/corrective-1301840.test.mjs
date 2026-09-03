import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(name) {
  return readFile(name, "utf8");
}

test("1.30.18.40 artwork help is hover-only, non-persistent and constrained to the editor", async () => {
  const [html, css] = await Promise.all([
    source("src/shared/newtab/newtab.html"),
    source("src/shared/newtab/newtab-secondary.css")
  ]);

  assert.doesNotMatch(html, /<details id="shortcutSyncImageInfo"/,
    "native details retains click-open state when the dialog is reused");
  assert.match(html, /<button id="shortcutSyncImageInfo"[^>]*type="button"[^>]*aria-describedby="shortcutSyncImageTooltip"[^>]*>\?<\/button>/);
  assert.match(html, /id="shortcutSyncImageTooltip" class="artwork-sync-popover" role="tooltip"/);
  assert.match(css, /\.artwork-sync-info-button:hover\s*\+\s*\.artwork-sync-popover/,
    "pointer hover over the question mark must reveal the help");
  assert.match(css, /\.artwork-sync-info-button:focus-visible\s*\+\s*\.artwork-sync-popover/,
    "keyboard users must retain an equivalent non-mouse path");
  assert.doesNotMatch(html, /shortcutSyncImageInfo[^>]*(?:open|aria-expanded)/,
    "the tooltip trigger must expose no persistent disclosure state");
  assert.match(css, /\.artwork-sync-popover\s*\{[^}]*left:\s*0;[^}]*width:\s*min\(420px, 100%\);[^}]*max-width:\s*100%;[^}]*pointer-events:\s*none;/s,
    "the tooltip must fit within the complete artwork row and close as soon as the pointer leaves the icon");
});

test("1.30.18.40 all four artwork actions share one desktop row", async () => {
  const [html, css] = await Promise.all([
    source("src/shared/newtab/newtab.html"),
    source("src/shared/newtab/newtab-secondary.css")
  ]);

  const actions = html.match(/<div class="row-actions">([\s\S]*?)<\/div>/)?.[1] || "";
  for (const id of ["shortcutImageFile", "chooseDetectedFavicon", "chooseBuiltinShortcutIcon", "clearShortcutImage"]) {
    assert.match(actions, new RegExp(`id="${id}"`), `${id} must remain in the common artwork-action group`);
  }
  assert.match(css, /@media \(min-width: 621px\)[\s\S]*?#shortcutDialog \.row-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
    "desktop and laptop editors must use one four-action row");
});

test("1.30.18.40 Light-mode field labels remain transparent while controls retain their surfaces", async () => {
  const css = await source("src/shared/newtab/newtab-critical.css");
  const labelRule = css.match(/:root\[data-effective-theme="light"\] \.field > span,\s*:root\[data-effective-theme="light"\] \.image-fieldset legend\s*\{([^}]*)\}/)?.[1] || "";
  const controlRule = css.match(/:root\[data-effective-theme="light"\] \.field input,\s*:root\[data-effective-theme="light"\] \.field select\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(labelRule, /background:\s*transparent/, "labels and legends must sit directly on the dialog surface");
  assert.doesNotMatch(labelRule, /background:\s*#fff/, "labels must never receive the input surface");
  assert.match(controlRule, /background:\s*#fff/, "actual Light-mode inputs and selects retain their control surface");
});
