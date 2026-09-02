import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtimeScenario = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [runtimeScenario, browser, scenario], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test("1.30.18.16 Firefox real open-tab adapter hydrates from tabs.query without network fallback or Sync pixels", () => {
  const result = runScenario("firefox", "firefox-open-tab-cache-1301816");
  assert.equal(result.hydrated, 1);
  assert.ok(result.tabQueries >= 1);
  assert.equal(result.networkFetches, 0);
  assert.equal(result.imageKind, "none");
});

test("1.30.18.16 Firefox real tabs.onUpdated learning is expected-navigation gated and clears the marker on success", () => {
  const result = runScenario("firefox", "firefox-tab-updated-learning-1301816");
  assert.equal(result.gated, true);
  assert.equal(result.learned, true);
  assert.equal(result.markerCleared, true);
  assert.equal(result.networkFetches, 0);
});

test("1.30.18.16 Chromium protected-store adapter keeps _favicon local, strips remote provenance, and rejects the sentinel", () => {
  const result = runScenario("chrome", "chrome-protected-native-1301816");
  assert.equal(result.nativeHydrated, true);
  assert.equal(result.protectedRemoteFetches, 0);
  assert.equal(result.provenanceStripped, true);
  assert.equal(result.placeholderBlocked, true);
  assert.ok(result.faviconFetches >= 3);
});
