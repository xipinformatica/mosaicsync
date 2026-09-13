import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helper = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function run(browser, scenario) {
  const out = spawnSync(process.execPath, [helper, browser, scenario], { cwd: root, encoding: "utf8", timeout: 45000 });
  assert.equal(out.status, 0, `${browser}/${scenario} failed:\n${out.stdout}\n${out.stderr}`);
  return JSON.parse(out.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
}

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
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
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.33.0.20 ${browser}: torn Personal live delivery cannot self-heal Recovery or clear a generic error, then converges when complete`, () => {
    const result = run(browser, "corrective-133020-torn-personal-live-guard");
    assert.equal(result.partialGuarded, true);
    assert.equal(result.completeConverged, true);
  });

  test(`1.33.0.20 ${browser}: torn Work live delivery cannot self-heal Recovery or clear a generic error, then converges when complete`, () => {
    const result = run(browser, "corrective-133020-torn-work-live-guard");
    assert.equal(result.partialGuarded, true);
    assert.equal(result.completeConverged, true);
  });

  test(`1.33.0.20 ${browser}: total live wipe remains owned by catastrophic-loss quarantine`, () => {
    const result = run(browser, "corrective-133020-total-live-wipe-negative-control");
    assert.equal(result.quarantined, true);
    assert.equal(result.noRepair, true);
    assert.equal(result.errorPreserved, true);
  });

  test(`1.33.0.20 ${browser}: Recovery cleanup never expands beyond its frozen target roots`, () => {
    const result = run(browser, "corrective-133020-frozen-target-survives-post-plan-generation");
    assert.equal(result.oldRemoved, true);
    assert.equal(result.newSurvived, true);
  });

  test(`1.33.0.20 ${browser}: failed acting-device survivor publication aborts destructive cleanup`, () => {
    const result = run(browser, "corrective-133020-survivor-publication-failure-aborts-cleanup");
    assert.equal(result.failedClosed, true);
    assert.equal(result.targetPreserved, true);
  });
}

test("1.33.0.20 network-learned artwork can never normalize into synchronized image bytes", async () => {
  const model = await import(`${pathToFileURL(resolve(root, "dist/firefox/core/model.js")).href}?privacy=${Date.now()}`);
  const constants = await import(`${pathToFileURL(resolve(root, "dist/firefox/core/constants.js")).href}?privacy=${Date.now()}`);
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+ZzqOMwAAAABJRU5ErkJggg==";
  for (const imageSourceKind of ["favicon", "remote", "firefox"]) {
    const state = model.normalizeState({
      schemaVersion: constants.STATE_SCHEMA_VERSION,
      activeSpaceId: "personal",
      spaces: {
        personal: {
          shortcuts: [{
            type: "shortcut", id: `learned-${imageSourceKind}`, title: "Learned", url: "https://learned.test/",
            image, imageSyncData: image, imageSyncKind: "sync", imageSourceKind,
            imageSourceUrl: imageSourceKind === "firefox" ? "" : "https://learned.test/favicon.ico",
            imageStyle: "contain", position: 0, createdAt: 100, modifiedAt: 100, source: "manual"
          }],
          settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 100, updatedAt: 100
        },
        work: { shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS, spaceName: "Work" }, settingsModifiedAt: 100, updatedAt: 100 }
      }
    });
    const item = state.spaces.personal.shortcuts[0];
    assert.equal(item.imageSourceKind, imageSourceKind);
    assert.equal(item.imageSyncKind, "device", `${imageSourceKind} artwork must remain device-local`);
    assert.equal(item.imageSyncData, "", `${imageSourceKind} artwork must carry zero synchronized pixel bytes`);
    assert.equal(item.imageAssetId, "", `${imageSourceKind} artwork must not claim a synchronized asset id`);
  }
});

async function runShortcutRace(firstItem, secondItem) {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "openShortcutEditor");
  const styles = deferred();
  let showCalls = 0;
  let resetCalls = 0;
  const field = () => ({ value: "", textContent: "", hidden: false, disabled: false, checked: false, focus() {} });
  const context = {
    ensureSecondaryStyles() { return styles.promise; },
    shortcutDialog: { open: false, showModal() { showCalls += 1; if (this.open) throw new Error("InvalidStateError"); this.open = true; } },
    localizeDocument() {}, closeDropChoice() {}, shortcutSyncPrepareGeneration: 0,
    resetDetectedFaviconPicker() {}, shortcutForm: { reset() { resetCalls += 1; } },
    shortcutId: field(), editingParentFolderId: null, editingPreferredPosition: null,
    editingSourceSpaceId: "", editingDestinationSpaceId: "", state: { activeSpaceId: "personal" },
    shortcutDialogTitle: field(), t(key) { return key; }, shortcutTitle: field(), shortcutUrl: field(),
    shortcutImageStyle: field(), pendingShortcutImage: "", pendingShortcutSyncData: "", pendingShortcutImageKind: "",
    pendingShortcutImageSourceKind: "", pendingShortcutImageSourceUrl: "", pendingShortcutFaviconPreference: "",
    pendingShortcutImageIsFallback: false, pendingShortcutBuiltinIcon: "", pendingShortcutColorTag: "",
    dataUrlByteLength() { return 0; }, classifyImage() { return "none"; },
    BUILTIN_SHORTCUT_ICON_KEYS: [], SHORTCUT_COLOR_TAG_KEYS: [], shortcutImageUrl: field(), shortcutSyncImage: field(),
    useShortcutImageUrl: field(), shortcutArtworkEdited: false, deleteShortcutButton: field(),
    shortcutBuiltinIconPicker: field(), chooseBuiltinShortcutIcon: { setAttribute() {} },
    updateBuiltinShortcutIconSelection() {}, updateShortcutColorSelection() {}, updateImagePreview() {}, updateShortcutSpaceChoice() {},
    queueMicrotask(fn) { fn(); }, console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.openShortcutEditorForTest = openShortcutEditor;`, context);
  const a = context.openShortcutEditorForTest(firstItem, null, null);
  const b = context.openShortcutEditorForTest(secondItem, null, null);
  styles.resolve();
  const results = await Promise.allSettled([a, b]);
  return { context, showCalls, resetCalls, statuses: results.map(result => result.status) };
}

for (const [label, first, second, expectedId] of [
  ["Edit A→Edit B", {id:"a",title:"A",url:"https://a.test/"}, {id:"b",title:"B",url:"https://b.test/"}, "a"],
  ["Add→Edit B", null, {id:"b",title:"B",url:"https://b.test/"}, ""],
  ["Edit A→Add", {id:"a",title:"A",url:"https://a.test/"}, null, "a"]
]) {
  test(`1.33.0.20 Shortcut Editor ${label} rapid race has one owner and no losing-intent mutation`, async () => {
    const result = await runShortcutRace(first, second);
    assert.deepEqual(result.statuses, ["fulfilled", "fulfilled"]);
    assert.equal(result.showCalls, 1);
    assert.equal(result.resetCalls, 1);
    assert.equal(result.context.shortcutId.value, expectedId);
  });
}
