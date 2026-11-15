// @kind behavioral
// Private modernization Slice 3: one edit-chip owner and one shared shortcut payload.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = path => readFileSync(path, "utf8");
const source = read("src/shared/newtab/newtab.js");

function extractFunction(name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must be a New Tab function`);
  const next = source.indexOf("\n  function ", start + marker.length);
  // The helper must be a single, self-contained lexical function.
  assert.ok(next > start, `${name} needs a subsequent function`);
  return source.slice(start, next);
}

test("Slice 3: both shortcut and folder edit chips reuse one listener/label owner", () => {
  const helper = extractFunction("attachEditChip");
  let made = 0, activations = 0, stopped = 0;
  const slot = {
    chip: null,
    querySelector(selector) { assert.equal(selector, ":scope > .edit-chip"); return this.chip; },
    append(element) { assert.equal(this.chip, null); this.chip = element; }
  };
  const document = {
    createElement(tag) {
      assert.equal(tag, "button"); made += 1;
      return {
        attributes: {}, listeners: {}, setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) { this.listeners[name] = callback; }
      };
    }
  };
  const context = vm.createContext({ document });
  vm.runInContext(`${helper}\nthis.attachEditChipForTest = attachEditChip;`, context);
  context.attachEditChipForTest(slot, "Edit shortcut: Alpha", event => { event.stopPropagation(); activations++; });
  assert.equal(made, 1);
  assert.equal(slot.chip.type, "button");
  assert.equal(slot.chip.className, "edit-chip");
  assert.equal(slot.chip.textContent, "⋯");
  assert.equal(slot.chip.title, "Edit shortcut: Alpha");
  assert.equal(slot.chip.attributes["aria-label"], "Edit shortcut: Alpha");
  slot.chip.listeners.click({ stopPropagation() { stopped++; } });
  assert.equal(activations, 1);
  assert.equal(stopped, 1);
  context.attachEditChipForTest(slot, "Folder: Beta", event => { event.stopPropagation(); activations += 10; });
  assert.equal(made, 1, "reusing a hydrated chip must not duplicate the element");
  assert.equal(slot.chip.attributes["aria-label"], "Folder: Beta");
  slot.chip.listeners.click({ stopPropagation() { stopped++; } });
  assert.equal(activations, 11);
  assert.equal(stopped, 2);
  assert.match(source, /attachEditChip\(slot, `\$\{t\("editShortcut"\)\}: \$\{item\.title\}`,/);
  assert.match(source, /attachEditChip\(slot, `\$\{t\("folder"\)\}: \$\{folderName\}`,/);
});

test("Slice 3: shortcut save keeps one common user-editable field set", () => {
  const start = source.indexOf('  shortcutForm.addEventListener("submit", async event => {');
  const end = source.indexOf('  shortcutForm.addEventListener(', start + 1);
  const block = source.slice(start, end > start ? end : source.length);
  assert.match(block, /const shortcutFields = \{[\s\S]*?imageSyncData,[\s\S]*?imageSourceKind: pendingShortcutImageSourceKind,[\s\S]*?imageStyle:/);
  assert.match(block, /record\.array\[record\.index\] = \{\s*\.\.\.record\.item,\s*\.\.\.shortcutFields,/);
  assert.match(block, /const newShortcut = \{\s*\.\.\.shortcutFields,/);
  assert.match(block, /imageAssetId: imageSyncKind === "sync" && !shortcutArtworkEdited \? record\.item\.imageAssetId : ""/);
  assert.match(block, /const newShortcut = \{[\s\S]*?imageAssetId: "",[\s\S]*?createdAt: now\(\),[\s\S]*?source: "manual"/);
  assert.match(block, /source: pendingShortcutImageSourceKind === "firefox" \? "firefox-import" : "manual"/);
});

test("Slice 3: the common shortcut fields are declared once, not separately in each branch", () => {
  const begin = source.indexOf('  shortcutForm.addEventListener("submit", async event => {');
  const end = source.indexOf('      let crossSpaceSyncIntent = null;', begin);
  assert.ok(begin > 0 && end > begin);
  const block = source.slice(begin, end);
  for (const field of ["builtinIcon", "colorTag", "faviconPreference", "imageSourceKind", "imageSourceUrl", "imageIsFallback", "imageStyle"]) {
    const occurrences = [...block.matchAll(new RegExp(`\\b${field}:`, "g"))];
    assert.equal(occurrences.length, 1, `${field} should have one assignment owner`);
  }
});
