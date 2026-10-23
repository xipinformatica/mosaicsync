// @kind integration
// Two extra cases from the independent Claude audit of 1.33.0.83. Place in tests/adversarial/.
// They reuse the existing audit-ig scenario in tests/harness/background-runtime-scenario.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(browser, variant) {
  const child = spawnSync(process.execPath, ['tests/harness/background-runtime-scenario.mjs', browser, 'audit-ig'],
    { cwd: process.cwd(), env: { ...process.env, IG_VARIANT: variant }, encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, `${browser} ${variant} failed: ${child.stderr.slice(-800)}`);
  return JSON.parse(child.stdout.trim().split('\n').at(-1));
}

for (const browser of ['firefox', 'chrome']) {
  // Guards the "provisional result, quality retries exhausted" branch: a site that answers 429
  // from the first visit must be revisited after seven days, not locked for thirty.
  test(`.84 ${browser}: site that rate-limits from the first visit gets its sharp icon after eight days`, () => {
    const result = run(browser, 'html-429');
    assert.notEqual(result.steps.find(s => s.tag === 'retry 6 (+31 min)').stored, 'icon192');
    assert.equal(result.steps.at(-1).stored, 'icon192', JSON.stringify(result.steps));
  });
}

// Chrome stores its native favicon as an upscaled 128px canvas with no site URL. That canvas must
// not count as "sharper" than real site artwork, or every site whose best icon is under 128px
// keeps the browser canvas and is marked as audited for 30 days.
test(`.84 chrome: real site artwork may replace the browser-native canvas`, () => {
  const result = run('chrome', 'generic-ranking');
  const final = result.steps.at(-1).stored;
  assert.notEqual(final, 'chromeNative128canvas', JSON.stringify(result.steps));
  assert.match(final, /^shop /, JSON.stringify(result.steps));
});

// A device previously running .83 can contain a blocked native-canvas icon.
// The corrected .84 update must still trigger the one-time weak-icon audit.
for (const browser of ['chrome', 'firefox']) {
  test(`.84 ${browser}: upgrading from .83 retries a previously checked weak automatic icon`, () => {
    const child = spawnSync(process.execPath, ['tests/harness/background-runtime-scenario.mjs', browser, 'audit-ig'],
      { cwd: process.cwd(), env: { ...process.env, IG_VARIANT: 'upgrade-weak', IG_PREVIOUS_VERSION: '1.33.0.83' }, encoding: 'utf8', timeout: 30000 });
    assert.equal(child.status, 0, `${browser} update failed: ${child.stderr.slice(-800)}`);
    const result = JSON.parse(child.stdout.trim().split('\n').at(-1));
    assert.equal(result.steps.at(-1).stored, 'icon192', JSON.stringify(result.steps));
  });
}
