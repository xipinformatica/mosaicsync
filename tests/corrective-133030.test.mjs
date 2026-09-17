import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createTestRecoveryLifecycle } from "./harness/recovery-lifecycle.mjs";
import { testFilesForGroup } from "../tools/test-groups.mjs";
import { hostLabel } from "../src/shared/core/model.js";

function rootKey(deviceId, commitId) {
  return `recovery.${deviceId}.snapshot.${commitId}`;
}

function root(deviceId, commitId, updatedAt) {
  return {
    schemaVersion: 2,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: 1,
    chunkKeyMode: "generation",
    snapshotId: commitId,
    deviceId,
    commitId,
    updatedAt,
    publishedAt: updatedAt,
    profileComplete: true
  };
}

function snapshot(deviceId, commitId, updatedAt) {
  return {
    rootKey: rootKey(deviceId, commitId),
    deviceId,
    commitId,
    updatedAt,
    publishedAt: updatedAt,
    profileComplete: true,
    usedPreviousGeneration: false
  };
}

function addGeneration(all, deviceId, commitId, updatedAt) {
  const key = rootKey(deviceId, commitId);
  all[key] = root(deviceId, commitId, updatedAt);
  all[`${key}.chunk.0`] = { kind: "device-snapshot-chunk", data: commitId };
  return key;
}

function compareRecency(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0) ||
    (Number(right?.publishedAt) || 0) - (Number(left?.publishedAt) || 0) ||
    String(right?.commitId || "").localeCompare(String(left?.commitId || ""));
}

function descriptor(key, value) {
  if (!value || !["device-snapshot", "device-snapshot-manifest"].includes(value.kind)) return null;
  if (!value.deviceId || key !== rootKey(value.deviceId, value.snapshotId || value.commitId)) return null;
  return {
    key,
    deviceId: value.deviceId,
    commitId: value.commitId || "",
    publishedAt: Number(value.publishedAt) || 0,
    updatedAt: Number(value.updatedAt) || 0
  };
}

function lifecycle() {
  return createTestRecoveryLifecycle({
    compareDeviceSnapshotGenerationRecency: compareRecency,
    deviceRootDescriptor: descriptor,
    policy: { orphanMinGcPasses: 2 }
  });
}

function matureObservation(rootKeys, gcPass = 10) {
  return {
    rootSeenPass: Object.fromEntries(rootKeys.map(key => [key, 1])),
    gcPass
  };
}

function snapshotsFrom(all) {
  return Object.entries(all)
    .filter(([key]) => !key.includes(".chunk."))
    .map(([, value]) => snapshot(value.deviceId, value.commitId, value.updatedAt));
}

function deleteKeys(all, keys) {
  for (const key of keys) delete all[key];
}

function extractSubmitCallback(source) {
  const marker = 'shortcutForm.addEventListener("submit", async event => {';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "missing shortcut submit handler");
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) {
      return `async function submitShortcutForTest(event) ${source.slice(brace, i + 1)}`;
    }
  }
  throw new Error("unterminated shortcut submit handler");
}

test("1.33.0.30 opposite whole-device Recovery cleanup cannot consume a freshly observed target survivor", () => {
  const owner = lifecycle();
  const all = {};
  const a1 = addGeneration(all, "A", "1", 10);
  const b1 = addGeneration(all, "B", "1", 10);
  const initialObservationA = matureObservation([a1, b1]);

  const planA = owner.planManualRecoveryCleanup(all, snapshotsFrom(all), {
    mode: "device", deviceId: "B", currentDeviceId: "A", ...initialObservationA
  });
  assert.deepEqual(planA.rootKeys, [b1]);

  const a2 = addGeneration(all, "A", "2", 20);
  const observationB = matureObservation([a1, b1]); // A2 is newly observed and intentionally absent.
  const planB = owner.planManualRecoveryCleanup(all, snapshotsFrom(all), {
    mode: "device", deviceId: "A", currentDeviceId: "B", ...observationB
  });
  assert.deepEqual(planB.rootKeys, [], "a newly observed target generation must block whole-device destructive authority");

  const b2 = addGeneration(all, "B", "2", 20);
  const removeA = owner.confirmedManualRecoveryCleanupKeys(all, snapshotsFrom(all), planA);
  deleteKeys(all, removeA);
  const removeB = owner.confirmedManualRecoveryCleanupKeys(all, snapshotsFrom(all), planB);
  deleteKeys(all, removeB);

  assert.ok(all[a2], "A's fresh survivor must remain present");
  assert.ok(Object.keys(all).some(key => key === a1 || key === a2), "A must retain at least one Recovery generation");
  assert.ok(all[b2], "B's fresh survivor must remain present");
});

test("1.33.0.30 schemeless hostname:port is accepted without reinterpreting unsupported URI schemes", async () => {
  const { normalizeShortcutUrl } = await import(`../dist/firefox/newtab/ui-utils.js?133030=${Date.now()}`);
  assert.equal(normalizeShortcutUrl("localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizeShortcutUrl("example.com:8443/path"), "https://example.com:8443/path");
  assert.equal(normalizeShortcutUrl("myserver.local:9090"), "https://myserver.local:9090/");
  assert.equal(normalizeShortcutUrl("127.0.0.1:8080/test"), "http://127.0.0.1:8080/test");
  for (const value of [
    "ftp://example.com/",
    "mailto:test@example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hello",
    "chrome://settings/",
    "moz-extension://abc/page.html"
  ]) {
    assert.throws(() => normalizeShortcutUrl(value), /http:\/\/ and https:\/\/ shortcuts/);
  }
});

test("1.33.0.30 invalid shortcut URL performs no website-access permission request", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractSubmitCallback(source);
  let permissionRequests = 0;
  let toast = "";
  const context = {
    state: { settings: { autoSiteIcons: true } },
    pendingShortcutImage: "",
    pendingShortcutBuiltinIcon: "",
    webAccessGranted: false,
    requestWebAccessFromGesture() { permissionRequests += 1; return Promise.resolve(true); },
    normalizeShortcutUrl() { throw new Error("invalid-url"); },
    shortcutUrl: { value: "not valid" },
    shortcutTitle: { value: "" },
    showToast(value) { toast = value; },
    t() { return "operationFailed"; },
    console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.submitShortcutForTest = submitShortcutForTest;`, context);
  await context.submitShortcutForTest({ preventDefault() {} });
  assert.equal(permissionRequests, 0, "invalid URL must fail before asking for optional all-sites access");
  assert.equal(toast, "invalid-url");
});


test("1.33.0.30 blank shortcut name is behaviorally persisted as the normalized host", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractSubmitCallback(source);
  const { normalizeShortcutUrl } = await import(`../dist/firefox/newtab/ui-utils.js?save133030=${Date.now()}`);
  const state = {
    settings: { autoSiteIcons: false },
    activeSpaceId: "personal",
    shortcuts: [],
    spaces: { personal: { shortcuts: [], settings: {} }, work: { shortcuts: [], settings: {} } },
    updatedAt: 0
  };
  let toast = "";
  const context = {
    state,
    pendingShortcutImage: "",
    pendingShortcutSyncData: "",
    pendingShortcutImageKind: "",
    pendingShortcutImageSourceKind: "",
    pendingShortcutImageSourceUrl: "",
    pendingShortcutImageIsFallback: false,
    pendingShortcutBuiltinIcon: "",
    pendingShortcutColorTag: "",
    pendingShortcutFaviconPreference: "",
    shortcutArtworkEdited: false,
    webAccessGranted: false,
    normalizeShortcutUrl,
    hostLabel,
    shortcutUrl: { value: "https://www.youtube.com/watch?v=1" },
    shortcutTitle: { value: "   " },
    shortcutId: { value: "" },
    shortcutSyncImage: { checked: false },
    shortcutImageStyle: { value: "contain" },
    findShortcutRecord() { return null; },
    isMultipleSpacesEnabled() { return false; },
    SPACE_IDS: ["personal", "work"],
    editingDestinationSpaceId: "personal",
    editingSourceSpaceId: "personal",
    editingParentFolderId: null,
    editingPreferredPosition: 0,
    firstEmptyTopLevelPosition() { return 0; },
    uid() { return "shortcut-1"; },
    now() { return 100; },
    saveState: async () => {},
    render() {},
    closeDialog() {},
    shortcutDialog: {},
    shortcutSyncPrepareGeneration: 0,
    requestMissingSiteIcons() {},
    showToast(value) { toast = value; },
    t(key) { return key; },
    console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.submitShortcutForTest = submitShortcutForTest;`, context);
  await context.submitShortcutForTest({ preventDefault() {} });
  assert.equal(state.shortcuts.length, 1);
  assert.equal(state.shortcuts[0].title, "youtube.com");
  assert.equal(state.shortcuts[0].url, "https://www.youtube.com/watch?v=1");
  assert.equal(toast, "shortcutAdded");
});

test("1.33.0.30 corrective is owned by the relevant certification groups", () => {
  for (const group of ["newtab", "sync", "recovery", "security", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133030.test.mjs"), `${group} must include corrective-133030.test.mjs`);
  }
});
