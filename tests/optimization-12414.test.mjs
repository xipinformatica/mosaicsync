import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

async function text(path) { return readFile(path, "utf8"); }

function functionBody(source, name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  throw new Error(`Could not parse ${name}`);
}

test("1.24.14 mutation-time quota refresh skips display-only category accounting", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = await text(`src/${browser}/background/background.js`);
    const body = functionBody(source, "refreshQuota");
    assert.match(body, /getBytesInUse\(null\)/);
    assert.match(body, /storage\.sync\.get\(null\)/);
    assert.doesNotMatch(body, /syncUsageBreakdown\(/);
    assert.match(source, /async function getSyncStatus\(\)[\s\S]*syncUsageBreakdown\(all, usedBytes\)/);
  }
});

test("1.24.14 removes confirmed dead compatibility-neutral helpers", async () => {
  const constants = await text("src/shared/core/constants.js");
  const storage = await text("src/shared/core/storage.js");
  const importer = await text("src/shared/core/importer.js");
  assert.doesNotMatch(constants, /SYNC_SPACES_DATASET_KEY|SYNC_SPACES_SETTINGS_KEY/);
  assert.doesNotMatch(storage, /export async function hydrateLocalAssetsForSpace\(/);
  assert.doesNotMatch(storage, /export function releaseLocalAssetsForSpace\(/);
  assert.doesNotMatch(importer, /optimizeFirefoxShortcutFavicons/);
});

test("1.24.14 source package contains the reproducible worst-case benchmark fixture", async () => {
  await access("fixtures/worst-case-profile.mjs");
  const fixture = await import("../fixtures/worst-case-profile.mjs");
  const profile = fixture.makeWorstCaseProfile({ count: 200, imageBytes: 512, backgroundBytes: 2048 });
  let shortcuts = 0;
  for (const item of profile.spaces.personal.shortcuts) {
    shortcuts += item?.type === "folder" ? item.items.length : 1;
  }
  assert.equal(shortcuts, 200);
});

test("1.24.14 asset-id memo preserves exact content identity", async () => {
  const model = await import("../dist/firefox/core/model.js");
  const first = "data:image/png;base64,AAAA";
  const second = "data:image/png;base64,AAAB";
  const memo = new Map();
  const firstId = model.assetIdForDataUrl(first, memo);
  assert.equal(firstId, model.assetIdForDataUrl(first));
  assert.equal(model.assetIdForDataUrl(first, memo), firstId);
  const secondId = model.assetIdForDataUrl(second, memo);
  assert.equal(secondId, model.assetIdForDataUrl(second));
  assert.notEqual(secondId, firstId, "same-length different bytes must never share an asset id");
  assert.equal(memo.size, 2);
});

test("1.24.14 memoized normalization and projection are byte-equivalent to uncached paths", async () => {
  const model = await import("../dist/firefox/core/model.js");
  const assets = await import("../dist/firefox/core/local-assets.js");
  const fixture = await import("../fixtures/worst-case-profile.mjs");
  const raw = fixture.makeWorstCaseProfile({ count: 24, imageBytes: 1024, backgroundBytes: 4096 });

  const uncached = model.normalizeState(raw);
  const memo = new Map();
  const cached = model.normalizeState(raw, memo);
  assert.equal(model.stableStringify(cached), model.stableStringify(uncached));

  const uncachedProjection = assets.projectStateToLocalAssets(uncached);
  const cachedProjection = assets.projectStateToLocalAssets(cached, memo);
  assert.equal(model.stableStringify(cachedProjection.state), model.stableStringify(uncachedProjection.state));
  assert.deepEqual([...cachedProjection.assets.entries()], [...uncachedProjection.assets.entries()]);
  assert.deepEqual([...cachedProjection.referencedIds], [...uncachedProjection.referencedIds]);
});
