import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readBackgroundSource } from "./harness/background-source.mjs";

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
  test(`1.30.18.43 ${browser} Clear Sync copy succeeds when reset-intent cannot be added to a full namespace`, () => {
    const out = runScenario(browser, "sync-1301843-full-quota-clear");
    assert.equal(out.cleared, true);
    assert.equal(out.localPreserved, true);
    assert.equal(out.onlyResetIntent, true);
    assert.equal(out.syncWaiting, true);
    assert.equal(out.noAutoRepublish, true);
    assert.equal(out.clearCalls, 1);
  });
}

test("1.30.18.43 Clear Sync copy arms intentional reset locally before browser.storage.sync.clear and writes sentinel after", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("async function clearSyncData()");
    const end = source.indexOf("async function readSyncSnapshot", start);
    const block = source.slice(start, end);
    const localReset = block.indexOf("markIntentionalSyncReset");
    const clear = block.indexOf("browser.storage.sync.clear()");
    const sentinel = block.lastIndexOf("writeSyncItems({ [SYNC_RESET_INTENT_KEY]: resetIntent }");
    assert.ok(localReset >= 0, `${browser}: reset must be armed locally`);
    assert.ok(clear > localReset, `${browser}: namespace clear must happen after local reset protection is armed`);
    assert.ok(sentinel > clear, `${browser}: reset sentinel must be written after quota-blocked data is cleared`);
  }
});

test("1.30.18.43 destructive reset warning exists in every supported runtime locale", async () => {
  const localeDir = resolve(root, "src/shared/core/i18n-locales");
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js"));
  assert.ok(files.length >= 30);
  for (const file of files) {
    const module = await import(`${new URL(`../src/shared/core/i18n-locales/${file}`, import.meta.url).href}?v=1301843`);
    for (const key of ["clearSyncWarning", "syncDataCleared"]) {
      assert.equal(typeof module.MESSAGES[key], "string", `${file} missing ${key}`);
      assert.ok(module.MESSAGES[key].length > 20, `${file} ${key} unexpectedly short`);
    }
  }
});

test("1.30.18.43 Settings confirmation presents the destructive reset warning", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const start = source.indexOf('clearSyncButton?.addEventListener("click"');
  const end = source.indexOf("// ---------------------------------------------------------------------------", start);
  const block = source.slice(start, end);
  assert.match(block, /t\("deleteSyncTitle"\)/);
  assert.match(block, /t\("clearSyncWarning"\)/);
});
