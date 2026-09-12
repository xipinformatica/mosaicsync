import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { testFilesForGroup } from "../tools/test-groups.mjs";

const VERSION = "1.33.0.10";
const SNAPSHOT = "docs/SNOW-LEOPARD-II-STEP5A-1.33.0.10.json";

function runCensus() {
  const result = spawnSync(process.execPath, ["tools/storage-background-census.mjs"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("1.33.0.10 adds a local-only Step-5 storage/background census with no product telemetry", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["perf:storage-background"], "node tools/build.mjs && node tools/storage-background-census.mjs");
  const tool = fs.readFileSync("tools/storage-background-census.mjs", "utf8");
  assert.match(tool, /directStorageCallSites/);
  assert.match(tool, /backgroundWakeTopology/);
  assert.match(tool, /runtimeCensus/);
  assert.doesNotMatch(tool, /fetch\s*\(|XMLHttpRequest|sendBeacon|browser\.storage\.(?:local|sync|session)\.set\s*\(/,
    "measurement tooling must not send or persist performance data");
});

test("1.33.0.10 freezes the direct storage-call and worker-wake inventory", () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.version, VERSION);
  assert.equal(snapshot.directStorageCallSites.total, 117);
  assert.equal(snapshot.directStorageCallSites.byOperation["local.get"], 24);
  assert.equal(snapshot.directStorageCallSites.byOperation["sync.get"], 30);
  assert.equal(snapshot.directStorageCallSites.byOperation["sync.getBytesInUse"], 10);
  assert.equal(snapshot.directStorageCallSites.fullAreaReads.filter(site => site.area === "sync").length, 27);
  assert.equal(snapshot.directStorageCallSites.fullAreaReads.filter(site => site.area === "local").length, 1);
  assert.equal(snapshot.backgroundWakeTopology.totalListeners, 10);
});

test("1.33.0.10 runtime census proves Firefox/Chromium parity for measured worker paths", () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const ff = snapshot.runtimeCensus.firefox;
  const chrome = snapshot.runtimeCensus.chrome;
  for (const scenario of Object.keys(ff)) {
    assert.deepEqual(chrome[scenario].storage, ff[scenario].storage, `${scenario} storage counts must retain generated-runtime parity`);
  }
  assert.equal(ff["snow-step5a-startup-sync-off"].storage.sync.getAllCalls, 0);
  assert.equal(ff["snow-step5a-startup-sync-off"].storage.local.getCalls, 7);
  assert.equal(ff["snow-step5a-startup-sync-on"].storage.sync.getAllCalls, 2);
  assert.equal(ff["snow-step5a-startup-sync-on"].storage.local.getCalls, 13);
  assert.equal(ff["snow-step5a-sync-watch-alarm"].storage.sync.getAllCalls, 3);
  assert.equal(ff["snow-step5a-sync-watch-alarm"].storage.local.getCalls, 8);
});

test("1.33.0.10 does not treat similar full Sync reads as interchangeable authority", () => {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  assert.equal(snapshot.interpretationBoundaries.fullSyncReadsAreNotAssumedRedundant, true);
  const reasons = snapshot.interpretationBoundaries.reasons.join(" ");
  assert.match(reasons, /catastrophic-loss detection/i);
  assert.match(reasons, /pending durable Sync journals/i);
  assert.match(reasons, /garbage collection.*fresh pre-delete revalidation/i);
});

test("1.33.0.10 frozen Step-5A measurements remain reproducible on later Snow Leopard II releases", () => {
  const live = runCensus();
  const frozen = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const runtimeVersion = fs.readFileSync("src/shared/core/constants.js", "utf8").match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1];
  assert.equal(frozen.version, VERSION, "the canonical Step-5A snapshot stays pinned to its originating release");
  assert.equal(live.version, runtimeVersion, "live census must identify the current runtime rather than impersonating 1.33.0.10");
  assert.deepEqual(live.directStorageCallSites.byOperation, frozen.directStorageCallSites.byOperation);
  for (const browser of ["firefox", "chrome"]) {
    for (const [scenario, frozenResult] of Object.entries(frozen.runtimeCensus[browser])) {
      const liveResult = live.runtimeCensus[browser][scenario];
      assert.ok(liveResult, `${browser}/${scenario} must remain measurable`);
      assert.equal(liveResult.storage.sync.getAllCalls, frozenResult.storage.sync.getAllCalls,
        `${browser}/${scenario} must not collapse Step-5A Sync freshness reads without a separately proven optimization`);
      assert.ok(liveResult.storage.local.getCalls <= frozenResult.storage.local.getCalls,
        `${browser}/${scenario} may reduce local reads after Step 5A but must never regress above the frozen baseline`);
    }
  }
});

test("1.33.0.10 keeps Step 5 measurement-first and focused-group protected", () => {
  for (const group of ["startup", "sync", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-133010.test.mjs"), `${group} must include optimization-133010.test.mjs`);
  }
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 5 — Storage\/background frugality: (?:IN PROGRESS|DONE in 1\.33\.0\.12)/,
    "the Step-5 phase must remain explicitly tracked; 1.33.0.12 may close it after the measured Step-5C audit");
  assert.match(tracker, /## Step 5A storage\/background census[\s\S]*?measurement-only/i,
    "the historical Step-5A section must remain explicitly measurement-only");
  assert.match(tracker, /## Step 5A storage\/background census[\s\S]*?No production storage read has been removed/i,
    "the Step-5A historical record must continue to state that .10 removed no production read");
});
