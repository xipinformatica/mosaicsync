// @kind static
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const VERSION = "1.33.0.98";

async function read(path) { return readFile(path, "utf8"); }

// The complete baseline already runs bench/performance.mjs --json --quick.
// Reuse that single execution for both the distribution and static-budget
// contracts; spawning the same benchmark twice adds ~8 seconds without
// independently exercising a different code path.
let quickBaseline;
function measureQuickBaselineOnce() {
  if (!quickBaseline) {
    const result = spawnSync(process.execPath, ["tools/performance-baseline.mjs", "--quick", "--no-browser"], {
      cwd: process.cwd(), encoding: "utf8", maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    quickBaseline = JSON.parse(result.stdout);
  }
  return quickBaseline;
}

test("1.33.0.2 exposes a Snow Leopard II baseline command without adding product telemetry", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.scripts["perf:baseline"], "node tools/build.mjs && node tools/performance-baseline.mjs");
  const tool = await read("tools/performance-baseline.mjs");
  assert.match(tool, /schemaVersion:\s*1/);
  assert.match(tool, /syntheticBenchmarks/);
  assert.match(tool, /newTabStatic/);
  assert.match(tool, /storageCallSites/);
  assert.match(tool, /browserStartup/);
  assert.doesNotMatch(tool, /fetch\s*\(|XMLHttpRequest|sendBeacon|storage\.(?:local|sync|session)\.set/,
    "baseline tooling must not send or persist performance data");
});

test("1.33.0.2 benchmark has machine-readable distribution output", async () => {
  const baseline = measureQuickBaselineOnce();
  const parsed = baseline.syntheticBenchmarks;
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.version, VERSION);
  assert.equal(parsed.mode, "quick");
  assert.ok(parsed.benchmarks["normalizeState(200)"].medianMs > 0);
  assert.ok(parsed.benchmarks["normalizeState(200)"].samples >= 3);
  assert.ok(parsed.benchmarks["flattenState normalized fast path"].medianMs >= 0);
});

test("1.33.0.2 baseline captures stable static New Tab budgets", async () => {
  const parsed = measureQuickBaselineOnce();
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.version, VERSION);
  assert.ok(parsed.newTabStatic.html.elementCount > 500);
  assert.ok(parsed.newTabStatic.html.secondaryElementCount > parsed.newTabStatic.html.primaryElementCount);
  const graph = parsed.newTabStatic.staticModuleGraph;
  assert.ok(graph.moduleCount > 0);
  assert.equal(graph.moduleCount, graph.modules.length);
  assert.equal(new Set(graph.modules).size, graph.moduleCount);
  assert.ok(graph.modules.includes("newtab/newtab.js"), "the actual New Tab entry must be in the graph");
  // Validate exact source-byte accounting without outlawing a smaller graph.
  const measuredBytes = (await Promise.all(graph.modules.map(path => readFile(`src/shared/${path}`))))
    .reduce((bytes, contents) => bytes + contents.byteLength, 0);
  assert.equal(graph.rawBytes, measuredBytes);
  assert.ok(parsed.storageCallSites.total > 50);
  assert.equal(parsed.browserStartup.status, "skipped");
});

test("1.33.0.2 real-browser smoke snapshot exports complete startup phases for the lab", async () => {
  const smoke = await read("tools/browser-smoke.mjs");
  assert.match(smoke, /startupPhases:\s*\{\s*\.\.\.timing\s*\}/);
  assert.match(smoke, /navigationTiming/);
  assert.match(smoke, /domElementCount/);
});
