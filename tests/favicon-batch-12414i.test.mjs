import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeFaviconPreference } from "../src/shared/core/model.js";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}(`);
  if (start < 0) start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  assert.ok(brace >= 0, `missing body for ${name}`);
  let depth = 0, quote = "", esc = false, lineComment = false, blockComment = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i++; } continue; }
    if (quote) { if (esc) { esc = false; continue; } if (c === "\\") { esc = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { lineComment = true; i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function shortcut(id, url, overrides = {}) {
  return {
    type: "shortcut", id, url, image: "", imageSyncData: "", imageAssetId: "", imageSyncKind: "none",
    imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false, ...overrides
  };
}

function stateWithSpaces({ activeSpaceId = "personal", personal = [], work = [], personalAuto = true, workAuto = true } = {}) {
  const spaces = {
    personal: { shortcuts: personal, settings: { autoSiteIcons: personalAuto } },
    work: { shortcuts: work, settings: { autoSiteIcons: workAuto } }
  };
  const active = spaces[activeSpaceId];
  return { activeSpaceId, spaces, shortcuts: active.shortcuts, settings: active.settings };
}

function installQueueMutationStub(ctx) {
  if (!ctx.resolveFaviconForUrlWithPreference && ctx.resolveFaviconForUrl) {
    ctx.resolveFaviconForUrlWithPreference = (url, _preference, options) => ctx.resolveFaviconForUrl(url, options);
  }
  if (ctx.mutateIconRecoveryQueue || !ctx.readIconRecoveryQueue || !ctx.writeIconRecoveryQueue) return;
  ctx.mutateIconRecoveryQueue = async mutator => {
    const current = await ctx.readIconRecoveryQueue();
    const next = await mutator(current);
    if (!next || next === current) return current;
    return ctx.writeIconRecoveryQueue(next);
  };
}

function runFunctions(src, names, context, prelude = "") {
  const ctx = { console, normalizeFaviconPreference, ...context };
  installQueueMutationStub(ctx);
  vm.createContext(ctx);
  const helperNames = ["manualFaviconPreferencePending", "shortcutAllowsFaviconRecovery"];
  const uniqueNames = [...new Set([...helperNames, ...names])];
  const body = uniqueNames.map(name => extract(src, name)).join("\n\n");
  vm.runInContext(`${prelude}\n${body}`, ctx);
  return ctx;
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: 1.24.14i proactive batch commit is Space-aware and rejects stale/deleted/disabled targets`, async () => {
    const src = readBackgroundSource(browser);
    let writes = 0;
    let currentState = stateWithSpaces({
      activeSpaceId: "personal",
      personal: [],
      work: [shortcut("moved", "https://same.example/"), shortcut("peer", "https://same.example/")],
      workAuto: true
    });
    const ctx = runFunctions(src, [
      "automaticFaviconArtwork", "shortcutNeedsProactiveFavicon", "findShortcutInItems", "findShortcutById", "findShortcutLocationById", "applyProactiveFaviconResults"
    ], {
      PERSONAL_SPACE_ID: "personal",
      WORK_SPACE_ID: "work",
      ensureLocalStorage: async () => ({ state: currentState }),
      createWriteBaseline: state => structuredClone(state),
      writeLocalState: async () => { writes++; }
    });

    const movedImage = "data:image/png;base64,TU9WRUQ=";
    const peerImage = "data:image/png;base64,UEVFUg==";
    let result = await ctx.applyProactiveFaviconResults([
      { id: "moved", url: "https://same.example/", image: movedImage, sourceUrl: "https://same.example/a.ico" },
      { id: "peer", url: "https://same.example/", image: peerImage, sourceUrl: "https://same.example/b.ico" }
    ]);
    assert.equal(result.appliedIds.has("moved"), true, "an in-flight job follows the shortcut into Work");
    assert.equal(result.appliedIds.has("peer"), true, "same-URL shortcuts stay isolated by id");
    assert.equal(currentState.spaces.work.shortcuts[0].image, movedImage);
    assert.equal(currentState.spaces.work.shortcuts[1].image, peerImage);
    assert.equal(writes, 1, "the batch persists once");

    writes = 0;
    currentState = stateWithSpaces({ work: [shortcut("moved", "https://new.example/")], workAuto: true });
    result = await ctx.applyProactiveFaviconResults([
      { id: "moved", url: "https://old.example/", image: movedImage, sourceUrl: "https://old.example/favicon.ico" }
    ]);
    assert.equal(result.appliedIds.size, 0, "a URL edit invalidates old network work");
    assert.equal(writes, 0);

    currentState = stateWithSpaces({ work: [], workAuto: true });
    result = await ctx.applyProactiveFaviconResults([
      { id: "moved", url: "https://same.example/", image: movedImage, sourceUrl: "https://same.example/favicon.ico" }
    ]);
    assert.equal(result.appliedIds.size, 0, "a deletion cannot be resurrected by the batch commit");

    currentState = stateWithSpaces({ work: [shortcut("moved", "https://same.example/")], workAuto: false });
    result = await ctx.applyProactiveFaviconResults([
      { id: "moved", url: "https://same.example/", image: movedImage, sourceUrl: "https://same.example/favicon.ico" }
    ]);
    assert.equal(result.appliedIds.size, 0, "the destination Space's auto-icon preference is authoritative");
  });

  test(`${browser}: 1.24.14i idempotent favicon rediscovery is unchanged success with no state write`, async () => {
    const src = readBackgroundSource(browser);
    const image = "data:image/png;base64,U0FNRQ==";
    const existing = shortcut("same", "https://same.example/", {
      image, imageSyncKind: "device", imageSourceKind: "favicon", imageSourceUrl: "https://same.example/favicon.ico",
      imageAssetId: "", imageIsFallback: false
    });
    let writes = 0;
    const currentState = stateWithSpaces({ work: [existing], workAuto: true });
    const ctx = runFunctions(src, [
      "automaticFaviconArtwork", "shortcutNeedsProactiveFavicon", "findShortcutInItems", "findShortcutById", "findShortcutLocationById", "applyProactiveFaviconResults"
    ], {
      PERSONAL_SPACE_ID: "personal",
      WORK_SPACE_ID: "work",
      ensureLocalStorage: async () => ({ state: currentState }),
      createWriteBaseline: state => structuredClone(state),
      writeLocalState: async () => { writes++; }
    });

    const result = await ctx.applyProactiveFaviconResults([
      { id: "same", url: "https://same.example/", image, sourceUrl: "https://same.example/favicon.ico", allowFaviconUpgrade: true }
    ]);
    assert.equal(result.appliedIds.size, 0);
    assert.equal(result.unchangedIds.has("same"), true);
    assert.equal(writes, 0, "identical pixels/source metadata must not cause a storage write");
  });

  test(`${browser}: 1.24.14i seed/prune retain a moved job in another enabled Space without leaking disabled-Space work`, async () => {
    const src = readBackgroundSource(browser);
    let currentState = stateWithSpaces({
      activeSpaceId: "personal", personal: [], personalAuto: false,
      work: [shortcut("moved", "https://moved.example/")], workAuto: true
    });
    const originalQueue = { version: 2, items: [{ id: "moved", url: "https://moved.example/", attempts: 1, nextAttemptAt: 99, qualityUpgrade: false }] };
    let written = null;
    const ctx = runFunctions(src, [
      "automaticFaviconArtwork", "flattenShortcuts", "shortcutNeedsProactiveFavicon", "findShortcutInItems", "findShortcutById", "findShortcutLocationById",
      "iconRecoveryItemStillRelevantInState", "iconRecoveryItemStillRelevant", "seedIconRecoveryQueue", "pruneIconRecoveryQueueAgainstState"
    ], {
      PERSONAL_SPACE_ID: "personal",
      WORK_SPACE_ID: "work",
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ensureLocalStorage: async () => ({ state: currentState }),
      readIconRecoveryQueue: async () => structuredClone(originalQueue),
      readFaviconQualityAuditLedger: async () => ({ version: 1, entries: {} }),
      faviconQualityAuditNeeded: () => false,
      writeIconRecoveryQueue: async queue => { written = structuredClone(queue); return queue; },
      hasWebAccess: async () => false,
      platformHasPermissionFreeFaviconSource: () => browser === "chrome",
      scheduleIconRecoveryAlarm: async () => {}
    });

    const seeded = await ctx.seedIconRecoveryQueue();
    assert.equal(seeded.items.length, 1, "disabling Personal must not wipe Work's valid pending job");
    assert.equal(seeded.items[0].id, "moved");

    let pruned = await ctx.pruneIconRecoveryQueueAgainstState(structuredClone(originalQueue), currentState);
    assert.equal(pruned.items.length, 1, "a moved shortcut remains recoverable in Work");

    currentState = stateWithSpaces({ activeSpaceId: "personal", personalAuto: false, work: [shortcut("moved", "https://moved.example/")], workAuto: false });
    pruned = await ctx.pruneIconRecoveryQueueAgainstState(structuredClone(originalQueue), currentState);
    assert.equal(pruned.items.length, 0, "Work's own disabled setting removes its recovery work");
    assert.equal(written.items.length, 0);
  });

  test(`${browser}: 1.24.14i batch engine re-reads the queue after networking and preserves newer queued work`, async () => {
    const src = readBackgroundSource(browser);
    const oldQueue = { version: 2, items: [{ id: "old", url: "https://old.example/", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }] };
    const newerQueue = { version: 2, items: [{ id: "new", url: "https://new.example/", attempts: 0, nextAttemptAt: 9999999999999, qualityUpgrade: false }] };
    let reads = 0;
    let finalQueue = null;
    let status = null;
    let metaWrites = 0;
    const ctx = { console, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5,
      ICON_RECOVERY_ALARM: "icon",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readIconRecoveryQueue: async () => structuredClone(++reads === 1 ? oldQueue : newerQueue),
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async queue => queue,
      scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true,
      resolveFaviconForUrl: async () => ({ image: "data:image/png;base64,T0xE", sourceUrl: "https://old.example/favicon.ico", provisional: false }),
      enqueue: async task => task(),
      applyProactiveFaviconResults: async () => ({ appliedIds: new Set(["old"]), unchangedIds: new Set() }),
      nextIconRecoveryQualityRetry: item => ({ item }),
      nextIconRecoveryFailure: item => ({ item, exhausted: false }),
      iconRecoveryItemStillRelevantInState: (_state, item) => item.id === "new",
      writeIconRecoveryQueue: async queue => { finalQueue = structuredClone(queue); return queue; },
      writeIconRecoveryStatus: async value => { status = structuredClone(value); },
      scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    installQueueMutationStub(ctx);
  vm.runInContext(`let iconRecoveryRun = null;\n${extract(src, "processIconRecoveryQueue")}`, ctx);

    const summary = await ctx.processIconRecoveryQueue();
    assert.equal(reads >= 2, true, "the durable queue must be re-read after the network batch");
    assert.deepEqual(finalQueue.items.map(item => item.id), ["new"], "newer queued work must survive completion of an older fetch");
    assert.equal(summary.failed, 0);
    assert.equal(status.pending, 1);
  });

  test(`${browser}: 1.24.14i batch engine counts identical recovered artwork as unchanged, not failed`, async () => {
    const src = readBackgroundSource(browser);
    const queue = { version: 2, items: [{ id: "same", url: "https://same.example/", attempts: 0, nextAttemptAt: 0, qualityUpgrade: true }] };
    let finalQueue = null;
    const ctx = { console, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5,
      ICON_RECOVERY_ALARM: "icon",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readIconRecoveryQueue: async () => structuredClone(queue),
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async value => value,
      scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true,
      resolveFaviconForUrl: async () => ({ image: "data:image/png;base64,U0FNRQ==", sourceUrl: "https://same.example/favicon.ico", provisional: false }),
      enqueue: async task => task(),
      applyProactiveFaviconResults: async () => ({ appliedIds: new Set(), unchangedIds: new Set(["same"]) }),
      nextIconRecoveryQualityRetry: item => ({ item }),
      nextIconRecoveryFailure: item => ({ item, exhausted: false }),
      iconRecoveryItemStillRelevantInState: () => true,
      writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
      writeIconRecoveryStatus: async () => {},
      scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    installQueueMutationStub(ctx);
  vm.runInContext(`let iconRecoveryRun = null;\n${extract(src, "processIconRecoveryQueue")}`, ctx);

    const summary = await ctx.processIconRecoveryQueue();
    assert.equal(summary.attempted, 1);
    assert.equal(summary.hydrated, 0);
    assert.equal(summary.unchanged, 1);
    assert.equal(summary.failed, 0);
    assert.equal(finalQueue.items.length, 0, "a completed idempotent recovery leaves no retry behind");
  });
}

test("chrome: 1.24.14i Space-aware seeding preserves browser-native favicon quality-upgrade semantics", async () => {
  const src = readBackgroundSource("chrome");
  const native = shortcut("native", "https://native.example/", {
    image: "data:image/png;base64,TkFUSVZF", imageSyncKind: "device", imageSourceKind: "firefox"
  });
  const currentState = stateWithSpaces({ activeSpaceId: "personal", personal: [native], personalAuto: true });
  const ctx = runFunctions(src, [
    "automaticFaviconArtwork", "flattenShortcuts", "shortcutNeedsProactiveFavicon", "findShortcutInItems", "findShortcutById", "findShortcutLocationById",
    "iconRecoveryItemStillRelevantInState", "iconRecoveryItemStillRelevant", "seedIconRecoveryQueue"
  ], {
    PERSONAL_SPACE_ID: "personal",
    WORK_SPACE_ID: "work",
    ICON_RECOVERY_QUEUE_VERSION: 2,
    ensureLocalStorage: async () => ({ state: currentState }),
    readIconRecoveryQueue: async () => ({ version: 2, items: [] }),
    readFaviconQualityAuditLedger: async () => ({ version: 1, entries: {} }),
    faviconQualityAuditNeeded: () => true,
    writeIconRecoveryQueue: async queue => queue,
    hasWebAccess: async () => false,
    platformHasPermissionFreeFaviconSource: () => true,
    scheduleIconRecoveryAlarm: async () => {}
  });

  const queue = await ctx.seedIconRecoveryQueue({ upgradeRecoveredFavicons: true });
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].qualityUpgrade, true, "Chrome-native cached artwork must still receive the one-time quality pass");
});

test("chrome: 1.24.14i protected Chrome pages remain terminal recovery misses", async () => {
  const src = readBackgroundSource("chrome");
  const queue = { version: 2, items: [{ id: "store", url: "https://chromewebstore.google.com/detail/x", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }] };
  let finalQueue = null;
  const ctx = { console, normalizeFaviconPreference };
  vm.createContext(ctx);
  Object.assign(ctx, {
    ICON_RECOVERY_CONCURRENCY: 3,
    ICON_RECOVERY_QUEUE_VERSION: 2,
    ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
    ICON_RECOVERY_MAX_ATTEMPTS: 5,
    ICON_RECOVERY_ALARM: "icon",
    browser: { alarms: { clear: async () => {} } },
    devMark: () => {}, devMeasure: () => {},
    readIconRecoveryQueue: async () => structuredClone(queue),
    ensureLocalStorage: async () => ({ state: {} }),
    pruneIconRecoveryQueueAgainstState: async value => value,
    scheduleIconRecoveryAlarm: async () => {},
    hasWebAccess: async () => true,
    resolveFaviconForUrl: async () => ({ image: "", reason: "protected", provisional: false }),
    enqueue: async task => task(),
    applyProactiveFaviconResults: async () => ({ appliedIds: new Set(), unchangedIds: new Set() }),
    nextIconRecoveryQualityRetry: item => ({ item }),
    nextIconRecoveryFailure: item => ({ item: { ...item, attempts: item.attempts + 1 }, exhausted: false }),
    iconRecoveryItemStillRelevantInState: () => true,
    writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
    writeIconRecoveryStatus: async () => {},
    scheduleImmediateIconRecoveryContinuation: () => {}
  });
  installQueueMutationStub(ctx);
  vm.runInContext(`let iconRecoveryRun = null;\n${extract(src, "processIconRecoveryQueue")}`, ctx);

  const summary = await ctx.processIconRecoveryQueue();
  assert.equal(summary.failed, 1);
  assert.equal(finalQueue.items.length, 0, "protected pages must not be put into an infinite retry loop");
});

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: 1.24.14j proactive commit failures retain durable work for backoff retry`, async () => {
    const src = readBackgroundSource(browser);
    const queue = { version: 2, items: [{ id: "retry", url: "https://retry.example/", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }] };
    let finalQueue = null;
    let status = null;
    let metaWrites = 0;
    const ctx = { console: { ...console, error: () => {} }, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5,
      ICON_RECOVERY_RETRY_DELAYS_MS: [1000, 5000, 15000, 60000],
      ICON_RECOVERY_EXHAUSTED_RETRY_MS: 3600000,
      ICON_RECOVERY_ALARM: "icon",
      PRODUCT_NAME: "MosaicSync",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readLocalMeta: async () => ({ syncEnabled: true }),
      writeLocalMeta: async () => { metaWrites += 1; },
      readIconRecoveryQueue: async () => structuredClone(queue),
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async value => value,
      scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true,
      resolveFaviconForUrl: async () => ({ image: "data:image/png;base64,UkVUUlk=", sourceUrl: "https://retry.example/favicon.ico", provisional: false }),
      applyProactiveFaviconResults: async () => { const error = new Error("simulated atomic local commit failure"); error.name = "QuotaExceededError"; throw error; },
      iconRecoveryItemStillRelevantInState: () => true,
      writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
      writeIconRecoveryStatus: async value => { status = structuredClone(value); },
      scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    vm.runInContext(
      `let queue = Promise.resolve();\nlet iconRecoveryRun = null;\n${extract(src, "enqueue")}\n${extract(src, "nextIconRecoveryFailure")}\n${extract(src, "nextIconRecoveryQualityRetry")}\n${extract(src, "processIconRecoveryQueue")}`,
      ctx
    );

    const summary = await ctx.processIconRecoveryQueue();
    assert.equal(summary.failed, 1, "commit failure is surfaced as a recoverable failed attempt");
    assert.equal(summary.hydrated, 0);
    assert.equal(finalQueue.items.length, 1, "the queue item must survive a transient commit failure");
    assert.equal(finalQueue.items[0].id, "retry");
    assert.equal(finalQueue.items[0].attempts, 1, "normal backoff accounting must advance");
    assert.ok(finalQueue.items[0].nextAttemptAt > Date.now(), "retry must be delayed by the normal backoff policy");
    assert.equal(status.pending, 1);
    assert.equal(metaWrites, 0, "favicon commit failures must not be persisted as Sync errors");
  });
}
