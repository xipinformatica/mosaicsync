import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { hostLabel } from "../src/shared/core/model.js";
import { testFilesForGroup } from "../tools/test-groups.mjs";

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

function field() {
  return { value: "", textContent: "", hidden: false, disabled: false, checked: false, focused: false, focus() { this.focused = true; } };
}

async function openEditor(item = null) {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const fn = extractFunction(source, "openShortcutEditor");
  const shortcutTitle = field();
  const shortcutUrl = field();
  const context = {
    ensureSecondaryStyles: async () => {},
    shortcutDialog: { open: false, showModal() { this.open = true; } },
    localizeDocument() {}, closeDropChoice() {}, shortcutSyncPrepareGeneration: 0,
    resetDetectedFaviconPicker() {}, shortcutForm: { reset() {} }, shortcutId: field(),
    editingParentFolderId: null, editingPreferredPosition: null,
    editingSourceSpaceId: "", editingDestinationSpaceId: "", state: { activeSpaceId: "personal" },
    shortcutDialogTitle: field(), t(key) { return key; }, shortcutTitle, shortcutUrl,
    shortcutImageStyle: field(), pendingShortcutImage: "", pendingShortcutSyncData: "", pendingShortcutImageKind: "",
    pendingShortcutImageSourceKind: "", pendingShortcutImageSourceUrl: "", pendingShortcutFaviconPreference: "",
    pendingShortcutImageIsFallback: false, pendingShortcutBuiltinIcon: "", pendingShortcutColorTag: "",
    dataUrlByteLength() { return 0; }, classifyImage() { return "none"; },
    BUILTIN_SHORTCUT_ICON_KEYS: [], SHORTCUT_COLOR_TAG_KEYS: [], shortcutImageUrl: field(), shortcutSyncImage: field(),
    useShortcutImageUrl: field(), shortcutArtworkEdited: false, deleteShortcutButton: field(),
    shortcutBuiltinIconPicker: field(), chooseBuiltinShortcutIcon: { setAttribute() {} },
    updateBuiltinShortcutIconSelection() {}, updateShortcutColorSelection() {}, updateImagePreview() {}, updateShortcutSpaceChoice() {},
    queueMicrotask(callback) { callback(); }, console
  };
  vm.createContext(context);
  vm.runInContext(`${fn}; this.openShortcutEditorForTest = openShortcutEditor;`, context);
  await context.openShortcutEditorForTest(item, null, null);
  return { shortcutTitle, shortcutUrl };
}

test("1.33.0.29 shortcut name is optional while URL remains required", () => {
  const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
  const title = html.match(/<input id="shortcutTitle"[^>]*>/)?.[0] || "";
  const url = html.match(/<input id="shortcutUrl"[^>]*>/)?.[0] || "";
  assert.ok(title, "missing shortcut title input");
  assert.ok(url, "missing shortcut URL input");
  assert.doesNotMatch(title, /\brequired\b/, "shortcut name must be optional");
  assert.match(url, /\brequired\b/, "shortcut URL must remain mandatory");
});

test("1.33.0.29 blank shortcut names still resolve deterministically from the website host", () => {
  assert.equal(hostLabel("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.equal(hostLabel("https://xipinformatica.cat/mosaicsync"), "xipinformatica.cat");
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /const title = shortcutTitle\.value\.trim\(\) \|\| hostLabel\(url\)/,
    "the save boundary must keep using the URL-derived fallback title");
});

test("1.33.0.29 Add Shortcut focuses the mandatory URL, while Edit Shortcut keeps focus on the existing name", async () => {
  const add = await openEditor(null);
  assert.equal(add.shortcutUrl.focused, true);
  assert.equal(add.shortcutTitle.focused, false);

  const edit = await openEditor({ id: "a", title: "Existing", url: "https://example.com/" });
  assert.equal(edit.shortcutTitle.focused, true);
  assert.equal(edit.shortcutUrl.focused, false);
});

test("1.33.0.29 optional shortcut-name feature is covered by New Tab, browser and release groups", () => {
  for (const group of ["newtab", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/feature-133029.test.mjs"), `${group} must include feature-133029.test.mjs`);
  }
});
