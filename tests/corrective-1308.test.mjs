import { readBackgroundSource } from "./harness/background-source.mjs";
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

test("1.30.8 preserves a newer same-key Personal record delivered inside the publication read->write window", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1308-personal-mid-publication-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.remoteWinner, "https://remote-newer.test/");
    assert.equal(out.localPublished, true);
    assert.equal(out.liveRecordCount, 2);
  }
});

test("1.30.8 preserves a newer same-key Work record delivered inside the publication read->write window", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1308-work-mid-publication-evidence");
    assert.equal(out.injected, true);
    assert.equal(out.remoteWinner, "https://work-remote-newer.test/");
    assert.equal(out.localPublished, true);
    assert.equal(out.liveRecordCount, 2);
  }
});

test("1.30.8 failed foreground single-flight clears and the next request executes normally", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1308-single-flight-failure-recovery");
    assert.equal(out.firstFailed, true);
    assert.equal(out.secondRecovered, true);
  }
});

test("1.30.8 foreground single-flight never becomes a completed-result freshness cache", () => {
  for (const browser of ["firefox", "chrome"]) {
    const out = runScenario(browser, "sync-1308-post-single-flight-freshness");
    assert.equal(out.firstRequests, 20);
    assert.equal(out.newRead, true);
    assert.equal(out.recovered, true);
  }
});

test("1.30.8 normalized Cross-Space move tolerates a deeply frozen trusted input without mutating it", async () => {
  const model = await import(`../dist/firefox/core/model.js?1308=${Date.now()}`);
  const before = model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{
          type: "folder", id: "f", title: "F", position: 0, createdAt: 1, modifiedAt: 1,
          items: [{ type: "shortcut", id: "a", title: "A", url: "https://a.test/", position: 0, createdAt: 1, modifiedAt: 1, image: "", imageSyncData: "", imageSyncKind: "none", imageSourceKind: "none", imageStyle: "contain", source: "manual" }, { type: "shortcut", id: "b", title: "B", url: "https://b.test/", position: 1, createdAt: 1, modifiedAt: 1, image: "", imageSyncData: "", imageSyncKind: "none", imageSourceKind: "none", imageStyle: "contain", source: "manual" }]
        }],
        settings: {}, settingsModifiedAt: 1, updatedAt: 1
      },
      work: { shortcuts: [], settings: {}, settingsModifiedAt: 1, updatedAt: 1 }
    }
  });
  deepFreeze(before);
  const moved = model.moveShortcutBetweenSpacesNormalized(before, { shortcutId: "a", fromSpaceId: "personal", toSpaceId: "work" });
  assert.notEqual(moved, before);
  assert.notEqual(moved.spaces.personal, before.spaces.personal);
  assert.notEqual(moved.spaces.work, before.spaces.work);
  assert.equal(before.spaces.personal.shortcuts[0].items[0].id, "a", "trusted fast path must leave frozen source tree untouched");
});

test("1.30.8 remote evidence is bounded, core-only, and repaired before authoritative commit/read paths", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    assert.match(source, /const deliveredCoreEvidence = new Map\(\)/);
    assert.match(source, /while \(deliveredCoreEvidence\.size > MAX_EXPECTATIONS\)/);
    assert.match(source, /function coreEvidenceDescriptor\(key, value\)/);
    assert.match(source, /\["shortcut", "folder", "deleted"\]\.includes\(value\.kind\)/);
    assert.match(source, /await repairDeliveredCoreEvidence\(PERSONAL_SPACE_ID\);[\s\S]*?const committedSnapshot = await readSyncSnapshot/);
    assert.match(source, /await repairDeliveredCoreEvidence\(WORK_SPACE_ID\);[\s\S]*?const committedSnapshot = await readSyncSnapshot/);
  }
});

test("1.30.8 own-write storage events preserve an overwritten deterministic winner from oldValue", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("browser.storage.onChanged.addListener");
    const end = source.indexOf("browser.alarms?.onAlarm?.addListener", start);
    const block = source.slice(start, end);
    assert.match(block, /rememberOverwrittenCoreEvidence\(key, change\.oldValue, change\.newValue\)/);
    assert.match(block, /rememberDeliveredCoreEvidence\(key, change\.newValue\)/);
    assert.match(source, /function scheduleSyncStorageReconciliation\(\)[\s\S]*?if \(!durableExternalChange && !overwrittenEvidenceCount\) continue;/);
    assert.match(block, /pendingSyncStorageOverwrittenEvidence \+= overwrittenEvidenceCount/);
  }
});
