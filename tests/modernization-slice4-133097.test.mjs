// @kind behavioral
// Slice 4: the four shortcut artwork-tile paths share one DOM/class/image owner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("src/shared/newtab/newtab.js", "utf8");
function createHarness() {
  const marker = "  function createShortcutArtworkTile(";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "a single artwork tile constructor must exist");
  const end = source.indexOf("\n  function ", start + marker.length);
  assert.ok(end > start, "tile helper must have an independent lexical boundary");
  const calls = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, "span");
      return { className: "", dataset: {}, children: [] };
    }
  };
  const context = vm.createContext({
    document,
    applyShortcutColorTag(element, item) {
      if (item.colorTag === "blue") element.dataset.colorTag = "blue";
      else delete element.dataset.colorTag;
    },
    appendImageOrFallback(element, ...args) {
      calls.push({ element, args });
      element.children.push(args[0] ? "image" : args[2] ? "builtin" : "fallback");
    }
  });
  vm.runInContext(`${source.slice(start, end)}\nthis.buildTile = createShortcutArtworkTile`, context);
  return { buildTile: context.buildTile, calls };
}

const types = ["tile", "folder-mosaic-cell", "folder-item-tile"];

test("Slice 4: every shortcut artwork container retains its exact class and cover style", () => {
  const { buildTile, calls } = createHarness();
  for (const className of types) {
    for (const style of ["contain", "cover", "unknown"]) {
      const record = { imageStyle: style, image: "data:image/png;base64,AAA", title: "Title", builtinIcon: "", colorTag: "blue" };
      const tile = buildTile(record, className);
      assert.equal(tile.className, `${className}${style === "cover" ? " cover" : ""}`);
      assert.equal(tile.dataset.colorTag, "blue");
      assert.deepEqual(tile.children, ["image"]);
      assert.equal(calls.at(-1).element, tile);
      assert.equal(calls.at(-1).args[0], record.image);
      assert.equal(calls.at(-1).args[1], record.title);
      assert.equal(calls.at(-1).args[2], record.builtinIcon);
      assert.equal(calls.at(-1).args[3], record);
    }
  }
});

test("Slice 4: empty-image, built-in-icon, and fallback inputs reach existing art renderer unchanged", () => {
  const { buildTile, calls } = createHarness();
  for (const record of [
    { imageStyle: "contain", image: "", title: "Fallback", builtinIcon: "", colorTag: "" },
    { imageStyle: "cover", image: "", title: "Built-in", builtinIcon: "star", colorTag: "" },
    { imageStyle: "contain", image: "data:image/gif;base64,AAA", title: "Preview", builtinIcon: "", imageDeferred: true }
  ]) {
    const tile = buildTile(record, "tile");
    assert.equal(tile.dataset.colorTag, undefined);
    assert.equal(calls.at(-1).args[3], record, "preserve record identity for deferred previews");
  }
  assert.deepEqual(calls.map(call => call.element.children[0]), ["fallback", "builtin", "image"]);
});

test("Slice 4: grid, folder mosaic, open folder, and artwork refresh reuse the tile constructor", () => {
  const expected = [
    ["function createShortcutSlot(", 'createShortcutArtworkTile(item, "tile")'],
    ["function createFolderSlot(", 'createShortcutArtworkTile(child, "folder-mosaic-cell")'],
    ["function renderFolderContents(", 'createShortcutArtworkTile(item, "folder-item-tile")'],
    ["function refreshFolderMosaicArtwork(", 'createShortcutArtworkTile(child, "folder-mosaic-cell")']
  ];
  for (const [marker, call] of expected) {
    const start = source.indexOf(marker);
    const end = source.indexOf("\n  function ", start + marker.length);
    assert.ok(start >= 0 && end > start);
    assert.ok(source.slice(start, end).includes(call), `${marker} must use the single artwork owner`);
  }
});
