import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing function body for ${name}`);
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
  throw new Error(`unterminated function ${name}`);
}

function makeFolderItems(count = 40) {
  return {
    children: Array.from({ length: count }, (_, index) => ({ index, click: () => index, drag: () => index })),
    replaceChildren() { this.children = []; }
  };
}

function makeContext({ hidden = false, count = 40 } = {}) {
  const folderItems = makeFolderItems(count);
  const context = vm.createContext({
    folderItems,
    folderPopover: {
      hidden,
      classList: { remove() {} }
    },
    activeFolderId: "folder-1",
    activeFolderAnchorId: "folder-1"
  });
  return { context, folderItems };
}

const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.33.0.16 closing a folder releases generated item controls and listener closures", () => {
  const { context, folderItems } = makeContext({ hidden: false, count: 40 });
  vm.runInContext(`${extractFunction(source, "closeFolder")}; this.closeFolder = closeFolder;`, context);
  context.closeFolder();
  assert.equal(folderItems.children.length, 0, "closed folder must release generated folder-item nodes");
  assert.equal(context.folderPopover.hidden, true);
  assert.equal(context.activeFolderId, null);
  assert.equal(context.activeFolderAnchorId, null);
});

test("1.33.0.16 repeated folder open-close cycles converge to the reusable shell", () => {
  const { context, folderItems } = makeContext({ hidden: false, count: 0 });
  vm.runInContext(`${extractFunction(source, "closeFolder")}; this.closeFolder = closeFolder;`, context);
  for (let cycle = 0; cycle < 50; cycle += 1) {
    folderItems.children = Array.from({ length: 40 }, (_, index) => ({ cycle, index, listener: () => index }));
    context.folderPopover.hidden = false;
    context.activeFolderId = `folder-${cycle}`;
    context.activeFolderAnchorId = `folder-${cycle}`;
    context.closeFolder();
    assert.equal(folderItems.children.length, 0, `cycle ${cycle + 1} must return to shell-only retention`);
  }
});

test("1.33.0.16 closeFolder is idempotent even if the popover is already hidden", () => {
  const { context, folderItems } = makeContext({ hidden: true, count: 40 });
  vm.runInContext(`${extractFunction(source, "closeFolder")}; this.closeFolder = closeFolder;`, context);
  context.closeFolder();
  assert.equal(folderItems.children.length, 0, "already-hidden close must not leave stale generated folder nodes behind");
  assert.equal(context.activeFolderId, null);
  assert.equal(context.activeFolderAnchorId, null);
});

test("1.33.0.16 Step 6D evidence and roadmap close the mechanically-audited lifetime phase", () => {
  const evidence = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP6D-1.33.0.16.json", "utf8"));
  const roadmap = fs.readFileSync("docs/SNOW-LEOPARD-II.md", "utf8");
  assert.equal(evidence.version, "1.33.0.16");
  assert.equal(evidence.folderPopover.fixtureItems, 40);
  assert.equal(evidence.folderPopover.before.retainedGeneratedItemsAfterClose, 40);
  assert.equal(evidence.folderPopover.after.retainedGeneratedItemsAfterClose, 0);
  assert.equal(evidence.folderPopover.after.repeatedCycles, 50);
  assert.match(roadmap, /Step 6 — Lifetime and memory: DONE in 1\.33\.0\.16/);
  assert.match(roadmap, /Step 7 — Runtime loading\/dead work/);
});
