import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function readSource() {
  return fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
}

function runBootstrap(tileSize) {
  const source = fs.readFileSync("src/shared/newtab/render-bootstrap.js", "utf8");
  const styles = new Map();
  class FakeElement {
    constructor() {
      this.hidden = false;
      this.inert = false;
      this.dataset = {};
      this.children = [];
      this.style = { setProperty(name, value) { styles.set(name, String(value)); } };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    setAttribute() {}
  }
  const root = new FakeElement();
  const grid = new FakeElement();
  const emptyState = new FakeElement();
  const manifest = {
    version: 1,
    ready: true,
    paintSpaceId: "personal",
    layout: { columns: 11, rows: 4, tileSize, brandVisible: true },
    shortcuts: []
  };
  const store = new Map([
    ["render-manifest", JSON.stringify(manifest)],
    ["mosaicsync.default-space.v1", "last"]
  ]);
  const context = {
    __mosaicsyncBootstrapConfig: { renderManifestKey: "render-manifest", renderManifestVersion: 1 },
    performance: { now: () => 1 },
    localStorage: { getItem: key => store.get(key) ?? null },
    document: {
      documentElement: root,
      getElementById(id) { return id === "shortcutGrid" ? grid : id === "emptyState" ? emptyState : null; },
      querySelector() { return null; },
      createDocumentFragment() { return new FakeElement(); },
      createElement() { return new FakeElement(); }
    },
    requestAnimationFrame(fn) { fn(); },
    setTimeout(fn) { fn(); },
    Set,
    Map,
    JSON,
    Number,
    Math,
    String,
    Object,
    Array,
    Date,
    console
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return styles;
}

function expectedGeometry(tileSize) {
  const scale = tileSize / 76;
  return {
    "--folder-mosaic-cell-size": `${Math.max(20, Math.round(25 * scale))}px`,
    "--folder-mosaic-icon-size": `${Math.max(15, Math.round(19 * scale))}px`,
    "--folder-mosaic-gap": `${Math.max(3, Math.round(4 * scale))}px`,
    "--folder-mosaic-padding": `${Math.max(5, Math.round(7 * scale))}px`,
    "--folder-item-tile-size": `${Math.max(44, Math.round(54 * scale))}px`,
    "--folder-item-icon-size": `${Math.max(30, Math.round(36 * scale))}px`
  };
}

for (const tileSize of [68, 76, 84]) {
  test(`1.33.0.22 bootstrap folder geometry matches authoritative geometry at ${tileSize}px`, () => {
    const styles = runBootstrap(tileSize);
    for (const [name, value] of Object.entries(expectedGeometry(tileSize))) {
      assert.equal(styles.get(name), value, `${name} must be correct on the synchronous first frame`);
    }
  });
}

test("1.33.0.22 folder-child Edit preserves folder ownership when opening the Shortcut Editor", () => {
  const source = readSource();
  const anchor = source.indexOf('edit.className = "folder-item-edit"');
  assert.ok(anchor >= 0, "missing folder child edit control");
  const handlerStart = source.indexOf('edit.addEventListener("click", event => {', anchor);
  const handlerEnd = source.indexOf("});", handlerStart);
  const body = source.slice(handlerStart, handlerEnd + 3);
  assert.doesNotMatch(body, /\bcloseFolder\s*\(/, "opening a child editor must not destroy the folder context");
  assert.match(body, /openShortcutEditor\(item, folder\.id\)/);
});

test("1.33.0.22 Shortcut Editor pointer interaction cannot be mistaken for an outside-folder click", () => {
  const source = readSource();
  const start = source.indexOf('document.addEventListener("pointerdown", event => {');
  assert.ok(start >= 0, "missing document pointerdown handler");
  let depth = 0, brace = source.indexOf("{", start), end = -1;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) { end = source.indexOf(");", i) + 2; break; }
  }
  assert.ok(end > start, "could not extract pointerdown registration");
  const registration = source.slice(start, end);
  let listener = null;
  let closes = 0;
  let commits = 0;
  const anchor = { contains: () => false };
  const context = {
    frequentContextMenu: null,
    bookmarksController: null,
    backgroundColorPopover: { hidden: true },
    backgroundColorControl: null,
    dropChoice: { hidden: true },
    folderPopover: { hidden: false, contains: () => false },
    shortcutDialog: { open: true },
    activeFolderAnchorId: "folder-1",
    CSS: { escape: value => value },
    document: {
      addEventListener(type, fn) { if (type === "pointerdown") listener = fn; },
      querySelector() { return anchor; }
    },
    commitFolderTitle() { commits += 1; return Promise.resolve(); },
    closeFolder() { closes += 1; },
    closeFrequentContextMenu() {},
    closeBackgroundColorPicker() {},
    closeDropChoice() {},
    isSettingsOpen() { return false; },
    isSettingsChildDialogOpen() { return false; },
    settingsDialog: { contains: () => false },
    settingsButton: { contains: () => false }
  };
  vm.createContext(context);
  vm.runInContext(registration, context);
  assert.equal(typeof listener, "function");
  listener({ target: {} });
  assert.equal(closes, 0, "clicks inside an open Shortcut Editor must preserve the underlying folder");
  assert.equal(commits, 0);
  context.shortcutDialog.open = false;
  listener({ target: {} });
  assert.equal(closes, 1, "ordinary outside-folder clicks must still close the folder");
  assert.equal(commits, 1);
});

test("1.33.0.22 render continues to preserve an open folder when it survives a child edit", () => {
  const source = readSource();
  assert.match(source, /const openFolderWas = activeFolderId;/);
  assert.match(source, /if \(folder\?\.type === "folder" && anchor && !folderPopover\.hidden\) \{\s*renderFolderContents\(folder\);\s*positionFolderPopover\(anchor\);/s);
  assert.match(source, /else if \(!folder \|\| folder\.type !== "folder"\) \{\s*closeFolder\(\);/s,
    "folder context should close naturally only when the folder no longer exists as a folder");
});
