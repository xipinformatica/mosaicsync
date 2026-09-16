import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSiteHost, clearCanonicalHostCacheForTests, getCanonicalHostCacheSizeForTests } from "../dist/firefox/newtab/ui-utils.js";
import { BACKGROUND_PRELOAD_CACHE_MAX, FREQUENT_TOP_SITES_LIMIT, LOADED_LOCALE_CATALOG_MAX, MAX_EXPECTATIONS, PENDING_NAVIGATION_MAX_ENTRIES } from "../dist/firefox/core/constants.js";

test("hot-path caches have explicit finite limits", () => {
  for (const value of [BACKGROUND_PRELOAD_CACHE_MAX, FREQUENT_TOP_SITES_LIMIT, LOADED_LOCALE_CATALOG_MAX, MAX_EXPECTATIONS, PENDING_NAVIGATION_MAX_ENTRIES]) {
    assert.ok(Number.isInteger(value) && value > 0 && value <= 1024);
  }
});

test("canonical URL cache remains bounded under hostile/high-cardinality input", () => {
  clearCanonicalHostCacheForTests();
  for (let i = 0; i < 2000; i += 1) canonicalSiteHost(`https://host-${i}.example.test/path/${i}`);
  assert.ok(getCanonicalHostCacheSizeForTests() <= 256);
  clearCanonicalHostCacheForTests();
});
