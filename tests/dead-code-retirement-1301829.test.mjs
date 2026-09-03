import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { collectRuntimeReachabilityAudit } from "../tools/runtime-reachability.mjs";

const root = resolve(import.meta.dirname, "..");
const scenarioHelper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [scenarioHelper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test("1.30.18.29 audited runtime graph has no high-confidence dead production module, import, or private function", async () => {
  const audit = await collectRuntimeReachabilityAudit();
  assert.deepEqual(audit.highConfidence.unreachableSharedModules, []);
  assert.deepEqual(audit.highConfidence.unusedNamedImports, []);
  assert.deepEqual(audit.highConfidence.unreferencedPrivateFunctions, []);

  assert.deepEqual(
    audit.retainedReviewSurfaces.testHooks.map(item => item.name).sort(),
    ["clearCanonicalHostCacheForTests", "getCanonicalHostCacheSizeForTests"]
  );
  assert.deepEqual(
    audit.retainedReviewSurfaces.unreferencedExports.map(item => item.name).sort(),
    ["collectLocalAssets", "flattenState", "hostnameMatchesRegistrableDomain", "makeSettingsRecord", "moveShortcutBetweenSpaces"]
  );
});

test("1.30.18.29 retires only the superseded auto-icon helper and stale unused concurrency import", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const concurrency = fs.readFileSync("src/shared/core/concurrency.js", "utf8");
  assert.doesNotMatch(core, /function\s+workspaceAllowsAutoIcons\s*\(/);
  assert.match(core, /function\s+shortcutAllowsFaviconRecovery\s*\(/);
  assert.doesNotMatch(concurrency, /\bsettingsRecordEqual\b/);
  for (const browser of ["firefox", "chrome"]) {
    const generated = fs.readFileSync(`dist/${browser}/background/background-core.js`, "utf8");
    assert.doesNotMatch(generated, /function\s+workspaceAllowsAutoIcons\s*\(/);
    assert.match(generated, /function\s+shortcutAllowsFaviconRecovery\s*\(/);
  }
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.29 ${browser} generated background preserves workspace-aware and explicit favicon recovery`, () => {
    const workspace = runScenario(browser, "favicon-work-space");
    assert.equal(workspace.space, "work", "inactive Work-space automatic favicon recovery must remain workspace-aware");

    const manual = runScenario(browser, "favicon-preference-rehydrate-13014");
    assert.equal(manual.ok, true);
    assert.equal(manual.hydrated, 1, "explicit favicon preference must still hydrate with automatic icons disabled");
    assert.equal(manual.exact, true);
  });
}
