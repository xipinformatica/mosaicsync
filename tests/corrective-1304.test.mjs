import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function exactRules(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`${escaped}\\{([^}]*)\\}`, "g"))].map((match) => match[1]);
}

function finalDeclaration(rules, property) {
  let value = "";
  const pattern = new RegExp(`(?:^|;)${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`, "g");
  for (const rule of rules) {
    for (const match of rule.matchAll(pattern)) value = match[1].trim();
  }
  return value;
}

test("1.30.4 Settings has one scroll owner: the outer Settings surface", async () => {
  const css = await text("src/shared/newtab/newtab-secondary.css");
  const outerRules = exactRules(css, ".settings-dialog");
  const innerRules = exactRules(css, ".settings-dialog .dialog-card");

  assert.ok(outerRules.length >= 1, "Settings outer selector must exist");
  assert.ok(innerRules.length >= 1, "Settings form selector must exist");
  assert.equal(finalDeclaration(outerRules, "overflow-y"), "auto");
  assert.equal(finalDeclaration(outerRules, "overflow-x"), "hidden");
  assert.equal(finalDeclaration(innerRules, "max-height"), "none");
  assert.equal(finalDeclaration(innerRules, "overflow"), "visible");
  assert.notEqual(finalDeclaration(innerRules, "overflow-y"), "auto");
});

test("1.30.4 changes scroll ownership without changing the 1.30.3 Settings container experiment", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const html = await text(`src/${browser}/newtab/newtab.html`);
    assert.match(html, /<aside id="settingsDialog"[^>]*role="dialog"[^>]*>/);
    assert.doesNotMatch(html, /<dialog id="settingsDialog"/);
    assert.match(html, /<form id="settingsForm" class="dialog-card settings-card">/);
  }
});

test("1.30.4 generated browser CSS preserves the single-scroll-owner contract", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = await text(`dist/${browser}/newtab/newtab-secondary.css`);
    const outerRules = exactRules(css, ".settings-dialog");
    const innerRules = exactRules(css, ".settings-dialog .dialog-card");
    assert.equal(finalDeclaration(outerRules, "overflow-y"), "auto", `${browser} outer Settings must scroll`);
    assert.equal(finalDeclaration(innerRules, "max-height"), "none", `${browser} inner Settings form must not own viewport max-height`);
    assert.equal(finalDeclaration(innerRules, "overflow"), "visible", `${browser} inner Settings form must be normal-flow paint content`);
  }
});

test("1.30.4 release packaging uses exactly the browser-labelled Firefox naming convention", async () => {
  const packager = await text("tools/package.py");
  assert.match(packager, /mosaicsync-\{version\}-firefox\.zip/);
  assert.match(packager, /mosaicsync-\{version\}-chrome\.zip/);
  assert.match(packager, /mosaicsync-\{version\}-github-ready\.zip/);
  assert.doesNotMatch(packager, /f"mosaicsync-\{version\}\.zip"/);
});
