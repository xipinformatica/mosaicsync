import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
const js = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
const critical = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
const secondary = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");

function ruleFor(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\{([^}]*)\\}`).exec(css);
  return match?.[1] || "";
}

test("1.32.1.1 removes the independently positioned branding surface that overlapped Spaces", () => {
  assert.equal(html.includes('id="customBrandingDisplay"'), false);
  assert.equal(secondary.includes(".custom-branding-display"), false);
  const activeRule = ruleFor(secondary, ".brand-button.custom-branding-active");
  assert.ok(activeRule, "custom branding must style the existing brand button");
  assert.doesNotMatch(activeRule, /position\s*:/);
  assert.doesNotMatch(activeRule, /left\s*:\s*50%/);
  assert.doesNotMatch(activeRule, /top\s*:/);
});

test("1.32.1.1 custom logo and text replace the built-in MosaicSync mark and name", () => {
  assert.match(html, /<header class="brand"[^>]*>[\s\S]*id="brandMark"[\s\S]*id="brandName"/);
  assert.match(js, /brandHelloButton\?\.classList\.toggle\("custom-branding-active", visible\)/);
  assert.match(js, /brandMark\.src = branding\.logo/);
  assert.match(js, /brandName\.textContent = branding\.text \|\| ""/);
  assert.match(js, /brandMark\.src = "\.\.\/assets\/icon\.svg"/);
  assert.match(js, /brandName\.textContent = PRODUCT_NAME/);
});

test("1.32.1.1 keeps the Hello mascot inside the same brand button", () => {
  const brandBlock = /<span id="brandHelloButton" class="brand-button">([\s\S]*?)<\/header>/.exec(html)?.[1] || "";
  assert.match(brandBlock, /id="brandMark"/);
  assert.match(brandBlock, /id="brandHelloEasterEgg"/);
  assert.match(brandBlock, /id="brandName"/);
  assert.match(js, /brandHelloButton\?\.addEventListener\("mouseenter", triggerBrandHello\)/);
});

test("1.32.1.1 preserves the established upper-left brand and centered Spaces geometry", () => {
  const brandRule = ruleFor(critical, ".brand");
  const spacesRule = ruleFor(critical, ".space-switcher");
  assert.match(brandRule, /position:\s*fixed/);
  assert.match(brandRule, /top:\s*31px/);
  assert.match(brandRule, /left:\s*48px/);
  assert.match(spacesRule, /left:\s*50%/);
  assert.match(spacesRule, /transform:\s*translateX\(-50%\)/);
  assert.equal(secondary.includes(".space-switcher"), false, "branding correction must not reposition the Space selector");
});

test("1.32.1.1 supports horizontal custom logos without distorting their aspect ratio", () => {
  const markRule = ruleFor(secondary, ".brand-button.custom-branding-active .brand-mark");
  assert.match(markRule, /width:auto/);
  assert.match(markRule, /max-width:180px/);
  assert.match(markRule, /height:auto/);
  assert.match(markRule, /max-height:52px/);
  assert.match(markRule, /object-fit:contain/);
});
