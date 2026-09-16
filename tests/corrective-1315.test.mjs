import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [helper, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test("1.31.5 unreadable durable cross-Space journals fail closed before any new publication", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1315-cross-space-journal-read-fails-closed");
    assert.equal(out.blockedPublication, true);
    assert.equal(out.pendingPreserved, true);
  }
});

test("1.31.5 unreadable durable local-mutation journals fail closed instead of falling back to direct publication", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1315-local-journal-read-fails-closed");
    assert.equal(out.blockedPublication, true);
    assert.equal(out.pendingPreserved, true);
  }
});

test("1.31.5 failed durable-journal cleanup aborts Sync disable until cleanup can be verified", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1315-cleanup-failure-blocks-disable");
    assert.equal(out.failedClosed, true);
    assert.equal(out.retrySucceeded, true);
    assert.equal(out.journalCleared, true);
  }
});
