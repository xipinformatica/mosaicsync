import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { spawnSync } from "node:child_process";
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
  test(`1.33.0.19 ${browser}: whole-device Recovery cleanup establishes a fresh post-plan survivor`, () => {
    const result = run(browser, "corrective-133019-device-cleanup-survivor");
    assert.equal(result.freshSurvivor, true);
    assert.equal(result.targetRemoved, true);
  });

  test(`1.33.0.19 ${browser}: unchanged healthy reconcile self-heals a missing current-device Recovery generation`, () => {
    const result = run(browser, "corrective-133019-recovery-self-heal");
    assert.equal(result.repaired, true);
  });

  test(`1.33.0.19 ${browser}: successful already-applied reconcile clears a stale non-quota Sync error`, () => {
    const result = run(browser, "corrective-133019-stale-sync-error-heal");
    assert.equal(result.healed, true);
    assert.equal(result.reason, "already-applied");
  });

  test(`1.33.0.19 ${browser}: healthy no-op reconcile preserves an explicit quota error`, () => {
    const result = run(browser, "corrective-133019-quota-error-preserved");
    assert.equal(result.preserved, true);
    assert.equal(result.reason, "already-applied");
  });
}

test("1.33.0.19 rapid Add/Edit Shortcut opens serialize before editor state mutation", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "openShortcutEditor");
  const styles = deferred();
  let showCalls = 0;
  let resetCalls = 0;
  const field = () => ({ value: "", hidden: false, disabled: false, checked: false, focus() {} });
  const context = {
    ensureSecondaryStyles() { return styles.promise; },
    shortcutDialog: {
      open: false,
      showModal() {
        showCalls += 1;
        if (this.open) throw new Error("InvalidStateError");
        this.open = true;
      }
    },
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
  const a = context.openShortcutEditorForTest(null, null, null);
  const b = context.openShortcutEditorForTest(null, null, null);
  styles.resolve();
  const results = await Promise.allSettled([a, b]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "fulfilled"]);
  assert.equal(showCalls, 1, "two rapid open attempts must produce exactly one native modal open");
  assert.equal(resetCalls, 1, "the losing attempt must return before mutating the editor form");
});

test("1.33.0.19 Recovery device cleanup freezes target roots before publishing the acting device survivor", () => {
  const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  const start = core.indexOf("async function cleanupRecoveryCopies(");
  const end = core.indexOf("\n  async function getSyncStatus", start);
  assert.ok(start >= 0 && end > start);
  const body = core.slice(start, end);
  const plan = body.indexOf("planManualRecoveryCleanup(");
  const survivor = body.indexOf("publishProfileDeviceSnapshot(");
  const latest = body.indexOf("const latest = await browser.storage.sync.get(null)");
  const confirm = body.indexOf("confirmedManualRecoveryCleanupKeys(", latest);
  const remove = body.indexOf("await removeSyncItems(keys)");
  assert.ok(plan >= 0 && survivor > plan && latest > survivor && confirm > latest && remove > confirm,
    "whole-device cleanup must freeze its target plan, publish a fresh own survivor, then revalidate and delete only planned roots");
});
