import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function importedNamesFromPlatform(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']\.\.\/core\/platform\.js["']/g)) {
    for (const part of match[1].split(",")) {
      const local = part.trim().split(/\s+as\s+/i).at(-1)?.trim();
      if (local) names.add(local);
    }
  }
  return names;
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.13b ${browser} Frequently Visited imports the native top-sites adapter it calls`, async () => {
    const source = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(source, /await\s+getNativeTopSites\s*\(/, "Frequently Visited must use the browser adapter");
    assert.ok(importedNamesFromPlatform(source).has("getNativeTopSites"), "getNativeTopSites must be bound by an explicit platform import");
  });
}

test("1.26.13b Firefox top-sites adapter executes Firefox's native API and preserves the requested bound", async () => {
  let options = null;
  globalThis.browser = {
    topSites: {
      async get(received) {
        options = received;
        return [
          { title: "One", url: "https://one.example/" },
          { title: "Two", url: "https://two.example/" },
          { title: "Three", url: "https://three.example/" }
        ];
      }
    }
  };
  try {
    const module = await import(`../dist/firefox/core/platform.js?frequent-firefox-12613b=${Date.now()}`);
    const sites = await module.getNativeTopSites({ limit: 2 });
    assert.deepEqual(options, { newtab: true, includeFavicon: true, limit: 2 });
    assert.equal(sites.length, 2);
    assert.equal(sites[0].url, "https://one.example/");
  } finally {
    delete globalThis.browser;
  }
});
