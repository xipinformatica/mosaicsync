import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const JOURNAL_PATH = path.join(ROOT, "src/shared/background/sync-pending-journal.js");
const STORAGE_PATH = path.join(ROOT, "src/shared/core/storage.js");
const BACKGROUND_PATH = path.join(ROOT, "src/shared/background/background-core.js");
const CONSTANTS_PATH = path.join(ROOT, "src/shared/core/constants.js");
const MODEL_PATH = path.join(ROOT, "src/shared/core/model.js");

const LOCAL_PENDING_KEY = "mosaicsync.pending-sync-mutation.v1";
const CROSS_PREFIX = "mosaicsync.pending-cross-space-sync.v1.";
const LOCK_NAME = "mosaicsync.local-assets.write.v1";

async function freshImport(file, label = "test") {
  return import(`${pathToFileURL(file).href}?${label}=${Date.now()}-${Math.random()}`);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeLockManager() {
  const tails = new Map();
  return {
    request(name, callback) {
      const prior = tails.get(name) || Promise.resolve();
      const release = deferred();
      const next = prior.catch(() => {}).then(() => release.promise);
      tails.set(name, next);
      return prior.catch(() => {}).then(async () => {
        try {
          return await callback({ name });
        } finally {
          release.resolve();
          if (tails.get(name) === next) tails.delete(name);
        }
      });
    }
  };
}

function makeArea(initial = {}) {
  const data = structuredClone(initial);
  const calls = { get: [], set: [], remove: [] };
  let getHook = null;
  let removeFault = null;
  return {
    data,
    calls,
    setGetHook(hook) { getHook = hook; },
    setRemoveFault(predicate) { removeFault = predicate; },
    async get(keys) {
      calls.get.push(structuredClone(keys));
      const snapshot = (() => {
        if (keys === null) return structuredClone(data);
        if (typeof keys === "string") return Object.hasOwn(data, keys) ? { [keys]: structuredClone(data[keys]) } : {};
        const out = {};
        for (const key of Array.isArray(keys) ? keys : Object.keys(keys || {})) {
          if (Object.hasOwn(data, key)) out[key] = structuredClone(data[key]);
        }
        return out;
      })();
      if (getHook) await getHook(keys, snapshot);
      return snapshot;
    },
    async set(values) {
      calls.set.push(structuredClone(values));
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      calls.remove.push(structuredClone(keys));
      if (removeFault?.(keys)) throw new Error("selective remove failure");
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    }
  };
}

async function withEnvironment({ local, session = makeArea(), locks = makeLockManager() }, callback) {
  const browserDescriptor = Object.getOwnPropertyDescriptor(globalThis, "browser");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "browser", {
    value: { storage: { local, session } }, configurable: true, writable: true
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { locks }, configurable: true, writable: true
  });
  try {
    return await callback({ locks });
  } finally {
    if (browserDescriptor) Object.defineProperty(globalThis, "browser", browserDescriptor);
    else delete globalThis.browser;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  }
}

function localJournal(id) {
  return {
    schemaVersion: 1,
    journalId: id,
    before: { spaces: {} },
    after: { spaces: {} },
    createdAt: 1,
    updatedAt: 2
  };
}

function crossJournal(id) {
  return {
    schemaVersion: 1,
    kind: "transaction",
    transactionId: id,
    createdAt: 1,
    phase: "destination",
    fromSpaceId: "personal",
    toSpaceId: "work",
    destination: { writes: { a: { id: "a" } } },
    source: { writes: { a: { id: "a", deleted: true } } }
  };
}

async function oneTurn() {
  await new Promise(resolve => setImmediate(resolve));
}

test("1.32.0.4 conditional local-journal acknowledgement cannot delete a newer writer that queues after the read", async () => {
  const mod = await freshImport(JOURNAL_PATH, "conditional-race");
  const local = makeArea({ [LOCAL_PENDING_KEY]: localJournal("old") });
  const captured = deferred();
  const releaseRead = deferred();
  let intercepted = false;
  local.setGetHook(async (keys) => {
    if (keys !== LOCAL_PENDING_KEY || intercepted) return;
    intercepted = true;
    captured.resolve();
    await releaseRead.promise;
  });

  await withEnvironment({ local }, async ({ locks }) => {
    const clearPromise = mod.clearPendingLocalSyncMutation("old");
    await captured.promise;
    const writerPromise = locks.request(LOCK_NAME, () => local.set({
      [LOCAL_PENDING_KEY]: localJournal("newer")
    }));
    // On vulnerable code the writer is not blocked by the clear and completes
    // before the stale read is allowed to resume. Correct code holds the same
    // persistence lock, so the writer remains queued until acknowledgement ends.
    await oneTurn();
    releaseRead.resolve();
    assert.equal(await clearPromise, true);
    await writerPromise;
    assert.equal(local.data[LOCAL_PENDING_KEY]?.journalId, "newer",
      "an older successful retry must never remove newer durable Sync authority");
  });
});

test("1.32.0.4 authority cleanup removes both journal classes in one fail-closed storage operation", async () => {
  const mod = await freshImport(JOURNAL_PATH, "atomic-clear");
  const crossKey = `${CROSS_PREFIX}old`;
  const local = makeArea({
    [crossKey]: crossJournal("old"),
    [LOCAL_PENDING_KEY]: localJournal("local")
  });
  // Fail any removal operation that includes the local-mutation authority. On
  // vulnerable code the independent cross-Space remove succeeds first; corrected
  // code uses one combined remove, so the fault occurs before either key changes.
  local.setRemoveFault(keys => (Array.isArray(keys) ? keys : [keys]).includes(LOCAL_PENDING_KEY));

  await withEnvironment({ local }, async () => {
    await assert.rejects(
      mod.clearAllPendingSyncRecoveryState(new Set(["personal", "work"])),
      /selective remove failure/
    );
    assert.ok(local.data[crossKey], "failed authority cleanup must retain cross-Space durable work");
    assert.ok(local.data[LOCAL_PENDING_KEY], "failed authority cleanup must retain local-mutation durable work");
    assert.equal(local.calls.remove.length, 1,
      "combined authority cleanup must have one all-or-nothing storage.local.remove boundary");
  });
});

test("1.32.0.4 authority transitions commit metadata inside cleanup lock without a nested Web-Lock request", () => {
  const source = fs.readFileSync(BACKGROUND_PATH, "utf8");
  const journal = fs.readFileSync(JOURNAL_PATH, "utf8");
  const storage = fs.readFileSync(STORAGE_PATH, "utf8");

  for (const [label, startNeedle, endNeedle] of [
    ["remote reset", "async function observeRemoteResetIntent", "async function beginOrContinueCatastrophicSyncRecovery"],
    ["explicit disable", "async function setSyncEnabled", "function hasSnapshotData"],
    ["permission revocation", "browser.permissions?.onRemoved?.addListener", "const REMOTE_IMAGE_MAX_BYTES"]
  ]) {
    const start = source.indexOf(startNeedle);
    const end = source.indexOf(endNeedle, start);
    const block = source.slice(start, end);
    assert.match(block, /clearAllPendingSyncRecoveryState\(SPACE_IDS_FOR_SYNC,\s*async\s*\(\)\s*=>\s*\{/s,
      `${label} must keep cleanup and authority commit under one serialized transition`);
    assert.match(block, /writeLocalMeta\([\s\S]*?persistenceLockHeld:\s*true\s*\}/,
      `${label} must use the already-held-lock metadata path instead of requesting the same Web Lock again`);
  }

  assert.match(journal, /clearAllPendingSyncRecoveryState\(spaceIdsForSync, afterClear = null\)/);
  assert.match(storage, /persistenceLockHeld = false/);
  assert.match(storage, /if \(persistenceLockHeld\) return commit\(\);/);
});

test("1.32.0.4 stale New Tab local mutation request rechecks durable Sync authority inside the persistence lock", async () => {
  const constants = await freshImport(CONSTANTS_PATH, "local-constants");
  const model = await freshImport(MODEL_PATH, "local-model");
  const local = makeArea();
  const session = makeArea();
  const locks = makeLockManager();

  await withEnvironment({ local, session, locks }, async () => {
    const storage = await freshImport(STORAGE_PATH, "stale-local-writer");
    const base = model.normalizeState({
      shortcuts: [{ type: "shortcut", id: "a", title: "A", url: "https://a.example/", position: 0, createdAt: 1, modifiedAt: 1 }],
      settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 1, updatedAt: 1
    });
    await local.set({ [constants.LOCAL_META_KEY]: {
      ...constants.DEFAULT_META,
      syncEnabled: true,
      syncInitialized: true
    }});
    await storage.writeLocalState(base);

    const edited = structuredClone(base);
    edited.shortcuts[0].title = "A2";
    edited.shortcuts[0].modifiedAt = 2;
    edited.updatedAt = 2;
    edited.spaces.personal.shortcuts = edited.shortcuts;
    edited.spaces.personal.updatedAt = 2;

    const lockEntered = deferred();
    const releaseLock = deferred();
    const held = locks.request(constants.LOCAL_ASSET_WRITE_LOCK_NAME, async () => {
      lockEntered.resolve();
      await releaseLock.promise;
    });
    await lockEntered.promise;
    const staleWriter = storage.writeLocalState(edited, {
      baseState: storage.createWriteBaseline(base),
      recordSyncMutation: true
    });
    await oneTurn();
    local.data[constants.LOCAL_META_KEY] = {
      ...local.data[constants.LOCAL_META_KEY],
      syncEnabled: false,
      syncInitialized: false
    };
    releaseLock.resolve();
    await held;
    await staleWriter;

    assert.equal(local.data[constants.LOCAL_STATE_KEY].spaces.personal.shortcuts[0].title, "A2",
      "the user's local edit must still persist after Sync is disabled");
    assert.equal(local.data[constants.LOCAL_PENDING_SYNC_MUTATION_KEY], undefined,
      "a stale caller must not create fresh durable outbound authority after Sync became inactive");
  });
});

test("1.32.0.4 stale New Tab cross-Space intent request rechecks durable Sync authority inside the persistence lock", async () => {
  const constants = await freshImport(CONSTANTS_PATH, "cross-constants");
  const model = await freshImport(MODEL_PATH, "cross-model");
  const local = makeArea();
  const session = makeArea();
  const locks = makeLockManager();

  await withEnvironment({ local, session, locks }, async () => {
    const storage = await freshImport(STORAGE_PATH, "stale-cross-writer");
    const base = model.normalizeState({
      shortcuts: [{ type: "shortcut", id: "a", title: "A", url: "https://a.example/", position: 0, createdAt: 1, modifiedAt: 1 }],
      settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 1, updatedAt: 1
    });
    await local.set({ [constants.LOCAL_META_KEY]: {
      ...constants.DEFAULT_META,
      deviceId: "dev",
      syncEnabled: true,
      syncInitialized: true
    }});
    await storage.writeLocalState(base);
    const moved = model.moveShortcutBetweenSpaces(base, {
      shortcutId: "a", fromSpaceId: "personal", toSpaceId: "work"
    });
    const intent = model.createCrossSpaceSyncIntent(base, moved, {
      fromSpaceId: "personal", toSpaceId: "work", shortcutIds: ["a"], deviceId: "dev"
    });
    assert.ok(intent?.intentId);

    const lockEntered = deferred();
    const releaseLock = deferred();
    const held = locks.request(constants.LOCAL_ASSET_WRITE_LOCK_NAME, async () => {
      lockEntered.resolve();
      await releaseLock.promise;
    });
    await lockEntered.promise;
    const staleWriter = storage.writeLocalState(moved, {
      baseState: storage.createWriteBaseline(base),
      crossSpaceSyncIntent: intent,
      recordSyncMutation: false
    });
    await oneTurn();
    local.data[constants.LOCAL_META_KEY] = {
      ...local.data[constants.LOCAL_META_KEY],
      syncEnabled: false,
      syncInitialized: false
    };
    releaseLock.resolve();
    await held;
    await staleWriter;

    const pendingCrossKeys = Object.keys(local.data).filter(key => key.startsWith(constants.LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX));
    assert.equal(pendingCrossKeys.length, 0,
      "a stale cross-Space writer must not recreate pending Sync authority after Sync became inactive");
    assert.equal(local.data[constants.LOCAL_STATE_KEY].spaces.work.shortcuts.some(item => item.id === "a"), true,
      "the local cross-Space move itself must still persist");
  });
});

test("1.32.0.4 failed authority metadata commit restores the exact durable journals before releasing the lock", async () => {
  const mod = await freshImport(JOURNAL_PATH, "transition-rollback");
  const crossKey = `${CROSS_PREFIX}rollback`;
  const originalCross = crossJournal("rollback");
  const originalLocal = localJournal("rollback-local");
  const local = makeArea({ [crossKey]: originalCross, [LOCAL_PENDING_KEY]: originalLocal, keep: 1 });
  const failure = new Error("simulated authority metadata failure");

  await withEnvironment({ local }, async () => {
    await assert.rejects(
      mod.clearAllPendingSyncRecoveryState(new Set(["personal", "work"]), async () => { throw failure; }),
      error => error === failure
    );
  });

  assert.deepEqual(local.data[crossKey], originalCross);
  assert.deepEqual(local.data[LOCAL_PENDING_KEY], originalLocal);
  assert.equal(local.data.keep, 1);
  assert.equal(local.calls.remove.length, 1);
  assert.equal(local.calls.set.length, 1, "journal restoration must be compensating failure-path I/O only");
});

// Source-shape guard: the correction must reuse the existing persistence lock and
// must not add a second browser.storage.local read just to revalidate Sync meta.
test("1.32.0.4 correction reuses the established persistence lock and same-read durable meta check", () => {
  const journal = fs.readFileSync(JOURNAL_PATH, "utf8");
  const storage = fs.readFileSync(STORAGE_PATH, "utf8");
  assert.match(journal, /LOCAL_ASSET_WRITE_LOCK_NAME/);
  assert.match(journal, /navigator\?\.locks|navigator\.locks/);
  assert.match(storage, /LOCAL_META_KEY/);
  assert.match(storage, /syncDurabilityActive/);
  const persistStart = storage.indexOf("async function persistNormalizedState");
  const persistEnd = storage.indexOf("async function writeLocalStateResult", persistStart);
  const persistBlock = storage.slice(persistStart, persistEnd);
  assert.match(persistBlock, /transactionKeys\.push\(LOCAL_META_KEY\)/);
  assert.match(persistBlock, /browser\.storage\.local\.get\(transactionKeys\)/);
  assert.doesNotMatch(persistBlock, /browser\.storage\.local\.get\(LOCAL_META_KEY\)/,
    "durable authority revalidation must piggyback on the existing transaction read, not add hot-path I\/O");
});
