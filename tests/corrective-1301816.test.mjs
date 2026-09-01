import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const helper = resolve(import.meta.dirname, "harness/background-favicon-adapter-scenario.mjs");

function run(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const lines = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length, `${browser}/${scenario} produced no result`);
  return JSON.parse(lines.at(-1));
}

test("1.30.18.16 Firefox open-tab favicon cache executes the real shared-core to adapter contract", () => {
  const result = run("firefox", "firefox-open-tab-cache");
  assert.equal(result.ok, true);
  assert.equal(result.hydrated, 1);
  assert.ok(result.queryCount >= 1);
  assert.equal(result.fetchCount, 0);
});

test("1.30.18.16 Firefox tabs.onUpdated favicon learning executes the real production adapter", () => {
  const result = run("firefox", "firefox-tab-updated-learning");
  assert.equal(result.ok, true);
  assert.equal(result.sourceKind, "firefox");
  assert.ok(result.nativeFetches >= 1);
});

test("1.30.18.16 Chromium protected-store tab learning stays browser-local and strips remote provenance", () => {
  const result = run("chrome", "chrome-store-tab-learning");
  assert.equal(result.ok, true);
  assert.equal(result.sourceUrl, "");
  assert.ok(result.nativeFetches >= 2, "real favicon + sentinel _favicon reads should both execute");
  assert.equal(result.remoteFetches, 0);
});
