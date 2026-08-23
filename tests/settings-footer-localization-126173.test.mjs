import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MESSAGES as FR } from "../dist/firefox/core/i18n-locales/fr.js";

const footerTrack = /\.sync-compact-footer\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(min-content,\s*max-content\)\s+auto;/s;
const oldUnsafeTrack = /\.sync-compact-footer\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/s;

function ruleFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

test("1.26.17.3 localized Sync footer reserves independent non-overlapping tracks", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = await readFile(`dist/${browser}/newtab/newtab.css`, "utf8");
    assert.match(css, footerTrack, `${browser} must use localization-safe footer tracks`);
    assert.doesNotMatch(css, oldUnsafeTrack, `${browser} must not restore the middle-column overflow layout`);

    const delay = ruleFor(css, ".sync-delay-compact");
    const privacy = ruleFor(css, ".sync-privacy-hover");
    const danger = ruleFor(css, ".sync-compact-footer .danger-text-button");
    assert.match(delay, /white-space:\s*normal/);
    assert.match(delay, /min-width:\s*0/);
    assert.match(privacy, /white-space:\s*normal/);
    assert.match(privacy, /min-width:\s*0/);
    assert.match(danger, /white-space:\s*nowrap/);
  }
});

test("French regression strings remain unchanged while layout handles their length", () => {
  assert.equal(FR.firefoxHandlesChangesBackground, "Firefox gère les modifications en arrière-plan");
  assert.equal(FR.whyFirefoxSync, "Pourquoi Firefox Sync ?");
  assert.equal(FR.clearSyncCopy, "Effacer la copie Sync");
});
