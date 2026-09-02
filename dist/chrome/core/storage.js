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
  SESSION_FREQUENTLY_VISITED_PROJECTION_KEY,
  SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY,
  SHORTCUT_COLOR_TAG_KEYS
} from "./constants.js";
import {
  createCrossSpaceSyncIntent,
  ensureDeviceId,
  normalizeState,
  selectActiveSpaceNormalized,
  stampSettingsMutationClocks,
  uid
} from "./model.js";
import { persistedWorkspacePayloadEqual, rebaseConcurrentState } from "./concurrency.js";
import {
  collectDeferredFolderLocalAssetIds,
  collectFolderLocalAssetIds,
  collectStateLocalAssetIds,
  dehydrateStateLocalAssets,
  hydrateStateLocalAssets,
  isLocalAssetId,
  projectStateToLocalAssets,
  stateHasInlineLocalAssets,
  validateLocalAsset,
  LOCAL_ASSET_COLLISION_ERROR_CODE
} from "./local-assets.js";
import { ERROR_CODES, codedError } from "./errors.js";
import {
  createFirstPaintContract,
  createFirstPaintFrequentProjection,
  isFirstPaintContractValid,
  sanitizeFirstPaintFrequentSnapshot
} from "./first-paint-contract.js";
import "./http-url-safety.js";

let lastSessionRenderCacheStatus = "unknown";
let lastSessionRenderStateSerialized = null;
let lastSessionRenderMetaSerialized = null;
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
  if (!browser.storage.session) return false;
  try {
    await browser.storage.session.set(items);
    return true;
  } catch {
    // The RAM cache is an optimization only. Persistent local data must remain
    // fully usable even if session storage is unavailable or temporarily fails.
    return false;
  }
}

function sessionSerialized(value) {
  try { return JSON.stringify(value); } catch { return null; }
}

async function sessionStoredValueMatches(key, serialized) {
  if (!browser.storage.session || !serialized) return false;
  try {
    const result = await browser.storage.session.get(key);
    return sessionSerialized(result?.[key]) === serialized;
  } catch {
    // A failed verification must never suppress a corrective cache write.
    return false;
  }
}

async function writeSessionRenderMetaBestEffort(meta) {
  const serialized = sessionSerialized(meta);
  if (serialized && serialized === lastSessionRenderMetaSerialized &&
      await sessionStoredValueMatches(SESSION_RENDER_META_KEY, serialized)) return false;
  const written = await setSessionBestEffort({ [SESSION_RENDER_META_KEY]: meta });
  if (written) lastSessionRenderMetaSerialized = serialized;
  return written;
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
  return withPersistenceWriteLock(async canCollectStale => {
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

async function readAssetMapForState(rawState, { spaceIds = SPACE_IDS, includeShortcuts = true, includeBackground = true, folderChildLimit = Number.POSITIVE_INFINITY, explicitIds = null } = {}) {
  const assetIdMemo = new Map();
  const ids = explicitIds
    ? [...new Set([...explicitIds].filter(isLocalAssetId))]
    : [...collectStateLocalAssetIds(rawState, { spaceIds, includeShortcuts, includeBackground, folderChildLimit })];
  if (!ids.length) return { assets: new Map(), storageMs: 0, assetIdMemo };
  const keys = ids.map(localAssetStorageKey);
  const startedAt = perfNow();
  const result = await browser.storage.local.get(keys);
  const storageMs = perfNow() - startedAt;
  const assets = new Map();
  for (const id of ids) {
    const value = result[localAssetStorageKey(id)];
    if (validateLocalAsset(id, value, assetIdMemo)) {
      assets.set(id, value);
      verifiedLocalAssetValues.set(id, value);
    } else {
      verifiedLocalAssetValues.delete(id);
    }
  }
  return { assets, storageMs, assetIdMemo };
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

export async function hydrateFolderLocalAssetsNormalized(normalizedState, spaceId, folderId) {
  const id = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  const explicitIds = collectFolderLocalAssetIds(normalizedState, { spaceId: id, folderId });
  if (!explicitIds.size) return normalizedState;
  const { assets } = await readAssetMapForState(normalizedState, { explicitIds });
  const hydrated = hydrateStateLocalAssets(normalizedState, assets, { spaceIds: [id] });
  return selectActiveSpaceNormalized(hydrated, hydrated?.activeSpaceId || normalizedState?.activeSpaceId);
}

export async function hydrateDeferredFolderLocalAssetsNormalized(
  normalizedState,
  spaceId,
  visibleChildren = 4,
  { batchSize = Number.POSITIVE_INFINITY, yieldBetween = null, onBatch = null } = {}
) {
  const id = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  const explicitIds = [...collectDeferredFolderLocalAssetIds(normalizedState, { spaceId: id, visibleChildren })];
  if (!explicitIds.length) return normalizedState;
  const size = Number.isFinite(batchSize) ? Math.max(1, Math.trunc(batchSize)) : explicitIds.length;
  let working = normalizedState;
  for (let offset = 0; offset < explicitIds.length; offset += size) {
    const chunk = new Set(explicitIds.slice(offset, offset + size));
    const { assets } = await readAssetMapForState(working, { explicitIds: chunk });
    const hydrated = hydrateStateLocalAssets(working, assets, { spaceIds: [id] });
    working = selectActiveSpaceNormalized(hydrated, hydrated?.activeSpaceId || working?.activeSpaceId);
    if (typeof onBatch === "function") await onBatch(working, { loaded: Math.min(offset + size, explicitIds.length), total: explicitIds.length });
    if (offset + size < explicitIds.length && typeof yieldBetween === "function") await yieldBetween();
  }
  return working;
}

export async function hydrateBackgroundLocalAssetNormalized(normalizedState, spaceId) {
  const id = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  const { assets } = await readAssetMapForState(normalizedState, {
    spaceIds: [id],
    includeShortcuts: false,
    includeBackground: true
  });
  let hydrated = hydrateStateLocalAssets(normalizedState, assets, { spaceIds: [id] });
  const workspace = hydrated?.spaces?.[id];
  if (workspace?.settings?.backgroundImage) {
    const settings = { ...workspace.settings };
    delete settings.backgroundImageDeferred;
    const spaces = { ...hydrated.spaces, [id]: { ...workspace, settings } };
    hydrated = { ...hydrated, spaces };
  }
  return selectActiveSpaceNormalized(hydrated, hydrated?.activeSpaceId || normalizedState?.activeSpaceId);
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
    faviconPreference: typeof item.faviconPreference === "string" ? item.faviconPreference : "",
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

export function createRenderSnapshot(state = DEFAULT_STATE, { frequentSnapshot = null } = {}) {
  const spacesDisabled = state?.spaces?.personal?.settings?.multipleSpacesEnabled === false;
  const personal = state?.spaces?.personal;
  const source = spacesDisabled && state?.activeSpaceId !== "personal" && personal
    ? {
        ...state,
        activeSpaceId: "personal",
        shortcuts: personal.shortcuts || [],
        settings: personal.settings || DEFAULT_STATE.settings,
        settingsModifiedAt: Number(personal.settingsModifiedAt) || 0,
        updatedAt: Number(personal.updatedAt) || 0
      }
    : state;
  const settings = source?.settings || DEFAULT_STATE.settings;
  return {
    renderSnapshotVersion: RENDER_SNAPSHOT_SCHEMA_VERSION,
    schemaVersion: source?.schemaVersion ?? DEFAULT_STATE.schemaVersion,
    activeSpaceId: SPACE_IDS.includes(source?.activeSpaceId) ? source.activeSpaceId : "personal",
    // Every startup accelerator now carries the same small visual contract.
    // A null Frequent snapshot means this session layer has no opinion and must
    // preserve any trustworthy synchronous Frequent paint already on screen.
    firstPaint: createFirstPaintContract(state, frequentSnapshot),
    shortcuts: Array.isArray(source?.shortcuts)
      ? source.shortcuts.map(projectRenderShortcut).filter(Boolean)
      : [],
    settings: {
      ...settings,
      backgroundImage: "",
      backgroundAssetId: "",
      backgroundImageDeferred: Boolean((settings.backgroundImage || settings.backgroundLocalAssetId) && !settings.backgroundPreset)
    },
    settingsModifiedAt: Number(source?.settingsModifiedAt) || 0,
    updatedAt: Number(source?.updatedAt) || 0
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
  if (!isFirstPaintContractValid(snapshot.firstPaint)) return false;
  if (snapshot.firstPaint.activeSpaceId !== snapshot.activeSpaceId) return false;
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
      : await browser.storage.session.get([SESSION_RENDER_STATE_KEY, SESSION_RENDER_META_KEY, SESSION_FREQUENTLY_VISITED_PROJECTION_KEY, SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY]);
    const storageMs = perfNow() - storageStartedAt;
    const frequentSuppressed = result?.[SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY] === true;
    if (!result?.[SESSION_RENDER_STATE_KEY] || !result?.[SESSION_RENDER_META_KEY]) {
      lastSessionRenderCacheStatus = "miss";
      return frequentSuppressed ? { state: null, meta: null, frequentSuppressed: true, timings: { storageMs, validationMs: 0 } } : null;
    }

    const validationStartedAt = perfNow();
    const cachedState = result[SESSION_RENDER_STATE_KEY];
    const cachedMeta = result[SESSION_RENDER_META_KEY];
    if (!isRenderSnapshotValid(cachedState) || typeof cachedMeta?.deviceId !== "string" || !cachedMeta.deviceId) {
      lastSessionRenderCacheStatus = "invalid";
      return null;
    }
    const meta = ensureDeviceId(cachedMeta);
    const storedFrequent = sanitizeFirstPaintFrequentSnapshot(result?.[SESSION_FREQUENTLY_VISITED_PROJECTION_KEY]);
    const frequent = frequentSuppressed
      ? createFirstPaintFrequentProjection(cachedState.settings, {
          enabled: true,
          count: cachedState.settings?.frequentlyVisitedCount,
          sites: []
        })
      : createFirstPaintFrequentProjection(cachedState.settings, storedFrequent);
    const composedState = {
      ...cachedState,
      firstPaint: { ...cachedState.firstPaint, frequent }
    };
    // Remember the exact structural bytes stored under SESSION_RENDER_STATE_KEY.
    // Frequently Visited has its own session key from 1.30.18.10 onward and is
    // composed only for the returned presentation snapshot.
    lastSessionRenderStateSerialized = sessionSerialized(cachedState);
    lastSessionRenderMetaSerialized = sessionSerialized(meta);
    const validationMs = perfNow() - validationStartedAt;
    lastSessionRenderCacheStatus = "hit";
    return {
      state: composedState,
      meta,
      frequentSuppressed,
      timings: { storageMs, validationMs }
    };
  } catch {
    lastSessionRenderCacheStatus = "error";
    return null;
  }
}

async function readSessionFrequentContext() {
  if (!browser.storage.session) return {};
  try {
    return await browser.storage.session.get([
      SESSION_FREQUENTLY_VISITED_PROJECTION_KEY,
      SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY
    ]);
  } catch {
    return {};
  }
}

function sessionFrequentProjectionForWrite(frequentSnapshot, { suppressed = false } = {}) {
  const candidate = sanitizeFirstPaintFrequentSnapshot(frequentSnapshot);
  if (!candidate) return null;
  return suppressed ? { ...candidate, sites: [] } : candidate;
}

async function writeSessionFrequentProjectionBestEffort(frequentSnapshot, { suppressed = false } = {}) {
  if (!browser.storage.session) return false;
  const projection = sessionFrequentProjectionForWrite(frequentSnapshot, { suppressed });
  if (!projection) return false;
  const serialized = sessionSerialized(projection);
  if (await sessionStoredValueMatches(SESSION_FREQUENTLY_VISITED_PROJECTION_KEY, serialized)) return false;
  return setSessionBestEffort({ [SESSION_FREQUENTLY_VISITED_PROJECTION_KEY]: projection });
}

async function publishSessionRenderSnapshotBestEffort(state, meta = null) {
  if (!browser.storage.session) return false;
  const snapshot = createRenderSnapshot(state || DEFAULT_STATE, { frequentSnapshot: null });
  const updates = {};
  const stateSerialized = sessionSerialized(snapshot);
  if (!(stateSerialized && stateSerialized === lastSessionRenderStateSerialized &&
        await sessionStoredValueMatches(SESSION_RENDER_STATE_KEY, stateSerialized))) {
    updates[SESSION_RENDER_STATE_KEY] = snapshot;
  }
  let normalizedMeta = null;
  let metaSerialized = null;
  if (meta) {
    normalizedMeta = ensureDeviceId(meta);
    metaSerialized = sessionSerialized(normalizedMeta);
    if (!(metaSerialized && metaSerialized === lastSessionRenderMetaSerialized &&
          await sessionStoredValueMatches(SESSION_RENDER_META_KEY, metaSerialized))) {
      updates[SESSION_RENDER_META_KEY] = normalizedMeta;
    }
  }
  if (!Object.keys(updates).length) return false;
  const written = await setSessionBestEffort(updates);
  if (written) {
    if (Object.hasOwn(updates, SESSION_RENDER_STATE_KEY)) lastSessionRenderStateSerialized = stateSerialized;
    if (Object.hasOwn(updates, SESSION_RENDER_META_KEY)) lastSessionRenderMetaSerialized = metaSerialized;
  }
  return written;
}

/**
 * Public structural warm-up path. A caller may hold an older in-memory state,
 * so derive the session accelerator from authoritative storage.local while the
 * shared persistence lock is held. Frequently Visited deliberately has no
 * parameter here: its dedicated session writer is the only physical owner of
 * browser-history-derived candidates.
 */
export async function warmSessionRenderCache(_state, _meta) {
  if (!browser.storage.session) return false;
  return withPersistenceWriteLock(async () => {
    const local = browser.storage.local;
    if (!local?.get) {
      return publishSessionRenderSnapshotBestEffort(_state || DEFAULT_STATE, _meta || DEFAULT_META);
    }
    const result = await local.get([LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY]);
    const hasPersistedState = result?.[LOCAL_STATE_KEY] && typeof result[LOCAL_STATE_KEY] === "object";
    let current = normalizeState(hasPersistedState ? result[LOCAL_STATE_KEY] : (_state || DEFAULT_STATE));
    const activeSpace = SPACE_IDS.includes(result?.[LOCAL_ACTIVE_SPACE_KEY])
      ? result[LOCAL_ACTIVE_SPACE_KEY]
      : (SPACE_IDS.includes(_state?.activeSpaceId) ? _state.activeSpaceId : current.activeSpaceId);
    current = selectActiveSpaceNormalized(current, activeSpace);
    const currentMeta = ensureDeviceId(result?.[LOCAL_META_KEY] || _meta || DEFAULT_META);
    return publishSessionRenderSnapshotBestEffort(current, currentMeta);
  });
}

/**
 * Frequently Visited candidates physically own a dedicated session key. Their
 * updates can no longer replace structural Space/grid/artwork session state.
 */
export async function updateSessionFrequentlyVisitedSnapshot(frequentSnapshot = null) {
  if (!browser.storage.session) return false;
  const shared = await readSessionFrequentContext();
  return writeSessionFrequentProjectionBestEffort(frequentSnapshot, {
    suppressed: shared?.[SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY] === true
  });
}

export async function clearSessionFrequentlyVisitedSnapshot() {
  if (!browser.storage.session) return false;
  try {
    const result = await browser.storage.session.get([
      SESSION_FREQUENTLY_VISITED_PROJECTION_KEY,
      SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY
    ]);
    const emptyProjection = { enabled: true, count: 5, sites: [] };
    const updates = {};
    if (result?.[SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY] !== true) {
      updates[SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY] = true;
    }
    if (sessionSerialized(result?.[SESSION_FREQUENTLY_VISITED_PROJECTION_KEY]) !== sessionSerialized(emptyProjection)) {
      updates[SESSION_FREQUENTLY_VISITED_PROJECTION_KEY] = emptyProjection;
    }
    if (!Object.keys(updates).length) return false;
    return setSessionBestEffort(updates);
  } catch {
    return false;
  }
}

export async function clearSessionFrequentlyVisitedSuppression() {
  if (!browser.storage.session) return false;
  try {
    const result = await browser.storage.session.get(SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY);
    if (result?.[SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY] !== true) return false;
    return setSessionBestEffort({ [SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY]: false });
  } catch {
    return false;
  }
}

async function withPersistenceWriteLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(LOCAL_ASSET_WRITE_LOCK_NAME, () => callback(true));
  }
  // Older/limited extension runtimes cannot provide cross-context serialization.
  // Keep the functional fallback for compatibility, but callers must not assume
  // the same race guarantees that navigator.locks provides on supported browsers.
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
  return withPersistenceWriteLock(async canCollectStale => {
    let finalState = normalized;
    let rebased = false;
    let effectiveCrossSpaceSyncIntent = crossSpaceSyncIntent;

    // A New Tab can have a stale in-memory copy for a few milliseconds while a
    // second New Tab commits a different edit. Re-read the compact persisted
    // state inside the same write lock and rebase only this caller's delta when
    // its baseline no longer matches. The same read also carries the durable
    // unsent-mutation journal when this is a Sync-relevant user edit.
    const transactionRead = await browser.storage.local.get(recordSyncMutation
      ? [LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_PENDING_SYNC_MUTATION_KEY]
      : [LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY]);
    const latestRaw = transactionRead[LOCAL_STATE_KEY];

    // Fine-grained Settings clocks are inferred at the persistence boundary. UI
    // callers continue mutating ordinary settings exactly as before; only groups
    // whose values changed and whose clock was not already supplied by an
    // authoritative remote/import state are stamped as local user intent.
    finalState = stampSettingsMutationClocks(baseState || latestRaw || DEFAULT_STATE, finalState);

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

    // Structural session publication is part of the same cross-context write
    // transaction as storage.local. Active-Space ownership stays with the
    // dedicated pointer: a stale structural writer may update workspace data,
    // but it cannot make first paint advertise a different Space.
    const persistedActiveSpaceId = rawStateMultipleSpacesEnabled(projection.state) &&
      SPACE_IDS.includes(transactionRead[LOCAL_ACTIVE_SPACE_KEY])
      ? transactionRead[LOCAL_ACTIVE_SPACE_KEY]
      : "personal";
    const sessionState = selectActiveSpaceNormalized(finalState, persistedActiveSpaceId);
    await publishSessionRenderSnapshotBestEffort(sessionState);

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
    return { state: finalState, rebased, compactBaseline: cloneCompactJson(projection.state) };
  });
}

async function writeLocalStateResult(state, {
  beforeWrite,
  crossSpaceSyncIntent = null,
  recordSyncMutation = false,
  baseState = null,
  baseStateIsCompact = false
} = {}) {
  // One short-lived memo spans validation and local-asset projection for this
  // transaction only. It never survives the write or weakens content identity:
  // identical bytes still resolve through assetIdForDataUrl's exact pure result.
  const assetIdMemo = new Map();
  const normalized = normalizeState(state || DEFAULT_STATE, assetIdMemo);
  const baseline = baseState
    ? (baseStateIsCompact ? cloneCompactJson(baseState) : createWriteBaseline(baseState, assetIdMemo))
    : null;
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
  return { state: finalState, compactBaseline: persisted.compactBaseline };
}

export async function writeLocalState(state, options = {}) {
  return (await writeLocalStateResult(state, options)).state;
}

export async function writeLocalStateWithBaseline(state, options = {}) {
  return writeLocalStateResult(state, options);
}


export async function readLocalMeta() {
  const result = await browser.storage.local.get(LOCAL_META_KEY);
  return ensureDeviceId(result[LOCAL_META_KEY] || DEFAULT_META);
}

export async function writeLocalMeta(meta, { allowOnboardingChange = false, allowDeviceNameChange = false } = {}) {
  return withPersistenceWriteLock(async () => {
    const stored = await browser.storage.local.get(LOCAL_META_KEY);
    const hasStoredMeta = Boolean(stored?.[LOCAL_META_KEY] && typeof stored[LOCAL_META_KEY] === "object");
    const current = ensureDeviceId(hasStoredMeta ? stored[LOCAL_META_KEY] : (meta || DEFAULT_META));
    const candidate = ensureDeviceId({
      ...(meta || DEFAULT_META),
      deviceId: hasStoredMeta ? current.deviceId : (meta?.deviceId || current.deviceId)
    });
    // Onboarding is an independent user/setup decision. Background Sync/status
    // transitions are often constructed from an older snapshot before long async
    // work, so they must not restore stale onboarding fields merely because their
    // eventual full-record write obtained the persistence lock later. The single
    // remote-bootstrap transition that intentionally completes onboarding opts in.
    const normalized = ensureDeviceId({
      ...candidate,
      deviceId: current.deviceId,
      onboardingCompleted: (allowOnboardingChange || !hasStoredMeta) ? candidate.onboardingCompleted : current.onboardingCompleted,
      onboardingVersion: (allowOnboardingChange || !hasStoredMeta) ? candidate.onboardingVersion : current.onboardingVersion,
      // A friendly device name is independent UI intent. Long-running Sync/status
      // writes may have been constructed from older meta and must not roll back a
      // newer rename merely because they acquire the persistence lock later.
      deviceName: (allowDeviceNameChange || !hasStoredMeta) ? candidate.deviceName : current.deviceName
    });
    await browser.storage.local.set({ [LOCAL_META_KEY]: normalized });
    await writeSessionRenderMetaBestEffort(normalized);
    return normalized;
  });
}

/**
 * Apply only the caller's intended meta fields against the record that is
 * authoritative inside the persistence transaction. This is for independent
 * setup/UI intentions; coherent Sync/status state-machine transitions continue
 * using writeLocalMeta() as full-record writes.
 */
export async function updateLocalMeta(patchOrUpdater) {
  return withPersistenceWriteLock(async () => {
    const stored = await browser.storage.local.get(LOCAL_META_KEY);
    const current = ensureDeviceId(stored?.[LOCAL_META_KEY] || DEFAULT_META);
    const requested = typeof patchOrUpdater === "function"
      ? patchOrUpdater({ ...current })
      : patchOrUpdater;
    if (!requested || typeof requested !== "object" || Array.isArray(requested)) return current;

    const patch = {};
    for (const key of Object.keys(DEFAULT_META)) {
      if (key === "schemaVersion" || key === "deviceId") continue;
      if (Object.hasOwn(requested, key)) patch[key] = requested[key];
    }
    const normalized = ensureDeviceId({ ...current, ...patch, deviceId: current.deviceId });
    await browser.storage.local.set({ [LOCAL_META_KEY]: normalized });
    await writeSessionRenderMetaBestEffort(normalized);
    return normalized;
  });
}

async function repairStartupAuthoritiesIfNeeded({ fallbackActiveSpaceId = "personal", fallbackMeta = DEFAULT_META } = {}) {
  return withPersistenceWriteLock(async () => {
    const latest = await browser.storage.local.get([LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY]);
    const currentState = latest?.[LOCAL_STATE_KEY] && typeof latest[LOCAL_STATE_KEY] === "object"
      ? latest[LOCAL_STATE_KEY]
      : DEFAULT_STATE;
    const multipleSpacesEnabled = rawStateMultipleSpacesEnabled(currentState);
    const storedActive = latest?.[LOCAL_ACTIVE_SPACE_KEY];
    const fallbackActive = SPACE_IDS.includes(fallbackActiveSpaceId) ? fallbackActiveSpaceId : "personal";
    const activeSpaceId = multipleSpacesEnabled
      ? (SPACE_IDS.includes(storedActive) ? storedActive : fallbackActive)
      : "personal";

    const storedMeta = latest?.[LOCAL_META_KEY];
    const metaNeedsRepair = !storedMeta || typeof storedMeta !== "object" || !storedMeta.deviceId;
    const meta = metaNeedsRepair
      ? ensureDeviceId(storedMeta || fallbackMeta || DEFAULT_META)
      : ensureDeviceId(storedMeta);
    const updates = {};
    if (storedActive !== activeSpaceId) updates[LOCAL_ACTIVE_SPACE_KEY] = activeSpaceId;
    if (metaNeedsRepair) updates[LOCAL_META_KEY] = meta;
    if (Object.keys(updates).length) await browser.storage.local.set(updates);

    // Startup repair is rare. While we already own the transaction, make the
    // disposable session accelerator agree with whichever active/meta authority
    // actually survived the re-read instead of publishing the caller's stale view.
    if (Object.keys(updates).length) {
      let renderState = normalizeState(currentState);
      renderState = selectActiveSpaceNormalized(renderState, activeSpaceId);
      await publishSessionRenderSnapshotBestEffort(renderState, meta);
    }
    return { activeSpaceId, meta };
  });
}

export function rawStateMultipleSpacesEnabled(rawState) {
  return rawState?.spaces?.personal?.settings?.multipleSpacesEnabled !== false;
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

export async function materializeLocalStorage(rawRead, { withTimings = false, hydrateAssets = "all", folderChildLimit = Number.POSITIVE_INFINITY } = {}) {
  const result = rawRead?.result && typeof rawRead.result === "object" ? rawRead.result : {};
  const rawState = result[LOCAL_STATE_KEY] || DEFAULT_STATE;
  let compactBaseline = result[LOCAL_STATE_KEY] && typeof result[LOCAL_STATE_KEY] === "object"
    ? cloneCompactJson(result[LOCAL_STATE_KEY])
    : null;

  const rawMultipleSpacesEnabled = rawStateMultipleSpacesEnabled(rawState);
  const initiallyValidActiveSpace = rawMultipleSpacesEnabled
    ? SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY])
    : result[LOCAL_ACTIVE_SPACE_KEY] === "personal";
  const initiallyValidMeta = Boolean(result[LOCAL_META_KEY] && typeof result[LOCAL_META_KEY] === "object" && result[LOCAL_META_KEY].deviceId);
  if (!initiallyValidActiveSpace || !initiallyValidMeta) {
    const repaired = await repairStartupAuthoritiesIfNeeded({
      fallbackActiveSpaceId: rawMultipleSpacesEnabled && SPACE_IDS.includes(rawState?.activeSpaceId) ? rawState.activeSpaceId : "personal",
      fallbackMeta: result[LOCAL_META_KEY] || DEFAULT_META
    });
    result[LOCAL_ACTIVE_SPACE_KEY] = repaired.activeSpaceId;
    result[LOCAL_META_KEY] = repaired.meta;
  }

  const requestedActiveSpaceId = rawMultipleSpacesEnabled && SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY])
    ? result[LOCAL_ACTIVE_SPACE_KEY]
    : "personal";
  const activeOnly = hydrateAssets === "active" || hydrateAssets === "active-no-background";
  const hydrateSpaceIds = activeOnly ? [requestedActiveSpaceId] : SPACE_IDS;
  const includeBackground = hydrateAssets !== "active-no-background";

  const assetStartedAt = perfNow();
  const { assets, storageMs: assetStorageMs, assetIdMemo } = await readAssetMapForState(rawState, {
    spaceIds: hydrateSpaceIds,
    includeBackground,
    folderChildLimit
  });
  const hydratedRawState = hydrateStateLocalAssets(rawState, assets, { spaceIds: hydrateSpaceIds, folderChildLimit });
  const assetHydrationMs = perfNow() - assetStartedAt;

  const normalizeStartedAt = perfNow();
  let state = normalizeState(hydratedRawState, assetIdMemo);
  const multipleSpacesEnabled = state.spaces?.personal?.settings?.multipleSpacesEnabled !== false;
  const storedActiveSpaceId = multipleSpacesEnabled && SPACE_IDS.includes(result[LOCAL_ACTIVE_SPACE_KEY])
    ? result[LOCAL_ACTIVE_SPACE_KEY]
    : "personal";
  state = selectActiveSpaceNormalized(state, storedActiveSpaceId);
  if (!includeBackground && state.settings?.backgroundLocalAssetId && !state.settings.backgroundImage && !state.settings.backgroundPreset) {
    // Transient render hint only: the compact state still retains the authoritative
    // content-addressed background ID. The full wallpaper is hydrated just after
    // the visible shortcut artwork has been allowed to paint.
    state.settings.backgroundImageDeferred = true;
  }
  const meta = ensureDeviceId(result[LOCAL_META_KEY] || DEFAULT_META);
  const normalizationMs = perfNow() - normalizeStartedAt;

  const needsStateSchemaMigration = Boolean(result[LOCAL_STATE_KEY]) &&
    Number(rawState?.schemaVersion) !== Number(DEFAULT_STATE.schemaVersion);
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

  if (!result[LOCAL_STATE_KEY] || needsStateSchemaMigration || needsSpacesMigration || forcedPersonal || needsAssetMigration) {
    // A legacy inline profile is migrated exactly once. If this New Tab asked for
    // active-only hydration but the old state was already inline, all original
    // pixels are still present in rawState and therefore migrate losslessly.
    const migrationState = needsAssetMigration && stateHasInlineLocalAssets(rawState)
      ? selectActiveSpaceNormalized(normalizeState(rawState), storedActiveSpaceId)
      : state;
    await persistNormalizedState(migrationState, { knownIndex: index });
    state = migrationState;
    // Migration is rare; pay the full projection cost here so the next real
    // mutation still has an exact persisted concurrency baseline. Normal modern
    // startup reuses the already-compact storage.local bytes instead.
    compactBaseline = createWriteBaseline(migrationState, assetIdMemo);
  }

  // Stale content-addressed pixels are non-authoritative, but a failed remove()
  // must not leak them forever. A tiny retry ledger stored with the atomic state
  // transaction is replayed on the next startup. The cleanup re-reads state under
  // the same asset lock and therefore cannot delete an asset that became live again.
  if (normalizeAssetIndex(result[LOCAL_ASSET_INDEX_KEY]).pendingGcIds.length) {
    await retryPendingLocalAssetCleanup();
  }

  const loaded = { state, meta, assetIdMemo, compactBaseline };
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
  const requested = SPACE_IDS.includes(spaceId) ? spaceId : "personal";
  return withPersistenceWriteLock(async () => {
    await browser.storage.local.set({ [LOCAL_ACTIVE_SPACE_KEY]: requested });

    // Read the persisted pointer back while the same cross-context persistence
    // lock is still held. Session startup truth is therefore derived from the
    // authoritative pointer that will survive this transaction, never merely
    // from a stale caller's requested Space.
    try {
      const result = await browser.storage.local.get([LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY]);
      const persistedActive = SPACE_IDS.includes(result?.[LOCAL_ACTIVE_SPACE_KEY])
        ? result[LOCAL_ACTIVE_SPACE_KEY]
        : "personal";
      let current = normalizeState(result?.[LOCAL_STATE_KEY] || DEFAULT_STATE);
      current = selectActiveSpaceNormalized(current, persistedActive);
      const currentMeta = ensureDeviceId(result?.[LOCAL_META_KEY] || DEFAULT_META);
      await publishSessionRenderSnapshotBestEffort(current, currentMeta);
      return persistedActive;
    } catch {
      // The active-Space pointer is authoritative even if the disposable session
      // accelerator cannot be refreshed. The next New Tab falls back to local.
      return requested;
    }
  });
}

export async function ensureLocalStorage({ withTimings = false, hydrateAssets = "all" } = {}) {
  const rawRead = await readLocalStorageRaw();
  return materializeLocalStorage(rawRead, { withTimings, hydrateAssets });
}
