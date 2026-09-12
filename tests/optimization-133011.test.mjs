import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { testFilesForGroup } from "../tools/test-groups.mjs";

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, ["tests/harness/background-runtime-scenario.mjs", browser, scenario], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function storageCounts(result) {
  return {
    localReads: result.storage.local.getCalls,
    fullSyncReads: result.storage.sync.getAllCalls
  };
}

test("1.33.0.11 routine Sync-watch alarm avoids the maintenance-only second local metadata read", () => {
  const frozen = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP5B-1.33.0.11.json", "utf8"));
  for (const browser of ["firefox", "chrome"]) {
    const historical = frozen.runtimeCensus[browser].routine133011;
    assert.deepEqual(historical, { localReads: 6, fullSyncReads: 2 }, `${browser} frozen .11 routine evidence`);
    const current = storageCounts(runScenario(browser, "snow-step5b-sync-watch-routine"));
    assert.equal(current.fullSyncReads, historical.fullSyncReads, `${browser} routine Sync freshness reads remain protected`);
    assert.ok(current.localReads <= historical.localReads, `${browser} later Step-5 releases may reduce local reads but must not regress .11`);
  }
});

test("1.33.0.11 keeps the historical fresh metadata and full Sync reads when device-snapshot GC is due", () => {
  const frozen = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP5B-1.33.0.11.json", "utf8"));
  for (const browser of ["firefox", "chrome"]) {
    const historical = frozen.runtimeCensus[browser].gcDue133011;
    assert.deepEqual(historical, { localReads: 8, fullSyncReads: 3 }, `${browser} frozen .11 GC-due evidence`);
    const current = storageCounts(runScenario(browser, "snow-step5b-sync-watch-gc-due"));
    assert.equal(current.fullSyncReads, historical.fullSyncReads, `${browser} GC-due Sync freshness reads remain protected`);
    assert.ok(current.localReads <= historical.localReads, `${browser} later Step-5 releases may reduce unrelated local reads but must preserve GC freshness`);
  }
});

test("1.33.0.11 uses the alarm-entry metadata only as a negative GC-due gate", () => {
  const source = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(source, /function\s+isDeviceSnapshotGcDue\s*\(/);
  assert.match(source, /if\s*\(isDeviceSnapshotGcDue\(meta\)\)\s*\{\s*meta\s*=\s*await\s+readLocalMeta\(\);\s*await\s+maybeGarbageCollectStaleDeviceSnapshots\(meta\);/s);
  assert.match(source, /async function maybeGarbageCollectStaleDeviceSnapshots\(meta,[\s\S]*?if\s*\(!force\s*&&\s*!isDeviceSnapshotGcDue\(meta,\s*now\)\)\s*return\s+meta;/);
});

test("1.33.0.11 Step-5B coverage is focused without rebuilding dist inside the test", () => {
  for (const group of ["startup", "sync", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-133011.test.mjs"), `${group} must include optimization-133011.test.mjs`);
  }
  const self = fs.readFileSync("tests/optimization-133011.test.mjs", "utf8");
  assert.doesNotMatch(self, /tools\/build\.mjs|npm\s+run\s+build|spawnSync\([^\n]*build/,
    "the Step-5B regression must consume the caller's built dist tree instead of racing parallel tests by rebuilding it");
});
