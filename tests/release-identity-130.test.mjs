import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const VERSION = "1.30.18.41";

test("1.30 has one exact release identity across public/runtime surfaces", () => {
  const ff = JSON.parse(fs.readFileSync("dist/firefox/manifest.json", "utf8"));
  const chrome = JSON.parse(fs.readFileSync("dist/chrome/manifest.json", "utf8"));
  const constants = fs.readFileSync("dist/firefox/core/constants.js", "utf8");
  const ffHtml = fs.readFileSync("dist/firefox/newtab/newtab.html", "utf8");
  const chromeHtml = fs.readFileSync("dist/chrome/newtab/newtab.html", "utf8");
  const readme = fs.readFileSync("README.md", "utf8");
  const devReadme = fs.readFileSync("README-DEVELOPMENT.md", "utf8");
  const releaseNotes = fs.readFileSync("docs/RELEASE-1.30.18.41.md", "utf8");
  const qa = fs.readFileSync("docs/QA-1.30.18.41.md", "utf8");
  const baseline = JSON.parse(fs.readFileSync("package-size-baseline.json", "utf8"));
  const buildManifest = JSON.parse(fs.readFileSync("build-manifest.json", "utf8"));
  assert.equal(ff.version, VERSION);
  assert.equal(chrome.version, VERSION);
  assert.equal(chrome.version_name, VERSION);
  assert.match(constants, new RegExp(`export const VERSION = "${VERSION.replaceAll(".", "\\.")}";`));
  assert.match(ffHtml, new RegExp(`MosaicSync · ${VERSION.replaceAll(".", "\\.")}`, "g"));
  assert.match(chromeHtml, new RegExp(`MosaicSync · ${VERSION.replaceAll(".", "\\.")}`, "g"));
  assert.match(readme, new RegExp(`Current source release: ${VERSION.replaceAll(".", "\\.")}`));
  assert.match(devReadme, /1\.30/);
  assert.match(releaseNotes, new RegExp(`^# MosaicSync ${VERSION.replaceAll(".", "\\.")} publication notes`, "m"));
  assert.match(releaseNotes, new RegExp(`## GitHub release title\\n\\n` + "`MosaicSync " + VERSION.replaceAll(".", "\\.") + "`"));
  assert.match(qa, new RegExp(`^# MosaicSync ${VERSION.replaceAll(".", "\\.")} QA / release-candidate checklist`, "m"));
  assert.equal(baseline.browsers.firefox.version, VERSION);
  assert.equal(baseline.browsers.chrome.version, VERSION);
  assert.equal(buildManifest.browsers.firefox.version, VERSION);
  assert.equal(buildManifest.browsers.chrome.version, VERSION);
});

test("1.30 public changelog keeps internal candidates out of the public release sequence", () => {
  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
  assert.match(changelog, new RegExp(`^## ${VERSION.replaceAll(".", "\\.")}\\n`));
  for (const unpublished of ["1.27.8", "1.27.8.1", "1.27.8.2", "1.27.8.3", "1.27.8.4", "1.27.8.5", "1.27.8.6", "1.27.8.7", "1.27.8.8", "1.26.13", "1.26.13b", "1.26.14", "1.26.15", "1.26.16", "1.26.17", "1.26.17.1", "1.26.17.2", "1.30.3"]) {
    assert.doesNotMatch(changelog, new RegExp(`^## ${unpublished.replaceAll(".", "\\.")}(?:\\s|$)`, "m"));
  }
  const headings = [...changelog.matchAll(/^## ([^\n]+)$/gm)].map(match => match[1]);
  assert.deepEqual(headings.slice(0, 40), [VERSION, "1.30.18.40", "1.30.18.39", "1.30.18.38", "1.30.18.37", "1.30.18.36", "1.30.18.35", "1.30.18.34", "1.30.18.33", "1.30.18.32", "1.30.18.31", "1.30.18.30", "1.30.18.29", "1.30.18.28", "1.30.18.27", "1.30.18.26 — withdrawn", "1.30.18.25", "1.30.18.24", "1.30.18.23", "1.30.18.22", "1.30.18.21", "1.30.18.20", "1.30.18.19", "1.30.18.18", "1.30.18.17", "1.30.18.16", "1.30.18.15", "1.30.18.14", "1.30.18.13", "1.30.18.12", "1.30.18.11", "1.30.18.10", "1.30.18.9", "1.30.18.8", "1.30.18.7", "1.30.18.6", "1.30.18.5", "1.30.18.4", "1.30.18.3", "1.30.18.2"]);
});
