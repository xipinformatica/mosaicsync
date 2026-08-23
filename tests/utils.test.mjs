import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSiteHost, formatBytes, normalizeShortcutUrl, clearCanonicalHostCacheForTests } from "../dist/firefox/newtab/ui-utils.js";
import { compactSignature, pruneExpectationMap, pruneSessionEntries, syncNamespaceFor } from "../dist/firefox/background/runtime-utils.js";

test("New Tab URL helpers are deterministic", () => {
  clearCanonicalHostCacheForTests();
  assert.equal(canonicalSiteHost("https://www.Example.com/path"), "example.com");
  assert.equal(normalizeShortcutUrl("example.com"), "https://example.com/");
  assert.equal(normalizeShortcutUrl("127.0.0.1:8080/test"), "http://127.0.0.1:8080/test");
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("background expectation helpers preserve limits and signatures", () => {
  const map = new Map([["old", 1], ["a", 100], ["b", 100], ["c", 100]]);
  pruneExpectationMap(map, { now: 50, max: 2 });
  assert.deepEqual([...map.keys()], ["b", "c"]);
  const entries = pruneSessionEntries({ old: 1, a: 100, b: 100, c: 100 }, { now: 50, max: 2 });
  assert.deepEqual(Object.keys(entries), ["b", "c"]);
  assert.equal(compactSignature("abc"), compactSignature("abc"));
  const ns = syncNamespaceFor("work", { personalSpaceId:"personal", syncPrefix:"p.", syncSettingsKey:"ps", syncDatasetKey:"pd", syncItemPrefix:"pi.", syncAssetPrefix:"pa.", syncSpacePrefix:"space." });
  assert.equal(ns.settingsKey, "space.work.settings");
});
