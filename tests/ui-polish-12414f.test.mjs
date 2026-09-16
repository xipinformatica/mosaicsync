import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeViewportTooltipPosition } from "../dist/firefox/core/viewport-tooltip.js";

const PREPARING_COPY = "The donation page is still being prepared";

test("1.24.14f: viewport tooltip position is clamped at the right edge", () => {
  const pos = computeViewportTooltipPosition({
    anchorRect: { left: 470, right: 490, top: 220, bottom: 240, width: 20, height: 20 },
    tooltipWidth: 320,
    tooltipHeight: 100,
    viewportWidth: 500,
    viewportHeight: 400,
    gap: 8,
    margin: 12
  });
  assert.equal(pos.left, 168);
  assert.equal(pos.top, 112);
  assert.equal(pos.placement, "above");
});

test("1.24.14f: viewport tooltip flips below when there is no room above", () => {
  const pos = computeViewportTooltipPosition({
    anchorRect: { left: 20, right: 40, top: 6, bottom: 26, width: 20, height: 20 },
    tooltipWidth: 280,
    tooltipHeight: 120,
    viewportWidth: 360,
    viewportHeight: 500,
    gap: 8,
    margin: 12
  });
  assert.equal(pos.left, 12);
  assert.equal(pos.top, 34);
  assert.equal(pos.placement, "below");
});

test("1.24.14f: Ko-fi is the live donate target and stale preparation UI is gone", async () => {
  const constants = await readFile("dist/firefox/core/constants.js", "utf8");
  assert.match(constants, /export const DONATE_URL = "https:\/\/ko-fi\.com\/mosaicsync";/);

  for (const browser of ["firefox", "chrome"]) {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    assert.equal(html.includes(PREPARING_COPY), false, `${browser}: stale donation preparation hint`);
    assert.equal(js.includes('t("donationSoon")'), false, `${browser}: obsolete donation fallback`);
    assert.match(js, /installViewportTooltips\(document, \{ wrapperSelector: "\.sync-help-wrap"/);
    assert.match(css, /\.sync-help-tooltip\.viewport-tooltip-active\s*\{/);
  }

  const welcomeHtml = await readFile("dist/firefox/welcome/welcome.html", "utf8");
  const welcomeJs = await readFile("dist/firefox/welcome/welcome.js", "utf8");
  const welcomeCss = await readFile("dist/firefox/welcome/welcome.css", "utf8");
  assert.equal(welcomeHtml.includes(PREPARING_COPY), false);
  assert.equal(welcomeJs.includes('t("donationSoon")'), false);
  assert.match(welcomeJs, /installViewportTooltips\(document, \{ wrapperSelector: "\.help-wrap"/);
  assert.match(welcomeCss, /\.help-tooltip\.viewport-tooltip-active\s*\{/);
});

test("1.24.14f: obsolete donation-preparation localization keys are removed from all catalogs", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const en = await import(`../dist/${browser}/core/i18n-locales/en.js?${Date.now()}-${browser}`);
    assert.equal(Object.hasOwn(en.MESSAGES, "donationSoon"), false);
    assert.equal(Object.hasOwn(en.MESSAGES, "donationPreparing"), false);
  }
});
