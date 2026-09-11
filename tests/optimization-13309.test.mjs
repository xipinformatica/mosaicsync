import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { testFilesForGroup } from "../tools/test-groups.mjs";

const source = () => fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

function extractFunction(text, name) {
  let start = text.indexOf(`async function ${name}(`);
  if (start < 0) start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = text.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function runReconciliation({ enabled = true, permitted = true, verified = true } = {}) {
  const text = source();
  let permissionChecks = 0;
  let fullRefreshes = 0;
  const ctx = {
    frequentlyVisitedEnabled: enabled,
    frequentLiveRefreshVerified: verified,
    hasTopSitesPermission: async () => { permissionChecks += 1; return permitted; },
    refreshFrequentlyVisited: async () => { fullRefreshes += 1; }
  };
  vm.createContext(ctx);
  vm.runInContext(`${extractFunction(text, "reconcileFrequentlyVisitedPermission")}; this.reconcileFrequentlyVisitedPermission = reconcileFrequentlyVisitedPermission;`, ctx);
  return ctx.reconcileFrequentlyVisitedPermission().then(() => ({ permissionChecks, fullRefreshes }));
}

test("1.33.0.9 records a New-Tab-local verified live Frequently Visited refresh only after a complete commit", () => {
  const text = source();
  assert.match(text, /let frequentLiveRefreshVerified = false;/);
  const refresh = extractFunction(text, "refreshFrequentlyVisited");
  assert.match(refresh, /const generation = \+\+frequentRefreshGeneration;[\s\S]*?frequentLiveRefreshVerified = false;[\s\S]*?await hasTopSitesPermission\(\)/,
    "every full refresh attempt must invalidate the fast-path proof before awaiting browser state");
  assert.match(refresh, /updateFrequentRenderSnapshot\(prepared\);\s*setFrequentlyVisitedStatus\("frequentDeviceLocalStatus"\);\s*frequentLiveRefreshVerified = true;/,
    "the proof may become true only after live render and session projection both commit");
});

test("1.33.0.9 delayed startup reconciliation keeps the timer but delegates to a permission-only reconciler", () => {
  const body = extractFunction(source(), "scheduleFrequentlyVisitedPermissionReconciliation");
  assert.match(body, /void reconcileFrequentlyVisitedPermission\(\);/);
  assert.doesNotMatch(body, /void refreshFrequentlyVisited\(\);/,
    "healthy startup must not unconditionally repeat the full FV render/decode pipeline");
});

test("1.33.0.9 healthy delayed reconciliation rechecks permission without rebuilding verified live cards", async () => {
  const result = await runReconciliation({ enabled: true, permitted: true, verified: true });
  assert.deepEqual(result, { permissionChecks: 1, fullRefreshes: 0 });
});

test("1.33.0.9 delayed reconciliation still retries the full pipeline when the initial live refresh was not verified", async () => {
  const result = await runReconciliation({ enabled: true, permitted: true, verified: false });
  assert.deepEqual(result, { permissionChecks: 1, fullRefreshes: 1 });
});

test("1.33.0.9 delayed reconciliation still clears/reconciles through the full path if permission disappeared", async () => {
  const result = await runReconciliation({ enabled: true, permitted: false, verified: true });
  assert.deepEqual(result, { permissionChecks: 1, fullRefreshes: 1 });
});

test("1.33.0.9 freezes Step-4C evidence, closes Step 4, and keeps focused coverage", () => {
  for (const group of ["startup", "newtab"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/optimization-13309.test.mjs"), `${group} must include optimization-13309.test.mjs`);
  }
  const snapshot = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP4C-1.33.0.9.json", "utf8"));
  assert.equal(snapshot.version, "1.33.0.9");
  assert.equal(snapshot.before.healthyStartupFullFrequentlyVisitedPasses, 2);
  assert.equal(snapshot.after.healthyStartupFullFrequentlyVisitedPasses, 1);
  assert.equal(snapshot.after.delayedPermissionChecks, 1);
  assert.equal(snapshot.correctness.initialFailureStillRetriesFullRefresh, true);
  assert.equal(snapshot.correctness.permissionLossStillUsesFullRefresh, true);
  const tracker = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.match(tracker, /Step 4 — Asset\/image\/network frugality: DONE in 1\.33\.0\.9/);
});
