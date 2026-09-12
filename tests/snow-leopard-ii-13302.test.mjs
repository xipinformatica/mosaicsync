import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const CURRENT_VERSION = "1.33.0.14";
const STEP1_VERSION = "1.33.0.2";
async function read(path) { return readFile(path, "utf8"); }

test("1.33.0.2 exposes a deterministic New Tab critical-path census", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["perf:critical-path"], "node tools/build.mjs && node tools/critical-path-census.mjs");
  const result = spawnSync(process.execPath, ["tools/critical-path-census.mjs", "--json"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.version, CURRENT_VERSION);
  assert.ok(parsed.parserCriticalPath.scripts.length >= 8);
  assert.ok(parsed.moduleEvaluation.staticGraph.moduleCount > 10);
  assert.ok(parsed.eagerDomBindings.total > 50);
  assert.ok(parsed.eagerDomBindings.secondary > parsed.eagerDomBindings.primary);
  assert.ok(parsed.deferredModules.moduleCount >= 5);
  assert.ok(Array.isArray(parsed.rankings) && parsed.rankings.length >= 5);
});

test("1.33.0.2 records finer startup ownership phases without telemetry", async () => {
  const source = await read("src/shared/newtab/newtab.js");
  for (const phase of ["shellLocalized", "uiBindingsReady", "moduleSetupReady", "sessionCacheReady", "localStateMaterialized"]) {
    assert.match(source, new RegExp(`startupPhase\\(\\"${phase}\\"\\)`), `missing ${phase}`);
  }
  assert.doesNotMatch(source, /sendBeacon|PerformanceObserver\([^)]*fetch|__mosaicsyncStartupTiming[^\n]*storage\.(?:local|sync|session)\.set/);
});

test("1.33.0.2 freezes a machine-readable Step 1 census snapshot", async () => {
  const snapshot = JSON.parse(await read("docs/SNOW-LEOPARD-II-CENSUS-1.33.0.2.json"));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.version, STEP1_VERSION);
  assert.equal(snapshot.step, 1);
  assert.equal(snapshot.purpose, "Snow Leopard II New Tab critical-path census");
  assert.ok(snapshot.census?.rankings?.length >= 5);
});

test("1.33.0.2 marks Snow Leopard II Step 1 complete and names the next measured target", async () => {
  const tracker = await read("docs/SNOW-LEOPARD-II.md");
  assert.match(tracker, /Step 1 — New Tab critical-path census: DONE in 1\.33\.0\.2/);
  assert.match(tracker, /Step 2 — State computation and serialization: DONE in 1\.33\.0\.3/);
  assert.match(tracker, /Step 3 — DOM\/CSS\/lazy secondary UI: (?:NEXT|IN PROGRESS|DONE in 1\.33\.0\.6)/);
  assert.match(tracker, /secondary Settings\/dialog/i);
});
