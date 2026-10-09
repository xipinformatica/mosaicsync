import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { DEFAULT_STATE, LOCAL_STATE_KEY, LOCAL_CUSTOM_BRANDING_KEY } from "../src/shared/core/constants.js";
import { normalizeState, stampImportedProfileState } from "../src/shared/core/model.js";
import { writeLocalState, ensureLocalStorage } from "../src/shared/core/storage.js";
import { beginCustomBrandingImport, rollbackCustomBrandingImport } from "../src/shared/core/custom-branding.js";
import { normalizeShortcutUrl } from "../src/shared/newtab/ui-utils.js";
import { isWebBookmarkUrl } from "../src/shared/core/bookmarks.js";
import { MESSAGES as EN } from "../src/shared/core/i18n-locales/en.js";

const source = fs.readFileSync("src/shared/welcome/welcome.js", "utf8");
const newTab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

class Area {
  data = {};
  async get(keys) {
    if (!keys) return structuredClone(this.data);
    const output = {};
    for (const key of typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)) {
      if (Object.hasOwn(this.data, key)) output[key] = structuredClone(this.data[key]);
    }
    return output;
  }
  async set(values) { Object.assign(this.data, structuredClone(values)); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key]; }
}

function state(label, clock) {
  const initial = normalizeState(DEFAULT_STATE);
  initial.spaces.personal.settings.spaceName = label;
  initial.spaces.personal.updatedAt = clock;
  initial.spaces.personal.settingsModifiedAt = clock;
  initial.spaces.personal.shortcuts = [{ type: "shortcut", id: "a", title: label,
    url: "https://example.test", position: 0, createdAt: 1, modifiedAt: clock, source: "manual" }];
  return normalizeState(initial);
}

function freshWelcomeContext({ onPreferences = () => {} } = {}) {
  const trace = [];
  const ctx = vm.createContext({
    pendingSourceCandidate: null,
    beginCustomBrandingImport, rollbackCustomBrandingImport,
    writeLocalState, ensureLocalStorage, stampImportedProfileState,
    parseProfilePackage: async () => ({ state: state("Backup", 25), branding: { text: "Imported", enabled: true }, preferences: { uiLocale: "en", frequentlyVisitedEnabled: true } }),
    readProfileImportText: async () => "backup",
    async setLocalePreference(locale) { trace.push(["locale", locale]); onPreferences(); },
    localStorage: { setItem(key, value) { trace.push([key, value]); } },
    localizeDocument() {}, document: {},
    FREQUENTLY_VISITED_PREF_KEY: "fv", t: key => key,
    console
  });
  // Execute the real production functions, rather than reimplementing their decisions in the test.
  const stage = source.slice(source.indexOf("function stageStartingSourceCandidate"), source.indexOf("async function commitPendingSourceCandidate"));
  const commit = source.slice(source.indexOf("async function commitPendingSourceCandidate"), source.indexOf("function discardPendingSourceCandidate"));
  const load = source.slice(source.indexOf("async function importMosaicSyncProfile(file)"), source.indexOf("async function completeOnboarding"));
  vm.runInContext(stage + commit + load, ctx);
  return { ctx, trace };
}

test(".42 Welcome's real staged profile import fails closed against a concurrent durable edit, including branding rollback", async () => {
  const previous = globalThis.browser;
  const local = new Area();
  globalThis.browser = { storage: { local, session: new Area() } };
  try {
    await writeLocalState(state("Before", 100));
    const { ctx, trace } = freshWelcomeContext();
    await ctx.importMosaicSyncProfile({});
    assert.ok(ctx.pendingSourceCandidate.compactBaseline, "staging must retain the exact persisted compact baseline");
    await writeLocalState(state("Newer tab", 700));
    const durableBefore = structuredClone(local.data);
    await assert.rejects(() => ctx.commitPendingSourceCandidate("profile"),
      error => error?.code === "PROFILE_IMPORT_STALE_BASELINE");
    const durableAfter = structuredClone(local.data);
    assert.deepEqual(durableAfter, durableBefore, "rejected import must not change layout, branding, or pending journals");
    assert.equal(trace.length, 0, "no imported preferences may leak after rejection");
  } finally { globalThis.browser = previous; }
});

test(".42 Welcome profile candidate commits normally when no second tab intervenes", async () => {
  const previous = globalThis.browser;
  const local = new Area();
  globalThis.browser = { storage: { local, session: new Area() } };
  try {
    await writeLocalState(state("Before", 100));
    const { ctx, trace } = freshWelcomeContext();
    await ctx.importMosaicSyncProfile({});
    await ctx.commitPendingSourceCandidate("profile");
    const stored = await ensureLocalStorage();
    assert.equal(stored.state.spaces.personal.settings.spaceName, "Backup");
    assert.equal(local.data[LOCAL_CUSTOM_BRANDING_KEY]?.text, "Imported");
    assert.deepEqual(trace[0], ["locale", "en"]);
    assert.equal(ctx.pendingSourceCandidate, null);
  } finally { globalThis.browser = previous; }
});

test(".42 stale-import errors are actionable and localized on both Welcome resolution paths and New Tab", async () => {
  assert.match(source, /loaded\.compactBaseline\);/);
  assert.match(source, /requireUnchangedCompactState:\s*candidate\.compactBaseline/);
  const references = (source + newTab).match(/t\("profileImportChangedRetry"\)/g) || [];
  assert.ok(references.length >= 3);
  assert.match(EN.profileImportChangedRetry, /try importing again/i);
  assert.doesNotMatch(EN.profileImportChangedRetry, /[<>{}]/);
  const localeDir = "src/shared/core/i18n-locales";
  for (const file of fs.readdirSync(localeDir).filter(f => f.endsWith(".js"))) {
    const { MESSAGES } = await import(`../${localeDir}/${file}`);
    for (const key of ["profileImportChangedRetry", "shortcutUrlCredentialsNotAllowed"]) {
      assert.ok(MESSAGES[key]?.trim(), `${file}: ${key} must be localized`);
    }
  }
});

test(".42 rejects newly authored credential URLs across manual, bookmark and native import boundaries, without deleting legacy stored shortcuts", async () => {
  const withPassword = "https://user:secret@example.org/private";
  const usernameOnly = "https://user@example.org/private";
  const plain = "https://example.org/private";
  assert.ok(globalThis.__mosaicsyncSafeShortcutNavigationUrl(withPassword), "legacy navigation is preserved; old saved layouts must not be silently pruned");
  assert.equal(globalThis.__mosaicsyncSafeShortcutCreationUrl(withPassword), "");
  assert.equal(globalThis.__mosaicsyncSafeShortcutCreationUrl(usernameOnly), "");
  assert.equal(globalThis.__mosaicsyncSafeShortcutCreationUrl(plain), plain);
  for (const value of [withPassword, usernameOnly, "https://:secret@example.org/"]) {
    assert.throws(() => normalizeShortcutUrl(value), error => error?.code === "SHORTCUT_URL_CREDENTIALS");
    assert.equal(isWebBookmarkUrl(value), true, "existing browser bookmarks remain visible; only new MosaicSync shortcuts reject credentials");
  }
  assert.equal(isWebBookmarkUrl(plain), true);
  assert.equal(normalizeShortcutUrl("example.org/private"), plain);
  const nativeImport = fs.readFileSync("src/shared/core/importer.js", "utf8");
  assert.match(nativeImport, /__mosaicsyncSafeShortcutCreationUrl\?\.\(site\?\.url\)/);
  const legacy = normalizeState({ shortcuts: [{ type: "shortcut", id: "legacy", title: "Legacy", url: withPassword, position: 0 }] });
  assert.equal(legacy.shortcuts[0]?.url, withPassword, "upgrades must not silently delete pre-existing shortcuts");
});

test(".42 corrective keeps credential-bearing browser bookmarks visible and allows explicit native bookmark creation while shortcut authoring rejects them", async () => {
  const { flattenBookmarks, directFolderBookmarks, createBookmark } = await import("../src/shared/core/bookmarks.js");
  const secret = "http://admin:password@192.168.1.1/";
  const folder = { id: "router", type: "folder", title: "Router", children: [
    { id: "router-admin", type: "bookmark", title: "Router admin", url: secret }
  ] };
  assert.equal(isWebBookmarkUrl(secret), true, "browser bookmark reading is not a shortcut-creation security boundary");
  assert.deepEqual(flattenBookmarks([folder]).map(entry => entry.title), ["Router admin"]);
  assert.deepEqual(directFolderBookmarks(folder).map(entry => entry.title), ["Router admin"]);
  const originalBrowser = globalThis.browser;
  const calls = [];
  globalThis.browser = { bookmarks: { create: async item => { calls.push(item); return { id: "book", ...item }; } } };
  try {
    const created = await createBookmark({ title: "Router admin", url: secret });
    assert.equal(created?.url, secret, "browser-bookmark creation remains independent of MosaicSync shortcut authoring");
    assert.deepEqual(calls, [{ title: "Router admin", url: secret }]);
  } finally { globalThis.browser = originalBrowser; }
  assert.throws(() => normalizeShortcutUrl(secret), error => error?.code === "SHORTCUT_URL_CREDENTIALS",
    "a bookmark cannot become a new MosaicSync shortcut with embedded credentials");
});

test(".42 corrective credential rejection is mapped by the real locale translator on Frequently Visited error surfaces", async () => {
  const { setLocalePreference, translateText } = await import("../src/shared/core/i18n.js");
  const previousStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    let error;
    try { normalizeShortcutUrl("https://user:secret@example.org/"); } catch (thrown) { error = thrown; }
    assert.equal(error?.code, "SHORTCUT_URL_CREDENTIALS");
    assert.equal(error.message, EN.shortcutUrlCredentialsNotAllowed,
      "generic Frequently Visited error-to-toast paths translate only exact English catalog values");
    await setLocalePreference("ca");
    const { MESSAGES: CA } = await import("../src/shared/core/i18n-locales/ca.js");
    assert.equal(translateText(error.message), CA.shortcutUrlCredentialsNotAllowed);
    assert.notEqual(translateText(error.message), error.message);
  } finally {
    await setLocalePreference("en");
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test(".42 corrective Welcome returns to source selection after a stale staged profile, allowing a fresh retry", async () => {
  const previous = globalThis.browser;
  const local = new Area();
  globalThis.browser = { storage: { local, session: new Area() } };
  try {
    await writeLocalState(state("Before", 100));
    const { ctx } = freshWelcomeContext();
    await ctx.importMosaicSyncProfile({});
    await writeLocalState(state("Other tab", 800));
    const saved = structuredClone(local.data);
    let chooseLocal;
    const sourceStep = { hidden: true };
    const resolutionPanel = { hidden: false };
    const sourceFinishButton = { disabled: true };
    Object.assign(ctx, {
      chooseLocalButton: { disabled: false, addEventListener(type, callback) { if (type === "click") chooseLocal = callback; } },
      chooseCloudButton: { disabled: false },
      introStep: { hidden: true }, sourceStep, syncStep: { hidden: true }, resolutionPanel,
      frequentPermissionStep: { hidden: true },
      sourceFinishButton,
      cloudChoiceInput: { disabled: false },
      cloudChoiceCard: { classList: { add() {}, remove() {} } },
      cloudSnapshotHint: { textContent: "" }, sourceIntro: { textContent: "" },
      latestSyncStatus: { hasRemoteSignal: true, hasRemoteData: true },
      syncOptedIn: true,
      formatTime: () => "now",
      refreshChoiceCards: () => { sourceFinishButton.disabled = sourceStep.hidden; },
      setStatus(message, kind) { ctx.lastStatus = { message, kind }; },
      sendSyncMessage: async () => { throw new Error("stale import must not publish"); }
    });
    const discard = source.slice(source.indexOf("function discardPendingSourceCandidate"), source.indexOf("async function importThisFirefox"));
    const render = source.slice(source.indexOf("function configureSourceStep"), source.indexOf("function showConflictPanel"));
    const handler = source.slice(source.indexOf('chooseLocalButton.addEventListener("click", async () => {'), source.indexOf('chooseCloudButton.addEventListener("click", () => {'));
    vm.runInContext(discard + render + handler, ctx);
    assert.equal(typeof chooseLocal, "function");
    await chooseLocal();
    assert.equal(ctx.pendingSourceCandidate, null, "the failed staged candidate must be discarded");
    assert.equal(sourceStep.hidden, false, "source selection, including profile file import, is visible again");
    assert.equal(resolutionPanel.hidden, true, "no dead-end resolution screen remains");
    assert.equal(sourceFinishButton.disabled, false, "the source-choice action is available for retry");
    assert.deepEqual(ctx.lastStatus, { message: "profileImportChangedRetry", kind: "error" });
    assert.deepEqual(local.data, saved, "conflict resolution never modifies the newer durable state");
    await ctx.importMosaicSyncProfile({});
    await ctx.commitPendingSourceCandidate("profile");
    assert.equal((await ensureLocalStorage()).state.spaces.personal.settings.spaceName, "Backup", "freshly staged profile can commit");
  } finally { globalThis.browser = previous; }
});
