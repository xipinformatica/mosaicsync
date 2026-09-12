import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

function counts(result) {
  return {
    localReads: result.storage.local.getCalls,
    localWrites: result.storage.local.setCalls,
    fullSyncReads: result.storage.sync.getAllCalls
  };
}

test("1.33.0.12 reuses the queue-owned continuity snapshot on routine Sync-watch reconciliation", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "snow-step5b-sync-watch-routine");
    assert.deepEqual(counts(result), { localReads: 5, localWrites: 2, fullSyncReads: 2 }, `${browser} routine alarm`);
  }
});

test("1.33.0.12 keeps GC-due freshness while removing only the redundant continuity read", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "snow-step5b-sync-watch-gc-due");
    assert.deepEqual(counts(result), { localReads: 7, localWrites: 3, fullSyncReads: 3 }, `${browser} GC-due alarm`);
  }
});

test("1.33.0.12 reuses startup continuity across deferral and the same queued reconciliation", () => {
  for (const browser of ["firefox", "chrome"]) {
    const result = runScenario(browser, "snow-step5a-startup-sync-on");
    assert.deepEqual(counts(result), { localReads: 11, localWrites: 3, fullSyncReads: 2 }, `${browser} Sync-on startup`);
  }
});

test("1.33.0.12 durable Sync continuity remains single-writer background-owned", () => {
  const allowed = new Set([
    "src/shared/background/background-core.js",
    "src/shared/core/constants.js"
  ]);
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && file.endsWith(".js")) {
        const relative = file.replaceAll("\\", "/");
        if (allowed.has(relative)) continue;
        const source = fs.readFileSync(file, "utf8");
        if (source.includes("LOCAL_SYNC_CONTINUITY_KEY") || source.includes("mosaicsync.sync-continuity.v1")) offenders.push(relative);
      }
    }
  };
  walk("src/shared");
  assert.deepEqual(offenders, [], "continuity ownership must not silently expand beyond the serialized background orchestrator");
});

test("1.33.0.12 continuity reuse is explicit and does not suppress continuity persistence", () => {
  const source = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(source, /async function markSyncContinuityHealthy\(meta, descriptor = \{\}, currentContinuity = null\)/);
  assert.match(source, /const current = currentContinuity \|\| await readSyncContinuity\(meta\);/);
  assert.match(source, /reconcileIfNewCommit\("startup", meta, false, startupContinuity\)/);
  assert.match(source, /await markSyncContinuityHealthy\(meta, completeDescriptor, continuityContext\.current\)/);
  assert.match(source, /await writeSyncContinuity\(planned, meta\)/, "healthy continuity must still be durably persisted");
  for (const group of ["startup", "sync", "recovery", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-133012.test.mjs"), `${group} must include optimization-133012.test.mjs`);
  }
});
