import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backgroundHarness = path.join(root, "tests/harness/background-runtime-scenario.mjs");

function runBackgroundScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [backgroundHarness, browser, scenario], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000
  });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.31.1 ${browser} reset intent is authoritative before uninitialized bootstrap`, () => {
    const out = runBackgroundScenario(browser, "sync-1311-reset-marker-blocks-uninitialized-bootstrap");
    assert.equal(out.waitedOnReset, true);
    assert.equal(out.remoteWasNotConsumed, true);
    assert.equal(out.noSafetyRepublish, true);
  });

  test(`1.31.1 ${browser} Restore preserves live deletion authority when atomic live content matches`, () => {
    const out = runBackgroundScenario(browser, "sync-1311-restore-live-tombstone-authority");
    assert.equal(out.sourceKind, "complete-legacy-ledgers");
    assert.equal(out.deletedStayedDeleted, true);
  });

  test(`1.31.1 ${browser} interrupted reset staging preserves Recovery-recognized live-core evidence`, () => {
    const out = runBackgroundScenario(browser, "sync-1311-reset-preserves-live-core-evidence");
    assert.equal(out.resetFailedSafely, true);
    assert.equal(out.liveCoreSurvived, true);
    assert.equal(out.peerStayedOutOfRecovery, true);
  });
}

test("1.31.1 reset capacity planner preserves a live-core key and blocks destructive metadata-only staging", async () => {
  const { planResetIntentCapacity } = await import("../src/shared/background/sync-reset-policy.js");
  const values = {
    "mosaicsync.sync.item.live": { bytes: 100 },
    "mosaicsync.audit.meta.a": { bytes: 3 },
    "mosaicsync.audit.meta.b": { bytes: 2 }
  };
  const entryBytes = (_key, value) => Number(value?.bytes) || 1;
  const compareStableText = (a, b) => String(a).localeCompare(String(b));
  const isLiveCoreKey = key => String(key).startsWith("mosaicsync.sync.item.");
  const fits = (current, additions) => {
    let bytes = 0;
    for (const value of Object.values({ ...current, ...additions })) bytes += Number(value?.bytes) || 5;
    return bytes <= 12;
  };
  const plan = planResetIntentCapacity(values, "mosaicsync.sync.reset", { bytes: 5 }, {
    fits, entryBytes, compareStableText, isLiveCoreKey
  });
  assert.equal(plan.blocked, false);
  assert.equal(plan.compactKey, "mosaicsync.sync.item.live", "the final staging key must remain visible to Recovery's live-core predicate");
  assert.ok(!plan.removeKeys.includes("mosaicsync.sync.item.live"));

  const metadataOnly = {
    "mosaicsync.audit.meta.a": { bytes: 100 },
    "mosaicsync.audit.meta.b": { bytes: 100 }
  };
  const blocked = planResetIntentCapacity(metadataOnly, "mosaicsync.sync.reset", { bytes: 5 }, {
    fits, entryBytes, compareStableText, isLiveCoreKey
  });
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.removeKeys, [], "metadata-only input must fail before destructive staging");
});

test("1.31.1 bounded response reader cancels immediately when declared size exceeds the limit", async () => {
  const { readBoundedResponseBlob } = await import("../src/shared/core/bounded-response.js");
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); },
    cancel() { cancelled = true; }
  });
  const response = {
    headers: { get: name => String(name).toLowerCase() === "content-length" ? "1001" : "image/png" },
    body
  };
  await assert.rejects(readBoundedResponseBlob(response, 1000), /too large/i);
  assert.equal(cancelled, true);
});

test("1.31.1 remote-image fetch owner aborts terminal failures before clearing its timeout", () => {
  const source = fs.readFileSync(path.join(root, "src/shared/newtab/newtab.js"), "utf8");
  const start = source.indexOf("async function fetchBoundedRemoteImageBlob");
  const end = source.indexOf("async function loadBookmarksModule", start);
  const body = source.slice(start, end);
  assert.match(body, /catch \(error\) \{\s*controller\.abort\(\);/s);
  assert.match(body, /finally \{\s*clearTimeout\(timeout\);/s);
});
