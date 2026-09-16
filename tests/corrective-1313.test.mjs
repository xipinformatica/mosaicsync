import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("1.31.3 new profiles default to 11 columns and 4 rows without changing user-selectable bounds", async () => {
  const { DEFAULT_SETTINGS } = await import("../src/shared/core/constants.js");
  const { normalizeState } = await import("../src/shared/core/model.js");
  assert.equal(DEFAULT_SETTINGS.columns, 11);
  assert.equal(DEFAULT_SETTINGS.rows, 4);
  const fresh = normalizeState({});
  assert.equal(fresh.settings.columns, 11);
  assert.equal(fresh.settings.rows, 4);
  assert.equal(normalizeState({ settings: { columns: 6, rows: 2 } }).settings.columns, 6);
  assert.equal(normalizeState({ settings: { columns: 6, rows: 2 } }).settings.rows, 2);
  assert.equal(normalizeState({ settings: { columns: 12, rows: 8 } }).settings.columns, 12);
  assert.equal(normalizeState({ settings: { columns: 12, rows: 8 } }).settings.rows, 8);
  assert.match(read("src/shared/newtab/newtab-critical.css"), /--columns:\s*11;/);
});

test("1.31.3 Sync status exposes only complete-copy Frequently Visited intent for gesture-time permission recovery", () => {
  const src = read("src/shared/background/background-core.js");
  assert.match(src, /remoteFrequentlyVisitedEnabled:\s*hasRemoteData\s*&&\s*core\?\.settings\?\.settings\?\.frequentlyVisitedEnabled\s*===\s*true/);
  assert.doesNotMatch(src, /remoteFrequentlyVisited(?:Sites|Candidates|History)/);
});

test("1.31.3 Welcome starts Top Sites permission from Finish setup gesture when a complete synced copy already has Frequently Visited ON", () => {
  const src = read("src/shared/welcome/welcome.js");
  assert.match(src, /function requestStartingSourceTopSitesPermissionFromGesture\(source, syncStatus = latestSyncStatus\)/);
  assert.match(src, /source === "cloud"[\s\S]*?syncStatus\?\.hasRemoteData === true[\s\S]*?syncStatus\?\.remoteFrequentlyVisitedEnabled === true/);
  const handlerStart = src.indexOf('sourceFinishButton.addEventListener("click", () => {');
  assert.ok(handlerStart >= 0);
  const handlerEnd = src.indexOf('welcomeProfileFile?.addEventListener', handlerStart);
  const handler = src.slice(handlerStart, handlerEnd);
  const requestAt = handler.indexOf("requestStartingSourceTopSitesPermissionFromGesture(source, latestSyncStatus)");
  const firstAwaitBoundary = handler.indexOf("void (async () => {");
  assert.ok(requestAt >= 0 && firstAwaitBoundary > requestAt, "optional permission request decision must begin in the Finish setup click stack before awaits");
});

test("1.31.3 late synchronized Frequently Visited ON gets a translated one-click permission step instead of requiring OFF/ON", () => {
  const welcomeHtml = read("src/shared/welcome/welcome.html");
  const welcomeJs = read("src/shared/welcome/welcome.js");
  const newtabHtml = read("src/shared/newtab/newtab.html");
  const newtabJs = read("src/shared/newtab/newtab.js");
  assert.match(welcomeHtml, /id="frequentPermissionStep"[^>]*hidden/);
  assert.match(welcomeHtml, /id="welcomeFrequentPermissionButton"[^>]*type="button"/);
  assert.match(welcomeJs, /completeOrOfferFrequentlyVisitedPermission/);
  assert.match(welcomeJs, /t\("frequentPermissionRequired"\)[\s\S]*?t\("frequentDeviceLocalStatus"\)/);
  assert.match(newtabHtml, /id="frequentSyncPermissionDialog"/);
  assert.match(newtabHtml, /id="frequentSyncPermissionGrant"[^>]*type="button"/);
  assert.match(newtabJs, /async function maybeShowSyncedFrequentlyVisitedPermissionStep\(previousEnabled = false\)/);
  assert.match(newtabJs, /if \(frequentlyVisitedEnabled\) void maybeShowSyncedFrequentlyVisitedPermissionStep\(false\)/);
  assert.match(newtabJs, /frequentSyncPermissionGrant\?\.addEventListener\("click", \(\) => \{[\s\S]*?requestTopSitesPermissionFromGesture\(\)/);
  assert.match(newtabJs, /FREQUENTLY_VISITED_PERMISSION_PROMPTED_KEY/);
});

test("1.31.3 every shipped locale contains all text used by the new Frequently Visited permission step", async () => {
  const localeDir = path.join(root, "src/shared/core/i18n-locales");
  const files = fs.readdirSync(localeDir).filter(name => name.endsWith(".js")).sort();
  assert.equal(files.length, 33);
  const keys = [
    "frequentlyVisited",
    "frequentPermissionRequired",
    "frequentDeviceLocalStatus",
    "grantFrequentlyVisitedPermission",
    "frequentPermissionDenied",
    "frequentEnableFailed",
    "continue"
  ];
  for (const file of files) {
    const url = pathToFileURL(path.join(localeDir, file)).href;
    const { MESSAGES } = await import(url);
    for (const key of keys) {
      assert.equal(typeof MESSAGES[key], "string", `${file}: missing ${key}`);
      assert.ok(MESSAGES[key].trim().length > 0, `${file}: empty ${key}`);
    }
  }
});
