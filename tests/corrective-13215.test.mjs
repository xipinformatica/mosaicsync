import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test("1.32.1.5 collaborative Sync receipt wording does not invent a single sending device", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const english = fs.readFileSync("src/shared/core/i18n-locales/en.js", "utf8");
  assert.match(english, /"received":"Combined changes from your other devices"/);
  const code = [extractFunction(source, "shortSyncId"), extractFunction(source, "syncReceiptSourceLabel")].join("\n");
  const messages = {
    received: "Combined changes from your other devices",
    receivedFromDevice: "Received from {name}",
    anotherDevice: "Another device",
    thisDevice: "This device",
    thisDeviceNamed: "This device ({name})"
  };
  const ctx = {
    meta: { deviceId: "local-device", deviceName: "Oasis" },
    normalizeDeviceName: value => String(value || "").trim().slice(0, 64),
    t: (key, vars = {}) => String(messages[key] || key).replace(/\{(\w+)\}/g, (_m, name) => String(vars[name] ?? ""))
  };
  vm.createContext(ctx);
  vm.runInContext(`${code}; this.label = syncReceiptSourceLabel;`, ctx);
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "work-device", lastRemoteReceiptOriginDeviceName: "Firefox - XIP", lastRemoteReceiptProvenanceExact: true }), "Received from Firefox - XIP");
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "linux-device", lastRemoteReceiptOriginDeviceName: "Firefox · Linux", lastRemoteReceiptProvenanceExact: false }), "Combined changes from your other devices");
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "", lastRemoteReceiptOriginDeviceName: "", lastRemoteReceiptProvenanceExact: false }), "Combined changes from your other devices");
});

test("1.32.1.5 every locale has deliberate collaborative receipt wording", () => {
  const files = fs.readdirSync("src/shared/core/i18n-locales").filter(name => name.endsWith(".js"));
  assert.equal(files.length, 33);
  for (const file of files) {
    const source = fs.readFileSync(`src/shared/core/i18n-locales/${file}`, "utf8");
    const match = source.match(/"received":"([^"]+)"/);
    assert.ok(match?.[1], `${file} must provide received wording`);
    if (file !== "en.js") assert.notEqual(match[1], "Combined changes from your other devices", `${file} must not fall back to English`);
  }
});

test("1.32.1.5 folder item area uses available-height flex scrolling instead of a magic max height", () => {
  const css = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");
  assert.match(css, /\.folder-panel\{[^}]*display:flex;[^}]*flex-direction:column;[^}]*max-height:/);
  const items = css.match(/\.folder-items\{([^}]*)\}/)?.[1] || "";
  assert.match(items, /flex:0 1 auto/);
  assert.match(items, /min-height:0/);
  assert.match(items, /overflow-y:auto/);
  assert.doesNotMatch(items, /max-height\s*:/);
  assert.doesNotMatch(items, /305px/);
});

test("1.32.1.5 Settings-owned child dialogs do not close Settings behind them", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const helper = extractFunction(source, "isSettingsChildDialogOpen");
  assert.match(helper, /wallpaperGalleryDialog\?\.open/);
  assert.match(helper, /customBrandingDialog\?\.open/);
  assert.match(helper, /recoveryCopiesDialog\?\.open/);
  assert.match(source, /isSettingsOpen\(\) && !isSettingsChildDialogOpen\(\) && !settingsDialog\.contains\(event\.target\)/);
  assert.match(source, /isSettingsOpen\(\) && !isSettingsChildDialogOpen\(\)\) closeSettingsPanel\(\)/);
  assert.doesNotMatch(source, /isSettingsOpen\(\) && !wallpaperGalleryDialog\?\.open && !settingsDialog\.contains/);
});
