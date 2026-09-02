import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  DEFAULT_STATE,
  SYNC_SCHEMA_VERSION
} from "../src/shared/core/constants.js";
import {
  faviconPreferenceForCandidate,
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  normalizeFaviconPreference,
  normalizeState,
  stateFromRecords,
  workspaceStateNormalized
} from "../src/shared/core/model.js";

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
  test(`1.30.14 ${browser} double-confirms zero namespace before quarantine`, () => {
    const out = runScenario(browser, "sync-loss-13014-zero-double-check");
    assert.equal(out.doubleChecked, true);
    assert.equal(out.falseZeroIgnored, true);
  });

  test(`1.30.14 ${browser} persisted quarantine gets a fresh browser-startup warm-up`, () => {
    const out = runScenario(browser, "sync-loss-13014-startup-warmup");
    assert.equal(out.startupWarmup, true);
  });

  test(`1.30.14 ${browser} reset observer waits safely and automatically rejoins later profile`, () => {
    const out = runScenario(browser, "sync-loss-13014-reset-peer-rejoins");
    assert.equal(out.waited, true);
    assert.equal(out.rejoined, true);
  });

  test(`1.30.14 ${browser} recovering worker restart respects persisted retry grace`, () => {
    const out = runScenario(browser, "sync-loss-13014-recovering-restart-grace");
    assert.equal(out.restartGrace, true);
  });
}

test("1.30.14 reset markers require a non-empty initiating device id", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("function validResetIntent");
    const end = source.indexOf("function recoveryStalePenalty", start);
    const block = source.slice(start, end);
    assert.match(block, /value\.initiatedByDevice\.length > 0/);
  }
});

test("1.30.14 manually chosen detected favicon syncs only a compact preference token", () => {
  const image = "data:image/png;base64," + "A".repeat(1200);
  const candidate = {
    image,
    sourceUrl: "https://cdn.example.test/assets/favicon-v4.svg?cache=123",
    source: "link",
    width: 128,
    height: 128
  };
  const preference = faviconPreferenceForCandidate(candidate);
  assert.match(preference, /^u:[0-9a-f]{8}:[0-9a-f]{8}$/);
  assert.equal(normalizeFaviconPreference(preference), preference);
  assert.ok(preference.length <= 19);

  const state = normalizeState({
    ...DEFAULT_STATE,
    shortcuts: [{
      type: "shortcut", id: "fav", title: "Fav", url: "https://example.test/",
      faviconPreference: preference,
      image, imageSyncData: "", imageAssetId: "", localImageAssetId: "",
      imageSyncKind: "device", imageSourceKind: "upload", imageSourceUrl: "",
      imageIsFallback: false, imageStyle: "contain", position: 0,
      createdAt: 100, modifiedAt: 200, source: "manual"
    }],
    updatedAt: 200
  });
  const records = flattenStateNormalized(state, "device-a");
  const record = records.get("fav");
  assert.equal(record.favPref, preference);
  assert.equal(record.imageKind, "device");
  assert.equal(record.imageAssetId, "");
  assert.equal(JSON.stringify(record).includes("data:image"), false, "preference Sync record must not contain favicon pixels");
});

test("1.30.14 remote favicon preference invalidates pixels for a different local preference but preserves a matching local copy", () => {
  const remoteImage = "data:image/png;base64,REMOTE";
  const oldImage = "data:image/png;base64,OLD";
  const preference = faviconPreferenceForCandidate({ image: remoteImage, sourceUrl: "https://example.test/favicon.svg", source: "link" });
  const workspace = workspaceStateNormalized(normalizeState(DEFAULT_STATE), "personal");
  const settings = makeSettingsRecordNormalized(workspace, "remote");
  const records = new Map([["fav", {
    schemaVersion: SYNC_SCHEMA_VERSION, kind: "shortcut", id: "fav", parentId: null,
    title: "Fav", url: "https://example.test/", imageAssetId: "", imageKind: "device",
    imageSourceKind: "upload", imageSourceUrl: "", imageStyle: "contain", position: 0,
    createdAt: 10, modifiedAt: 20, source: "manual", deviceId: "remote", favPref: preference
  }]]);

  const staleLocal = normalizeState({
    ...DEFAULT_STATE,
    shortcuts: [{
      type: "shortcut", id: "fav", title: "Fav", url: "https://example.test/",
      faviconPreference: "i:11111111", image: oldImage, imageSyncData: "", imageAssetId: "", localImageAssetId: "",
      imageSyncKind: "device", imageSourceKind: "upload", imageSourceUrl: "", imageIsFallback: false,
      imageStyle: "contain", position: 0, createdAt: 10, modifiedAt: 15, source: "manual"
    }]
  });
  const replaced = stateFromRecords(records, settings, staleLocal, new Map());
  assert.equal(replaced.shortcuts[0].faviconPreference, preference);
  assert.equal(replaced.shortcuts[0].image, "", "different preference must force device-local rehydration");

  const matchingLocal = normalizeState({
    ...staleLocal,
    shortcuts: [{ ...staleLocal.shortcuts[0], faviconPreference: preference, image: remoteImage }]
  });
  const preserved = stateFromRecords(records, settings, matchingLocal, new Map());
  assert.equal(preserved.shortcuts[0].image, remoteImage, "same preference should reuse already hydrated local pixels");
});

test("1.30.14 100 manual favicon preferences consume only a small Sync-record budget", () => {
  const makeState = withPrefs => normalizeState({
    ...DEFAULT_STATE,
    shortcuts: Array.from({ length: 100 }, (_, index) => ({
      type: "shortcut", id: `s${index}`, title: `Site ${index}`, url: `https://site${index}.example/`,
      faviconPreference: withPrefs ? `u:${index.toString(16).padStart(8, "0")}:${(index + 1000).toString(16).padStart(8, "0")}` : "",
      image: "", imageSyncData: "", imageAssetId: "", localImageAssetId: "",
      imageSyncKind: "device", imageSourceKind: "upload", imageSourceUrl: "", imageIsFallback: false,
      imageStyle: "contain", position: index, createdAt: 100 + index, modifiedAt: 200 + index, source: "manual"
    })),
    updatedAt: 500
  });
  const bytes = state => Buffer.byteLength(JSON.stringify([...flattenStateNormalized(state, "device-a").values()]));
  const overhead = bytes(makeState(true)) - bytes(makeState(false));
  assert.ok(overhead > 0);
  assert.ok(overhead < 5000, `100 preferences should stay below 5 KB of extra record JSON; got ${overhead} bytes`);
});

test("1.30.14 favicon chooser records preference without forcing image-byte Sync", () => {
  const source = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  const start = source.indexOf("function renderDetectedFaviconChoices");
  const end = source.indexOf("async function openShortcutEditor", start);
  const block = source.slice(start, end);
  assert.match(block, /pendingShortcutFaviconPreference = faviconPreferenceForCandidate\(candidate\)/);
  assert.match(block, /shortcutSyncImage\.checked = false/);
  assert.match(block, /pendingShortcutImageKind = "device"/);
});

test("1.30.14 preferred favicon hydration uses compact preference matching in both browsers", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    assert.match(source, /resolveFaviconForUrlWithPreference/);
    assert.match(source, /faviconPreferenceMatchesCandidate\(wanted, candidate\)/);
    assert.match(source, /faviconPreference: normalizeFaviconPreference\(item\.faviconPreference\)/);
    assert.match(source, /result\.preferenceMatched !== true/);
  }
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.14 ${browser} locally rehydrates the exact synchronized favicon preference without Syncing pixels`, () => {
    const out = runScenario(browser, "favicon-preference-rehydrate-13014");
    assert.equal(out.hydrated, 1);
    assert.equal(out.exact, true);
    assert.match(out.preference, /^u:[0-9a-f]{8}:[0-9a-f]{8}$/);
  });
}
