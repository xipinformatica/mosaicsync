import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSiteHost, formatBytes, normalizeShortcutUrl, clearCanonicalHostCacheForTests } from "../dist/firefox/newtab/ui-utils.js";
import { compactSignature, syncNamespaceFor, trimExpectationMap, trimSessionEntries } from "../dist/firefox/background/runtime-utils.js";

test("New Tab URL helpers are deterministic", () => {
  clearCanonicalHostCacheForTests();
  assert.equal(canonicalSiteHost("https://www.Example.com/path"), "example.com");
  assert.equal(normalizeShortcutUrl("example.com"), "https://example.com/");
  assert.equal(normalizeShortcutUrl("127.0.0.1:8080/test"), "http://127.0.0.1:8080/test");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("background expectation helpers preserve limits and signatures", () => {
  const map = new Map([["old", { signature: "old", expiresAt: 1 }], ["a", { signature: "a", expiresAt: 100 }], ["b", { signature: "b", expiresAt: 100 }], ["c", { signature: "c", expiresAt: 100 }]]);
  trimExpectationMap(map, { max: 2 });
  assert.deepEqual([...map.keys()], ["b", "c"]);
  const entries = trimSessionEntries({ old: { signature: "old", expiresAt: 1 }, a: { signature: "a", expiresAt: 100 }, b: { signature: "b", expiresAt: 100 }, c: { signature: "c", expiresAt: 100 } }, { max: 2 });
  assert.deepEqual(Object.keys(entries), ["b", "c"]);
  assert.equal(compactSignature("abc"), compactSignature("abc"));
  const ns = syncNamespaceFor("work", { personalSpaceId:"personal", syncPrefix:"p.", syncSettingsKey:"ps", syncDatasetKey:"pd", syncItemPrefix:"pi.", syncAssetPrefix:"pa.", syncSpacePrefix:"space." });
  assert.equal(ns.settingsKey, "space.work.settings");
});
