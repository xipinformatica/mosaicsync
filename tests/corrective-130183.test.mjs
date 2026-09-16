import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  META_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION
} from "../dist/firefox/core/constants.js";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}(`);
  if (start < 0) start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0, quote = "", esc = false, line = false, block = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i++; } continue; }
    if (quote) { if (esc) { esc = false; continue; } if (c === "\\") { esc = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i++; continue; }
    if (c === "/" && n === "*") { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test("1.30.18.3 keeps ordinary Sync schemas stable", () => {
  assert.equal(DEVICE_SNAPSHOT_SCHEMA_VERSION, 2, "payload v2 stays readable by older MosaicSync generations");
  assert.equal(META_SCHEMA_VERSION, 12);
  assert.equal(SYNC_SCHEMA_VERSION, 11);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.3 ${browser} cloned deviceIds publish into collision-free immutable snapshot generations`, () => {
    const src = readBackgroundSource(browser);
    const context = { SYNC_DEVICE_SNAPSHOT_PREFIX: "mosaicsync.sync.device.", encodeURIComponent };
    vm.createContext(context);
    vm.runInContext(extract(src, "deviceSnapshotKey"), context);
    vm.runInContext(extract(src, "deviceSnapshotGenerationKey"), context);
    vm.runInContext(extract(src, "deviceSnapshotGenerationChunkKey"), context);

    const a = context.deviceSnapshotGenerationKey("cloned-device", "commit-a");
    const b = context.deviceSnapshotGenerationKey("cloned-device", "commit-b");
    assert.notEqual(a, b, "two live clones sharing deviceId must never share the authoritative recovery root");
    assert.notEqual(
      context.deviceSnapshotGenerationChunkKey("cloned-device", "commit-a", 0),
      context.deviceSnapshotGenerationChunkKey("cloned-device", "commit-b", 0),
      "their chunk namespaces must also be disjoint"
    );
    assert.equal(context.deviceSnapshotKey("cloned-device"), "mosaicsync.sync.device.cloned-device", "legacy key remains readable");
  });

  test(`1.30.18.3 ${browser} generation decoder is additive and legacy a/b snapshots remain readable`, () => {
    const src = readBackgroundSource(browser);
    const decode = extract(src, "decodeDeviceSnapshotCurrentPayload");
    assert.match(decode, /snapshotId/);
    assert.match(decode, /deviceSnapshotGenerationChunkKey/);
    assert.match(decode, /deviceSnapshotChunkKey\(value\.deviceId, value\.slot, index\)/,
      "legacy fixed-root a/b snapshots must retain their old decoder path");
  });

  test(`1.30.18.3 ${browser} publication never overwrites the copied legacy device root`, () => {
    const src = readBackgroundSource(browser);
    assert.match(src, /const rootKey = deviceSnapshotGenerationKey\(deviceId, commitId\)/);
    assert.match(src, /deviceSnapshotGenerationChunkKey\(deviceId, commitId, index\)/);
    assert.doesNotMatch(src, /const rootKey = deviceSnapshotKey\(deviceId\)/,
      "new publications must not target the single copied per-device root");
  });

  test(`1.30.18.3 ${browser} own-snapshot selection scans generations and retention is generation-aware`, () => {
    const src = readBackgroundSource(browser);
    const own = extract(src, "readOwnDeviceSnapshot");
    assert.match(own, /readDeviceSnapshots/);
    assert.match(own, /snapshot\.deviceId === deviceId/);
    assert.match(src, /maxGenerationsPerDevice:\s*DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE/);
    assert.match(src, /function staleVerifiedRootKeys[\s\S]*generationsByDevice/);
  });

  test(`1.30.18.3 ${browser} stable deviceId still owns normal Sync records`, () => {
    const src = readBackgroundSource(browser);
    assert.match(src, /flattenStateNormalized\([^\n]+meta\.deviceId\)/);
    assert.match(src, /makeSettingsRecordNormalized\([^\n]+meta\.deviceId\)/);
    assert.match(src, /originDeviceId:\s*meta\.deviceId/);
  });
}
