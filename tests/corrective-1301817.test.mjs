import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const exists = async path => {
  try { await access(resolve(root, path), fsConstants.F_OK); return true; }
  catch { return false; }
};

const read = path => readFile(resolve(root, path), "utf8");

async function withBrowser(mock, callback) {
  const previousBrowser = globalThis.browser;
  const previousChrome = globalThis.chrome;
  try {
    globalThis.browser = mock;
    delete globalThis.chrome;
    return await callback();
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
}

test("1.30.18.17 Step 3.2 gives shared browser-neutral shells one canonical source owner", async () => {
  for (const path of [
    "src/shared/background/background.js",
    "src/shared/newtab/newtab.html",
    "src/shared/core/permissions.js",
    "src/shared/core/permission-platform.js",
    "src/shared/manifest-locales.json"
  ]) assert.equal(await exists(path), true, `missing canonical source: ${path}`);

  for (const path of [
    "src/firefox/background/background.js",
    "src/chrome/background/background.js",
    "src/firefox/newtab/newtab.html",
    "src/chrome/newtab/newtab.html",
    "src/firefox/core/permissions.js",
    "src/chrome/core/permissions.js",
    "src/firefox/_locales",
    "src/chrome/_locales"
  ]) assert.equal(await exists(path), false, `browser overlay must not re-own shared source: ${path}`);

  assert.equal(await exists("src/chrome/core/permission-platform.js"), true, "Chrome keeps only its genuine permission capability override");
  assert.equal(await exists("src/firefox/core/permission-platform.js"), false, "Firefox uses the reviewed shared/default permission capability");
});

test("1.30.18.17 generated browser shells preserve the exact Chrome shim boundary and shared entrypoint/policy", async () => {
  const ffBg = await read("dist/firefox/background/background.js");
  const chromeBg = await read("dist/chrome/background/background.js");
  assert.equal(chromeBg, ffBg, "background entrypoint must be one generated shared file");

  const ffPermissions = await read("dist/firefox/core/permissions.js");
  const chromePermissions = await read("dist/chrome/core/permissions.js");
  assert.equal(chromePermissions, ffPermissions, "common permission policy must not diverge by browser");

  const ffHtml = await read("dist/firefox/newtab/newtab.html");
  const chromeHtml = await read("dist/chrome/newtab/newtab.html");
  const shim = '  <script src="../core/browser-shim.js"></script>\n';
  assert.equal(ffHtml.includes(shim), false, "Firefox first-paint shell must not gain the Chrome shim");
  assert.equal(chromeHtml.split(shim).length - 1, 1, "Chrome shell must inject exactly one browser shim");
  assert.equal(chromeHtml.replace(shim, ""), ffHtml, "Chrome shell may differ only by its required browser shim");
  assert.ok(chromeHtml.indexOf(shim) < chromeHtml.indexOf('  <script src="local-storage-bootstrap.js"></script>'), "Chrome shim must run before classic bootstrap scripts");
});

test("1.30.18.17 manifest localization has one reviewed source registry and preserves browser branding", async () => {
  const registry = JSON.parse(await read("src/shared/manifest-locales.json"));
  const localeIds = Object.keys(registry).sort();
  assert.equal(localeIds.length, 33);

  for (const browser of ["firefox", "chrome"]) {
    const generated = (await readdir(resolve(root, `dist/${browser}/_locales`), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    assert.deepEqual(generated, localeIds, `${browser}: generated manifest locale set`);
  }

  for (const locale of localeIds) {
    const ff = JSON.parse(await read(`dist/firefox/_locales/${locale}/messages.json`));
    const chrome = JSON.parse(await read(`dist/chrome/_locales/${locale}/messages.json`));
    assert.equal(ff.actionOpenHome.message, registry[locale].actionOpenHome);
    assert.equal(chrome.actionOpenHome.message, registry[locale].actionOpenHome);
    assert.equal(ff.extensionDescription.message, registry[locale].firefoxDescription);
    assert.equal(chrome.extensionDescription.message, registry[locale].chromeDescription);
    assert.doesNotMatch(chrome.extensionDescription.message, /Firefox|Mozilla|Firefok/i, `${locale}: Chrome description leaked Firefox branding`);
  }
});

test("1.30.18.17 permission capability seam preserves Firefox user-gesture consent and Chrome no-op consent", async () => {
  const requested = [];
  const removed = [];
  const api = {
    permissions: {
      request: spec => { requested.push(structuredClone(spec)); return Promise.resolve(true); },
      remove: spec => { removed.push(structuredClone(spec)); return Promise.resolve(true); },
      contains: () => Promise.resolve(true),
      getAll: () => Promise.resolve({ origins: ["http://*/*", "https://*/*"] })
    }
  };

  await withBrowser(api, async () => {
    const ff = await import(`../dist/firefox/core/permissions.js?step32-ff-${Date.now()}-${Math.random()}`);
    const consentPromise = ff.requestSyncConsentFromGesture();
    assert.equal(requested.length, 1, "Firefox permission request must be issued synchronously from the gesture call");
    assert.ok(Array.isArray(requested[0].data_collection) && requested[0].data_collection.length >= 1);
    assert.equal(await consentPromise, true);
    assert.equal(await ff.removeSyncConsent(), true);
    assert.deepEqual(removed.at(-1), { data_collection: requested[0].data_collection });
  });

  requested.length = 0;
  removed.length = 0;
  await withBrowser(api, async () => {
    const chrome = await import(`../dist/chrome/core/permissions.js?step32-ch-${Date.now()}-${Math.random()}`);
    assert.equal(await chrome.requestSyncConsentFromGesture(), true);
    assert.equal(requested.length, 0, "Chrome must not invent a Firefox data-collection permission request");
    assert.equal(await chrome.removeSyncConsent(), false);
    assert.equal(removed.length, 0, "Chrome Sync disable remains a local preference, not a permission revoke");
  });
});
