import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_SETTINGS,
  META_SCHEMA_VERSION,
  PROFILE_SNAPSHOT_SCHEMA_VERSION,
  VERSION
} from "../dist/firefox/core/constants.js";
import {
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  mergeRecordMaps,
  normalizeState,
  stateFromRecords,
  workspaceStateNormalized
} from "../dist/firefox/core/model.js";

const t = 1_800_000_000_000;
function shortcut(id, position, modifiedAt = t) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`,
    image: "", imageSyncData: "", imageAssetId: "", localImageAssetId: "",
    imageSyncKind: "none", imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", builtinIcon: "", colorTag: "", position,
    createdAt: modifiedAt, modifiedAt, source: "manual"
  };
}
function state(personalItems = [], workItems = []) {
  const personal = { shortcuts: personalItems, settings: { ...DEFAULT_SETTINGS }, settingsModifiedAt: t, updatedAt: t };
  const work = { shortcuts: workItems, settings: { ...DEFAULT_SETTINGS, spaceName: "Work" }, settingsModifiedAt: t, updatedAt: t };
  return normalizeState({ activeSpaceId: "personal", spaces: { personal, work } });
}

test("1.30 release and local Sync bookkeeping schemas are explicit", () => {
  assert.equal(VERSION, "1.30.18.28");
  assert.equal(META_SCHEMA_VERSION, 12);
  assert.equal(PROFILE_SNAPSHOT_SCHEMA_VERSION, 1);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.8 ${browser} device snapshot is a backward-compatible complete Personal+Work generation`, async () => {
    const src = readBackgroundSource(browser);
    assert.match(src, /version:\s*DEVICE_SNAPSHOT_SCHEMA_VERSION,[\s\S]*?records:[\s\S]*?settings:[\s\S]*?workRecords:[\s\S]*?workSettings/,
      "payload must remain v2-readable by 1.27.7 while adding Work");
    assert.match(src, /profileComplete\s*=\s*true|profileComplete:\s*true/);
    assert.match(src, /previousRoot:\s*currentOwn\?\.root \|\| null/,
      "the core must pass its currently verified root to publication preparation");
    assert.match(src, /previousProfile:\s*previousProfileDescriptor\(previousRoot\)/,
      "the first immutable generation must retain a descriptor for the legacy complete fallback when available");
    assert.match(src, /const rootKey = deviceSnapshotGenerationKey\(deviceId, commitId\)/,
      "new complete-profile recovery publications must use commit-scoped immutable roots");
    assert.match(src, /await writeSyncItems\(chunkWrites[\s\S]*?await writeSyncItems\(\{ \[rootKey\]: rootValue \}/,
      "chunks must commit before the authoritative root");
    assert.doesNotMatch(src, /publishDeviceSnapshot\([\s\S]{0,200}?newRecords, newSettings/,
      "normal mutations must not fall back to the Personal-only publisher");
  });

  test(`1.27.8.8 ${browser} fresh bootstrap cannot finalize from Personal alone`, async () => {
    const src = readBackgroundSource(browser);
    const start = src.indexOf("async function bootstrapRemote");
    const end = src.indexOf("const CROSS_SPACE_SYNC_TRANSACTION_VERSION", start);
    const fn = src.slice(start, end);
    assert.match(fn, /const profileComplete =/);
    assert.match(fn, /const legacyComplete = remoteCoreUsable\(personalCore\) && isSnapshotUsable\(workSnapshot\)/);
    assert.match(fn, /\(!profileComplete && !legacyComplete\)/);
    assert.match(fn, /syncStatus:\s*waitIfMissing \? "waiting" : "error"/);
  });

  test(`1.27.8.8 ${browser} waiting-profile local edits merge and publish after complete arrival`, async () => {
    const src = readBackgroundSource(browser);
    const start = src.indexOf("async function bootstrapRemote");
    const end = src.indexOf("const CROSS_SPACE_SYNC_TRANSACTION_VERSION", start);
    const fn = src.slice(start, end);
    assert.match(fn, /mergeRecordMaps\(remote\.records, localRecords\)/);
    assert.match(fn, /pushLocalMutation\(remoteOnlyState, mergedState, refreshed\)/);
    assert.match(fn, /publishProfileDeviceSnapshot\(mergedState, refreshed, \{ force: true \}\)/);
  });

  test(`1.27.8.8 ${browser} torn Work ledger is repaired from the complete profile and never treated as empty`, async () => {
    const src = readBackgroundSource(browser);
    const start = src.indexOf("async function reconcileWork");
    const end = src.indexOf("async function reconcile(strategy", start);
    const fn = src.slice(start, end);
    assert.match(fn, /if \(!remoteCoreUsable\(core\)\)[\s\S]*?syncStatus:\s*"waiting"/);
    assert.match(fn, /const shouldCommitDataset = hasCoreWrites \|\| sharedLedgerPartial/);
    assert.match(fn, /if \(shouldCommitDataset && desiredDataset\) await writeSyncItems\(\{ \[namespace\.datasetKey\]: desiredDataset \}\)/);
    assert.doesNotMatch(fn, /remoteMissing:\s*true/);
  });

  test(`1.27.8.8 ${browser} shortcut hover is restrained, paint-only and does not change grid geometry`, async () => {
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    assert.match(css, /\.shortcut-card:hover \.tile\s*\{[\s\S]*?transform:\s*scale\(1\.045\);[\s\S]*?filter:\s*brightness\(1\.065\);/);
    assert.match(css, /transition:[^;]*transform 100ms ease,[^;]*filter 100ms ease/);
  });
}

test("1.27.8.8 complete-arrival merge keeps a shortcut created locally while remote shortcuts arrive", () => {
  const remoteState = state([shortcut("remote-a", 0), shortcut("remote-b", 1)], [shortcut("work-a", 0)]);
  const localWaitingState = state([shortcut("local-new", 2, t + 1000)], []);
  const remoteWorkspace = workspaceStateNormalized(remoteState, "personal");
  const localWorkspace = workspaceStateNormalized(localWaitingState, "personal");
  const remoteRecords = flattenStateNormalized(remoteWorkspace, "remote-device");
  const localRecords = flattenStateNormalized(localWorkspace, "local-device");
  const merged = mergeRecordMaps(remoteRecords, localRecords);
  const rebuilt = stateFromRecords(
    merged,
    makeSettingsRecordNormalized(remoteWorkspace, "remote-device"),
    localWorkspace,
    new Map()
  );
  assert.deepEqual(rebuilt.shortcuts.map(item => item.id).sort(), ["local-new", "remote-a", "remote-b"]);
});
