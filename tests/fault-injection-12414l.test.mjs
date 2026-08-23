import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.failNextRemove = false; }
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
    for (const [key, value] of Object.entries(items || {})) this.data[key] = structuredClone(value);
  }
  async remove(keys) {
    if (this.failNextRemove) {
      this.failNextRemove = false;
      const error = new Error("injected remove failure");
      error.name = "AbortError";
      throw error;
    }
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

const local = new Area();
const session = new Area();
globalThis.browser = { storage: { local, session } };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { locks: { request: async (_name, callback) => callback() } }
});

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const storage = await import("../dist/firefox/core/storage.js");

function stateWithImage(image, modifiedAt = 100) {
  return model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{
          type: "shortcut", id: "tile", title: "Tile", url: "https://example.test/", image,
          imageSyncKind: "device", imageSourceKind: "upload", imageStyle: "contain", position: 0,
          createdAt: 100, modifiedAt, source: "manual"
        }],
        settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: modifiedAt, updatedAt: modifiedAt
      },
      work: { shortcuts: [], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 0, updatedAt: 0 }
    }
  });
}

test("1.24.14l failed local stale-asset deletion persists a retry ledger and startup reclaims it safely", async () => {
  local.data = {}; session.data = {}; local.failNextRemove = false;
  const oldImage = `data:image/png;base64,${Buffer.from("old-artwork".repeat(100)).toString("base64")}`;
  const newImage = `data:image/png;base64,${Buffer.from("new-artwork".repeat(100)).toString("base64")}`;
  const oldId = model.assetIdForDataUrl(oldImage);
  const newId = model.assetIdForDataUrl(newImage);

  const first = await storage.writeLocalState(stateWithImage(oldImage, 100));
  assert.equal(typeof local.data[`${constants.LOCAL_ASSET_PREFIX}${oldId}`], "string");

  const next = structuredClone(first);
  next.spaces.personal.shortcuts[0].image = newImage;
  next.spaces.personal.shortcuts[0].modifiedAt = 101;
  next.spaces.personal.updatedAt = 101;
  next.shortcuts = next.spaces.personal.shortcuts;
  next.updatedAt = 101;

  local.failNextRemove = true;
  await storage.writeLocalState(next, { baseState: storage.createWriteBaseline(first) });

  assert.equal(typeof local.data[`${constants.LOCAL_ASSET_PREFIX}${oldId}`], "string", "injected cleanup failure leaves old pixels in place");
  assert.equal(typeof local.data[`${constants.LOCAL_ASSET_PREFIX}${newId}`], "string", "new pixels and compact state still commit atomically");
  assert.deepEqual(local.data[constants.LOCAL_ASSET_INDEX_KEY].pendingGcIds, [oldId], "failed cleanup remains durable rather than being forgotten");

  const loaded = await storage.ensureLocalStorage({ hydrateAssets: "all" });
  assert.equal(loaded.state.shortcuts[0].image, newImage, "startup still hydrates the authoritative new artwork");
  assert.equal(local.data[`${constants.LOCAL_ASSET_PREFIX}${oldId}`], undefined, "startup retry reclaims the stale pixels");
  assert.equal(typeof local.data[`${constants.LOCAL_ASSET_PREFIX}${newId}`], "string");
  assert.equal(local.data[constants.LOCAL_ASSET_INDEX_KEY].pendingGcIds, undefined, "retry ledger clears only after successful cleanup");
});

test("1.24.14l pending local cleanup never deletes an asset that became referenced again", async () => {
  local.data = {}; session.data = {}; local.failNextRemove = false;
  const image = `data:image/png;base64,${Buffer.from("reused-artwork".repeat(100)).toString("base64")}`;
  const id = model.assetIdForDataUrl(image);
  const written = await storage.writeLocalState(stateWithImage(image, 200));
  const compact = structuredClone(local.data[constants.LOCAL_STATE_KEY]);

  // Simulate a crash-era retry ledger that still names an asset which a later
  // state has made live again. Startup must re-read current references first.
  local.data[constants.LOCAL_STATE_KEY] = compact;
  local.data[constants.LOCAL_ASSET_INDEX_KEY] = {
    schemaVersion: constants.LOCAL_ASSET_STORE_SCHEMA_VERSION,
    ids: [id], pendingGcIds: [id]
  };
  const loaded = await storage.ensureLocalStorage({ hydrateAssets: "all" });
  assert.equal(loaded.state.shortcuts[0].image, image);
  assert.equal(typeof local.data[`${constants.LOCAL_ASSET_PREFIX}${id}`], "string", "re-referenced pixels survive cleanup retry");
  assert.equal(local.data[constants.LOCAL_ASSET_INDEX_KEY].pendingGcIds, undefined);
  assert.deepEqual(local.data[constants.LOCAL_ASSET_INDEX_KEY].ids, [id]);
});

function extract(src, name) {
  let start = src.indexOf(`async function ${name}(`);
  if (start < 0) start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = src.indexOf("{\n", start);
  if (brace < 0) brace = src.indexOf("{", start);
  let depth = 0, quote = "", esc = false, line = false, block = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i++; } continue; }
    if (quote) { if (esc) { esc = false; continue; } if (c === "\\") { esc = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i++; continue; }
    if (c === "/" && n === "*") { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

for (const browserName of ["firefox", "chrome"]) {
  test(`${browserName}: 1.24.14l snapshot decompression is bounded while streaming`, async () => {
    const src = fs.readFileSync(`dist/${browserName}/background/background.js`, "utf8");
    const ctx = { console, Uint8Array };
    vm.createContext(ctx);
    vm.runInContext(extract(src, "readBoundedStreamBytes"), ctx);

    let reads = 0, cancelled = false;
    const oversized = {
      getReader() {
        const chunks = [new Uint8Array(300_000), new Uint8Array(300_000), new Uint8Array(1)];
        return {
          async read() { reads++; return chunks.length ? { done: false, value: chunks.shift() } : { done: true }; },
          async cancel() { cancelled = true; },
          releaseLock() {}
        };
      }
    };
    assert.equal(await ctx.readBoundedStreamBytes(oversized, 512 * 1024), null);
    assert.equal(cancelled, true, "oversized decompression should cancel immediately");
    assert.equal(reads, 2, "the reader must stop as soon as the cap is crossed");

    const bounded = {
      getReader() {
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
        return {
          async read() { return chunks.length ? { done: false, value: chunks.shift() } : { done: true }; },
          async cancel() {}, releaseLock() {}
        };
      }
    };
    const bytes = await ctx.readBoundedStreamBytes(bounded, 10);
    assert.deepEqual([...bytes], [1, 2, 3]);
  });

  test(`${browserName}: 1.24.14l device snapshot publication cleans only non-authoritative chunk generations`, async () => {
    const src = fs.readFileSync(`dist/${browserName}/background/background.js`, "utf8");
    const events = [];
    const prefix = "mosaicsync.sync.device.";
    const rootKey = `${prefix}dev`;
    const store = {
      [rootKey]: { kind: "device-snapshot-manifest", deviceId: "dev", slot: "a", parts: 2 },
      [`${rootKey}.chunk.a.0`]: { old: true },
      [`${rootKey}.chunk.a.1`]: { old: true },
      [`${rootKey}.chunk.b.5`]: { stale: true },
      [`${rootKey}.chunk.b.9`]: { stale: true }
    };
    const publication = {
      mode: "chunked", rootKey,
      rootValue: { kind: "device-snapshot-manifest", deviceId: "dev", slot: "b", parts: 2 },
      chunkWrites: {
        [`${rootKey}.chunk.b.0`]: { fresh: 0 },
        [`${rootKey}.chunk.b.1`]: { fresh: 1 }
      }
    };
    const context = {
      console, Map, SYNC_DEVICE_SNAPSHOT_PREFIX: prefix,
      browser: { storage: { sync: { async get(keys) {
        if (keys == null) return structuredClone(store);
        const out = {};
        for (const key of (Array.isArray(keys) ? keys : [keys])) if (Object.hasOwn(store, key)) out[key] = structuredClone(store[key]);
        return out;
      } } } },
      readOwnDeviceSnapshot: async () => ({ root: structuredClone(store[rootKey]), decoded: null }),
      retainTombstones: target => target,
      buildDeviceSnapshotPublication: async () => publication,
      writeSyncItems: async items => {
        events.push(["write", Object.keys(items)]);
        Object.assign(store, structuredClone(items));
      },
      removeSyncItems: async keys => {
        events.push(["remove", [...keys]]);
        for (const key of keys) delete store[key];
      },
      isQuotaError: () => false,
      readDeviceSnapshots: async () => [],
      mergeDeviceSnapshots: () => null
    };
    vm.createContext(context);
    vm.runInContext([
      extract(src, "deviceSnapshotKey"), extract(src, "deviceSnapshotChunkKey"), extract(src, "deviceSnapshotSlotKeys"),
      extract(src, "obsoleteOwnDeviceSnapshotChunkKeys"), extract(src, "publishDeviceSnapshot")
    ].join("\n\n"), context);

    const result = await context.publishDeviceSnapshot(new Map(), { kind: "settings", modifiedAt: 0 }, { deviceId: "dev" });
    assert.equal(result.written, true);

    const chunkWriteIndex = events.findIndex(([kind, keys]) => kind === "write" && keys.some(key => key.endsWith("chunk.b.0")));
    const rootWriteIndex = events.findIndex(([kind, keys]) => kind === "write" && keys.includes(rootKey));
    const precleanIndex = events.findIndex(([kind, keys]) => kind === "remove" && keys.some(key => key.endsWith("chunk.b.5")));
    const postcleanIndex = events.findIndex(([kind, keys]) => kind === "remove" && keys.some(key => key.endsWith("chunk.a.0")));
    assert.ok(precleanIndex >= 0 && precleanIndex < chunkWriteIndex, "inactive stale slot is reclaimed before new chunks consume quota");
    assert.ok(chunkWriteIndex >= 0 && chunkWriteIndex < rootWriteIndex, "new chunks must commit before the root switches");
    assert.ok(postcleanIndex > rootWriteIndex, "previous authoritative slot is reclaimed only after the new root commits");
    assert.ok(Object.hasOwn(store, `${rootKey}.chunk.b.0`));
    assert.ok(Object.hasOwn(store, `${rootKey}.chunk.b.1`));
    assert.equal(Object.keys(store).some(key => key.includes(".chunk.a.")), false);
    assert.equal(Object.keys(store).some(key => key.endsWith("chunk.b.5") || key.endsWith("chunk.b.9")), false);
  });

  test(`${browserName}: 1.24.14l failed snapshot root flip leaves the previous generation authoritative`, async () => {
    const src = fs.readFileSync(`dist/${browserName}/background/background.js`, "utf8");
    const prefix = "mosaicsync.sync.device.";
    const rootKey = `${prefix}dev`;
    const oldRoot = { kind: "device-snapshot-manifest", deviceId: "dev", slot: "a", parts: 2, commitId: "old" };
    const store = {
      [rootKey]: structuredClone(oldRoot),
      [`${rootKey}.chunk.a.0`]: { old: 0 },
      [`${rootKey}.chunk.a.1`]: { old: 1 },
      [`${rootKey}.chunk.b.7`]: { stale: true }
    };
    const publication = {
      mode: "chunked", rootKey,
      rootValue: { kind: "device-snapshot-manifest", deviceId: "dev", slot: "b", parts: 2, commitId: "new" },
      chunkWrites: {
        [`${rootKey}.chunk.b.0`]: { fresh: 0 },
        [`${rootKey}.chunk.b.1`]: { fresh: 1 }
      }
    };
    const context = {
      console, Map, SYNC_DEVICE_SNAPSHOT_PREFIX: prefix,
      browser: { storage: { sync: { async get(keys) {
        if (keys == null) return structuredClone(store);
        const out = {};
        for (const key of (Array.isArray(keys) ? keys : [keys])) if (Object.hasOwn(store, key)) out[key] = structuredClone(store[key]);
        return out;
      } } } },
      readOwnDeviceSnapshot: async () => ({ root: structuredClone(store[rootKey]), decoded: null }),
      retainTombstones: target => target,
      buildDeviceSnapshotPublication: async () => publication,
      writeSyncItems: async items => {
        if (Object.hasOwn(items, rootKey)) {
          const error = new Error("injected root quota failure");
          error.name = "QuotaExceededError";
          throw error;
        }
        Object.assign(store, structuredClone(items));
      },
      removeSyncItems: async keys => { for (const key of keys) delete store[key]; },
      isQuotaError: error => error?.name === "QuotaExceededError",
      readDeviceSnapshots: async () => [], mergeDeviceSnapshots: () => null
    };
    vm.createContext(context);
    vm.runInContext([
      extract(src, "deviceSnapshotKey"), extract(src, "deviceSnapshotChunkKey"), extract(src, "deviceSnapshotSlotKeys"),
      extract(src, "obsoleteOwnDeviceSnapshotChunkKeys"), extract(src, "publishDeviceSnapshot")
    ].join("\n\n"), context);

    const result = await context.publishDeviceSnapshot(new Map(), { kind: "settings", modifiedAt: 0 }, { deviceId: "dev" });
    assert.equal(result.written, false);
    assert.equal(result.reason, "quota");
    assert.deepEqual(store[rootKey], oldRoot, "failed root flip must not disturb the previous authoritative manifest");
    assert.ok(Object.hasOwn(store, `${rootKey}.chunk.a.0`) && Object.hasOwn(store, `${rootKey}.chunk.a.1`), "previous authoritative chunks survive");
    assert.equal(Object.keys(store).some(key => key.includes(".chunk.b.")), false, "failed inactive generation is cleaned without touching the active slot");
  });
}

test("1.24.14l live model preserves equal cross-Space ids while profile-boundary hardening remains separate", () => {
  const sharedId = "logical-move-id";
  const raw = {
    activeSpaceId: "personal",
    spaces: {
      personal: { shortcuts: [{ type: "shortcut", id: sharedId, title: "P", url: "https://p.example/", position: 0, createdAt: 1, modifiedAt: 1 }], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 1, updatedAt: 1 },
      work: { shortcuts: [{ type: "shortcut", id: sharedId, title: "W", url: "https://w.example/", position: 0, createdAt: 1, modifiedAt: 1, spaceMoveAt: 2 }], settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: 1, updatedAt: 2 }
    }
  };
  const normalized = model.normalizeState(raw);
  assert.equal(normalized.spaces.personal.shortcuts[0].id, sharedId);
  assert.equal(normalized.spaces.work.shortcuts[0].id, sharedId, "live cross-Space identity must not be randomly rewritten during move convergence");
  const personal = model.flattenStateNormalized(model.workspaceStateNormalized(normalized, "personal"));
  const work = model.flattenStateNormalized(model.workspaceStateNormalized(normalized, "work"));
  assert.equal(personal.has(sharedId), true);
  assert.equal(work.has(sharedId), true, "the two maps live under separate Sync namespaces and may share the logical id");
});
