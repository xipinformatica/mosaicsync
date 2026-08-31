import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const profile = await import("../dist/firefox/core/profile.js");
const ui = await import("../dist/firefox/newtab/ui-utils.js");

function shortcut(id, url = `https://${id}.example/`) {
  return {
    type: "shortcut", id, title: id, url, image: "", imageSyncKind: "none",
    imageSourceKind: "none", imageStyle: "contain", position: 0,
    createdAt: 10, modifiedAt: 10, source: "manual"
  };
}

function ownHostileKeys(target, marker) {
  Object.defineProperty(target, "__proto__", {
    value: { [`polluted_${marker}`]: "yes" }, enumerable: true, configurable: true
  });
  target.constructor = { prototype: { [`ctor_${marker}`]: "yes" } };
  target.prototype = { [`prototype_${marker}`]: "yes" };
}

async function recomputeIntegrity(raw) {
  const { integrity, ...body } = raw;
  const bytes = new TextEncoder().encode(model.stableStringify(body));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  raw.integrity.value = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function assertPrototypeClean(marker) {
  assert.equal(Object.prototype[`polluted_${marker}`], undefined);
  assert.equal(Object.prototype[`ctor_${marker}`], undefined);
  assert.equal(Object.prototype[`prototype_${marker}`], undefined);
  assert.equal(({})[`polluted_${marker}`], undefined);
}

async function baseProfilePackage() {
  const state = model.normalizeState({
    shortcuts: [shortcut("safe")],
    settings: { ...constants.DEFAULT_SETTINGS },
    settingsModifiedAt: 10,
    updatedAt: 10
  });
  const pkg = await profile.createProfilePackage(state, {});
  return JSON.parse(profile.serializeProfilePackage(pkg));
}

test("1.26.17.5 one shared HTTP(S) validator owns model/cache/bootstrap/UI shortcut acceptance", async () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://example.com/deadbeef",
    "file:///etc/passwd",
    "about:config",
    "chrome://settings/",
    "moz-extension://deadbeef/",
    "not a url",
    `https://example.com/${"x".repeat(2100)}`
  ]) assert.equal(ui.safeShortcutNavigationUrl(value), "", value);

  assert.equal(ui.safeShortcutNavigationUrl("HTTPS://Example.COM/path"), "https://example.com/path");
  assert.equal(ui.safeShortcutNavigationUrl("http://localhost:8080/"), "http://localhost:8080/");

  const modelSource = await readFile(resolve("src/shared/core/model.js"), "utf8");
  const storageSource = await readFile(resolve("src/shared/core/storage.js"), "utf8");
  const uiSource = await readFile(resolve("src/shared/newtab/ui-utils.js"), "utf8");
  const manifestSource = await readFile(resolve("src/shared/newtab/render-manifest.js"), "utf8");
  const firstPaintSource = await readFile(resolve("src/shared/core/first-paint-contract.js"), "utf8");
  assert.match(modelSource, /__mosaicsyncSafeShortcutNavigationUrl/);
  assert.match(storageSource, /__mosaicsyncSafeShortcutNavigationUrl/);
  assert.match(uiSource, /__mosaicsyncSafeShortcutNavigationUrl/);
  assert.match(manifestSource, /first-paint-contract/);
  assert.match(firstPaintSource, /__mosaicsyncSafeShortcutNavigationUrl/);
  assert.doesNotMatch(modelSource, /\["http:",\s*"https:"\]\.includes\(parsed\.protocol\)/);
  assert.doesNotMatch(storageSource, /\^https\?:\\\/\\\//i);
});

test("1.26.17.5 synchronous first-paint uses the shared fail-closed URL helper at href sinks", async () => {
  const safety = await readFile(resolve("src/shared/core/http-url-safety.js"), "utf8");
  assert.ok(Buffer.byteLength(safety, "utf8") < 1800, "first-paint safety primitive must stay tiny");
  assert.doesNotMatch(safety, /\b(?:fetch|XMLHttpRequest|setTimeout|setInterval|requestAnimationFrame)\b/);

  const bootstrap = await readFile(resolve("src/shared/newtab/render-bootstrap.js"), "utf8");
  assert.match(bootstrap, /const safeShortcutNavigationUrl = globalThis\.__mosaicsyncSafeShortcutNavigationUrl;/);
  assert.match(bootstrap, /if \(typeof safeShortcutNavigationUrl !== "function"\) return;/);
  assert.match(bootstrap, /const safeUrl = safeShortcutNavigationUrl\(item\?\.url\);[\s\S]*?card\.href = safeUrl;/);
  assert.doesNotMatch(bootstrap, /site\?\.url|frequentSitesList|paintFrequentSnapshot/,
    "browser-derived Frequently Visited URLs must not be persistent first-frame href sinks");
  assert.doesNotMatch(bootstrap, /function validUrl\s*\(/);
  assert.doesNotMatch(bootstrap, /card\.href\s*=\s*item\.url/);

  for (const browser of ["firefox", "chrome"]) {
    const html = await readFile(resolve(`src/${browser}/newtab/newtab.html`), "utf8");
    const safetyIndex = html.indexOf('<script src="../core/http-url-safety.js"></script>');
    const bootstrapIndex = html.indexOf('<script src="render-bootstrap.js"></script>');
    assert.ok(safetyIndex >= 0 && bootstrapIndex > safetyIndex, `${browser}: helper must load before render bootstrap`);
    // Keep the additional tiny classic safety file at the bottom next to the
    // disposable first-frame renderer; it must not move into the head/startup I/O path.
    assert.ok(safetyIndex > html.indexOf("<body"), `${browser}: helper must stay out of the head critical path`);
  }
});

test("1.26.17.5 checksum-valid hostile prototype keys are safe at every profile object boundary", async () => {
  const cases = [
    ["package", raw => raw],
    ["profile", raw => raw.profile],
    ["state", raw => raw.profile.state],
    ["spaces", raw => raw.profile.state.spaces],
    ["settings", raw => raw.profile.state.spaces.personal.settings],
    ["personal-space", raw => raw.profile.state.spaces.personal],
    ["shortcut", raw => raw.profile.state.spaces.personal.shortcuts[0]],
    ["assets", raw => raw.profile.assets]
  ];

  for (const [marker, select] of cases) {
    const raw = await baseProfilePackage();
    const target = select(raw);
    assert.ok(target && typeof target === "object", marker);
    ownHostileKeys(target, marker);
    await recomputeIntegrity(raw);

    let parsed = null;
    let rejected = false;
    try {
      parsed = await profile.parseProfilePackage(JSON.stringify(raw));
    } catch (error) {
      rejected = true;
      assert.ok(
        ["PROFILE_DAMAGED", "PROFILE_INVALID_FILE", "PROFILE_INVALID_STATE"].includes(error?.code),
        `${marker}: unexpected rejection code ${error?.code}`
      );
    }
    assertPrototypeClean(marker);
    if (!rejected) {
      assert.ok(parsed?.state, `${marker}: accepted hostile package must normalize to a state`);
      assert.equal(Object.hasOwn(parsed.state, "__proto__"), false);
      assert.equal(Object.hasOwn(parsed.state, "prototype"), false);
    }
  }
});

test("1.26.17.5 nested folder child hostile keys are normalized without prototype pollution", async () => {
  const t = 10;
  const state = model.normalizeState({
    shortcuts: [{
      type: "folder", id: "folder", title: "Folder", position: 0, createdAt: t, modifiedAt: t,
      items: [shortcut("one"), { ...shortcut("two"), position: 1 }]
    }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: t, updatedAt: t
  });
  const raw = JSON.parse(profile.serializeProfilePackage(await profile.createProfilePackage(state, {})));
  const folder = raw.profile.state.spaces.personal.shortcuts[0];
  const child = folder.items[0];
  ownHostileKeys(folder, "folder");
  ownHostileKeys(child, "folder-child");
  await recomputeIntegrity(raw);
  const parsed = await profile.parseProfilePackage(JSON.stringify(raw));
  assertPrototypeClean("folder");
  assertPrototypeClean("folder-child");
  assert.equal(parsed.state.spaces.personal.shortcuts[0].items.length, 2);
  assert.equal(Object.hasOwn(parsed.state.spaces.personal.shortcuts[0], "__proto__"), false);
  assert.equal(Object.hasOwn(parsed.state.spaces.personal.shortcuts[0].items[0], "__proto__"), false);
});
