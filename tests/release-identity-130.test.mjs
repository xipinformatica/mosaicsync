import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const VERSION = "1.30.15";

test("1.30 has one exact release identity across public/runtime surfaces", () => {
  const ff = JSON.parse(fs.readFileSync("dist/firefox/manifest.json", "utf8"));
  const chrome = JSON.parse(fs.readFileSync("dist/chrome/manifest.json", "utf8"));
  const constants = fs.readFileSync("dist/firefox/core/constants.js", "utf8");
  const ffHtml = fs.readFileSync("dist/firefox/newtab/newtab.html", "utf8");
  const chromeHtml = fs.readFileSync("dist/chrome/newtab/newtab.html", "utf8");
  const readme = fs.readFileSync("README.md", "utf8");
  const devReadme = fs.readFileSync("README-DEVELOPMENT.md", "utf8");
  const releaseNotes = fs.readFileSync("docs/RELEASE-1.30.15.md", "utf8");
  const qa = fs.readFileSync("docs/QA-1.30.15.md", "utf8");
  const baseline = JSON.parse(fs.readFileSync("package-size-baseline.json", "utf8"));
  const buildManifest = JSON.parse(fs.readFileSync("build-manifest.json", "utf8"));
  assert.equal(ff.version, VERSION);
  assert.equal(chrome.version, VERSION);
  assert.equal(chrome.version_name, VERSION);
  assert.match(constants, /export const VERSION = "1\.30\.15";/);
  assert.match(ffHtml, /MosaicSync · 1\.30\.15/g);
  assert.match(chromeHtml, /MosaicSync · 1\.30\.15/g);
  assert.match(readme, /Current source release: 1\.30\.15/);
  assert.match(devReadme, /1\.30/);
  assert.match(releaseNotes, /^# MosaicSync 1\.30\.15 publication notes/m);
  assert.match(releaseNotes, /## GitHub release title\n\n`MosaicSync 1\.30\.15`/);
  assert.match(qa, /^# MosaicSync 1\.30\.15 QA \/ release-candidate checklist/m);
  assert.equal(baseline.browsers.firefox.version, VERSION);
  assert.equal(baseline.browsers.chrome.version, VERSION);
  assert.equal(buildManifest.browsers.firefox.version, VERSION);
  assert.equal(buildManifest.browsers.chrome.version, VERSION);
});

test("1.30 public changelog keeps internal candidates out of the public release sequence", () => {
  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
  assert.match(changelog, /^## 1\.30\.15\n/);
  for (const unpublished of ["1.27.8", "1.27.8.1", "1.27.8.2", "1.27.8.3", "1.27.8.4", "1.27.8.5", "1.27.8.6", "1.27.8.7", "1.27.8.8", "1.26.13", "1.26.13b", "1.26.14", "1.26.15", "1.26.16", "1.26.17", "1.26.17.1", "1.26.17.2", "1.30.3"]) {
    assert.doesNotMatch(changelog, new RegExp(`^## ${unpublished.replaceAll(".", "\\.")}(?:\\s|$)`, "m"));
  }
  const headings = [...changelog.matchAll(/^## ([^\n]+)$/gm)].map(match => match[1]);
  assert.deepEqual(headings.slice(0, 15), [VERSION, "1.30.14", "1.30.13", "1.30.12", "1.30.11", "1.30.10", "1.30.9", "1.30.8", "1.30.7", "1.30.6", "1.30.5", "1.30.4", "1.30.2", "1.30.1", "1.27.9"]);
});
