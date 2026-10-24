// @kind integration
// An undeclared /apple-touch-icon.png must be considered even when a declared favicon is already
// "good enough" (newyorker.com: favicon.ico declared four times, colour icon only at the standard path).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(browser, env) {
  const child = spawnSync(process.execPath, ["tests/harness/background-runtime-scenario.mjs", browser, "favicon-undeclared-touch"],
    { cwd: process.cwd(), env: { ...process.env, ...env }, encoding: "utf8", timeout: 30000 });
  assert.equal(child.status, 0, `${browser} failed: ${child.stderr.slice(-800)}`);
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: a sharper undeclared home-screen icon replaces a "good enough" 64px favicon`, () => {
    const result = run(browser, { TOUCH_ICO_FRAMES: "16,32,48,64", TOUCH_ICON: "ok" });
    assert.equal(result.stored, "touch", JSON.stringify(result));
    assert.equal(result.queue, 0, "no retry should remain queued");
  });
  test(`${browser}: a missing or failing home-screen icon keeps the favicon and still completes the audit`, () => {
    for (const mode of ["missing", "network"]) {
      const result = run(browser, { TOUCH_ICO_FRAMES: "16,32,48,64", TOUCH_ICON: mode });
      assert.equal(result.stored, "favicon", `${mode}: ${JSON.stringify(result)}`);
      assert.equal(result.ledger, 1, `${mode}: the quality audit must still be recorded as complete`);
      assert.equal(result.queue, 0, `${mode}: the optional probe must not schedule retries`);
    }
  });
  test(`${browser}: a sharp 128px favicon requires no additional guessed Apple icon request`, () => {
    const result = run(browser, { TOUCH_ICO_FRAMES: "16,32,128", TOUCH_ICON: "ok" });
    assert.equal(result.stored, "favicon", JSON.stringify(result));
    assert.equal(result.touchRequests, 0, "a tile-ready favicon should not incur the extra probe");
  });
  test(`${browser}: a small favicon still upgrades to the home-screen icon as before`, () => {
    assert.equal(run(browser, { TOUCH_ICO_FRAMES: "16,32", TOUCH_ICON: "ok" }).stored, "touch");
  });
}
