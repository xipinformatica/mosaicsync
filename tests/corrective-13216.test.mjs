import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

function extractFunction(text, name) {
  const signatures = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const signature of signatures) {
    start = text.indexOf(signature);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `missing function ${name}`);

  const parenStart = text.indexOf("(", start);
  let parenDepth = 0;
  let bodyStart = -1;
  let quote = "";
  let escaped = false;
  for (let i = parenStart; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = text.indexOf("{", i);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `missing body for ${name}`);

  let depth = 0;
  quote = "";
  escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = bodyStart; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeState(label, workShortcuts = []) {
  return {
    schemaVersion: 7,
    updatedAt: label === "S1" ? 200 : 100,
    activeSpaceId: "personal",
    spaces: {
      personal: { settings: { multipleSpacesEnabled: true }, shortcuts: [] },
      work: { settings: { multipleSpacesEnabled: true, backgroundPreset: "" }, shortcuts: clone(workShortcuts) }
    },
    settings: { multipleSpacesEnabled: true }
  };
}

function makeDeferredHydrator() {
  let releaseFirst;
  let calls = 0;
  const first = new Promise(resolve => { releaseFirst = resolve; });
  return {
    hydrate: async input => {
      calls += 1;
      if (calls === 1) return first;
      return clone(input);
    },
    releaseFirst,
    get calls() { return calls; }
  };
}

function baseContext(state, hydrator) {
  return {
    state,
    writeBaseline: { revision: "S0" },
    meta: { deviceId: "device-a" },
    stateMutationGeneration: 0,
    spaceSwitchGeneration: 0,
    crossSpacePreviewGeneration: 0,
    activeSpacePersistQueue: Promise.resolve(),
    crossSpaceDrag: null,
    spaceButtons: [],
    SPACE_IDS: ["personal", "work"],
    PRODUCT_NAME: "MosaicSync",
    DEFAULT_STATE: { schemaVersion: 7 },
    RENDER_MANIFEST_KEY: "manifest",
    settingsDialog: { hidden: true },
    console: { warn() {} },
    localStorage: { removeItem() {} },
    isMultipleSpacesEnabled: () => true,
    hydrateLocalAssetsForSpaceNormalized: hydrator.hydrate,
    preloadBackgroundForSettings: async () => {},
    preloadEffectiveBackgroundForSettings: async () => {},
    selectActiveSpaceNormalized: (input, id) => ({ ...clone(input), activeSpaceId: id }),
    releaseLocalAssetsForSpaceNormalized: input => clone(input),
    closeFrequentContextMenu() {},
    bookmarksController: { closeColorMenu() {} },
    closeDropChoice() {},
    closeFolder() {},
    preserveCrossSpaceDragElement() {},
    ensureLocalStorage: async () => ({ state: clone(state), meta: { deviceId: "device-a" } }),
    applySettings() {},
    render() {},
    updateSpaceSwitcher() {},
    scheduleFrequentlyVisitedRefresh() {},
    scheduleAppearanceHintRefresh() {},
    refreshFirstPaintCaches() {},
    requestMissingSiteIcons() {},
    preloadOtherSpaceBackgrounds() {},
    devMark() {},
    devMeasure() {},
    writeActiveSpace: async () => {},
    nextMutationTime: value => Number(value || 0) + 1,
    repairTopLevelPositionsWithinCapacity: shortcuts => shortcuts,
    visibleTopLevelCapacity: () => 999,
    settlePersistedSettingsDraft() {},
    t: key => key
  };
}

function installFunctions(context, names) {
  for (const name of names) vm.runInContext(extractFunction(source, name), context);
}

test("1.32.1.6 Space switch retries hydration after newer authoritative state and preserves that state on the next save", async () => {
  const oldState = makeState("S0", [{ id: "old", title: "Old" }]);
  const newerState = makeState("S1", [
    { id: "old", title: "Old" },
    { id: "remote", title: "Concurrent shortcut" }
  ]);
  const hydrator = makeDeferredHydrator();
  const context = vm.createContext(baseContext(oldState, hydrator));
  installFunctions(context, ["isSettingsOpen", "hydrateSpaceForOwnedOperation", "switchActiveSpace", "saveState"]);

  const switching = context.switchActiveSpace("work");
  await Promise.resolve();

  const newerBaseline = { revision: "S1" };
  context.state = clone(newerState);
  context.writeBaseline = newerBaseline;
  context.stateMutationGeneration += 1;
  hydrator.releaseFirst(clone(oldState));
  await switching;

  assert.equal(hydrator.calls, 2, "stale hydration must be discarded and retried from current authority");
  assert.equal(context.state.activeSpaceId, "work");
  assert.ok(context.state.spaces.work.shortcuts.some(item => item.id === "remote"),
    "Space switch must not resurrect the pre-update workspace");
  assert.equal(context.writeBaseline, newerBaseline,
    "read-only Space hydration must not disturb the newer write baseline");

  let persistedInput = null;
  let persistedBase = null;
  context.writeLocalStateWithBaseline = async (candidate, options) => {
    persistedInput = clone(candidate);
    persistedBase = options.baseState;
    return { state: clone(candidate), compactBaseline: options.baseState };
  };
  context.state.spaces.work.shortcuts[0].title = "Local edit after switch";
  await context.saveState();

  assert.equal(persistedBase, newerBaseline, "next user save must retain the current authoritative baseline");
  assert.ok(persistedInput.spaces.work.shortcuts.some(item => item.id === "remote"),
    "concurrent authoritative shortcut must survive the subsequent local persistence");
});

test("1.32.1.6 drag Space preview also retries stale hydration instead of replacing newer state", async () => {
  const oldState = makeState("S0", [{ id: "dragged", title: "Dragged" }]);
  const newerState = makeState("S1", [
    { id: "dragged", title: "Dragged" },
    { id: "remote", title: "Concurrent shortcut" }
  ]);
  const hydrator = makeDeferredHydrator();
  const context = vm.createContext(baseContext(oldState, hydrator));
  context.crossSpaceDrag = {
    shortcutId: "dragged",
    sourceSpaceId: "personal",
    sourceParentFolderId: null,
    sourceElement: null,
    previewSpaceId: "personal",
    committed: false
  };
  installFunctions(context, ["hydrateSpaceForOwnedOperation", "previewSpaceDuringDrag"]);

  const previewing = context.previewSpaceDuringDrag("work");
  await Promise.resolve();

  context.state = clone(newerState);
  context.writeBaseline = { revision: "S1" };
  context.stateMutationGeneration += 1;
  hydrator.releaseFirst(clone(oldState));
  await previewing;

  assert.equal(hydrator.calls, 2, "drag preview must discard stale hydration and retry");
  assert.equal(context.state.activeSpaceId, "work");
  assert.ok(context.state.spaces.work.shortcuts.some(item => item.id === "remote"),
    "drag preview must preserve the newer authoritative workspace");
});

test("1.32.1.6 Space hydration ownership contract never assigns awaited hydration directly to global state", () => {
  const switchFn = extractFunction(source, "switchActiveSpace");
  const previewFn = extractFunction(source, "previewSpaceDuringDrag");
  assert.doesNotMatch(switchFn, /state\s*=\s*await\s+hydrateLocalAssetsForSpaceNormalized/);
  assert.doesNotMatch(previewFn, /state\s*=\s*await\s+hydrateLocalAssetsForSpaceNormalized/);
  assert.match(switchFn, /hydrateSpaceForOwnedOperation/);
  assert.match(previewFn, /hydrateSpaceForOwnedOperation/);
});
