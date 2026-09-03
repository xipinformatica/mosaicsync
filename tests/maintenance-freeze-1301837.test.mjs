import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const json = rel => JSON.parse(read(rel));

function staticBareImports(source) {
  const out = [];
  const re = /^\s*import(?:\s+[^;\n]*?\s+from\s+|\s*)["']([^"']+)["']/gm;
  for (const match of source.matchAll(re)) {
    const spec = match[1];
    if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("node:")) out.push(spec);
  }
  return out;
}

test("1.30.18.42 compatibility floors and permission budget stay explicit and least-privilege", () => {
  const firefox = json("src/firefox/manifest.json");
  const chrome = json("src/chrome/manifest.json");

  assert.equal(firefox.version, "1.30.18.42");
  assert.equal(chrome.version, "1.30.18.42");
  assert.equal(chrome.version_name, "1.30.18.42");
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, "140.0");
  assert.equal(chrome.minimum_chrome_version, "104");

  assert.deepEqual(firefox.permissions, ["storage", "alarms"]);
  assert.deepEqual(chrome.permissions, ["storage", "alarms", "favicon"]);
  assert.deepEqual(firefox.optional_permissions, ["topSites", "bookmarks"]);
  assert.deepEqual(chrome.optional_permissions, ["topSites", "bookmarks"]);
  assert.deepEqual(firefox.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.deepEqual(chrome.optional_host_permissions, ["http://*/*", "https://*/*"]);

  const forbidden = new Set(["tabs", "history", "cookies", "webRequest", "scripting", "downloads", "management", "nativeMessaging", "unlimitedStorage"]);
  for (const manifest of [firefox, chrome]) {
    for (const permission of [...manifest.permissions, ...manifest.optional_permissions]) {
      assert.equal(forbidden.has(permission), false, `unexpected broad permission ${permission}`);
    }
    assert.equal("content_scripts" in manifest, false);
    assert.equal("web_accessible_resources" in manifest, false);
    assert.equal("externally_connectable" in manifest, false);
  }
});

test("1.30.18.42 repository remains dependency-free and maintenance ESM uses built-ins/local modules only", () => {
  const pkg = json("package.json");
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    assert.deepEqual(pkg[key] || {}, {}, `${key} must remain empty unless deliberately reviewed`);
  }

  const roots = ["tools", "tests", "bench"];
  const bare = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && full.endsWith(".mjs")) {
        for (const spec of staticBareImports(fs.readFileSync(full, "utf8"))) bare.push([path.relative(ROOT, full), spec]);
      }
    }
  };
  for (const root of roots) walk(path.join(ROOT, root));
  assert.deepEqual(bare, []);
});

test("1.30.18.42 compatibility and maintenance policy preserve the reviewed freeze boundary", () => {
  const compatibility = read("docs/COMPATIBILITY.md");
  const policy = read("docs/MAINTENANCE-POLICY.md");
  const infrastructure = read("docs/MAINTENANCE-INFRASTRUCTURE.md");

  for (const token of ["Firefox: 140+", "Chromium / Chrome: 104+", "Chrome 104 introduced", "no npm runtime or development dependencies", "least-privilege"]) {
    assert.match(compatibility, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  for (const trigger of ["demonstrated production bug", "browser/platform/API compatibility", "security or privacy", "measurable maintenance problem", "approved product/feature objective"]) {
    assert.match(policy, new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(policy, /large file.*not.*sufficient|large file[\s\S]*not sufficient/i);
  assert.match(infrastructure, /Completed in 1\.30\.18\.37/);
  assert.match(infrastructure, /no planned M7/i);
  assert.match(infrastructure, /1\.30\.18\.38[\s\S]*post-audit corrective/i);
});

test("1.30.18.42 architecture map links the permanent post-freeze compatibility and maintenance references", () => {
  const architecture = read("docs/ARCHITECTURE.md");
  assert.match(architecture, /docs\/COMPATIBILITY\.md/);
  assert.match(architecture, /docs\/MAINTENANCE-POLICY\.md/);
  assert.ok(fs.existsSync(path.join(ROOT, "docs", "PRE-M6-AUDIT-1.30.18.36.md")));
});
