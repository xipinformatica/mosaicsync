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
  const bodyStart = text.indexOf("{", text.indexOf(")", start));
  assert.ok(bodyStart >= 0, `missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = bodyStart; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i += 1; } continue; }
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

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function makeContext({ stylesPromise = Promise.resolve(true), modulePromise = null, readPromise = null } = {}) {
  const customBrandingDialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; }
  };
  const module = { readCustomBranding: async () => readPromise ? readPromise : ({ enabled: true, text: "Brand", logo: "" }) };
  const context = vm.createContext({
    settingsDialog: { hidden: false, setAttribute() {} },
    settingsButton: { setAttribute() {} },
    customBrandingDialog,
    customBrandingDraft: null,
    customBrandingUploadGeneration: 0,
    backgroundUploadGeneration: 0,
    deferredSettingsControlRefresh: false,
    deferredAppearanceVisual: false,
    deferredLauncherSettings: false,
    deferredLauncherRender: false,
    closeBackgroundColorPicker() {},
    commitDeferredLauncherVisual() {},
    requestAnimationFrame(callback) { callback(); return 1; },
    ensureSecondaryStyles: async () => stylesPromise,
    loadCustomBrandingModule: async () => modulePromise ? modulePromise : module,
    refreshCustomBrandingPreview() {},
    localizeDocument() {}
  });
  vm.runInContext(extractFunction(source, "isSettingsOpen"), context);
  vm.runInContext(extractFunction(source, "closeSettingsPanel"), context);
  vm.runInContext(extractFunction(source, "openCustomBrandingDialog"), context);
  return { context, customBrandingDialog };
}

test("1.32.1.8 delayed Custom Branding open is cancelled when Settings closes during stylesheet preparation", async () => {
  const styles = deferred();
  const { context, customBrandingDialog } = makeContext({ stylesPromise: styles.promise });
  const opening = context.openCustomBrandingDialog();
  await Promise.resolve();
  context.closeSettingsPanel();
  styles.resolve(true);
  await opening;
  assert.equal(customBrandingDialog.open, false, "a child dialog must not outlive the Settings owner that launched it");
  assert.equal(context.customBrandingDraft, null, "cancelled child opening must not install a stale branding draft");
});

test("1.32.1.8 close-and-reopen Settings cannot let an older Custom Branding request attach to the new Settings ownership generation", async () => {
  const read = deferred();
  const { context, customBrandingDialog } = makeContext({ readPromise: read.promise });
  const opening = context.openCustomBrandingDialog();
  await Promise.resolve();
  await Promise.resolve();
  context.closeSettingsPanel();
  context.settingsDialog.hidden = false; // a new Settings session now owns the panel
  read.resolve({ enabled: true, text: "Stale Brand", logo: "" });
  await opening;
  assert.equal(customBrandingDialog.open, false, "old async child work must not attach to a later Settings session");
  assert.equal(context.customBrandingDraft, null, "old child data must not overwrite the later Settings session");
});

test("1.32.1.8 Custom Branding opening carries an explicit Settings-owner token across asynchronous preparation", () => {
  const openFn = extractFunction(source, "openCustomBrandingDialog");
  const closeFn = extractFunction(source, "closeSettingsPanel");
  assert.match(openFn, /__mosaicOwnershipGeneration/, "child opener must capture/check Settings ownership");
  assert.match(openFn, /isSettingsOpen\(\)/, "child opener must also prove Settings is currently visible");
  assert.match(closeFn, /__mosaicOwnershipGeneration/, "closing Settings must invalidate pending child opens");
});
