import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const harness = path.resolve(import.meta.dirname, "harness/newtab-runtime-smoke.mjs");

function runSmoke(tree, browser) {
  const run = spawnSync(process.execPath, [harness, tree, browser], { cwd: tree, encoding: "utf8", timeout: 20_000 });
  const lines = String(run.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  const result = lines.length ? JSON.parse(lines.at(-1)) : null;
  return { run, result };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.30 ${browser} full generated New Tab reaches interactionReady with Settings and Frequently Visited live`, () => {
    const { run, result } = runSmoke(root, browser);
    assert.equal(run.status, 0, `${browser} full New Tab smoke failed:\n${run.stdout}\n${run.stderr}`);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.consoleErrors, []);
    assert.equal(result.interactionReady, true, "authoritative loadState startup must reach the interaction-ready boundary");
    assert.ok(result.settingsClickListeners > 0, "Settings must have a real generated click listener");
    assert.equal(result.settingsOpened, true, "clicking the generated Settings control must actually open the panel");
    assert.ok(result.swatchClickListeners > 0, "the synchronous color-swatch pass must complete and attach its listener");
    assert.ok(result.storageListeners > 0, "the full module must reach external-state listener registration");
    assert.ok(result.topSitesCalls > 1, "enabled and re-enabled Frequently Visited must execute the browser top-sites path");
    assert.equal(result.frequentlyVisitedVisible, true, "Frequently Visited must finish a live render rather than remain bootstrap-hidden");
    assert.ok(result.frequentlyVisitedChangeListeners > 0, "the real Settings FV toggle must have its generated change listener");
    assert.deepEqual(result.frequentDisabled, { optionsHidden: true, sectionHidden: true }, "disabling FV must hide its dependent controls and live strip");
    assert.deepEqual(result.frequentReenabled, { optionsVisible: true, sectionVisible: true }, "re-enabling FV with permission must restore controls and the live strip");
  });
}

test("1.30.18.30 full-startup smoke fails closed on the withdrawn 1.30.18.26 dependency-contract class", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mosaicsync-newtab-smoke-"));
  try {
    await fs.cp(path.join(root, "dist/firefox"), path.join(temp, "dist/firefox"), { recursive: true });
    const ownerPath = path.join(temp, "dist/firefox/newtab/appearance-color.js");
    let owner = await fs.readFile(ownerPath, "utf8");
    owner = owner.replace("export function normalizeHexColor(value) {", "export function normalizeHexColor(value, validHexDependency) {");
    owner = owner.replace("return validHex(text) ? text.toLowerCase() : \"\";", "return validHexDependency(text) ? text.toLowerCase() : \"\";");
    await fs.writeFile(ownerPath, owner);

    const { run, result } = runSmoke(temp, "firefox");
    assert.notEqual(run.status, 0, "the integration smoke must reject a one-argument caller / injected-validator contract mismatch");
    assert.ok(result?.failures.some(value => /validHexDependency is not a function/.test(value)),
      `expected the historical startup failure class, got ${JSON.stringify(result)}`);
    assert.equal(result?.interactionReady, false, "a startup exception before wiring must never be mistaken for an interactive page");
    assert.equal(result?.settingsClickListeners, 0, "the smoke must observe that later Settings wiring was skipped");
    assert.equal(result?.topSitesCalls, 0, "the smoke must observe that later Frequently Visited startup was skipped");
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
