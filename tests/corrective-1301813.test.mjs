import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  META_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  DEFAULT_META
} from "../src/shared/core/constants.js";
import { defaultDeviceName, normalizeDeviceName } from "../src/shared/core/model.js";

const root = resolve(import.meta.dirname, "..");

class Area {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys == null) return structuredClone(this.data);
    const out = {};
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) if (Object.prototype.hasOwnProperty.call(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}
class Locks {
  constructor() { this.tail = Promise.resolve(); }
  request(_name, callback) {
    const run = this.tail.then(callback);
    this.tail = run.catch(() => {});
    return run;
  }
}
async function withStorageRuntime(browserName, fn) {
  const previousBrowser = globalThis.browser;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const local = new Area(), session = new Area();
  globalThis.browser = { storage: { local, session } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: new Locks() } });
  const nonce = `${Date.now()}-${Math.random()}`;
  try {
    const constants = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/constants.js`)).href}?c=${nonce}`);
    const storage = await import(`${pathToFileURL(resolve(root, `dist/${browserName}/core/storage.js`)).href}?s=${nonce}`);
    return await fn({ constants, storage, local, session });
  } finally {
    globalThis.browser = previousBrowser;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator); else delete globalThis.navigator;
  }
}

test("1.30.18.13 device names are bounded, friendly and require no schema expansion", () => {
  assert.equal(normalizeDeviceName("  Oasis\n\t Home  "), "Oasis Home");
  assert.equal(normalizeDeviceName("x".repeat(100)).length, 64);
  assert.equal(defaultDeviceName("firefox", "win"), "Firefox · Windows");
  assert.equal(defaultDeviceName("chrome", "linux"), "Chrome · Linux");
  assert.equal(STATE_SCHEMA_VERSION, 19);
  assert.equal(META_SCHEMA_VERSION, 12);
  assert.equal(SYNC_SCHEMA_VERSION, 11);
  assert.equal(DEFAULT_META.deviceName, "");
});

for (const browserName of ["firefox", "chrome"]) {
  test(`1.30.18.13 ${browserName} stale full-record meta cannot roll back a newer device rename`, async () => {
    await withStorageRuntime(browserName, async ({ constants, storage, local, session }) => {
      await storage.writeLocalMeta({ ...constants.DEFAULT_META, deviceId: "stable-device", deviceName: "Oasis", syncEnabled: true, syncStatus: "ready" });
      const stale = await storage.readLocalMeta();
      const renamed = await storage.updateLocalMeta({ deviceName: "Work PC" });
      assert.equal(renamed.deviceId, "stable-device");
      assert.equal(renamed.deviceName, "Work PC");
      const result = await storage.writeLocalMeta({ ...stale, syncStatus: "syncing", lastSyncError: "" });
      assert.equal(result.deviceId, "stable-device");
      assert.equal(result.deviceName, "Work PC");
      assert.equal(result.syncStatus, "syncing");
      assert.equal(local.data[constants.LOCAL_META_KEY].deviceName, "Work PC");
      assert.equal(session.data[constants.SESSION_RENDER_META_KEY].deviceName, "Work PC");
    });
  });

  test(`1.30.18.13 ${browserName} device-name Sync channel is attribution-only and cannot trigger layout reconciliation`, () => {
    const src = readBackgroundSource(browserName, { built: false });
    assert.match(src, /SYNC_DEVICE_NAME_PREFIX/);
    assert.match(src, /kind:\s*"device-name"/);
    assert.match(src, /deviceId,\s*\n\s*name,\s*\n\s*updatedAt:/);
    assert.doesNotMatch(src.slice(src.indexOf("async function publishDeviceName"), src.indexOf("async function setDeviceName")), /image|favicon|history|shortcut|workspace/i);
    assert.match(src, /key\.startsWith\(SYNC_PREFIX\)\s*&&\s*!key\.startsWith\(SYNC_DEVICE_NAME_PREFIX\)/);
  });
}

test("1.30.18.13 Welcome names the device before enabling Sync and exposes the field only in the Sync-choice flow", () => {
  const js = fs.readFileSync(resolve(root, "src/shared/welcome/welcome.js"), "utf8");
  const html = fs.readFileSync(resolve(root, "src/shared/welcome/welcome.html"), "utf8");
  const click = js.slice(js.indexOf('syncContinueButton.addEventListener("click"'), js.indexOf("async function continueAfterStartingSource"));
  assert.ok(click.indexOf('mosaicsync:set-device-name') >= 0);
  assert.ok(click.indexOf('mosaicsync:set-device-name') < click.indexOf('mosaicsync:set-sync-enabled'));
  assert.match(js, /welcomeDeviceNameCard\.hidden = !wantsSync/);
  assert.match(html, /id="welcomeDeviceNameCard"[^>]*hidden/);
  assert.match(html, /id="welcomeDeviceNameInput"[^>]*maxlength="64"/);
});

test("1.30.18.13 Settings uses source dataset time, separate receipt time, and initializes fallback naming after first paint", () => {
  const js = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");
  for (const browserName of ["firefox", "chrome"]) {
    const html = fs.readFileSync(resolve(root, `src/${browserName}/newtab/newtab.html`), "utf8");
    for (const id of ["settingsDeviceNameText", "editDeviceNameButton", "deviceNameEditor", "settingsDeviceNameInput", "saveDeviceNameButton", "syncSourceText", "syncSourceDetail"]) {
      assert.match(html, new RegExp(`id="${id}"`), `${browserName}:${id}`);
    }
  }
  const schedule = js.indexOf("schedulePostPaintMaintenance();");
  const ensure = js.indexOf("void ensureLocalDeviceName(meta)", schedule);
  assert.ok(schedule >= 0 && ensure > schedule, "fallback naming must be post-paint maintenance");
  assert.match(js, /enabled && remoteTime > 0\s*\? `\$\{syncSourceLabel\(status, meta\)\} · \$\{formatSyncTime\(remoteTime\)\}`/);
  assert.match(js, /t\("receivedHereAt", \{ time: formatSyncTime\(remoteReceiptAt\) \}\)/);
});
