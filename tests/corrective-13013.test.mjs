import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.13 ${browser} established survivor quarantines zero Sync then self-heals`, () => {
    const out = runScenario(browser, "sync-loss-13013-single-survivor-recovers");
    assert.equal(out.recovered, true);
    assert.equal(out.tombstonePreserved, true);
    assert.equal(out.editPreserved, true);
    assert.equal(out.deletePreserved, true);
  });

  test(`1.30.13 ${browser} live 1.30.12 upgrade infers established continuity before first zero read`, () => {
    const out = runScenario(browser, "sync-loss-13013-upgrade-infers-established");
    assert.equal(out.inferredEstablished, true);
    assert.equal(out.quarantined, true);
  });

  test(`1.30.13 ${browser} fresh empty device still waits and never invents a recovery`, () => {
    const out = runScenario(browser, "sync-loss-13013-fresh-empty-waits");
    assert.equal(out.freshWait, true);
  });

  test(`1.30.13 ${browser} transient zero namespace cancels silently when complete data reappears`, () => {
    const out = runScenario(browser, "sync-loss-13013-transient-empty-cancels");
    assert.equal(out.cancelled, true);
    assert.equal(out.silent, true);
  });

  test(`1.30.13 ${browser} intentional reset remains non-zero and is never auto-resurrected`, () => {
    const out = runScenario(browser, "sync-loss-13013-intentional-reset-is-nonzero");
    assert.equal(out.nonzeroReset, true);
    assert.equal(out.observerRespected, true);
    assert.equal(out.republishedAfterReset, true);
    assert.ok(out.remainingBytes > 0);
  });

  test(`1.30.13 ${browser} exhausted recovery preserves local data and surfaces failure`, () => {
    const out = runScenario(browser, "sync-loss-13013-recovery-failure-preserves-local");
    assert.equal(out.failedSafely, true);
    assert.equal(out.localPreserved, true);
  });

  test(`1.30.13 ${browser} partial non-zero delivery stays in torn-delivery path`, () => {
    const out = runScenario(browser, "sync-loss-13013-partial-nonzero-does-not-recover");
    assert.equal(out.noRecovery, true);
  });
}

test("1.30.13 catastrophic-loss guard precedes pending mutation replay", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const start = source.indexOf("async function reconcileIfNewCommit");
    const end = source.indexOf("async function getSyncStatus", start);
    const block = source.slice(start, end);
    const guard = block.indexOf("beginOrContinueCatastrophicSyncRecovery");
    const pending = block.indexOf("retryPendingLocalSyncMutation");
    assert.ok(guard >= 0 && pending > guard, `${browser}: loss guard must run before pending local publication`);
  }
});

test("1.30.13 explicit Sync clear commits reset sentinel before removing profile keys", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const start = source.indexOf("async function clearSyncData()");
    const end = source.indexOf("async function readSyncSnapshot", start);
    const block = source.slice(start, end);
    assert.ok(block.indexOf("writeSyncItems({ [SYNC_RESET_INTENT_KEY]: resetIntent })") >= 0);
    assert.ok(block.indexOf("writeSyncItems({ [SYNC_RESET_INTENT_KEY]: resetIntent })") < block.indexOf("removeSyncItems(keys)"));
    assert.doesNotMatch(block, /storage\.sync\.clear\(/, "MosaicSync-controlled reset must never create an intentional 0-byte namespace");
  }
});

test("1.30.13 recovery UI strings exist in every supported runtime locale", async () => {
  const localeDir = resolve(root, "src/shared/core/i18n-locales");
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js"));
  assert.ok(files.length >= 30);
  for (const file of files) {
    const module = await import(`${new URL(`../src/shared/core/i18n-locales/${file}`, import.meta.url).href}?v=13013`);
    for (const key of ["syncRecoveryRestoring", "syncRecoveryRestored", "syncRecoveryFailed"]) {
      assert.equal(typeof module.MESSAGES[key], "string", `${file} missing ${key}`);
      assert.ok(module.MESSAGES[key].length > 10, `${file} ${key} unexpectedly empty`);
    }
  }
});

test("1.30.13 startup and watchdog never replay pending local state before the loss guard", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const startupAt = source.indexOf("browser.runtime.onStartup.addListener");
    const storageAt = source.indexOf("browser.storage.onChanged.addListener", startupAt);
    const startup = source.slice(startupAt, storageAt);
    assert.doesNotMatch(startup, /retryPendingLocalSyncMutation\(/, `${browser}: startup must not pre-publish pending local state`);
    assert.match(startup, /reconcileIfNewCommit\("startup", meta, false\)/);

    const alarmAt = source.indexOf("browser.alarms?.onAlarm?.addListener");
    const permissionsAt = source.indexOf("browser.permissions?.onAdded", alarmAt);
    const alarm = source.slice(alarmAt, permissionsAt);
    assert.doesNotMatch(alarm, /retryPendingLocalSyncMutation\(/, `${browser}: watchdog must not pre-publish pending local state`);
    assert.match(alarm, /reconcileIfNewCommit\("alarm", meta, false\)/);
  }
});
