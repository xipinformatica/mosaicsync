import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeFaviconPreference } from "../src/shared/core/model.js";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  let depth = 0, quote = "", esc = false, line = false, block = false;
  for (let i = brace; i < src.length; i += 1) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function installQueueMutationStub(ctx) {
  if (!ctx.resolveFaviconForUrlWithPreference && ctx.resolveFaviconForUrl) {
    ctx.resolveFaviconForUrlWithPreference = (url, _preference, options) => ctx.resolveFaviconForUrl(url, options);
  }
  ctx.mutateIconRecoveryQueue = async mutator => {
    const current = await ctx.readIconRecoveryQueue();
    const next = await mutator(current);
    if (!next || next === current) return current;
    return ctx.writeIconRecoveryQueue(next);
  };
}

for (const browserName of ["firefox", "chrome"]) {
  test(`1.26.17 ${browserName} targeted iconless-shortcut recovery reaches commit without a site visit`, async () => {
    const src = readBackgroundSource(browserName);
    const state = {
      activeSpaceId: "personal",
      spaces: {
        personal: { settings: { autoSiteIcons: true }, shortcuts: [{ type: "shortcut", id: "new", url: "https://fresh.test/", image: "", imageSourceKind: "none", imageSyncKind: "none" }] },
        work: { settings: { autoSiteIcons: true }, shortcuts: [] }
      }
    };
    let queue = { version: 2, items: [] };
    let schedules = 0;
    let committed = 0;
    const ctx = {
      console, Date, Set, Map, normalizeFaviconPreference,
      PERSONAL_SPACE_ID: "personal", WORK_SPACE_ID: "work",
      ICON_RECOVERY_QUEUE_VERSION: 2, ICON_RECOVERY_CONCURRENCY: 3, ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_ALARM: "fav", ICON_RECOVERY_CONTINUE_DELAY_MS: 120,
      iconRecoveryRun: null, iconRecoveryContinuationTimer: null,
      devMark: () => {}, devMeasure: () => {},
      ensureLocalStorage: async () => ({ state }),
      readIconRecoveryQueue: async () => queue,
      readFaviconQualityAuditLedger: async () => ({ version: 1, entries: {} }),
      faviconQualityAuditNeeded: () => false,
      writeIconRecoveryQueue: async value => { queue = value; return value; },
      scheduleIconRecoveryAlarm: async () => { schedules += 1; },
      hasWebAccess: async () => true,
      platformHasPermissionFreeFaviconSource: () => browserName === "chrome",
      flattenShortcuts: st => [...st.spaces.personal.shortcuts, ...st.spaces.work.shortcuts],
      findShortcutLocationById: (st, id) => {
        for (const [spaceId, workspace] of Object.entries(st.spaces)) {
          const shortcut = workspace.shortcuts.find(item => item.id === id);
          if (shortcut) return { spaceId, workspace, shortcut };
        }
        return null;
      },
      workspaceAllowsAutoIcons: (st, id) => {
        const loc = ctx.findShortcutLocationById(st, id);
        return Boolean(loc?.workspace?.settings?.autoSiteIcons);
      },
      shortcutAllowsFaviconRecovery: (st, id) => {
        const loc = ctx.findShortcutLocationById(st, id);
        const pref = normalizeFaviconPreference(loc?.shortcut?.faviconPreference);
        const manualPending = Boolean(pref && loc?.shortcut?.imageSourceKind === "upload" && loc?.shortcut?.imageSyncKind === "device" && (!loc?.shortcut?.image || loc.shortcut.imageIsFallback === true));
        return manualPending || Boolean(loc?.workspace?.settings?.autoSiteIcons);
      },
      automaticFaviconArtwork: shortcut => Boolean(shortcut?.image && ["favicon", "firefox"].includes(shortcut.imageSourceKind)),
      shortcutNeedsProactiveFavicon: shortcut => !shortcut.image && shortcut.imageSourceKind === "none",
      iconRecoveryItemStillRelevant: (shortcut, item) => Boolean(shortcut && shortcut.url === item.url),
      iconRecoveryItemStillRelevantInState: (st, item) => {
        const loc = ctx.findShortcutLocationById(st, item.id);
        return Boolean(loc && loc.workspace.settings.autoSiteIcons && loc.shortcut.url === item.url);
      },
      pruneIconRecoveryQueueAgainstState: async value => value,
      resolveFaviconForUrl: async () => ({ image: "data:image/png;base64,AAAA", sourceUrl: "https://fresh.test/favicon.ico", provisional: false }),
      enqueue: async fn => fn(),
      applyProactiveFaviconResults: async results => {
        const appliedIds = new Set();
        for (const result of results) {
          const shortcut = state.spaces.personal.shortcuts.find(item => item.id === result.id);
          if (!shortcut) continue;
          shortcut.image = result.image;
          shortcut.imageSourceKind = "favicon";
          shortcut.imageSyncKind = "device";
          committed += 1;
          appliedIds.add(result.id);
        }
        return { appliedIds, unchangedIds: new Set() };
      },
      writeIconRecoveryStatus: async () => {},
      nextIconRecoveryQualityRetry: item => ({ exhausted: false, item: { ...item, qualityUpgrade: true } }),
      nextIconRecoveryFailure: item => ({ exhausted: false, item: { ...item, attempts: (item.attempts || 0) + 1, nextAttemptAt: Date.now() + 1000 } }),
      scheduleImmediateIconRecoveryContinuation: () => {},
      browser: { alarms: { clear: async () => {} } }
    };
    installQueueMutationStub(ctx);
    vm.createContext(ctx);
    for (const name of ["seedIconRecoveryQueue", "processIconRecoveryQueue", "requestMissingShortcutIconHydration"]) {
      vm.runInContext(extract(src, name), ctx);
    }
    const result = await ctx.requestMissingShortcutIconHydration({ shortcutIds: ["new"], force: true });
    assert.equal(result.hydrated, 1);
    assert.equal(committed, 1);
    assert.match(state.spaces.personal.shortcuts[0].image, /^data:image\/png/);
    assert.equal(queue.items.length, 0);
    assert.ok(schedules >= 1);
  });
}

test("1.26.17 Chrome native fallback is attempted without Website Access and does not pin a quality job", async () => {
  const src = readBackgroundSource("chrome");
  let queue = { version: 2, items: [{ id: "s", url: "https://known.test/", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }] };
  let resolverCalls = 0;
  const ctx = {
    console, Date, Set, Map, normalizeFaviconPreference,
    iconRecoveryRun: null,
    ICON_RECOVERY_CONCURRENCY: 3, ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000, ICON_RECOVERY_ALARM: "fav", ICON_RECOVERY_QUEUE_VERSION: 2,
    devMark: () => {}, devMeasure: () => {},
    readIconRecoveryQueue: async () => queue,
    ensureLocalStorage: async () => ({ state: {} }),
    pruneIconRecoveryQueueAgainstState: async value => value,
    scheduleIconRecoveryAlarm: async () => {},
    hasWebAccess: async () => false,
    platformHasPermissionFreeFaviconSource: () => true,
    resolveFaviconForUrl: async () => { resolverCalls += 1; return { image: "data:image/png;base64,AAAA", sourceUrl: "chrome-native", provisional: true }; },
    enqueue: async fn => fn(),
    applyProactiveFaviconResults: async () => ({ appliedIds: new Set(["s"]), unchangedIds: new Set() }),
    writeIconRecoveryQueue: async value => { queue = value; return value; },
    iconRecoveryItemStillRelevantInState: () => true,
    writeIconRecoveryStatus: async () => {},
    nextIconRecoveryQualityRetry: () => { throw new Error("quality-only job must not be retained without Website Access"); },
    nextIconRecoveryFailure: item => ({ exhausted: false, item }),
    scheduleImmediateIconRecoveryContinuation: () => {},
    browser: { alarms: { clear: async () => {} } }
  };
  installQueueMutationStub(ctx);
  vm.createContext(ctx);
  vm.runInContext(extract(src, "processIconRecoveryQueue"), ctx);
  const result = await ctx.processIconRecoveryQueue();
  assert.equal(resolverCalls, 1);
  assert.equal(result.hydrated, 1);
  assert.equal(result.pending, 0);
  assert.equal(queue.items.length, 0);
});
