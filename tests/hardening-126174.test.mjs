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
  return { type:"shortcut", id, title:id, url, image:"", imageSyncKind:"none", imageSourceKind:"none", imageStyle:"contain", position:0, createdAt:10, modifiedAt:10, source:"manual" };
}

test("1.26.17.4 rejects an oversized profile before File.text() is called", async () => {
  let textCalls = 0;
  const file = {
    size: profile.PROFILE_IMPORT_MAX_BYTES + 1,
    async text() { textCalls += 1; return "{}"; }
  };
  await assert.rejects(() => profile.readProfileImportText(file), error => error?.code === "PROFILE_TOO_LARGE");
  assert.equal(textCalls, 0, "oversized profile must be rejected before allocating its text");
});

test("1.26.17.4 profile pre-read guard accepts the exact ceiling", async () => {
  let textCalls = 0;
  const file = { size: profile.PROFILE_IMPORT_MAX_BYTES, async text() { textCalls += 1; return "ok"; } };
  assert.equal(await profile.readProfileImportText(file), "ok");
  assert.equal(textCalls, 1);
});

test("1.26.17.4 final shortcut navigation accepts only HTTP(S)", () => {
  assert.equal(ui.safeShortcutNavigationUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(ui.safeShortcutNavigationUrl("http://localhost:8080/"), "http://localhost:8080/");
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "blob:https://example.com/deadbeef",
    "file:///etc/passwd",
    "chrome://settings/",
    "about:config",
    "not a url"
  ]) assert.equal(ui.safeShortcutNavigationUrl(value), "", value);
});

test("1.26.17.4 model and Sync reconstruction independently drop non-HTTP(S) shortcut URLs", () => {
  const normalized = model.normalizeState({
    shortcuts: [shortcut("good"), shortcut("bad", "javascript:alert(1)")],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 10, updatedAt: 10
  });
  assert.deepEqual(normalized.shortcuts.map(item => item.id), ["good"]);

  const records = new Map([
    ["good", { schemaVersion:constants.SYNC_SCHEMA_VERSION, kind:"shortcut", id:"good", title:"Good", url:"https://good.example/", position:0, createdAt:10, modifiedAt:10, deviceId:"a" }],
    ["bad", { schemaVersion:constants.SYNC_SCHEMA_VERSION, kind:"shortcut", id:"bad", title:"Bad", url:"data:text/html,bad", position:1, createdAt:10, modifiedAt:10, deviceId:"a" }]
  ]);
  const rebuilt = model.stateFromRecords(records, null, normalized);
  assert.equal(rebuilt.shortcuts.some(item => item.id === "bad"), false);
});

test("1.26.17.4 checksum-valid hostile profile keys cannot pollute Object.prototype", async () => {
  const state = model.normalizeState({ shortcuts:[shortcut("safe")], settings:{...constants.DEFAULT_SETTINGS}, settingsModifiedAt:10, updatedAt:10 });
  const pkg = await profile.createProfilePackage(state, {});
  const raw = JSON.parse(profile.serializeProfilePackage(pkg));
  Object.defineProperty(raw.profile.state, "__proto__", { value:{ polluted:"yes" }, enumerable:true, configurable:true });
  raw.profile.state.constructor = { prototype:{ pollutedConstructor:"yes" } };
  const { integrity, ...body } = raw;
  const bytes = new TextEncoder().encode(model.stableStringify(body));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  raw.integrity.value = [...digest].map(byte => byte.toString(16).padStart(2,"0")).join("");
  const parsed = await profile.parseProfilePackage(JSON.stringify(raw));
  assert.equal(parsed.state.shortcuts[0].url, "https://safe.example/");
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.prototype.pollutedConstructor, undefined);
  assert.equal(({}).polluted, undefined);
});

test("1.26.17.4 source keeps profile restore explicitly authoritative while hardening file reads", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const background = await readFile(resolve(`src/${browser}/background/background.js`), "utf8");
    const start = background.indexOf("async function bootstrapLocal()");
    const end = background.indexOf("async function", start + 30);
    const section = background.slice(start, end > start ? end : undefined);
    assert.match(section, /Authoritative local publish/);
    assert.match(section, /for \(const \[id, record\] of records\) writes\[itemKey\(id\)\] = record;/);
    assert.match(section, /if \(!records\.has\(id\) && remoteRecord\?\.kind !== "deleted"\)/);

    const newtab = await readFile(resolve(`src/shared/newtab/newtab.js`), "utf8");
    assert.match(newtab, /parseProfilePackage\(await readProfileImportText\(file\)\)/);
    assert.doesNotMatch(newtab, /parseProfilePackage\(await file\.text\(\)\)/);
  }
  const welcome = await readFile(resolve("src/shared/welcome/welcome.js"), "utf8");
  assert.match(welcome, /parseProfilePackage\(await readProfileImportText\(file\)\)/);
  assert.doesNotMatch(welcome, /parseProfilePackage\(await file\.text\(\)\)/);
});

test("1.26.17.4 removes the obsolete current-version migration gate and contradictory mobile CSS", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const background = await readFile(resolve(`src/${browser}/background/background.js`), "utf8");
    assert.doesNotMatch(background, /VERSION\s*===\s*["']1\.24\.7b["']/);
    assert.match(background, /force:\s*resolverQualityUpgrade/);

    const css = await readFile(resolve(`src/shared/newtab/newtab.css`), "utf8");
    assert.doesNotMatch(css, /\.frequent-site-card:nth-child\(n\+4\)\s*\{\s*display:\s*none;/);
    assert.match(css, /\.frequent-site-card:nth-child\(n\+4\)\s*\{\s*display:\s*flex;/);
  }
});
