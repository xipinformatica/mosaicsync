import test from "node:test";
import assert from "node:assert/strict";
import { collectComplexityInventory } from "../tools/complexity-inventory.mjs";

test("1.30.18.25 inventory proves New Tab has one canonical shared source owner", async () => {
  const inventory = await collectComplexityInventory();
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.sourceOwnership.browserNewTabCopies.firefox, false);
  assert.equal(inventory.sourceOwnership.browserNewTabCopies.chrome, false);
  assert.ok(inventory.sourceOwnership.sharedNewTab.files >= 10);
  assert.ok(inventory.sourceOwnership.sharedNewTab.bytes > 500_000);
});

test("1.30.18.25 inventory pins the intentional browser overlay topology", async () => {
  const { overlays } = (await collectComplexityInventory()).sourceOwnership;
  assert.deepEqual(overlays.firefox.files, [
    "background/background-adapter.js",
    "manifest.json"
  ]);
  assert.deepEqual(overlays.firefox.shadowsShared, []);
  assert.deepEqual(overlays.chrome.shadowsShared, [
    "core/i18n-platform.js",
    "core/permission-platform.js",
    "core/platform.js"
  ]);
  assert.ok(overlays.chrome.files.includes("background/background-adapter.js"));
  assert.ok(overlays.chrome.files.includes("core/browser-shim.js"));
  assert.ok(overlays.chrome.files.includes("manifest.json"));
});

test("1.30.18.25 complexity inventory is deterministic and reports source concentration without declaring dead code", async () => {
  const first = await collectComplexityInventory();
  const second = await collectComplexityInventory();
  assert.deepEqual(second, first);
  assert.match(first.sourceTreeSha256, /^[0-9a-f]{64}$/);
  const paths = new Set(first.concentrationCandidates.map(entry => entry.path));
  assert.ok(paths.has("src/shared/newtab/newtab.js"));
  assert.ok(paths.has("src/shared/background/background-core.js"));
  assert.ok(paths.has("src/shared/core/model.js"));
  assert.ok(paths.has("src/shared/core/storage.js"));
  for (const candidate of first.concentrationCandidates) {
    assert.equal(Object.hasOwn(candidate, "dead"), false,
      "Step 5.1 may identify concentration candidates but must not infer dead code from size alone");
  }
});
