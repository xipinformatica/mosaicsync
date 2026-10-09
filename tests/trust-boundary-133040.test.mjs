import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { readdir } from "node:fs/promises";

globalThis.crypto ||= webcrypto;

function extractFunction(source, name) {
  const signatures = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const signature of signatures) {
    start = source.indexOf(signature);
    if (start >= 0) break;
  }
  assert.ok(start >= 0, `missing function ${name}`);
  const parenStart = source.indexOf("(", start);
  let parenDepth = 0, body = -1, quote = "", escaped = false;
  for (let i = parenStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")" && --parenDepth === 0) { body = source.indexOf("{", i); break; }
  }
  assert.ok(body >= 0, `missing body ${name}`);
  let depth = 0, line = false, block = false;
  quote = ""; escaped = false;
  for (let i = body; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1];
    if (line) { if (ch === "\n") line = false; continue; }
    if (block) { if (ch === "*" && next === "/") { block = false; i += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") { line = true; i += 1; continue; }
    if (ch === "/" && next === "*") { block = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

class Area {
  constructor() { this.data = {}; this.fail = null; }
  async get(keys) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    const out = { ...(keys || {}) };
    for (const key of Object.keys(keys || {})) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) {
    if (this.fail) {
      const error = this.fail;
      this.fail = null;
      throw error;
    }
    for (const [key, value] of Object.entries(items)) this.data[key] = structuredClone(value);
  }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

const local = new Area();
const session = new Area();
globalThis.browser = { storage: { local, session } };

const constants = await import(`../src/shared/core/constants.js?tb133040=${Date.now()}`);
const model = await import(`../src/shared/core/model.js?tb133040=${Date.now()}`);
const storage = await import(`../src/shared/core/storage.js?tb133040=${Date.now()}`);
const errors = await import(`../src/shared/core/errors.js?tb133040=${Date.now()}`);

function shortcut(title = "Before", modifiedAt = 100) {
  return {
    type: "shortcut", id: "a", title, url: "https://example.test/", image: "", localImageAssetId: "",
    imageSyncData: "", imageAssetId: "", imageSyncKind: "none", imageSourceKind: "none",
    imageSourceUrl: "", imageIsFallback: false, imageStyle: "contain", position: 0,
    createdAt: 10, modifiedAt, spaceMoveAt: 0, source: "manual"
  };
}

function stateWithTitle(title, updatedAt = 100) {
  return model.normalizeState({
    shortcuts: [shortcut(title, updatedAt)],
    settings: { ...constants.DEFAULT_SETTINGS },
    settingsModifiedAt: 100,
    updatedAt
  });
}

function quotaError(message = "raw QUOTA_BYTES quota exceeded diagnostic") {
  const error = new Error(message);
  error.name = "QuotaExceededError";
  return error;
}

test("1.33.0.40 quota classification covers named, message-only and nested browser errors without broad false positives", () => {
  assert.equal(errors.isQuotaExceededError(quotaError()), true);
  const messageOnly = new Error("QUOTA_BYTES quota exceeded");
  messageOnly.name = "Error";
  assert.equal(errors.isQuotaExceededError(messageOnly), true);
  const nested = new Error("outer storage wrapper");
  nested.cause = messageOnly;
  assert.equal(errors.isQuotaExceededError(nested), true);
  assert.equal(errors.isQuotaExceededError(new Error("request exceeded the retry time limit")), false);
});

test("1.33.0.40 local quota failure has a stable quota category and preserves the browser diagnostic only as cause", async () => {
  local.data = {};
  session.data = {};
  const before = stateWithTitle("Before", 100);
  await storage.writeLocalState(before);
  const persistedBefore = structuredClone(local.data);
  local.fail = quotaError();
  await assert.rejects(
    () => storage.writeLocalState(stateWithTitle("After", 200), { baseState: storage.createWriteBaseline(before) }),
    error => {
      assert.equal(error?.code, "STORAGE_LOCAL_QUOTA_EXCEEDED");
      assert.equal(error?.cause?.name, "QuotaExceededError");
      assert.doesNotMatch(String(error?.message || ""), /QUOTA_BYTES|raw .*diagnostic/i);
      return true;
    }
  );
  assert.deepEqual(local.data, persistedBefore, "failed atomic write must leave the persisted transaction unchanged");
});

test("1.33.0.40 non-quota local write failure keeps the generic stable category without exposing raw browser text", async () => {
  local.data = {};
  session.data = {};
  const before = stateWithTitle("Before", 100);
  await storage.writeLocalState(before);
  const error = new Error("raw platform storage backend exploded");
  error.name = "UnknownError";
  local.fail = error;
  await assert.rejects(
    () => storage.writeLocalState(stateWithTitle("After", 200), { baseState: storage.createWriteBaseline(before) }),
    thrown => {
      assert.equal(thrown?.code, "STORAGE_LOCAL_WRITE_FAILED");
      assert.equal(thrown?.cause?.name, "UnknownError");
      assert.doesNotMatch(String(thrown?.message || ""), /backend exploded|raw platform/i);
      return true;
    }
  );
});

test("1.33.0.40 a failed user save keeps the live edit and the next successful save persists that same intention", async () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const attempted = [];
  let calls = 0;
  const context = vm.createContext({
    state: { schemaVersion: 7, updatedAt: 100, shortcuts: [{ id: "a", title: "Edited in memory" }], settings: {} },
    writeBaseline: { old: true },
    stateMutationGeneration: 0,
    DEFAULT_STATE: { schemaVersion: 7 },
    nextMutationTime: value => Number(value || 0) + 1,
    repairTopLevelPositionsWithinCapacity: items => items,
    visibleTopLevelCapacity: () => 50,
    async writeLocalStateWithBaseline(candidate) {
      attempted.push(structuredClone(candidate));
      calls += 1;
      if (calls <= 2) {
        const error = quotaError("browser raw quota detail");
        error.code = "STORAGE_LOCAL_QUOTA_EXCEEDED";
        throw error;
      }
      return { state: structuredClone(candidate), compactBaseline: { saved: true } };
    },
    presentLocalPersistenceError(error) {
      if (error?.code === "STORAGE_LOCAL_QUOTA_EXCEEDED") error.message = "friendly-quota";
      return error;
    },
    settlePersistedSettingsDraft() {}, scheduleAppearanceHintRefresh() {}, refreshRenderManifestAfterArtworkChange() {}, refreshFirstPaintCaches() {},
    meta: {}, Object, Number, Boolean, structuredClone
  });
  vm.runInContext(extractFunction(source, "saveState"), context);

  await assert.rejects(() => context.saveState(), error => error?.message === "friendly-quota");
  assert.equal(context.state.shortcuts[0].title, "Edited in memory", "failed persistence must not roll back the visible local intention");
  assert.equal(context.writeBaseline.old, true, "failed persistence must not pretend to advance the durable baseline");

  await assert.rejects(() => context.saveState(), error => error?.message === "friendly-quota");
  assert.equal(context.state.shortcuts[0].title, "Edited in memory", "repeated failure must still keep the live intention");
  assert.equal(context.writeBaseline.old, true, "repeated failure must still leave the durable baseline unchanged");

  await context.saveState();
  assert.equal(attempted.length, 3);
  assert.equal(attempted[2].shortcuts[0].title, "Edited in memory", "eventual retry must carry the still-live edit");
  assert.deepEqual(context.writeBaseline, { saved: true }, "successful retry must advance the durable baseline");
});

test("1.33.0.40 saveState presents both quota and generic local persistence failures through localized UI keys", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /function presentLocalPersistenceError\(/);
  assert.match(source, /STORAGE_LOCAL_QUOTA_EXCEEDED[\s\S]{0,260}?localStorageFullUnsaved/);
  assert.match(source, /STORAGE_LOCAL_WRITE_FAILED[\s\S]{0,260}?localSaveFailedUnsaved/);
  assert.match(extractFunction(source, "saveState"), /catch\s*\(error\)[\s\S]*presentLocalPersistenceError\(error\)/);
});

test("1.33.0.40 every UI locale carries the two persistence-failure messages with matching placeholders", async () => {
  const dir = "src/shared/core/i18n-locales";
  const files = (await readdir(dir)).filter(name => name.endsWith(".js")).sort();
  const en = (await import(`../${dir}/en.js?tb133040-en=${Date.now()}`)).MESSAGES;
  for (const key of ["localStorageFullUnsaved", "localSaveFailedUnsaved"]) {
    assert.ok(String(en[key] || "").trim(), `English missing ${key}`);
  }
  for (const file of files) {
    const catalog = (await import(`../${dir}/${file}?tb133040-${Date.now()}-${file}`)).MESSAGES;
    for (const key of ["localStorageFullUnsaved", "localSaveFailedUnsaved"]) {
      assert.ok(String(catalog[key] || "").trim(), `${file} missing ${key}`);
      if (file !== "en.js") assert.notEqual(catalog[key], en[key], `${file}:${key} must be translated`);
    }
  }
});

test("1.33.0.40 does not add a new unlimitedStorage permission as part of failure handling", () => {
  for (const browser of ["firefox", "chrome"]) {
    const manifest = JSON.parse(fs.readFileSync(`src/${browser}/manifest.json`, "utf8"));
    assert.equal(manifest.permissions.includes("unlimitedStorage"), false, `${browser} permission scope must remain unchanged`);
  }
});


test("1.33.0.40 persistence-failure regression is owned by New Tab, Security, Browser, Core and Release groups", async () => {
  const { testFilesForGroup } = await import("../tools/test-groups.mjs");
  const file = "tests/trust-boundary-133040.test.mjs";
  for (const group of ["newtab", "security", "browser", "core", "release"]) {
    assert.ok(testFilesForGroup(group).includes(file), `${group} must own ${file}`);
  }
});
