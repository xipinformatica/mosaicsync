import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const VERSION = "1.26.16";

test("1.26.16 has one exact release identity across public/runtime surfaces", () => {
  const ff = JSON.parse(fs.readFileSync("dist/firefox/manifest.json", "utf8"));
  const chrome = JSON.parse(fs.readFileSync("dist/chrome/manifest.json", "utf8"));
  const constants = fs.readFileSync("dist/firefox/core/constants.js", "utf8");
  const ffHtml = fs.readFileSync("dist/firefox/newtab/newtab.html", "utf8");
  const chromeHtml = fs.readFileSync("dist/chrome/newtab/newtab.html", "utf8");
  const readme = fs.readFileSync("README.md", "utf8");
  assert.equal(ff.version, VERSION);
  assert.equal(chrome.version, VERSION);
  assert.equal(chrome.version_name, VERSION);
  assert.match(constants, /export const VERSION = "1\.26\.16";/);
  assert.match(ffHtml, /MosaicSync · 1\.26\.16/);
  assert.match(chromeHtml, /MosaicSync · 1\.26\.16/);
  assert.match(readme, /Current source release: 1\.26\.16/);
});

test("1.26.16 public changelog does not invent standalone unpublished releases", () => {
  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
  assert.match(changelog, /^## 1\.26\.16\n/);
  for (const unpublished of ["1.26.13", "1.26.13b", "1.26.14", "1.26.15"]) {
    assert.doesNotMatch(changelog, new RegExp(`^## ${unpublished.replaceAll(".", "\\\\.")}(?:\\s|$)`, "m"));
  }
  assert.match(changelog, /^## 1\.26\.12\n/m);
});
