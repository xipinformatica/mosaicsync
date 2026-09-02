import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.10 ${browser} reuses all eight unchanged verified device generations`, () => {
    const out = runScenario(browser, "sync-13010-device-cache-reuse");
    assert.equal(out.afterFirst, 8);
    assert.equal(out.afterSecond, 8, "second full read must perform zero additional gzip decodes");
    assert.equal(out.remoteCommitId, "cache-g7");
    assert.equal(out.remoteItems, 20, "cached Personal+Work merge must preserve all live records");
  });

  test(`1.30.10 ${browser} never caches incomplete generations and accepts later completion`, () => {
    const out = runScenario(browser, "sync-13010-cache-incomplete-then-complete");
    assert.equal(out.decompressions, 1);
    assert.equal(out.remoteState, "complete");
  });

  test(`1.30.10 ${browser} revalidates currently visible chunks before any cache hit`, () => {
    const out = runScenario(browser, "sync-13010-cache-revalidates-current-bytes");
    assert.equal(out.decompressions, 1);
    assert.equal(out.corruptState, "partial");
    assert.equal(out.restoredState, "complete");
  });

  test(`1.30.10 ${browser} caches previous complete fallback without blocking later current completion`, () => {
    const out = runScenario(browser, "sync-13010-cache-previous-generation-fallback");
    assert.equal(out.decompressions, 2);
    assert.equal(out.fallbackCommit, "old-generation");
    assert.equal(out.currentCommit, "new-generation");
  });

  test(`1.30.10 ${browser} invalid validated/decompression outcomes never populate the cache`, () => {
    const out = runScenario(browser, "sync-13010-cache-failures-never-cache");
    assert.equal(out.invalidFingerprintDecodes, 2);
    assert.equal(out.invalidGzipDecodes, 2);
    assert.equal(out.unfingerprintedDecodes, 2, "unfingerprinted compatible generations must remain readable but uncached");
  });

  test(`1.30.10 ${browser} cache identity includes validation-relevant manifest metadata`, () => {
    const out = runScenario(browser, "sync-13010-cache-validation-metadata-miss");
    assert.equal(out.decompressions, 3);
    assert.equal(out.commitId, "metadata-g2");
  });
}

test("1.30.10 cache is worker-local, bounded to the retained device count, and consulted only after current fingerprint verification", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    assert.match(source, /const deviceSnapshotDecodeCache = new Map\(\)/);
    assert.match(source, /const DEVICE_SNAPSHOT_DECODE_CACHE_MAX = DEVICE_SNAPSHOT_MAX_RECENT_DEVICES;/);
    assert.match(source, /typeof value\.dataFingerprint !== "string" \|\| !value\.dataFingerprint/);
    assert.match(source, /typeof value\.recordFingerprint !== "string" \|\| !value\.recordFingerprint/);
    assert.match(source, /typeof value\.workRecordFingerprint !== "string" \|\| !value\.workRecordFingerprint/);
    assert.match(source, /while \(deviceSnapshotDecodeCache\.size > DEVICE_SNAPSHOT_DECODE_CACHE_MAX\)/);
    const start = source.indexOf("async function decodeDeviceSnapshotCurrentPayload");
    const end = source.indexOf("async function decodeDeviceSnapshotPayload", start);
    assert.ok(start >= 0 && end > start);
    const block = source.slice(start, end);
    const fingerprintAt = block.indexOf("value.dataFingerprint !== deviceSnapshotDataFingerprint(data)");
    const cacheAt = block.indexOf("readDeviceSnapshotDecodeCache(value)");
    const decodeAt = block.indexOf("decodeDeviceSnapshotData(value, data)");
    assert.ok(fingerprintAt >= 0 && cacheAt > fingerprintAt && decodeAt > cacheAt,
      "cache lookup must happen after current chunk/data fingerprint verification but before expensive decoding");
  }
});

test("1.30.10 cache identity covers decoded-result and validation metadata", () => {
  const source = readBackgroundSource("firefox", { built: false });
  const start = source.indexOf("function deviceSnapshotDecodeCacheKey");
  const end = source.indexOf("function readDeviceSnapshotDecodeCache", start);
  const block = source.slice(start, end);
  for (const field of [
    "schemaVersion", "chunkSchemaVersion", "deviceId", "commitId", "publishedAt", "updatedAt",
    "liveRecordCount", "recordFingerprint", "settingsModifiedAt", "encoding", "compressedBytes", "jsonChars",
    "profileSnapshotVersion", "profileComplete", "workLiveRecordCount", "workRecordFingerprint",
    "workSettingsModifiedAt", "slot", "parts", "dataChars", "dataFingerprint"
  ]) assert.match(block, new RegExp(`value\\.${field}`), `cache identity must include ${field}`);
});

test("1.30.10 Sync disable clears only the performance cache and does not alter durable snapshot data", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("async function setSyncEnabled");
    const end = source.indexOf("function hasSnapshotData", start);
    const block = source.slice(start, end);
    assert.match(block, /if \(!enabled\) \{\s*clearDeviceSnapshotDecodeCache\(\);/);
    assert.doesNotMatch(block, /browser\.storage\.sync\.remove\([^)]*deviceSnapshotDecodeCache/);
  }
});

test("1.30.10 removes only newly proven-dead model/platform vocabulary", () => {
  const model = fs.readFileSync(resolve(root, "src/shared/core/model.js"), "utf8");
  const firefoxPlatform = fs.readFileSync(resolve(root, "src/shared/core/platform.js"), "utf8");
  const chromePlatform = fs.readFileSync(resolve(root, "src/chrome/core/platform.js"), "utf8");
  assert.doesNotMatch(model, /export function selectActiveSpace\(/);
  assert.match(model, /export function selectActiveSpaceNormalized\(/);
  for (const platform of [firefoxPlatform, chromePlatform]) {
    assert.doesNotMatch(platform, /PLATFORM_NAME/);
    assert.doesNotMatch(platform, /ACCOUNT_PROVIDER_NAME/);
    assert.match(platform, /export const PLATFORM_ID/);
  }
});
