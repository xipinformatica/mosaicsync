import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const core = fs.readFileSync("src/shared/background/background-core.js", "utf8");
const sharedEntry = fs.readFileSync("src/shared/background/background.js", "utf8");
const firefoxEntry = sharedEntry;
const chromeEntry = sharedEntry;
const firefoxAdapter = fs.readFileSync("src/firefox/background/background-adapter.js", "utf8");
const chromeAdapter = fs.readFileSync("src/chrome/background/background-adapter.js", "utf8");

const root = resolve(import.meta.dirname, "..");
const runtimeScenario = resolve(import.meta.dirname, "harness/background-runtime-scenario.mjs");

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, [runtimeScenario, browser, scenario], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${browser}/${scenario} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function extractFunction(source, name) {
  let start = source.indexOf(`function ${name}`);
  if (start < 0) start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const semanticOwners = [
  "publishWorkspaceAuthoritative",
  "bootstrapRemote",
  "reconcileIfNewCommit",
  "publishProfileDeviceSnapshot",
  "processIconRecoveryQueue",
  "applyLearnedFaviconForTab",
  "setSyncEnabled",
  "refreshQuota"
];

test("1.30.18.15 background semantics have one canonical shared owner", () => {
  for (const name of semanticOwners) {
    assert.match(core, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`), `${name} must live in the shared background core`);
    assert.doesNotMatch(firefoxEntry + firefoxAdapter, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`), `${name} must not be redeclared by Firefox`);
    assert.doesNotMatch(chromeEntry + chromeAdapter, new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`), `${name} must not be redeclared by Chrome`);
  }
});

test("1.30.18.15 browser background entrypoints are thin and identical", () => {
  assert.equal(firefoxEntry, chromeEntry);
  assert.ok(firefoxEntry.split(/\r?\n/).length <= 12, "browser entrypoint must stay tiny");
  assert.match(firefoxEntry, /startBackground\(backgroundAdapter\)/);
  assert.doesNotMatch(firefoxEntry, /storage\.sync|publishAuthoritativeState|reconcileIfNewCommit|processIconRecoveryQueue/);
});

test("1.30.18.15 adapters contain capabilities rather than Sync policy", () => {
  for (const [name, source] of [["firefox", firefoxAdapter], ["chrome", chromeAdapter]]) {
    assert.ok(source.split(/\r?\n/).length <= 120, `${name} adapter must remain a thin platform boundary`);
    assert.match(source, /resolveBrowserCachedFavicon/);
    assert.match(source, /resolveTabNativeFavicon/);
    assert.doesNotMatch(source, /publishAuthoritativeState|bootstrapRemote|publishCompleteDeviceSnapshot|reconcileIfNewCommit|writeSyncItems/);
  }
  assert.match(firefoxAdapter, /browser\.tabs\.query/);
  assert.match(firefoxAdapter, /handlesDataCollectionPermission:\s*true/);
  assert.match(chromeAdapter, /readNativeFaviconDataUrl/);
  assert.match(chromeAdapter, /isProtectedChromeStoreUrl/);
  assert.match(chromeAdapter, /handlesDataCollectionPermission:\s*false/);
});

test("1.30.18.15 shared background core does not import browser-specific adapters", () => {
  assert.doesNotMatch(core, /browser-shim\.js|\.\.\/core\/permissions\.js|readNativeFaviconDataUrl|isProtectedChromeStoreUrl|browser\.tabs\.query/);
  assert.match(core, /resolveBrowserCachedFaviconAdapter/);
  assert.match(core, /resolveTabNativeFaviconAdapter/);
  assert.match(core, /isProtectedFaviconUrl/);
});

test("1.30.18.15 generated Firefox and Chrome runtimes use the exact same background core", () => {
  const firefoxCore = fs.readFileSync("dist/firefox/background/background-core.js");
  const chromeCore = fs.readFileSync("dist/chrome/background/background-core.js");
  assert.deepEqual(firefoxCore, chromeCore);
});

test("1.30.18.15 removes the duplicated 6,700-line browser background implementations", () => {
  const oldFirefoxLines = 6799;
  const oldChromeLines = 6766;
  const newBrowserOwnedLines = [firefoxEntry, chromeEntry, firefoxAdapter, chromeAdapter]
    .reduce((sum, source) => sum + source.split(/\r?\n/).length, 0);
  assert.ok(newBrowserOwnedLines < 300, `browser-owned background code should be tiny, got ${newBrowserOwnedLines} lines`);
  assert.ok(newBrowserOwnedLines < (oldFirefoxLines + oldChromeLines) * 0.03, "Step 3.1 must remove the duplicated browser-owned background bodies");
});


test("1.30.18.15 post-audit real background listener topology stays identical across adapters", () => {
  const firefox = runScenario("firefox", "step3-listener-topology");
  const chrome = runScenario("chrome", "step3-listener-topology");
  assert.deepEqual(firefox, chrome);
  assert.deepEqual(firefox, {
    ok: true,
    onInstalled: 1,
    onStartup: 1,
    onMessage: 1,
    onStorageChanged: 1,
    onAlarm: 1,
    onPermissionAdded: 1,
    onPermissionRemoved: 2,
    onTabUpdated: 1,
    onTabRemoved: 0,
    onActionClicked: 1
  });
});

test("1.30.18.15 post-audit Firefox data_collection revoke remains platform-specific behavior", () => {
  const firefox = runScenario("firefox", "step3-data-collection-revoke");
  const chrome = runScenario("chrome", "step3-data-collection-revoke");
  assert.equal(firefox.syncEnabled, false);
  assert.equal(firefox.syncInitialized, false);
  assert.equal(firefox.syncStatus, "off");
  assert.equal(chrome.syncEnabled, true);
  assert.equal(chrome.syncInitialized, true);
  assert.equal(chrome.syncStatus, "ready");
});

test("1.30.18.15 receipt attribution uses the named device and has an ID fallback", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const code = [extractFunction(source, "shortSyncId"), extractFunction(source, "syncReceiptSourceLabel")].join("\n");
  const messages = {
    received: "Received from another device",
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
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "work-device", lastRemoteReceiptOriginDeviceName: "Work PC", lastRemoteReceiptProvenanceExact: true }), "Received from Work PC");
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "remote-ABC123", lastRemoteReceiptOriginDeviceName: "", lastRemoteReceiptProvenanceExact: true }), "Received from Another device · ABC123");
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "", lastRemoteReceiptOriginDeviceName: "", lastRemoteReceiptProvenanceExact: false }), "Received from another device");
  assert.equal(ctx.label({ lastRemoteReceiptOriginDeviceId: "legacy-misattributed", lastRemoteReceiptOriginDeviceName: "CachyOS", lastRemoteReceiptProvenanceExact: false }), "Received from another device");
  assert.match(source, /remoteReceiptAt\s*\?\s*syncReceiptSourceLabel\(status, meta\)/s, "receipt card must render the resolved source label");
});

test("1.30.18.15 receipt-source translation exists in every locale with the name placeholder", () => {
  const localeDir = "src/shared/core/i18n-locales";
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js"));
  assert.equal(files.length, 33);
  for (const file of files) {
    const source = fs.readFileSync(`${localeDir}/${file}`, "utf8");
    assert.match(source, /"receivedFromDevice":"[^"]*\{name\}[^"]*"/, `${file} must localize receivedFromDevice with {name}`);
  }
});
