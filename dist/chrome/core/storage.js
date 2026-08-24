/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Persistence boundary around browser.storage.local, with a disposable,
 * deliberately lightweight browser.storage.session render snapshot.
 *
 * Since 1.24.6, heavy device-local image pixels are content-addressed and stored
 * separately from the core profile. Runtime callers still receive ordinary
 * hydrated MosaicSync state, so the renderer/editor/sync model stays simple.
 */
import {
  BUILTIN_SHORTCUT_ICON_KEYS,
  DEFAULT_META,
  DEFAULT_STATE,
  LOCAL_ACTIVE_SPACE_KEY,
  LOCAL_ASSET_INDEX_KEY,
  LOCAL_ASSET_PREFIX,
  LOCAL_ASSET_STORE_SCHEMA_VERSION,
  LOCAL_ASSET_WRITE_LOCK_NAME,
  LOCAL_META_KEY,
  LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX,
  LOCAL_PENDING_SYNC_MUTATION_KEY,
  LOCAL_PRE_SPACES_BACKUP_KEY,
  LOCAL_STATE_KEY,
  SPACE_IDS,
  RENDER_SNAPSHOT_SCHEMA_VERSION,
  SESSION_RENDER_INLINE_IMAGE_MAX_CHARS,
  SESSION_RENDER_META_KEY,
  SESSION_RENDER_STATE_KEY,
  SHORTCUT_COLOR_TAG_KEYS
} from "./constants.js";
import {
  createCrossSpaceSyncIntent,
  ensureDeviceId,
  normalizeState,
  selectActiveSpaceNormalized,
  uid
} from "./model.js";
import { persistedWorkspacePayloadEqual, rebaseConcurrentState } from "./concurrency.js";
import {
  collectStateLocalAssetIds,
  dehydrateStateLocalAssets,
  hydrateStateLocalAssets,
  projectStateToLocalAssets,
  stateHasInlineLocalAssets,
  validateLocalAsset,
  LOCAL_ASSET_COLLISION_ERROR_CODE
} from "./local-assets.js";
import { ERROR_CODES, codedError } from "./errors.js";
import "./http-url-safety.js";

let lastSessionRenderCacheStatus = "unknown";
// Exact bytes already read from storage.local in this extension context. Keeping
// this map lets routine writes verify immutable content-addressed assets without
// re-reading every favicon/image on every shortcut edit. It is pruned to live IDs.
const verifiedLocalAssetValues = new Map();

function cloneCompactJson(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Small immutable snapshot used as the base of a later optimistic write. Heavy
 * local image bytes are projected out before cloning, so keeping this baseline
 * does not duplicate the asset store in New Tab memory.
 */
export function createWriteBaseline(state, assetIdMemo = null) {
  const memo = assetIdMemo || new Map();
  const normalized = normalizeState(state || DEFAULT_STATE, memo);
  return cloneCompactJson(projectStateToLocalAssets(normalized, memo).state);
}

function perfNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function getSessionRenderCacheStatus() {
  return lastSessionRenderCacheStatus;
}

async function setSessionBestEffort(items) {
  if (!browser.storage.session) return;
  try {
    await browser.storage.session.set(items);
  } catch {
    // The RAM cache is an optimization only. Persistent local data must remain
    // fully usable even if session storage is unavailable or temporarily fails.
  }
}

function localAssetStorageKey(assetId) {
  return `${LOCAL_ASSET_PREFIX}${assetId}`;
}

function normalizeAssetIndex(raw) {
  const ids = Array.isArray(raw?.ids) ? raw.ids.filter(id => typeof id === "string") : [];
  const pendingGcIds = Array.isArray(raw?.pendingGcIds) ? raw.pendingGcIds.filter(id => typeof id === "string") : [];
  return {
    schemaVersion: LOCAL_ASSET_STORE_SCHEMA_VERSION,
    ids: [...new Set(ids)].sort(),
    pendingGcIds: [...new Set(pendingGcIds)].sort()
  };
}

function assetIndexValue(ids, pendingGcIds = []) {
  const value = {
    schemaVersion: LOCAL_ASSET_STORE_SCHEMA_VERSION,
    ids: [...new Set(ids)].sort()
  };
  const pending = [...new Set(pendingGcIds)].sort();
  if (pending.length) value.pendingGcIds = pending;
  return value;
}

async function retryPendingLocalAssetCleanup() {
  return withLocalAssetWriteLock(async canCollectStale => {
    if (!canCollectStale) return false;
    const latest = await browser.storage.local.get([LOCAL_STATE_KEY, LOCAL_ASSET_INDEX_KEY]);
    const index = normalizeAssetIndex(latest[LOCAL_ASSET_INDEX_KEY]);
    if (!index.pendingGcIds.length) return false;

    const referencedIds = collectStateLocalAssetIds(latest[LOCAL_STATE_KEY] || DEFAULT_STATE);
    const removableIds = index.pendingGcIds.filter(assetId => !referencedIds.has(assetId));
    try {
      if (removableIds.length) {
        await browser.storage.local.remove(removableIds.map(localAssetStorageKey));
        for (const assetId of removableIds) verifiedLocalAssetValues.delete(assetId);
      }
      // A pending ID that became referenced again is no longer garbage. Rebuild
      // the active index from the authoritative compact state and clear the retry
      // ledger only after deletions succeeded (or there was nothing left to delete).
      await browser.storage.local.set({
        [LOCAL_ASSET_INDEX_KEY]: assetIndexValue(referencedIds)
      });
      return true;
    } catch {
      // Keep the persisted retry ledger intact. A later startup/write can retry;
      // never risk deleting a newly re-referenced content-addressed asset.
      return false;
    }
  });
}

async function readAssetMapForState(rawState, { spaceIds = SPACE_IDS } = {}) {
  const ids = [...collectStateLocalAssetIds(rawState, { spaceIds })];
  if (!ids.length) return { assets: new Map(), storageMs: 0 };
  const keys = ids.map(localAssetStorageKey);
  const startedAt = perfNow();
  const result = await browser.storage.local.get(keys);
  const storageMs = perfNow() - startedAt;
  const assets = new Map();
  for (const id of ids) {
    const value = result[localAssetStorageKey(id)];
    if (validateLocalAsset(id, value)) {
      assets.set(id, value);
      verifiedLocalAssetValues.set(id, value);
    } else {
      verifiedLocalAssetValues.delete(id);
    }
  }
  return { assets, storageMs };
}

export async function hydratePersistedState(rawState, { spaceIds = SPACE_IDS } = {}) {
  const source = rawState && typeof rawState === "object" ? rawState : DEFAULT_STATE;
  const { assets } = await readAssetMapForState(source, { spaceIds });
  return hydrateStateLocalAssets(source, assets, { spaceIds });
}

export async function hydrateLocalAssetsForSpaceNormalized(normalizedState, spaceId) {
  const id = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  const { assets } = await readAssetMapForState(normalizedState, { spaceIds: [id] });
  return hydrateStateLocalAssets(normalizedState, assets, { spaceIds: [id] });
}

export function releaseLocalAssetsForSpaceNormalized(normalizedState, spaceId) {
  const id = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  return dehydrateStateLocalAssets(normalizedState, { spaceIds: [id] });
}

function projectRenderShortcut(item) {
  if (!item || typeof item !== "object") return null;
  if (item.type === "folder") {
    const children = Array.isArray(item.items)
      ? item.items.map(projectRenderShortcut).filter(Boolean)
      : [];
    return {
      type: "folder",
      id: item.id,
      title: item.title,
      position: item.position,
      createdAt: item.createdAt,
      modifiedAt: item.modifiedAt,
      items: children
    };
  }

  const builtinIcon = BUILTIN_SHORTCUT_ICON_KEYS.includes(item.builtinIcon) ? item.builtinIcon : "";
  const colorTag = SHORTCUT_COLOR_TAG_KEYS.includes(item.colorTag) ? item.colorTag : "";
  const image = !builtinIcon && typeof item.image === "string" && item.image.length <= SESSION_RENDER_INLINE_IMAGE_MAX_CHARS
    ? item.image
    : "";
  return {
    type: "shortcut",
    id: item.id,
    title: item.title,
    url: item.url,
    builtinIcon,
    colorTag,
    image,
    localImageAssetId: item.localImageAssetId || "",
    // Sync derivatives can be independently quota-compressed but are not needed
    // to draw or navigate a New Tab. Never copy them into the render snapshot.
    imageSyncData: "",
    imageAssetId: item.imageAssetId || "",
    imageSyncKind: item.imageSyncKind || "none",
    imageSourceKind: item.imageSourceKind || "none",
    imageSourceUrl: item.imageSourceUrl || "",
    imageIsFallback: item.imageIsFallback === true,
    imageStyle: item.imageStyle === "cover" ? "cover" : "contain",
    position: item.position,
    createdAt: item.createdAt,
    modifiedAt: item.modifiedAt,
    spaceMoveAt: Number.isFinite(item.spaceMoveAt) ? item.spaceMoveAt : 0,
    source: item.source === "firefox-import" ? "firefox-import" : "manual",
    imageDeferred: Boolean((item.image || item.localImageAssetId) && !image)
  };
}

export function createRenderSnapshot(state = DEFAULT_STATE) {
  const settings = state?.settings || DEFAULT_STATE.settings;
  return {
    renderSnapshotVersion: RENDER_SNAPSHOT_SCHEMA_VERSION,
    schemaVersion: state?.schemaVersion ?? DEFAULT_STATE.schemaVersion,
    activeSpaceId: SPACE_IDS.includes(state?.activeSpaceId) ? state.activeSpaceId : "personal",
    shortcuts: Array.isArray(state?.shortcuts)
      ? state.shortcuts.map(projectRenderShortcut).filter(Boolean)
      : [],
    settings: {
      ...settings,
      backgroundImage: "",
      backgroundAssetId: "",
      backgroundImageDeferred: Boolean((settings.backgroundImage || settings.backgroundLocalAssetId) && !settings.backgroundPreset)
    },
    settingsModifiedAt: Number(state?.settingsModifiedAt) || 0,
    updatedAt: Number(state?.updatedAt) || 0
  };
}

function validHttpUrl(value) {
  return Boolean(globalThis.__mosaicsyncSafeShortcutNavigationUrl?.(value));
}

function isRenderShortcutValid(item, depth = 0) {
  if (!item || typeof item !== "object" || depth > 1) return false;
  if (typeof item.id !== "string" || !item.id) return false;
  if (typeof item.title !== "string") return false;
  if (!Number.isInteger(item.position) || item.position < 0) return false;

  if (item.type === "folder") {
    return Array.isArray(item.items) && item.items.length <= 96 &&
      item.items.every(child => isRenderShortcutValid(child, depth + 1) && child.type === "shortcut");
  }
  if (item.type !== "shortcut" || !validHttpUrl(item.url)) return false;
  const builtinIcon = item.builtinIcon ?? "";
  const colorTag = item.colorTag ?? "";
  if (typeof builtinIcon !== "string" || (builtinIcon && !BUILTIN_SHORTCUT_ICON_KEYS.includes(builtinIcon))) return false;
  if (typeof colorTag !== "string" || (colorTag && !SHORTCUT_COLOR_TAG_KEYS.includes(colorTag))) return false;
  if (typeof item.image !== "string" || item.image.length > SESSION_RENDER_INLINE_IMAGE_MAX_CHARS) return false;
  if (builtinIcon && item.image) return false;
  if (item.image && !/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(item.image)) return false;
  return true;
}

function isRenderSnapshotValid(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.renderSnapshotVersion !== RENDER_SNAPSHOT_SCHEMA_VERSION) return false;
  if (!SPACE_IDS.includes(snapshot.activeSpaceId)) return false;
  if (!Array.isArray(snapshot.shortcuts) || snapshot.shortcuts.length > 96) return false;
  if (!snapshot.shortcuts.every(item => isRenderShortcutValid(item))) return false;
  const settings = snapshot.settings;
  if (!settings || typeof settings !== "object") return false;
  if (!Number.isInteger(settings.columns) || settings.columns < 6 || settings.columns > 12) return false;
  if (!Number.isInteger(settings.rows) || settings.rows < 2 || settings.rows > 8) return false;
  if (settings.backgroundImage !== "") return false;
  return true;
}

export async function readSessionRenderCache(earlyRead = null) {
  if (!browser.storage.session) {
    lastSessionRenderCacheStatus = "unavailable";
    return null;
  }
  try {
    const canUseEarly = earlyRead?.promise && typeof earlyRead.promise.then === "function";
    const storageStartedAt = canUseEarly && Number.isFinite(earlyRead.startedAt) ? earlyRead.startedAt : perfNow();
    const result = canUseEarly
      ? await earlyRead.promise
      : await browser.storage.session.get([SESSION_RENDER_STATE_KEY, SESSION_RENDER_META_KEY]);
    const storageMs = perfNow() - storageStartedAt;
    if (!result?.[SESSION_RENDER_STATE_KEY] || !result?.[SESSION_RENDER_META_KEY]) {
      lastSessionRenderCacheStatus = "miss";
      return null;
    }

    const validationStartedAt = perfNow();
    const cachedState = result[SESSION_RENDER_STATE_KEY];
    const cachedMeta = result[SESSION_RENDER_META_KEY];
    if (!isRenderSnapshotValid(cachedState) || typeof cachedMeta?.deviceId !== "string" || !cachedMeta.deviceId) {
      lastSessionRenderCacheStatus = "invalid";
      return null;
    }
    const meta = ensureDeviceId(cachedMeta);
    const validationMs = perfNow() - validationStartedAt;
    lastSessionRenderCacheStatus = "hit";
    return {
      state: cachedState,
      meta,
      timings: { storageMs, validationMs }
    };
  } catch {
    lastSessionRenderCacheStatus = "error";
    return null;
  }
}

export async function warmSessionRenderCache(state, meta) {
  if (!browser.storage.session) return;
  const normalizedMeta = ensureDeviceId(meta || DEFAULT_META);
  await setSessionBestEffort({
    [SESSION_RENDER_STATE_KEY]: createRenderSnapshot(state || DEFAULT_STATE),
    [SESSION_RENDER_META_KEY]: normalizedMeta
  });
}

async function withLocalAssetWriteLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(LOCAL_ASSET_WRITE_LOCK_NAME, () => callback(true));
  }
  // Older/limited extension runtimes still persist safely; they merely retain
  // orphaned content-addressed pixels rather than risking cross-context deletion.
  return callback(false);
}

async function persistNormalizedState(normalized, {
  crossSpaceSyncIntent = null,
  recordSyncMutation = false,
  knownIndex = null,
  baseState = null,
  beforeWrite = null,
  assetIdMemo = null
} = {}) {
  return withLocalAssetWriteLock(async canCollectStale => {
    let finalState = normalized;
    let rebased = false;
    let effectiveCrossSpaceSyncIntent = crossSpaceSyncIntent;

    // A New Tab can have a stale in-memory copy for a few milliseconds while a
    // second New Tab commits a different edit. Re-read the compact persisted
    // state inside the same write lock and rebase only this caller's delta when
    // its baseline no longer matches. The same read also carries the durable
    // unsent-mutation journal when this is a Sync-relevant user edit.
    const transactionRead = (baseState || recordSyncMutation)
      ? await browser.storage.local.get(recordSyncMutation
        ? [LOCAL_STATE_KEY, LOCAL_PENDING_SYNC_MUTATION_KEY]
        : LOCAL_STATE_KEY)
      : {};
    const latestRaw = transactionRead[LOCAL_STATE_KEY];
    if (baseState) {
      if (latestRaw && !persistedWorkspacePayloadEqual(baseState, latestRaw)) {
        finalState = rebaseConcurrentState(baseState, normalized, latestRaw);
        rebased = true;

        // Cross-Space recovery journals must describe the state that actually
        // won the local rebase, not the stale pre-rebase intent.
        if (effectiveCrossSpaceSyncIntent && typeof effectiveCrossSpaceSyncIntent === "object") {
          const inferDeviceId = intent => {
            for (const side of [intent.destination, intent.source]) {
              for (const record of side?.upserts || []) {
                if (typeof record?.deviceId === "string" && record.deviceId) return record.deviceId;
              }
              if (typeof side?.settings?.deviceId === "string" && side.settings.deviceId) return side.settings.deviceId;
            }
            return "";
          };
          const regenerated = createCrossSpaceSyncIntent(latestRaw, finalState, {
            fromSpaceId: effectiveCrossSpaceSyncIntent.fromSpaceId,
            toSpaceId: effectiveCrossSpaceSyncIntent.toSpaceId,
            shortcutIds: effectiveCrossSpaceSyncIntent.shortcutIds,
            deviceId: inferDeviceId(effectiveCrossSpaceSyncIntent),
            timestamp: effectiveCrossSpaceSyncIntent.createdAt
          });
          if (regenerated) {
            effectiveCrossSpaceSyncIntent = {
              ...regenerated,
              intentId: effectiveCrossSpaceSyncIntent.intentId || regenerated.intentId
            };
          }
        }
      }
    }

    if (typeof beforeWrite === "function") await beforeWrite(finalState);

    const projection = projectStateToLocalAssets(finalState, assetIdMemo);
    const previousIndexRaw = knownIndex || (await browser.storage.local.get(LOCAL_ASSET_INDEX_KEY))[LOCAL_ASSET_INDEX_KEY];
    const previousIndex = normalizeAssetIndex(previousIndexRaw);
    const previousIds = new Set(previousIndex.ids);
    const currentIds = new Set(projection.referencedIds);
    const newlyStaleIds = canCollectStale
      ? [...previousIds].filter(assetId => !currentIds.has(assetId))
      : [];
    const pendingGcIds = new Set(previousIndex.pendingGcIds);
    for (const assetId of newlyStaleIds) pendingGcIds.add(assetId);
    // A stale pixel can become live again through a concurrent rebase/import.
    // Never let an old cleanup retry delete a currently referenced asset.
    for (const assetId of currentIds) pendingGcIds.delete(assetId);
    const writes = {
      [LOCAL_STATE_KEY]: projection.state,
      [LOCAL_ACTIVE_SPACE_KEY]: finalState.activeSpaceId,
      [LOCAL_ASSET_INDEX_KEY]: assetIndexValue(currentIds, pendingGcIds)
    };

    // Content-addressed keys are immutable only when the stored bytes really match
    // the bytes this state expects. Most assets were already hydrated and verified
    // in this context, so routine edits take the cache-fast path. A newly introduced
    // value that reuses an existing ID is read back exactly once: missing/corrupt
    // bytes are repaired atomically; valid-but-different bytes fail closed as a true
    // content-address collision instead of silently displaying the wrong pixels.
    const existingAssetsToVerify = [];
    for (const [assetId, dataUrl] of projection.assets) {
      const key = localAssetStorageKey(assetId);
      if (!previousIds.has(assetId)) {
        writes[key] = dataUrl;
      } else if (verifiedLocalAssetValues.get(assetId) !== dataUrl) {
        existingAssetsToVerify.push([assetId, dataUrl, key]);
      }
    }
    if (existingAssetsToVerify.length) {
      const storedAssets = await browser.storage.local.get(existingAssetsToVerify.map(([, , key]) => key));
      for (const [assetId, dataUrl, key] of existingAssetsToVerify) {
        const storedValue = storedAssets[key];
        if (storedValue === dataUrl) {
          verifiedLocalAssetValues.set(assetId, dataUrl);
          continue;
        }
        if (!validateLocalAsset(assetId, storedValue)) {
          writes[key] = dataUrl;
          continue;
        }
        const collision = new Error("Local asset content collision.");
        collision.code = LOCAL_ASSET_COLLISION_ERROR_CODE;
        throw collision;
      }
    }

    if (effectiveCrossSpaceSyncIntent && typeof effectiveCrossSpaceSyncIntent === "object") {
      const intentId = typeof effectiveCrossSpaceSyncIntent.intentId === "string" ? effectiveCrossSpaceSyncIntent.intentId.trim() : "";
      if (intentId) writes[`${LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX}${intentId}`] = effectiveCrossSpaceSyncIntent;
    }

    if (recordSyncMutation && !effectiveCrossSpaceSyncIntent) {
      const previousPending = transactionRead[LOCAL_PENDING_SYNC_MUTATION_KEY];
      const pendingBefore = previousPending?.before && typeof previousPending.before === "object"
        ? previousPending.before
        : (latestRaw && typeof latestRaw === "object" ? latestRaw : (baseState || DEFAULT_STATE));
      writes[LOCAL_PENDING_SYNC_MUTATION_KEY] = {
        schemaVersion: 1,
        journalId: uid("sync-mutation"),
        before: cloneCompactJson(pendingBefore),
        after: cloneCompactJson(projection.state),
        createdAt: Number(previousPending?.createdAt) || Date.now(),
        updatedAt: Date.now()
      };
    }

    // Publish assets + compact references in the same storage.set call. Stale pixels
    // are removed only afterwards, so interruption can never leave a new state
    // pointing at an asset that was deleted first.
    try {
      await browser.storage.local.set(writes);
      for (const [assetId, dataUrl] of projection.assets) verifiedLocalAssetValues.set(assetId, dataUrl);
      for (const assetId of [...verifiedLocalAssetValues.keys()]) {
        if (!currentIds.has(assetId)) verifiedLocalAssetValues.delete(assetId);
      }
    } catch (error) {
      // Never fall back to a compact-state-only write here: that could publish
      // references to asset pixels that were not committed. Preserve the entire
      // previous transaction and surface one stable diagnostic category instead.
      const wrapped = codedError(
        ERROR_CODES.STORAGE_LOCAL_WRITE_FAILED,
        String(error?.message || "Local storage write failed.")
      );
      try { wrapped.cause = error; } catch {}
      throw wrapped;
    }

    if (canCollectStale && pendingGcIds.size) {
      try {
        await browser.storage.local.remove([...pendingGcIds].map(localAssetStorageKey));
        for (const assetId of pendingGcIds) verifiedLocalAssetValues.delete(assetId);
        // Clearing the retry ledger is a second best-effort write. If this write
        // fails after pixels were removed, the ledger remains and a later retry
        // merely removes already-missing keys before clearing itself.
        await browser.storage.local.set({
          [LOCAL_ASSET_INDEX_KEY]: assetIndexValue(currentIds)
        });
      } catch {
        // The state + new pixels are already atomically committed. Keeping the
        // pendingGcIds ledger makes stale-pixel cleanup crash/retry safe instead
        // of silently leaking storage forever after one failed remove().
      }
    }
    return { state: finalState, rebased };
  });
}

export async function writeLocalState(state, { beforeWrite, crossSpaceSyncIntent = null, recordSyncMutation = false, baseState = null } = {}) {
  // One short-lived memo spans validation and local-asset projection for this
  // transaction only. It never survives the write or weakens content identity:
  // identical bytes still resolve through assetIdForDataUrl's exact pure result.
  const assetIdMemo = new Map();
  const normalized = normalizeState(state || DEFAULT_STATE, assetIdMemo);
  const baseline = baseState ? createWriteBaseline(baseState, assetIdMemo) : null;
  let persisted;
  try {
    persisted = await persistNormalizedState(normalized, {
      crossSpaceSyncIntent,
      recordSyncMutation,
      baseState: baseline,
      beforeWrite,
      assetIdMemo
    });
  } finally {
    // The memo exists only to avoid repeating the same pure hash work inside one
    // transaction. Drop all image-string references before any later UI/session work.
    assetIdMemo.clear();
  }
  let finalState = persisted.state;
  if (persisted.rebased) {
    // A concurrent tab may have contributed an asset reference that was not in
    // this page's stale working copy. Hydrate only the visible Space before
    // handing the rebased result back to the renderer.
    finalState = await hydrateLocalAssetsForSpaceNormalized(finalState, finalState.activeSpaceId);
    finalState = selectActiveSpaceNormalized(finalState, finalState.activeSpaceId);
  }
  await setSessionBestEffort({ [SESSION_RENDER_STATE_KEY]: createRenderSnapshot(finalState) });
  return finalState;
}


export async function readLocalMeta() {
  const result = await browser.storage.local.get(LOCAL_META_KEY);
  return ensureDeviceId(result[LOCAL_META_KEY] || DEFAULT_META);
}

export async function writeLocalMeta(meta) {
  const normalized = ensureDeviceId(meta);
  await browser.storage.local.set({ [LOCAL_META_KEY]: normalized });
  await setSessionBestEffort({ [SESSION_RENDER_META_KEY]: normalized });
  return normalized;
}

export async function readLocalStorageRaw() {
  const storageStartedAt = perfNow();
  const result = await browser.storage.local.get([
    LOCAL_STATE_KEY,
    LOCAL_META_KEY,
    LOCAL_ACTIVE_SPACE_KEY,
    LOCAL_ASSET_INDEX_KEY
  ]);
  return {
    result,
    timings: { storageMs: perfNow() - storageStartedAt }
  };
}

export async function materializeLocalStorage(rawRead, { withTimings = false, hydrateAssets = "all" } = {}) {
  const result = rawRead?.result && typeof rawRead.result === "object" ? rawRead.result : {};
  const rawState = result[LOCAL_STATE_KEY] || DEFAULT_STATE;

  const rawMultipleSpacesEnabled = rawState?.spaces?.personal?.settings?.multipleSpacesEnabled !== false;
  const requestedActiveSpaceId = rawMultipleSpacesEnabled && SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY])
    ? result[LOCAL_ACTIVE_SPACE_KEY]
    : "personal";
  const hydrateSpaceIds = hydrateAssets === "active" ? [requestedActiveSpaceId] : SPACE_IDS;

  const assetStartedAt = perfNow();
  const { assets, storageMs: assetStorageMs } = await readAssetMapForState(rawState, { spaceIds: hydrateSpaceIds });
  const hydratedRawState = hydrateStateLocalAssets(rawState, assets, { spaceIds: hydrateSpaceIds });
  const assetHydrationMs = perfNow() - assetStartedAt;

  const normalizeStartedAt = perfNow();
  let state = normalizeState(hydratedRawState);
  const multipleSpacesEnabled = state.spaces?.personal?.settings?.multipleSpacesEnabled !== false;
  const storedActiveSpaceId = multipleSpacesEnabled && SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY])
    ? result[LOCAL_ACTIVE_SPACE_KEY]
    : "personal";
  state = selectActiveSpaceNormalized(state, storedActiveSpaceId);
  const meta = ensureDeviceId(result[LOCAL_META_KEY] || DEFAULT_META);
  const normalizationMs = perfNow() - normalizeStartedAt;

  const needsSpacesMigration = Boolean(result[LOCAL_STATE_KEY]) &&
    (!rawState?.spaces || typeof rawState.spaces !== "object");
  if (needsSpacesMigration) {
    const legacyBackup = await browser.storage.local.get(LOCAL_PRE_SPACES_BACKUP_KEY);
    if (!legacyBackup?.[LOCAL_PRE_SPACES_BACKUP_KEY]) {
      await browser.storage.local.set({ [LOCAL_PRE_SPACES_BACKUP_KEY]: rawState });
    }
  }

  const index = result[LOCAL_ASSET_INDEX_KEY];
  const assetStoreCurrent = Number(index?.schemaVersion) === LOCAL_ASSET_STORE_SCHEMA_VERSION;
  const needsAssetMigration = !assetStoreCurrent || stateHasInlineLocalAssets(rawState);
  const forcedPersonal = !multipleSpacesEnabled && (rawState?.activeSpaceId === "work" || result[LOCAL_ACTIVE_SPACE_KEY] === "work");

  if (!result[LOCAL_STATE_KEY] || needsSpacesMigration || forcedPersonal || needsAssetMigration) {
    // A legacy inline profile is migrated exactly once. If this New Tab asked for
    // active-only hydration but the old state was already inline, all original
    // pixels are still present in rawState and therefore migrate losslessly.
    const migrationState = needsAssetMigration && stateHasInlineLocalAssets(rawState)
      ? selectActiveSpaceNormalized(normalizeState(rawState), storedActiveSpaceId)
      : state;
    await persistNormalizedState(migrationState, { knownIndex: index });
    state = migrationState;
  } else if (!SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY]) || forcedPersonal) {
    await browser.storage.local.set({ [LOCAL_ACTIVE_SPACE_KEY]: state.activeSpaceId });
  }

  if (!result[LOCAL_META_KEY] || !result[LOCAL_META_KEY].deviceId) {
    await browser.storage.local.set({ [LOCAL_META_KEY]: meta });
  }

  // Stale content-addressed pixels are non-authoritative, but a failed remove()
  // must not leak them forever. A tiny retry ledger stored with the atomic state
  // transaction is replayed on the next startup. The cleanup re-reads state under
  // the same asset lock and therefore cannot delete an asset that became live again.
  if (normalizeAssetIndex(result[LOCAL_ASSET_INDEX_KEY]).pendingGcIds.length) {
    await retryPendingLocalAssetCleanup();
  }

  const loaded = { state, meta };
  if (withTimings) {
    loaded.timings = {
      storageMs: Number(rawRead?.timings?.storageMs) || 0,
      assetStorageMs,
      assetHydrationMs,
      normalizationMs
    };
  }
  return loaded;
}

export async function writeActiveSpace(spaceId) {
  const normalized = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  await browser.storage.local.set({ [LOCAL_ACTIVE_SPACE_KEY]: normalized });
  return normalized;
}

export async function ensureLocalStorage({ withTimings = false, hydrateAssets = "all" } = {}) {
  const rawRead = await readLocalStorageRaw();
  return materializeLocalStorage(rawRead, { withTimings, hydrateAssets });
}
