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
  test(`1.30.12 ${browser} false install preserves completed local/Sync identity`, () => {
    const out = runScenario(browser, "lifecycle-13012-false-install-preserves-complete");
    assert.equal(out.preserved, true);
    assert.equal(out.onboarding, true);
    assert.equal(out.syncStatus, "ready");
  });

  test(`1.30.12 ${browser} false install preserves in-progress Sync recovery`, () => {
    const out = runScenario(browser, "lifecycle-13012-false-install-preserves-waiting");
    assert.equal(out.preservedWaiting, true);
    assert.equal(out.syncStatus, "waiting");
    assert.equal(out.welcomeTabs, 1);
  });

  test(`1.30.12 ${browser} genuine empty install still receives safe defaults`, () => {
    const out = runScenario(browser, "lifecycle-13012-genuine-fresh-install-defaults");
    assert.equal(out.fresh, true);
    assert.equal(out.syncStatus, "off");
    assert.equal(out.welcomeTabs, 1);
  });

  test(`1.30.12 ${browser} update and downgrade-shaped lifecycle events preserve state`, () => {
    const out = runScenario(browser, "lifecycle-13012-update-and-downgrade-preserve");
    assert.equal(out.updatePreserved, true);
    assert.equal(out.downgradePreserved, true);
  });
}

test("1.30.12 browser lifecycle handlers never reset durable MosaicSync state from reason=install", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    const start = source.indexOf("browser.runtime.onInstalled.addListener");
    const end = source.indexOf("browser.action?.onClicked", start);
    assert.ok(start >= 0 && end > start, `${browser} lifecycle block must exist`);
    const block = source.slice(start, end);
    assert.match(block, /lifecycle metadata, not\s*\/\/ proof that MosaicSync has never existed/);
    assert.doesNotMatch(block, /if \(details\.reason === ["']install["']\)\s*\{[^}]*writeLocalMeta/s,
      "reason=install must never authorize a metadata reset");
    assert.doesNotMatch(block, /clearAllPendingSyncRecoveryState\(\)/,
      "ambiguous install lifecycle must not clear recovery state");
    assert.doesNotMatch(block, /storage\.local\.remove\(/,
      "ambiguous install lifecycle must not delete local durable/recovery keys");
    assert.match(block, /const \{ meta \} = await ensureLocalStorage\(\)/,
      "fresh defaults must come from the normal durable-storage initializer");
  }
});

test("1.30.12 production Firefox identity remains the AMO identity", () => {
  const manifest = JSON.parse(fs.readFileSync(resolve(root, "src/firefox/manifest.json"), "utf8"));
  assert.equal(manifest.browser_specific_settings?.gecko?.id, "mosaicsync@xipinformatica.cat");
  assert.equal(manifest.name, "MosaicSync");
});

test("1.30.12 development Firefox packager uses a separate non-AMO Gecko identity", () => {
  const source = fs.readFileSync(resolve(root, "tools/package.py"), "utf8");
  assert.match(source, /FIREFOX_DEV_GECKO_ID\s*=\s*["']mosaicsync-dev@xipinformatica\.cat["']/);
  assert.match(source, /FIREFOX_PRODUCTION_GECKO_ID\s*=\s*["']mosaicsync@xipinformatica\.cat["']/);
  assert.match(source, /def package_firefox_dev\(/);
  assert.match(source, /--firefox-dev/);
  assert.match(source, /MosaicSync Dev/);
});
