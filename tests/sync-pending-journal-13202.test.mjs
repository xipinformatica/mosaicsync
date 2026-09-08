import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODULE_REL = "src/shared/background/sync-pending-journal.js";
const MODULE_PATH = path.join(ROOT, MODULE_REL);
const CORE_PATH = path.join(ROOT, "src/shared/background/background-core.js");
const STORAGE_PATH = path.join(ROOT, "src/shared/core/storage.js");
const HARNESS_PATH = path.join(ROOT, "tests/harness/background-source.mjs");

async function loadJournalModule() {
  assert.equal(fs.existsSync(MODULE_PATH), true,
    "1.32.0.2 must own durable pending Sync journal mechanics in a dedicated module");
  return import(`${pathToFileURL(MODULE_PATH).href}?test=${Date.now()}-${Math.random()}`);
}

function makeLocal(initial = {}) {
  const data = structuredClone(initial);
  const calls = { get: [], set: [], remove: [] };
  const faults = { get: null, set: null, remove: null };
  return {
    data,
    calls,
    faults,
    async get(keys) {
      calls.get.push(keys);
      if (faults.get) throw faults.get;
      if (keys === null) return structuredClone(data);
      if (typeof keys === "string") return Object.prototype.hasOwnProperty.call(data, keys) ? { [keys]: structuredClone(data[keys]) } : {};
      if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = structuredClone(data[key]);
        return out;
      }
      return {};
    },
    async set(values) {
      calls.set.push(structuredClone(values));
      if (faults.set) throw faults.set;
      Object.assign(data, structuredClone(values));
    },
    async remove(keys) {
      calls.remove.push(structuredClone(keys));
      if (faults.remove) throw faults.remove;
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    }
  };
}

async function withBrowser(local, callback) {
  const previous = globalThis.browser;
  globalThis.browser = { storage: { local } };
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
}

function cross(prefix, id, overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "transaction",
    transactionId: id,
    createdAt: 100,
    phase: "destination",
    fromSpaceId: "personal",
    toSpaceId: "work",
    destination: { writes: { a: { id: "a" } } },
    source: { writes: { a: { id: "a", deleted: true } } },
    ...overrides,
    key: `${prefix}${id}`
  };
}

function localJournal(overrides = {}) {
  return {
    schemaVersion: 1,
    journalId: "local-journal",
    before: { spaces: {} },
    after: { spaces: {} },
    createdAt: 10,
    updatedAt: 20,
    ...overrides
  };
}

test("1.32.0.2 pending-journal owner has one narrow browser-local-storage responsibility", async () => {
  const mod = await loadJournalModule();
  const source = fs.readFileSync(MODULE_PATH, "utf8");
  assert.deepEqual(Object.keys(mod).sort(), [
    "CROSS_SPACE_SYNC_TRANSACTION_VERSION",
    "clearAllPendingSyncRecoveryState",
    "clearPendingCrossSpaceSync",
    "clearPendingLocalSyncMutation",
    "pendingCrossSpaceSyncKey",
    "readPendingCrossSpaceSyncEntries",
    "readPendingLocalSyncMutation",
    "writePendingCrossSpaceSync"
  ]);
  assert.doesNotMatch(source, /browser\.storage\.sync|\bfetch\s*\(|XMLHttpRequest|setTimeout|setInterval|queueMicrotask|from ["'][^"']*recovery-|\bcreateRecovery\w*\s*\(|\bpublish\w*\s*\(|\breconcile\w*\s*\(/i,
    "journal storage ownership must not absorb Sync publication, Recovery, scheduling or network work");
  assert.doesNotMatch(source, /from "\.\.\/core\/storage\.js"/,
    "the journal module must not own authoritative local-state persistence");
});

test("1.32.0.2 cross-Space journal enumeration preserves validation and stable createdAt/key ordering", async () => {
  const mod = await loadJournalModule();
  const prefix = "mosaicsync.pending-cross-space-sync.v1.";
  const a = cross(prefix, "a", { createdAt: 200 });
  const b = cross(prefix, "b", { createdAt: 100 });
  const c = cross(prefix, "c", { createdAt: 100, kind: "intent", destination: { spaceId: "work" }, source: { spaceId: "personal" } });
  const local = makeLocal({
    [a.key]: a,
    [b.key]: b,
    [c.key]: c,
    [`${prefix}bad-schema`]: { ...a, schemaVersion: 9 },
    [`${prefix}bad-space`]: { ...a, fromSpaceId: "other" },
    [`${prefix}same-space`]: { ...a, fromSpaceId: "personal", toSpaceId: "personal" },
    [`${prefix}bad-transaction`]: { ...a, destination: {} },
    unrelated: { schemaVersion: 1 }
  });
  const entries = await withBrowser(local, () => mod.readPendingCrossSpaceSyncEntries(new Set(["personal", "work"])));
  assert.deepEqual(entries.map(entry => entry.key), [c.key, b.key, a.key].sort((x, y) => {
    const tx = local.data[x], ty = local.data[y];
    return tx.createdAt - ty.createdAt || (x < y ? -1 : x > y ? 1 : 0);
  }));
  assert.equal(local.calls.get.length, 1);
  assert.equal(local.calls.get[0], null, "enumeration must retain the single storage.local.get(null) read");
});

test("1.32.0.2 cross-Space journal read remains fail-closed on storage.local failure", async () => {
  const mod = await loadJournalModule();
  const local = makeLocal();
  const failure = new Error("local read unavailable");
  local.faults.get = failure;
  await withBrowser(local, () => assert.rejects(
    mod.readPendingCrossSpaceSyncEntries(new Set(["personal", "work"])),
    error => error === failure
  ));
});

test("1.32.0.2 cross-Space write/clear/key mechanics preserve exact durable key behavior", async () => {
  const mod = await loadJournalModule();
  const prefix = "mosaicsync.pending-cross-space-sync.v1.";
  const local = makeLocal();
  const transaction = { transactionId: "tx-1", intentId: "intent-1", phase: "destination" };
  assert.equal(mod.pendingCrossSpaceSyncKey(transaction), `${prefix}intent-1`);
  assert.equal(mod.pendingCrossSpaceSyncKey({ transactionId: "tx-2" }), `${prefix}tx-2`);
  assert.equal(mod.pendingCrossSpaceSyncKey({}), "");

  await withBrowser(local, async () => {
    await assert.rejects(mod.writePendingCrossSpaceSync("wrong-key", transaction), /Invalid pending cross-Space Sync transaction key/);
    assert.equal(local.calls.set.length, 0);
    await mod.writePendingCrossSpaceSync(`${prefix}intent-1`, transaction);
    assert.deepEqual(local.data[`${prefix}intent-1`], transaction);
    await mod.clearPendingCrossSpaceSync("wrong-key");
    assert.equal(local.calls.remove.length, 0);
    await mod.clearPendingCrossSpaceSync(`${prefix}intent-1`);
    assert.equal(local.data[`${prefix}intent-1`], undefined);
  });
});

test("1.32.0.4 combined cleanup removes validated cross-Space and local-mutation authority in one call", async () => {
  const mod = await loadJournalModule();
  const prefix = "mosaicsync.pending-cross-space-sync.v1.";
  const a = cross(prefix, "a");
  const b = cross(prefix, "b", { kind: "intent", destination: { spaceId: "work" }, source: { spaceId: "personal" } });
  const invalidKey = `${prefix}invalid`;
  const localKey = "mosaicsync.pending-sync-mutation.v1";
  const local = makeLocal({ [a.key]: a, [b.key]: b, [invalidKey]: { schemaVersion: 9 }, [localKey]: localJournal(), keep: 1 });
  await withBrowser(local, () => mod.clearAllPendingSyncRecoveryState(new Set(["personal", "work"])));
  assert.equal(local.data[a.key], undefined);
  assert.equal(local.data[b.key], undefined);
  assert.equal(local.data[localKey], undefined);
  assert.deepEqual(local.data[invalidKey], { schemaVersion: 9 });
  assert.equal(local.data.keep, 1);
  assert.equal(local.calls.remove.length, 1);
  assert.deepEqual(new Set(local.calls.remove[0]), new Set([a.key, b.key, localKey]));
});

test("1.32.0.2 local mutation journal read preserves validation and fail-closed distinction", async () => {
  const mod = await loadJournalModule();
  const key = "mosaicsync.pending-sync-mutation.v1";
  const valid = localJournal();
  const local = makeLocal({ [key]: valid });
  await withBrowser(local, async () => {
    assert.deepEqual(await mod.readPendingLocalSyncMutation(), valid);
    local.data[key] = { ...valid, journalId: "" };
    assert.equal(await mod.readPendingLocalSyncMutation(), null);
    local.data[key] = { ...valid, before: null };
    assert.equal(await mod.readPendingLocalSyncMutation(), null);
    delete local.data[key];
    assert.equal(await mod.readPendingLocalSyncMutation(), null);
    const failure = new Error("cannot read local journal");
    local.faults.get = failure;
    await assert.rejects(mod.readPendingLocalSyncMutation(), error => error === failure);
  });
});

test("1.32.0.2 local mutation clear preserves journal-id race protection and propagates cleanup failures", async () => {
  const mod = await loadJournalModule();
  const key = "mosaicsync.pending-sync-mutation.v1";
  const local = makeLocal({ [key]: localJournal({ journalId: "newer" }) });
  await withBrowser(local, async () => {
    assert.equal(await mod.clearPendingLocalSyncMutation("older"), false);
    assert.equal(local.calls.remove.length, 0, "an older retry must not clear newer pending work");
    assert.equal(await mod.clearPendingLocalSyncMutation("newer"), true);
    assert.equal(local.data[key], undefined);

    local.data[key] = localJournal({ journalId: "must-remain" });
    const failure = new Error("remove failed");
    local.faults.remove = failure;
    await assert.rejects(mod.clearPendingLocalSyncMutation(), error => error === failure);
    assert.equal(local.data[key].journalId, "must-remain");
  });
});

test("1.32.0.2 combined durable-journal cleanup keeps fail-closed authority semantics", async () => {
  const mod = await loadJournalModule();
  const prefix = "mosaicsync.pending-cross-space-sync.v1.";
  const entry = cross(prefix, "x");
  const key = "mosaicsync.pending-sync-mutation.v1";
  const local = makeLocal({ [entry.key]: entry, [key]: localJournal() });
  await withBrowser(local, async () => {
    await mod.clearAllPendingSyncRecoveryState(new Set(["personal", "work"]));
    assert.equal(local.data[entry.key], undefined);
    assert.equal(local.data[key], undefined);
  });

  const failing = makeLocal({ [entry.key]: entry, [key]: localJournal() });
  failing.faults.get = new Error("journal authority unknown");
  await withBrowser(failing, () => assert.rejects(
    mod.clearAllPendingSyncRecoveryState(new Set(["personal", "work"])),
    /journal authority unknown/
  ));
});

test("1.32.0.2 production ownership moves only journal mechanics and preserves atomic journal creation in core/storage.js", async () => {
  await loadJournalModule();
  const core = fs.readFileSync(CORE_PATH, "utf8");
  const storage = fs.readFileSync(STORAGE_PATH, "utf8");
  const harness = fs.readFileSync(HARNESS_PATH, "utf8");
  assert.match(core, /from "\.\/sync-pending-journal\.js";/);
  for (const name of [
    "readPendingCrossSpaceSyncEntries", "writePendingCrossSpaceSync", "clearPendingCrossSpaceSync",
    "readPendingLocalSyncMutation", "clearPendingLocalSyncMutation",
    "clearAllPendingSyncRecoveryState", "pendingCrossSpaceSyncKey"
  ]) {
    assert.doesNotMatch(core, new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`), `${name} must have one production owner`);
  }
  assert.match(core, /async function retryPendingCrossSpaceSync\(/,
    "background core must continue deciding when pending work is retried");
  assert.match(core, /async function executePendingCrossSpaceSync\(/,
    "background core must continue owning destination-first publication orchestration");
  assert.match(storage, /writes\[LOCAL_PENDING_SYNC_MUTATION_KEY\]\s*=\s*\{/,
    "authoritative local-state persistence must still create the cumulative mutation journal atomically");
  assert.match(storage, /writes\[`\$\{LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX\}\$\{intentId\}`\]\s*=\s*effectiveCrossSpaceSyncIntent/,
    "cross-Space intent must still be committed in the authoritative storage transaction");
  assert.match(harness, /sync-pending-journal\.js/,
    "historical source-shape harness must follow the new ownership boundary");

  for (const browser of ["firefox", "chrome"]) {
    const generated = path.join(ROOT, `dist/${browser}/background/sync-pending-journal.js`);
    assert.equal(fs.existsSync(generated), true, `${browser} build must contain the pending-journal owner`);
    assert.equal(fs.readFileSync(generated, "utf8"), fs.readFileSync(MODULE_PATH, "utf8"),
      `${browser} generated journal module must remain byte-identical to canonical shared source`);
  }
});
