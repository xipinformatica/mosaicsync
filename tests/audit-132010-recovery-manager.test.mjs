// @kind integration
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import fs from "node:fs";
import { createRecoveryGenerationLifecycle } from "../src/shared/background/recovery-generation-lifecycle.js";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");
function run(browser, scenario) {
  const out = spawnSync(process.execPath, [helper, browser, scenario], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(out.status, 0, `${browser}/${scenario} failed:\n${out.stdout}\n${out.stderr}`);
  return JSON.parse(out.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.32.0.10 audit ${browser}: safe cleanup removes only superseded Recovery and touches no live/reset/name keys`, () => {
    const result = run(browser, "recovery-manager-132010-safe-cleanup");
    assert.equal(result.newestProtected, true);
    assert.equal(result.unrelatedKeysProtected, true);
    assert.equal(result.removedGenerations, 2);
  });
  test(`1.32.0.10 audit ${browser}: old-device deletion fails closed if current fallback disappears during revalidation`, () => {
    const result = run(browser, "recovery-manager-132010-device-revalidation");
    assert.equal(result.revalidationCancelled, true);
    assert.equal(result.remotePreserved, true);
  });
  test(`1.32.0.10 audit ${browser}: storage removal failure cannot report Recovery cleanup success`, () => {
    const result = run(browser, "recovery-manager-132010-remove-failure");
    assert.equal(result.failedClosed, true);
    assert.equal(result.oldPreserved, true);
    assert.equal(result.newestPreserved, true);
  });
}

test("1.32.0.10 audit: manual Recovery policy exports no browser/storage authority", () => {
  const src = fs.readFileSync("src/shared/background/recovery-generation-lifecycle.js", "utf8");
  assert.doesNotMatch(src, /browser\.|storage\.(?:local|sync)|runtime\./);
  assert.match(src, /planManualRecoveryCleanup/);
  assert.match(src, /confirmedManualRecoveryCleanupKeys/);
});

test("1.32.0.10 audit: destructive manager surface remains Recovery-key-only and expected-change-aware", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const start = core.indexOf("async function cleanupRecoveryCopies(");
  const end = core.indexOf("\n  async function getSyncStatus", start);
  const body = core.slice(start, end);
  assert.match(body, /confirmedManualRecoveryCleanupKeys\(latest, latestSnapshots, plan\)/);
  assert.match(body, /await removeSyncItems\(keys\)/);
  assert.doesNotMatch(body, /storage\.sync\.(?:clear|remove)\(/);
  assert.doesNotMatch(body, /LOCAL_PENDING_|SYNC_RESET_INTENT_KEY|SYNC_DATASET_KEY/,
    "manual cleanup must not name unrelated live/pending/reset authorities as deletion targets");
});

// .94 display behavior tests reuse the existing Recovery/Settings test file.
import { recoveryDeviceCopyCountText, syncStorageDisplayUsage } from "../src/shared/newtab/ui-utils.js";
import { MESSAGES as EN } from "../src/shared/core/i18n-locales/en.js";
import { MESSAGES as CA } from "../src/shared/core/i18n-locales/ca.js";

function renderedCopyCount(count, catalog) {
  return recoveryDeviceCopyCountText(count, key => catalog[key]);
}

test(".94 Recovery device heading labels one and two copies in English and Catalan", () => {
  assert.equal(renderedCopyCount(1, EN), "1 copy");
  assert.equal(renderedCopyCount(2, EN), "2 copies");
  assert.equal(renderedCopyCount(1, CA), "1 còpia de seguretat");
  assert.equal(renderedCopyCount(2, CA), "2 còpies de seguretat");
});

for (const itemCount of [100, 512]) {
  test(`.94 Firefox storage display accounts for namespace JSON at ${itemCount} keys`, () => {
    const quota = 102400;
    const usage = {core: 39000, recovery: 20000, shortcutArtwork: 2000, overhead: 2500,
      total: 101000, free: 1400};
    const shown = syncStorageDisplayUsage(usage, quota, itemCount);
    assert.equal(shown.free, Math.max(0, 1400 - 4 * itemCount - 1));
    assert.equal(shown.core + shown.recovery + shown.shortcutArtwork + shown.overhead + shown.free, quota);
    assert.equal(shown.overhead - usage.overhead >= 4 * itemCount + 1, true);
  });
}

test(".94 missing Firefox item count and Chrome leave the existing usage unchanged", () => {
  const usage = {core:210, recovery:340, shortcutArtwork:18, overhead:7, total:1000, free:101400};
  for (const count of [null, undefined, Number.NaN]) {
    assert.deepEqual(syncStorageDisplayUsage(usage, 102400, count), {
      core:210, recovery:340, shortcutArtwork:18, overhead:7, free:101400
    });
  }
});

test(".94 all supported locale catalogs include correctly scoped Recovery display wording", async () => {
  const localeFiles = fs.readdirSync("src/shared/core/i18n-locales").filter(file => file.endsWith(".js"));
  assert.equal(localeFiles.length, 34);
  for (const file of localeFiles) {
    const {MESSAGES} = await import(`../src/shared/core/i18n-locales/${file}`);
    for (const key of ["recoveryDeviceCopyOne", "recoveryDeviceCopyOther", "syncOldDeviceRecoveryHint"]) {
      assert.ok(MESSAGES[key] && typeof MESSAGES[key] === "string", `${file} ${key}`);
    }
    assert.equal(recoveryDeviceCopyCountText(1, key => MESSAGES[key]).startsWith("1 "), true);
    assert.equal(recoveryDeviceCopyCountText(2, key => MESSAGES[key]).startsWith("2 "), true);
    assert.ok(MESSAGES.syncOldDeviceRecoveryHint.includes("{action}"),
      `${file}: the tip must display the localized Manage button label`);
  }
});

for (const browser of ["firefox", "chrome"]) {
  test(`.94 ${browser} real status reports old-device advice only when every verified device has one copy`, () => {
    const result = run(browser, "recovery-manager-133094-display-hint");
    assert.equal(result.oneEach, true);
    assert.equal(result.nearlyFull, false);
    assert.equal(result.immature, false);
    assert.equal(result.hasOlder, false);
    assert.equal(result.missingFallback, false);
    assert.equal(result.onlyCurrent, false);
  });
}

test(".94 Recovery copy labels match the dialog terminology in French, Finnish and Dutch", async () => {
  const translations = [
    ["fr", "1 sauvegarde", "2 sauvegardes"],
    ["fi", "1 varmuuskopio", "2 varmuuskopiota"],
    ["nl", "1 back-up", "2 back-ups"]
  ];
  for (const [locale, one, two] of translations) {
    const { MESSAGES } = await import(`../src/shared/core/i18n-locales/${locale}.js`);
    assert.equal(recoveryDeviceCopyCountText(1, key => MESSAGES[key]), one);
    assert.equal(recoveryDeviceCopyCountText(2, key => MESSAGES[key]), two);
    const actualHint = MESSAGES.syncOldDeviceRecoveryHint.replace("{action}", MESSAGES.manageRecoveryCopies);
    assert.ok(actualHint.includes(MESSAGES.manageRecoveryCopies), `${locale}: tip must name the real button`);
    assert.ok(!actualHint.includes("{action}"));
  }
});
