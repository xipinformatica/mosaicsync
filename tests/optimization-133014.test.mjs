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
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
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

const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.33.0.14 closed Recovery manager drops its generated list payload", () => {
  const list = {
    children: Array.from({ length: 120 }, (_, index) => ({ index, listener: () => index })),
    replaceChildren() { this.children = []; }
  };
  const context = vm.createContext({ recoveryCopiesList: list });
  vm.runInContext(`${extractFunction(source, "clearRecoveryCopiesView")}; this.clearRecoveryCopiesView = clearRecoveryCopiesView;`, context);
  context.clearRecoveryCopiesView();
  assert.equal(list.children.length, 0, "closed Recovery manager must release dynamic device/generation nodes and their listener closures");
});

test("1.33.0.14 an async Recovery model cannot repopulate a closed dialog", async () => {
  let renderCalls = 0;
  let busy = false;
  const context = vm.createContext({
    recoveryCopiesBusy: false,
    recoveryCopiesSessionGeneration: 1,
    recoveryCopiesLoadInFlightGeneration: 0,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesDialog: { open: false },
    recoveryCopiesSummary: { textContent: "" },
    setRecoveryCopiesBusy(value) { busy = Boolean(value); context.recoveryCopiesBusy = busy; },
    async sendSyncMessage() { return { ok: true, devices: [{ deviceId: "stale" }] }; },
    renderRecoveryCopies() { renderCalls += 1; },
    t(key) { return key; }
  });
  vm.runInContext(`${extractFunction(source, "loadRecoveryCopies")}; this.loadRecoveryCopies = loadRecoveryCopies;`, context);
  await context.loadRecoveryCopies();
  assert.equal(renderCalls, 0, "a response that finishes after close must not rebuild hidden Recovery DOM");
  assert.equal(busy, false, "closed-response suppression must still release the busy guard");
});


test("1.33.0.14 closed Recovery cleanup completion does not rebuild hidden controls", async () => {
  let renderCalls = 0;
  let refreshCalls = 0;
  let busy = false;
  const context = vm.createContext({
    recoveryCopiesBusy: false,
    recoveryCopiesSessionGeneration: 1,
    recoveryCopiesLoadInFlightGeneration: 0,
    recoveryCopiesCleanupBusy: false,
    recoveryCopiesDialog: { open: false },
    setRecoveryCopiesBusy(value) { busy = Boolean(value); context.recoveryCopiesBusy = busy; },
    async sendSyncMessage() { return { ok: true, removedBytes: 2048, removedGenerations: 1, devices: [] }; },
    renderRecoveryCopies() { renderCalls += 1; },
    showSyncFeedback() {},
    t(key) { return key; },
    formatBytes(value) { return String(value); },
    async refreshSyncStatus() { refreshCalls += 1; },
    async loadRecoveryCopies() { throw new Error("closed cleanup must not schedule a hidden reload"); }
  });
  vm.runInContext(`${extractFunction(source, "performRecoveryCleanup")}; this.performRecoveryCleanup = performRecoveryCleanup;`, context);
  await context.performRecoveryCleanup({ mode: "superseded" });
  assert.equal(renderCalls, 0, "a cleanup response that finishes after close must not rebuild hidden Recovery DOM");
  assert.equal(refreshCalls, 1, "successful cleanup must still refresh Sync status after close");
  assert.equal(busy, false, "cleanup completion must release the busy guard even when closed");
});

test("1.33.0.14 repeated Recovery-manager close cycles converge to an empty dynamic list", () => {
  const list = {
    children: [],
    replaceChildren() { this.children = []; }
  };
  const context = vm.createContext({ recoveryCopiesList: list });
  vm.runInContext(`${extractFunction(source, "clearRecoveryCopiesView")}; this.clearRecoveryCopiesView = clearRecoveryCopiesView;`, context);
  for (let cycle = 0; cycle < 50; cycle += 1) {
    list.children = Array.from({ length: 120 }, (_, index) => ({ cycle, index, listener: () => index }));
    context.clearRecoveryCopiesView();
    assert.equal(list.children.length, 0, `cycle ${cycle + 1} must return to empty Recovery-list retention`);
  }
});

test("1.33.0.14 Step-6B evidence records Recovery-manager lifecycle bounds", () => {
  const evidence = JSON.parse(fs.readFileSync("docs/SNOW-LEOPARD-II-STEP6B-1.33.0.14.json", "utf8"));
  assert.equal(evidence.version, "1.33.0.14");
  assert.equal(evidence.recoveryCopies.fixtureDynamicNodes, 120);
  assert.equal(evidence.recoveryCopies.before.retainedDynamicNodesAfterClose, 120);
  assert.equal(evidence.recoveryCopies.after.retainedDynamicNodesAfterClose, 0);
  assert.equal(evidence.recoveryCopies.after.repeatedCycles, 50);
  assert.equal(evidence.recoveryCopies.after.closedAsyncRenderCalls, 0);
});
