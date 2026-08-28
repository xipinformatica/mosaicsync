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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

test("1.30.9 trusted workspace replacement is equivalent to the defensive path without mutating frozen input", async () => {
  const model = await import(`../dist/firefox/core/model.js?1309=${Date.now()}`);
  const before = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{ type:"shortcut", id:"a", title:"A", url:"https://a.test/", position:0, createdAt:1, modifiedAt:1, image:"", imageSyncData:"", imageSyncKind:"none", imageSourceKind:"none", imageStyle:"contain", source:"manual" }],
        settings: { spaceName:"" }, settingsModifiedAt:1, updatedAt:1
      },
      work: { shortcuts: [], settings: {}, settingsModifiedAt:1, updatedAt:1 }
    }
  });
  const personal = before.spaces.personal;
  const updated = {
    ...personal,
    settings: { ...personal.settings, spaceName:"Trusted" },
    settingsModifiedAt: 2,
    updatedAt: 2
  };
  const defensive = model.replaceWorkspace(before, "personal", updated);
  deepFreeze(before);
  const trusted = model.replaceWorkspaceTrustedNormalized(before, "personal", updated);
  assert.deepEqual(trusted, defensive);
  assert.equal(before.spaces.personal.settings.spaceName, "");
  assert.notEqual(trusted.spaces.personal, before.spaces.personal);
});

test("1.30.9 measured New Tab preference paths use trusted normalized workspace replacement", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  for (const name of ["persistFrequentlyVisitedPreference", "persistWorkspaceSetting", "setMultipleSpacesEnabled"]) {
    const start = source.indexOf(`async function ${name}`);
    assert.ok(start >= 0, `missing ${name}`);
    const end = source.indexOf("\n  async function ", start + 20);
    const block = source.slice(start, end >= 0 ? end : source.length);
    assert.match(block, /replaceWorkspaceTrustedNormalized\(/, `${name} should use the trusted replacement path`);
    assert.doesNotMatch(block, /const normalized = normalizeState\(state\)/, `${name} should not re-normalize the already-trusted live state`);
  }
  const spacesStart = source.indexOf("async function setMultipleSpacesEnabled");
  const spacesEnd = source.indexOf("\n  async function ", spacesStart + 20);
  const spacesBlock = source.slice(spacesStart, spacesEnd);
  assert.match(spacesBlock, /selectActiveSpaceNormalized\(state, "personal"\)/);
});

test("1.30.9 Sync publication reuses the already-normalized state for profile snapshot publication", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    assert.doesNotMatch(source, /publishProfileDeviceSnapshot\(normalizeState\((?:newRaw|newStateInput)\), meta\)/);
    assert.match(source, /publishProfileDeviceSnapshot\(newStateInput, meta\)/);
  }
});

test("1.30.9 watchdog retries pending local publication only once before its semantic freshness check", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = fs.readFileSync(resolve(root, `src/${browser}/background/background.js`), "utf8");
    assert.match(source, /await reconcileIfNewCommit\("alarm", meta, true\);/);
    assert.match(source, /if \(!pendingLocalAlreadyRetried\) meta = await retryPendingLocalSyncMutation\(meta\);/);
  }
});

test("1.30.9 delivered evidence never overrides a newer local same-key winner", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1309-personal-local-newer-than-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.localWinner, "https://local-newer.test/");
    assert.equal(out.liveRecordCount, 2);
  }
});

test("1.30.9 newer delivered tombstones win over racing older local live records", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1309-personal-newer-remote-tombstone-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.tombstoneWinner, "deleted");
    assert.equal(out.localPublished, true);
    assert.equal(out.liveRecordCount, 1);
  }
});

test("1.30.9 delivered tombstone evidence preserves MosaicSync deletion dominance over later ordinary edits", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1309-personal-local-live-newer-than-tombstone-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.tombstoneWinner, "deleted");
    assert.equal(out.liveRecordCount, 1);
  }
});

test("1.30.9 same-key Settings evidence uses the same deterministic repair path", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1309-personal-settings-mid-publication-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.columns, 12);
    assert.equal(out.settingsModifiedAt, 500);
  }
});

test("1.30.9 removes only proven-dead runtime symbols from the mature source tree", () => {
  const constants = fs.readFileSync(resolve(root, "src/shared/core/constants.js"), "utf8");
  const domain = fs.readFileSync(resolve(root, "src/shared/core/registrable-domain.js"), "utf8");
  const model = fs.readFileSync(resolve(root, "src/shared/core/model.js"), "utf8");
  assert.doesNotMatch(constants, /NATIVE_FAVICON_CONCURRENCY/);
  assert.doesNotMatch(constants, /ICON_RECOVERY_HIGH_QUALITY_SIDE/);
  assert.doesNotMatch(domain, /registrableDomainFromUrl/);
  assert.doesNotMatch(domain, /resetPublicSuffixRulesForTests/);
  assert.doesNotMatch(model, /export function workspaceState\(/);
});
