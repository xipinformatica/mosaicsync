import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const VERSION = "1.30.18.24";
const FIREFOX_KEYS = [
  "action", "author", "background", "browser_specific_settings", "chrome_settings_overrides",
  "chrome_url_overrides", "content_security_policy", "default_locale", "description", "homepage_url",
  "icons", "manifest_version", "name", "optional_host_permissions", "optional_permissions",
  "permissions", "short_name", "version"
].sort();
const CHROME_KEYS = [
  "action", "author", "background", "chrome_url_overrides", "content_security_policy", "default_locale",
  "description", "homepage_url", "icons", "manifest_version", "minimum_chrome_version", "name",
  "optional_host_permissions", "optional_permissions", "permissions", "short_name", "version", "version_name"
].sort();

test("1.30.18 production manifests match the approved browser/store capability contract", async () => {
  const ff = JSON.parse(fs.readFileSync("dist/firefox/manifest.json", "utf8"));
  const chrome = JSON.parse(fs.readFileSync("dist/chrome/manifest.json", "utf8"));

  assert.deepEqual(Object.keys(ff).sort(), FIREFOX_KEYS);
  assert.deepEqual(Object.keys(chrome).sort(), CHROME_KEYS);

  assert.equal(ff.version, VERSION);
  assert.equal(chrome.version, VERSION);
  assert.equal(chrome.version_name, VERSION);
  assert.equal(chrome.minimum_chrome_version, "104", "MV3 _favicon API is available from Chrome 104");

  assert.deepEqual(ff.permissions, ["storage", "alarms"]);
  assert.deepEqual(chrome.permissions, ["storage", "alarms", "favicon"]);
  assert.deepEqual(ff.optional_permissions, ["topSites", "bookmarks"]);
  assert.deepEqual(chrome.optional_permissions, ["topSites", "bookmarks"]);
  assert.deepEqual(ff.optional_host_permissions, ["http://*/*", "https://*/*"]);
  assert.deepEqual(chrome.optional_host_permissions, ["http://*/*", "https://*/*"]);

  assert.deepEqual(Object.keys(ff.browser_specific_settings).sort(), ["gecko"]);
  assert.equal(Object.hasOwn(ff.browser_specific_settings, "gecko_android"), false,
    "Firefox production must remain desktop-only until Android support is deliberately implemented/tested");
  assert.equal(ff.browser_specific_settings.gecko.id, "mosaicsync@xipinformatica.cat");
  assert.equal(ff.browser_specific_settings.gecko.strict_min_version, "140.0");
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, {
    required: ["none"],
    optional: ["browsingActivity", "technicalAndInteraction"]
  });

  assert.deepEqual(ff.chrome_settings_overrides, { homepage: "newtab/newtab.html" },
    "Firefox Home/new-window behavior is intentional");
  assert.equal(Object.hasOwn(chrome, "chrome_settings_overrides"), false,
    "Chrome intentionally overrides New Tab only");
  assert.equal(Object.hasOwn(chrome, "browser_specific_settings"), false);
});

test("1.30.18 Firefox data-collection categories are backed by explicit browser-native-Sync rationales", async () => {
  const constants = await import(`${pathToFileURL(process.cwd() + "/dist/firefox/core/constants.js").href}?contract=${Date.now()}`);
  const declared = JSON.parse(fs.readFileSync("dist/firefox/manifest.json", "utf8"))
    .browser_specific_settings.gecko.data_collection_permissions.optional;
  assert.deepEqual(constants.SYNC_DATA_COLLECTION_TYPES, declared);
  assert.deepEqual(Object.keys(constants.SYNC_DATA_COLLECTION_RATIONALE), declared);
  for (const type of declared) {
    assert.equal(typeof constants.SYNC_DATA_COLLECTION_RATIONALE[type], "string");
    assert.ok(constants.SYNC_DATA_COLLECTION_RATIONALE[type].length >= 80, `${type} rationale must remain substantive`);
  }
  assert.match(constants.SYNC_DATA_COLLECTION_RATIONALE.browsingActivity, /shortcut URLs/i);
  assert.match(constants.SYNC_DATA_COLLECTION_RATIONALE.technicalAndInteraction, /settings|configuration/i);
});

test("1.30.18 deterministic release-contract scanner accepts both built runtime trees", () => {
  const result = spawnSync("python", ["tools/release_contract.py"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release contract OK/);
});
