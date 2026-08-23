/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * MosaicSync background event page.
 *
 * Design goals:
 * - event-driven MV3 code: no persistent background page and no polling loop;
 * - serialize mutations through one promise queue to avoid overlapping Sync writes;
 * - keep layout records authoritative and artwork best-effort under Firefox's quota;
 * - never let a newly installed device publish until the user chooses a source.
 */
import "../core/browser-shim.js";
import { isProtectedChromeStoreUrl, platformHasPermissionFreeFaviconSource, readNativeFaviconDataUrl } from "../core/platform.js";
import {
  ASSET_ORPHAN_GRACE_MS,
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_CHUNK_DATA_CHARS,
  DEVICE_SNAPSHOT_RETENTION_MS,
  DEVICE_SNAPSHOT_CAP_MIN_AGE_MS,
  DEVICE_SNAPSHOT_MAX_RECENT_DEVICES,
  DEVICE_SNAPSHOT_GC_INTERVAL_MS,
  DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES,
  EXPECTATION_TTL_MS,
  ICON_RECOVERY_ALARM,
  ICON_RECOVERY_CONCURRENCY,
  ICON_RECOVERY_CONTINUE_DELAY_MS,
  ICON_RECOVERY_EXHAUSTED_RETRY_MS,
  ICON_RECOVERY_FETCH_TIMEOUT_MS,
  ICON_RECOVERY_HIGH_QUALITY_SIDE,
  ICON_RECOVERY_MAX_ATTEMPTS,
  ICON_RECOVERY_QUEUE_VERSION,
  ICON_RECOVERY_RETRY_DELAYS_MS,
  ICON_RECOVERY_WATCHDOG_MS,
  LEGACY_ICON_HYDRATION_ALARM,
  LEGACY_SESSION_ICON_HYDRATION_FAILURES_KEY,
  LOCAL_ASSET_GC_KEY,
  LOCAL_ICON_RECOVERY_QUEUE_KEY,
  LOCAL_ICON_RECOVERY_STATUS_KEY,
  LOCAL_MAINTENANCE_MIGRATIONS_KEY,
  LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX,
  LOCAL_PENDING_SYNC_MUTATION_KEY,
  LOCAL_PRE_SPACES_BACKUP_KEY,
  LOCAL_STATE_KEY,
  MAX_EXPECTATIONS,
  PENDING_NAVIGATION_MAX_ENTRIES,
  PENDING_NAVIGATION_TTL_MS,
  PRODUCT_NAME,
  SESSION_LOCAL_IGNORE_KEY,
  SESSION_PENDING_NAVIGATIONS_KEY,
  SESSION_SYNC_EXPECTATIONS_KEY,
  SYNC_ASSET_CHUNK_CHARS,
  SYNC_ASSET_PREFIX,
  SYNC_CORE_RESERVE_BYTES,
  SYNC_DATASET_KEY,
  SYNC_DEVICE_SNAPSHOT_PREFIX,
  SYNC_ITEM_PREFIX,
  SYNC_PREFIX,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_BYTES_PER_ITEM,
  SYNC_QUOTA_MAX_ITEMS,
  SYNC_SETTINGS_KEY,
  SYNC_SPACE_PREFIX,
  SYNC_SCHEMA_VERSION,
  SYNC_WATCH_ALARM,
  SYNC_WATCH_PERIOD_MINUTES,
  TOMBSTONE_TTL_MS,
  VERSION,
  WEB_ACCESS_CACHE_MS
} from "../core/constants.js";
import {
  assetIdForDataUrl,
  chooseNewerRecord,
  collectLocalAssetsNormalized,
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  makeTombstone,
  localStateSyncClockSignature,
  localStateSyncRawSignature,
  localStateSyncSignature,
  mergeRecordMaps,
  newestRecordTimestamp,
  nextMutationTime,
  normalizeState,
  replaceWorkspaceNormalized,
  settingsRecordEqual,
  stableStringify,
  stateFromRecords,
  syncRecordEqual,
  uid,
  workspaceStateNormalized
} from "../core/model.js";
import {
  createWriteBaseline,
  ensureLocalStorage,
  readLocalMeta,
  writeLocalMeta,
  writeLocalState
} from "../core/storage.js";
import { cleanupLegacyWebOriginPermissions } from "../core/permissions.js";
import { compactSignature as compactRuntimeSignature, countOwnEnumerable, hasOwnEnumerable, pruneExpectationMap as pruneRuntimeExpectationMap, pruneSessionEntries as pruneRuntimeSessionEntries, syncNamespaceFor } from "./runtime-utils.js";
import { devMark, devMeasure } from "../core/perf.js";
import { isSafeSelfContainedSvgText, svgRasterDimensionsFromText } from "../core/svg-safety.js";

let queue = Promise.resolve();
const ignoredLocalStateSignatures = new Map();
const expectedSyncChanges = new Map();
const REMOVED = Symbol("removed");
const ASSET_GC_MIN_OBSERVATION_GAP_MS = 12 * 60 * 60 * 1000;
const ASSET_GC_LEDGER_VERSION = 1;
const pendingShortcutNavigations = new Map();
const TAB_FAVICON_LEARN_CONCURRENCY = 3;
const tabFaviconLearningJobs = new Map();
const tabFaviconLearningQueue = [];
let activeTabFaviconLearningJobs = 0;
let iconRecoveryRun = null;
let iconRecoveryContinuationTimer = null;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let webAccessCacheValue = null;
let webAccessCacheAt = 0;

const PERSONAL_SPACE_ID = "personal";
const WORK_SPACE_ID = "work";

function syncNamespace(spaceId = PERSONAL_SPACE_ID) {
  return syncNamespaceFor(spaceId, { personalSpaceId: PERSONAL_SPACE_ID, syncPrefix: SYNC_PREFIX, syncSettingsKey: SYNC_SETTINGS_KEY, syncDatasetKey: SYNC_DATASET_KEY, syncItemPrefix: SYNC_ITEM_PREFIX, syncAssetPrefix: SYNC_ASSET_PREFIX, syncSpacePrefix: SYNC_SPACE_PREFIX });
}

function pruneExpectationMap(map) { pruneRuntimeExpectationMap(map, { max: MAX_EXPECTATIONS }); }

function compactSignature(signature) { return compactRuntimeSignature(signature, REMOVED); }

function pruneSessionEntries(entries) { return pruneRuntimeSessionEntries(entries, { max: MAX_EXPECTATIONS }); }

function rememberLocalSignature(signature) {
  pruneExpectationMap(ignoredLocalStateSignatures);
  ignoredLocalStateSignatures.set(signature, Date.now() + EXPECTATION_TTL_MS);
}

function consumeLocalSignature(signature) {
  const expiresAt = ignoredLocalStateSignatures.get(signature) || 0;
  ignoredLocalStateSignatures.delete(signature);
  return expiresAt >= Date.now();
}

async function rememberDurableLocalSignature(signature) {
  if (!browser.storage.session) return;
  try {
    const fingerprint = compactSignature(signature);
    const stored = await browser.storage.session.get(SESSION_LOCAL_IGNORE_KEY);
    const entries = pruneSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY]);
    entries[fingerprint] = Date.now() + EXPECTATION_TTL_MS;
    await browser.storage.session.set({ [SESSION_LOCAL_IGNORE_KEY]: entries });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not persist local write suppression`, error);
  }
}

async function consumeDurableLocalSignature(signature) {
  if (!browser.storage.session) return false;
  try {
    const fingerprint = compactSignature(signature);
    const stored = await browser.storage.session.get(SESSION_LOCAL_IGNORE_KEY);
    const entries = pruneSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY]);
    const expiresAt = Number(entries[fingerprint]) || 0;
    delete entries[fingerprint];
    await browser.storage.session.set({ [SESSION_LOCAL_IGNORE_KEY]: entries });
    return expiresAt >= Date.now();
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read local write suppression`, error);
    return false;
  }
}

async function forgetDurableLocalSignature(signature) {
  if (!browser.storage.session || !signature) return;
  try {
    const fingerprint = compactSignature(signature);
    const stored = await browser.storage.session.get(SESSION_LOCAL_IGNORE_KEY);
    const entries = pruneSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY]);
    if (!Object.prototype.hasOwnProperty.call(entries, fingerprint)) return;
    delete entries[fingerprint];
    await browser.storage.session.set({ [SESSION_LOCAL_IGNORE_KEY]: entries });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not roll back local write suppression`, error);
  }
}

function rememberSyncChange(key, signature) {
  pruneExpectationMap(expectedSyncChanges);
  expectedSyncChanges.set(key, { signature, expiresAt: Date.now() + EXPECTATION_TTL_MS });
}

function consumeSyncChange(key, signature) {
  const expected = expectedSyncChanges.get(key);
  expectedSyncChanges.delete(key);
  return Boolean(expected && expected.expiresAt >= Date.now() && expected.signature === signature);
}

async function rememberDurableSyncChanges(entries) {
  if (!browser.storage.session || !entries.length) return;
  try {
    const stored = await browser.storage.session.get(SESSION_SYNC_EXPECTATIONS_KEY);
    const expectations = pruneSessionEntries(stored?.[SESSION_SYNC_EXPECTATIONS_KEY]);
    const expiresAt = Date.now() + EXPECTATION_TTL_MS;
    for (const [key, signature] of entries) {
      expectations[key] = { signature: compactSignature(signature), expiresAt };
    }
    await browser.storage.session.set({ [SESSION_SYNC_EXPECTATIONS_KEY]: expectations });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not persist Sync write suppression`, error);
  }
}

async function consumeDurableSyncChanges(entries) {
  if (!browser.storage.session || !entries.length) return entries.length > 0;
  try {
    const stored = await browser.storage.session.get(SESSION_SYNC_EXPECTATIONS_KEY);
    const expectations = pruneSessionEntries(stored?.[SESSION_SYNC_EXPECTATIONS_KEY]);
    let hasExternalChange = false;
    for (const [key, signature] of entries) {
      const expected = expectations[key];
      delete expectations[key];
      if (!expected || expected.expiresAt < Date.now() || expected.signature !== compactSignature(signature)) {
        hasExternalChange = true;
      }
    }
    await browser.storage.session.set({ [SESSION_SYNC_EXPECTATIONS_KEY]: expectations });
    return hasExternalChange;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read Sync write suppression`, error);
    return true;
  }
}

function validPendingNavigation(value) {
  return value && typeof value.shortcutId === "string" && value.shortcutId && Number(value.expiresAt) >= Date.now();
}

function prunePendingNavigationMemory() {
  for (const [tabId, value] of pendingShortcutNavigations) {
    if (!validPendingNavigation(value)) pendingShortcutNavigations.delete(tabId);
  }
  while (pendingShortcutNavigations.size >= PENDING_NAVIGATION_MAX_ENTRIES) {
    pendingShortcutNavigations.delete(pendingShortcutNavigations.keys().next().value);
  }
}

function prunePendingNavigationEntries(entries) {
  const valid = [];
  for (const [key, value] of Object.entries(entries || {})) {
    if (validPendingNavigation(value)) valid.push([key, value]);
  }
  valid.sort((a, b) => Number(b[1].expiresAt) - Number(a[1].expiresAt));
  return Object.fromEntries(valid.slice(0, PENDING_NAVIGATION_MAX_ENTRIES));
}

async function rememberPendingShortcutNavigation(tabId, shortcutId) {
  if (!Number.isInteger(tabId) || typeof shortcutId !== "string" || !shortcutId) return { ok: false };
  const value = { shortcutId, expiresAt: Date.now() + PENDING_NAVIGATION_TTL_MS };
  prunePendingNavigationMemory();
  pendingShortcutNavigations.set(tabId, value);
  if (browser.storage.session) {
    try {
      const stored = await browser.storage.session.get(SESSION_PENDING_NAVIGATIONS_KEY);
      const entries = prunePendingNavigationEntries(stored?.[SESSION_PENDING_NAVIGATIONS_KEY]);
      entries[String(tabId)] = value;
      await browser.storage.session.set({
        [SESSION_PENDING_NAVIGATIONS_KEY]: prunePendingNavigationEntries(entries)
      });
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: could not persist pending shortcut navigation`, error);
    }
  }
  return { ok: true };
}

async function readPendingShortcutNavigation(tabId) {
  const memory = pendingShortcutNavigations.get(tabId);
  if (validPendingNavigation(memory)) return memory;
  pendingShortcutNavigations.delete(tabId);
  if (!browser.storage.session || !Number.isInteger(tabId)) return null;
  try {
    const stored = await browser.storage.session.get(SESSION_PENDING_NAVIGATIONS_KEY);
    const rawEntries = stored?.[SESSION_PENDING_NAVIGATIONS_KEY] || {};
    const value = rawEntries[String(tabId)];
    const entries = prunePendingNavigationEntries(rawEntries);
    if (Object.keys(entries).length !== Object.keys(rawEntries).length) {
      await browser.storage.session.set({ [SESSION_PENDING_NAVIGATIONS_KEY]: entries });
    }
    if (!validPendingNavigation(value)) return null;
    prunePendingNavigationMemory();
    pendingShortcutNavigations.set(tabId, value);
    return value;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read pending shortcut navigation`, error);
    return null;
  }
}

async function clearPendingShortcutNavigation(tabId) {
  pendingShortcutNavigations.delete(tabId);
  if (!browser.storage.session || !Number.isInteger(tabId)) return;
  try {
    const stored = await browser.storage.session.get(SESSION_PENDING_NAVIGATIONS_KEY);
    const entries = { ...(stored?.[SESSION_PENDING_NAVIGATIONS_KEY] || {}) };
    if (!(String(tabId) in entries)) return;
    delete entries[String(tabId)];
    await browser.storage.session.set({ [SESSION_PENDING_NAVIGATIONS_KEY]: entries });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not clear pending shortcut navigation`, error);
  }
}

function enqueue(task, { persistSyncError = true } = {}) {
  const run = queue.then(task);
  queue = run.catch(async error => {
    console.error(`${PRODUCT_NAME}: background task failed`, error);
    if (!persistSyncError) return;
    try {
      const meta = await readLocalMeta();
      await writeLocalMeta({
        ...meta,
        syncStatus: meta.syncEnabled ? "error" : "off",
        lastSyncError: error?.message || String(error)
      });
    } catch (metaError) {
      console.error(`${PRODUCT_NAME}: could not persist sync error`, metaError);
    }
  });
  return run.catch(error => ({ ok: false, error: error?.message || String(error) }));
}

async function openMosaicHomeTab() {
  try {
    await browser.tabs.create({ url: browser.runtime.getURL("newtab/newtab.html"), active: true });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not open MosaicSync home`, error);
  }
}

async function ensureSyncWatchAlarm(meta) {
  if (!browser.alarms?.create || !browser.alarms?.clear) return;
  try {
    if (meta?.syncEnabled) {
      const existing = browser.alarms.get ? await browser.alarms.get(SYNC_WATCH_ALARM) : null;
      const existingPeriod = Number(existing?.periodInMinutes) || 0;
      if (!existing || Math.abs(existingPeriod - SYNC_WATCH_PERIOD_MINUTES) > 0.001) {
        if (existing) await browser.alarms.clear(SYNC_WATCH_ALARM);
        await browser.alarms.create(SYNC_WATCH_ALARM, {
          delayInMinutes: 0.5,
          periodInMinutes: SYNC_WATCH_PERIOD_MINUTES
        });
      }
    } else {
      await browser.alarms.clear(SYNC_WATCH_ALARM);
    }
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not configure Sync watch alarm`, error);
  }
}

// -----------------------------------------------------------------------------
// Firefox lifecycle / event listeners
// -----------------------------------------------------------------------------
browser.runtime.onInstalled.addListener(details => {
  const lifecycle = enqueue(async () => {
    const { meta } = await ensureLocalStorage();
    let nextMeta = meta;

    // A genuine fresh install always starts with an incomplete onboarding
    // marker. This makes the first-run flow deterministic even if a profile
    // had stale development state from an earlier temporary build. Updates do
    // not reset completed onboarding.
    if (details.reason === "install") {
      try { await browser.storage.local.remove([LOCAL_ICON_RECOVERY_QUEUE_KEY, LOCAL_ICON_RECOVERY_STATUS_KEY]); } catch {}
      try { await clearAllPendingSyncRecoveryState(); } catch {}
      nextMeta = await writeLocalMeta({
        ...meta,
        // Treat a genuine install as a new device bootstrap even if a
        // development profile unexpectedly retained extension-local metadata.
        // The layout itself is preserved until the user chooses a source, but
        // Sync permission/source state must be chosen again explicitly.
        syncEnabled: false,
        syncInitialized: false,
        syncBootstrapMode: "none",
        syncStatus: "off",
        lastSyncAt: 0,
        lastSyncError: "",
        lastSyncWarning: "",
        syncSkippedAssets: 0,
        syncFastSnapshotFallback: false,
        onboardingCompleted: false,
        onboardingVersion: "",
        syncWaitStartedAt: 0,
        lastAppliedSyncRevision: "",
      lastAppliedWorkSyncRevision: "",
        lastAppliedDeviceSnapshotRevision: "",
        lastRemoteReceiptAt: 0,
        lastRemoteReceiptRevision: "",
        lastRemoteReceiptUpdatedAt: 0,
        lastRemoteReceiptOriginDeviceId: ""
      });
    }

    if (!nextMeta.onboardingCompleted) {
      try {
        await browser.tabs.create({ url: browser.runtime.getURL("welcome/welcome.html"), active: true });
      } catch (error) {
        // The New Tab page has its own onboarding redirect, so failing to open
        // a foreground Welcome tab here cannot leave the extension unconfigured.
        console.warn(`${PRODUCT_NAME}: could not foreground Welcome`, error);
      }
    }

    await ensureSyncWatchAlarm(nextMeta);
    await runOneTimeLegacyMaintenance();
    // Do not reconcile during install/update. The user must first choose the
    // local or synchronized source in onboarding.
    return nextMeta;
  });
  void lifecycle.then(meta => {
    if (details.reason !== "install" && meta?.onboardingCompleted) {
      const previousVersion = String(details.previousVersion || "");
      const resolverQualityUpgrade = /^1\.24\.14(?:\.[1234])?$/.test(previousVersion);
      return requestMissingShortcutIconHydration({
        // Resolver changes reset exhausted retry backoff once so existing
        // automatically learned icons can benefit immediately after upgrade.
        force: (VERSION === "1.24.7b" && /^1\.24\.7$/.test(previousVersion)) || resolverQualityUpgrade,
        // 1.20.9 treated the first valid favicon.ico as final. 1.24.14c also
        // recovers declared site artwork from the original public root when an
        // authenticated deep link redirects to a login provider, so re-check
        // 1.24.14 through 1.24.14c device-local favicons once without touching uploads.
        upgradeRecoveredFavicons: /^1\.20\.9(?:\.|$)/.test(previousVersion) || resolverQualityUpgrade
      });
    }
    return null;
  }).catch(() => {});
});

browser.action?.onClicked?.addListener(() => {
  void openMosaicHomeTab();
});

browser.runtime.onStartup.addListener(() => {
  const lifecycle = enqueue(async () => {
    let { meta } = await ensureLocalStorage();
    await ensureSyncWatchAlarm(meta);
    await runOneTimeLegacyMaintenance();
    if (meta.syncEnabled && meta.syncInitialized) {
      meta = await retryPendingLocalSyncMutation(meta);
      // reconcile("merge") replays any durable cross-Space transactions first.
      await reconcile("merge");
    } else if (meta.syncEnabled && meta.syncBootstrapMode === "await-remote") {
      await reconcile("merge");
    }
    return readLocalMeta();
  });
  void lifecycle.then(meta => {
    if (meta?.onboardingCompleted) return requestMissingShortcutIconHydration();
    return null;
  }).catch(() => {});
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    const stateChange = changes[LOCAL_STATE_KEY];
    if (!stateChange?.newValue) return;
    // Device-local asset pixels are stored outside LOCAL_STATE_KEY in 1.24.6.
    // Reject cache-only/ref-only changes from the compact state before any exact
    // semantic normalization. Legacy shapes still fall through safely.
    const quickSignature = localStateSyncClockSignature(stateChange.newValue);
    const previousQuickSignature = stateChange.oldValue ? localStateSyncClockSignature(stateChange.oldValue) : "";
    if (quickSignature && previousQuickSignature && quickSignature === previousQuickSignature) {
      // Clocks make cache-only writes overwhelmingly likely, but verify the raw
      // Sync projection too. This keeps the optimization safe even if an older
      // caller ever changes a core field without advancing its workspace clock.
      const rawSignature = localStateSyncRawSignature(stateChange.newValue);
      const previousRawSignature = localStateSyncRawSignature(stateChange.oldValue);
      if (rawSignature && rawSignature === previousRawSignature) return;
    }
    const signature = localStateSyncSignature(stateChange.newValue);
    const previousSignature = stateChange.oldValue ? localStateSyncSignature(stateChange.oldValue) : "";
    if (previousSignature && previousSignature === signature) return;
    if (consumeLocalSignature(signature)) return;

    enqueue(async () => {
      if (await consumeDurableLocalSignature(signature)) return;
      const meta = await readLocalMeta();
      // Never publish a fresh/empty profile merely because Sync permission was
      // granted. A device must first be explicitly bootstrapped from local or
      // synchronized data.
      if (meta.syncEnabled && meta.syncInitialized) {
        const pending = await readPendingLocalSyncMutation();
        if (pending) {
          await pushLocalMutation(pending.before, pending.after, meta);
          await clearPendingLocalSyncMutation(pending.journalId);
        } else {
          await pushLocalMutation(stateChange.oldValue, stateChange.newValue, meta);
        }
      }
    });
    return;
  }

  if (areaName !== "sync") return;
  const relevant = Object.entries(changes).filter(([key]) => key.startsWith(SYNC_PREFIX));
  if (!relevant.length) return;

  const unresolvedChanges = [];
  for (const [key, change] of relevant) {
    const actual = change.newValue === undefined ? REMOVED : stableStringify(change.newValue);
    if (!consumeSyncChange(key, actual)) unresolvedChanges.push([key, actual]);
  }

  if (unresolvedChanges.length) {
    enqueue(async () => {
      if (!(await consumeDurableSyncChanges(unresolvedChanges))) return;
      const meta = await readLocalMeta();
      if (!meta.syncEnabled) return;
      // A new computer can wait safely for Firefox itself to download the
      // extension's storage.sync data. As soon as it arrives, restore it.
      if (!meta.syncInitialized && meta.syncBootstrapMode === "await-remote") {
        await bootstrapRemote({ waitIfMissing: true });
        return;
      }
      if (meta.syncInitialized) {
        // reconcile("merge") replays any durable cross-Space transactions first.
        await reconcile("merge");
      }
    });
  }
});

browser.alarms?.onAlarm?.addListener(alarm => {
  if (alarm?.name === LEGACY_ICON_HYDRATION_ALARM) {
    void Promise.resolve(browser.alarms?.clear?.(LEGACY_ICON_HYDRATION_ALARM)).catch(() => {});
    return;
  }
  if (alarm?.name === ICON_RECOVERY_ALARM) {
    void processIconRecoveryQueue().catch(error => {
      console.warn(`${PRODUCT_NAME}: scheduled favicon recovery failed`, error);
    });
    return;
  }
  if (alarm?.name !== SYNC_WATCH_ALARM) return;
  enqueue(async () => {
    let meta = await readLocalMeta();
    if (!meta.syncEnabled) {
      await ensureSyncWatchAlarm(meta);
      return;
    }
    if (!meta.syncInitialized && meta.syncBootstrapMode === "await-remote") {
      await bootstrapRemote({ waitIfMissing: true });
      return;
    }
    if (meta.syncInitialized) {
      meta = await retryPendingLocalSyncMutation(meta);
      meta = await retryPendingCrossSpaceSync(meta);
      // The watchdog performs a strong semantic consistency check, not only a
      // commit-marker comparison. If currently usable remote records/settings
      // differ from local state, reconcileIfNewCommit() falls through to the
      // same full merge used at startup without paying that cost on every tick.
      await reconcileIfNewCommit();
      meta = await readLocalMeta();
      await maybeGarbageCollectStaleDeviceSnapshots(meta);
    }
  });
});

browser.permissions?.onAdded?.addListener(permissions => {
  const origins = Array.isArray(permissions?.origins) ? permissions.origins : [];
  const webAccessChanged = origins.some(origin => WEB_ORIGINS.includes(origin));
  if (!webAccessChanged) return;
  webAccessCacheValue = true;
  webAccessCacheAt = Date.now();
  // A fresh grant can improve already-present browser/native or low-resolution
  // artwork as well as fill genuinely missing icons. Re-seed both classes.
  void requestMissingShortcutIconHydration({ force: true, upgradeRecoveredFavicons: true }).catch(error => {
    console.warn(`${PRODUCT_NAME}: could not resume favicon recovery after website access was granted`, error);
  });
});

browser.permissions?.onRemoved?.addListener(permissions => {
  const origins = Array.isArray(permissions?.origins) ? permissions.origins : [];
  const webAccessChanged = origins.some(origin => WEB_ORIGINS.includes(origin));
  if (webAccessChanged) {
    webAccessCacheValue = false;
    webAccessCacheAt = Date.now();
    // Quality-only work exists solely to improve already-useful site/browser
    // artwork through remote discovery. Once Website Access is revoked, drop
    // those jobs rather than leaving them indefinitely pending. A later grant
    // explicitly re-seeds recovered favicons for quality upgrade. Missing-icon
    // jobs remain eligible for any permission-free platform source.
    void (async () => {
      // Sequence pruning before any native-only re-seed. Running these as two
      // detached promises would let the seeder re-persist a quality-only item
      // from the old queue after the prune completed.
      await dropIconRecoveryQualityJobs();
      if (platformHasPermissionFreeFaviconSource()) {
        // Chromium can still satisfy genuinely missing icons from its browser-local cache.
        await requestMissingShortcutIconHydration({ force: true });
      } else {
        await browser.alarms?.clear?.(ICON_RECOVERY_ALARM);
      }
    })().catch(() => {});
  }
  // Chrome has no Firefox-style data-collection permission to revoke.

});

const REMOTE_IMAGE_MAX_BYTES = 250_000;
const REMOTE_IMAGE_MAX_DECODE_DIMENSION = 4096;
const REMOTE_IMAGE_MAX_DECODED_PIXELS = 8_000_000;
const FAVICON_LOCAL_TARGET_BYTES = 16_000;
const FAVICON_LOCAL_MAX_SIDE = 192;
const REMOTE_HTML_HEAD_MAX_BYTES = 256_000;
const REMOTE_MANIFEST_MAX_BYTES = 128_000;
const REMOTE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);
const WEB_ORIGINS = Object.freeze(["http://*/*", "https://*/*"]);

function httpOriginPattern(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return "";
  }
}

async function hasWebAccess({ refresh = false } = {}) {
  if (!browser.permissions?.contains) return false;
  const now = Date.now();
  if (!refresh && webAccessCacheValue !== null && now - webAccessCacheAt < WEB_ACCESS_CACHE_MS) return webAccessCacheValue;
  try {
    webAccessCacheValue = await browser.permissions.contains({ origins: [...WEB_ORIGINS] });
  } catch {
    webAccessCacheValue = false;
  }
  webAccessCacheAt = now;
  return webAccessCacheValue;
}

async function canReadOrigin(value) {
  if (!httpOriginPattern(value)) return false;
  return hasWebAccess();
}

function bytesToBase64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

async function readBoundedResponseBytes(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length")) || 0;
  if (declaredLength > maxBytes) return { ok: false, reason: "too-large", bytes: null };
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= maxBytes
      ? { ok: true, reason: "", bytes }
      : { ok: false, reason: bytes.length ? "too-large" : "empty", bytes: null };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      total += value.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        return { ok: false, reason: "too-large", bytes: null };
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }
  if (!total) return { ok: false, reason: "empty", bytes: null };
  if (chunks.length === 1) return { ok: true, reason: "", bytes: chunks[0] };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: true, reason: "", bytes };
}

async function fetchBoundedResource(value, { maxBytes, deadlineAt }) {
  if (!(await canReadOrigin(value))) return { ok: false, reason: "permission", url: value, type: "", bytes: null };
  const remaining = Math.max(0, Number(deadlineAt) - Date.now());
  if (remaining <= 0) return { ok: false, reason: "timeout", url: value, type: "", bytes: null };
  const timeoutMs = Math.max(250, Math.min(4_000, remaining));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(value, {
      credentials: "omit",
      cache: "force-cache",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    if (!response.ok) return { ok: false, reason: `http-${response.status}`, url: response.url || value, type: "", bytes: null };
    const body = await readBoundedResponseBytes(response, maxBytes);
    if (!body.ok) return { ok: false, reason: body.reason, url: response.url || value, type: "", bytes: null };
    return {
      ok: true,
      reason: "",
      url: response.url || value,
      type: String(response.headers.get("content-type") || "").toLowerCase().split(";")[0],
      bytes: body.bytes
    };
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === "AbortError";
    return { ok: false, reason: timedOut ? "timeout" : "network", url: value, type: "", bytes: null };
  } finally {
    clearTimeout(timeout);
  }
}

function sniffImageMime(bytes, declaredType = "") {
  const declared = String(declaredType || "").toLowerCase().split(";")[0];
  if (!bytes?.length) return "";

  // Trust file signatures before HTTP/data-URL MIME labels. Favicon servers
  // commonly return PNG bytes as image/x-icon (and occasionally the reverse).
  // The fail-closed geometry guard exposed those harmless
  // MIME mismatches as missing icons because the wrong header parser was used.
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";

  const prefix = textDecoder.decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/^\s*<!--(?:.|\n|\r)*?-->\s*/i, "")
    .trimStart();
  if (/^<svg(?:\s|>)/i.test(prefix)) return "image/svg+xml";

  // A declared raster type is still useful when its format has no stronger
  // signature at byte zero, but it remains subject to the fail-closed geometry
  // parser before any browser decoder is called.
  if (REMOTE_IMAGE_TYPES.has(declared)) return declared;
  return declared === "image/svg+xml" ? "image/svg+xml" : "";
}

function decodeInlineFaviconResource(value) {
  if (typeof value !== "string" || value.length > REMOTE_IMAGE_MAX_BYTES * 2) {
    return { ok: false, reason: "too-large", type: "", bytes: null };
  }
  const comma = value.indexOf(",");
  if (comma <= 5) return { ok: false, reason: "unsupported-image", type: "", bytes: null };
  const header = value.slice(5, comma);
  const parts = header.split(";").map(part => part.trim()).filter(Boolean);
  const declaredType = String(parts.shift() || "").toLowerCase();
  const parameters = parts.map(part => part.toLowerCase());
  if (parameters.some(part => part !== "base64" && !part.startsWith("charset="))) {
    return { ok: false, reason: "unsupported-image", type: "", bytes: null };
  }
  const isBase64 = parameters.includes("base64");
  const isSupportedRaster = REMOTE_IMAGE_TYPES.has(declaredType);
  const isSvg = declaredType === "image/svg+xml";
  if (!isSupportedRaster && !isSvg) return { ok: false, reason: "unsupported-image", type: "", bytes: null };

  try {
    let bytes;
    const payload = value.slice(comma + 1);
    if (isBase64) {
      const compact = payload.replace(/[\t\n\f\r ]+/g, "");
      if (!compact || compact.length > Math.ceil(REMOTE_IMAGE_MAX_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
        return { ok: false, reason: "too-large", type: "", bytes: null };
      }
      const binary = atob(compact);
      if (!binary.length || binary.length > REMOTE_IMAGE_MAX_BYTES) return { ok: false, reason: "too-large", type: "", bytes: null };
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else if (isSvg) {
      // Non-base64 inline SVG is legal in favicon metadata. Decode it only into
      // bounded bytes and send it through the existing self-contained SVG
      // validator/rasterizer; non-base64 raster data URLs are intentionally not
      // supported because browsers conventionally encode those as base64.
      const decoded = decodeURIComponent(payload);
      bytes = new TextEncoder().encode(decoded);
      if (!bytes.length || bytes.length > REMOTE_IMAGE_MAX_BYTES) return { ok: false, reason: "too-large", type: "", bytes: null };
    } else {
      return { ok: false, reason: "unsupported-image", type: "", bytes: null };
    }
    const type = sniffImageMime(bytes, declaredType);
    if (!type) return { ok: false, reason: "unsupported-image", type: "", bytes: null };
    return { ok: true, reason: "", type, bytes };
  } catch {
    return { ok: false, reason: "unsupported-image", type: "", bytes: null };
  }
}

function imageDimensionsFromBytes(bytes, type) {
  if (!bytes?.length) return { width: 0, height: 0 };
  const readU16LE = offset => offset + 1 < bytes.length ? bytes[offset] | (bytes[offset + 1] << 8) : 0;
  const readU32LE = offset => offset + 3 < bytes.length
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | ((bytes[offset + 3] << 24) >>> 0)) >>> 0
    : 0;
  const readU32BE = offset => offset + 3 < bytes.length
    ? (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    : 0;

  if (type === "image/png" && bytes.length >= 24) {
    return { width: readU32BE(16), height: readU32BE(20) };
  }
  if (type === "image/gif" && bytes.length >= 10) {
    return { width: readU16LE(6), height: readU16LE(8) };
  }
  if ((type === "image/x-icon" || type === "image/vnd.microsoft.icon") && bytes.length >= 6) {
    const count = Math.min(readU16LE(4), 64);
    let bestWidth = 0;
    let bestHeight = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      if (offset + 15 >= bytes.length) break;
      let width = bytes[offset] || 256;
      let height = bytes[offset + 1] || 256;
      const payloadSize = readU32LE(offset + 8);
      const payloadOffset = readU32LE(offset + 12);
      if (payloadSize && payloadOffset < bytes.length && payloadOffset + Math.min(payloadSize, 24) <= bytes.length) {
        if (payloadOffset + 24 <= bytes.length &&
            bytes[payloadOffset] === 0x89 && bytes[payloadOffset + 1] === 0x50 &&
            bytes[payloadOffset + 2] === 0x4e && bytes[payloadOffset + 3] === 0x47 &&
            bytes[payloadOffset + 4] === 0x0d && bytes[payloadOffset + 5] === 0x0a &&
            bytes[payloadOffset + 6] === 0x1a && bytes[payloadOffset + 7] === 0x0a) {
          width = Math.max(width, readU32BE(payloadOffset + 16));
          height = Math.max(height, readU32BE(payloadOffset + 20));
        } else if (payloadOffset + 12 <= bytes.length) {
          // ICO bitmap payloads use either the 12-byte OS/2 core header (16-bit
          // geometry) or a Windows DIB header (32-bit geometry). The stored DIB
          // height commonly includes both the XOR bitmap and AND mask.
          const dibHeaderSize = readU32LE(payloadOffset);
          const dibWidth = dibHeaderSize === 12
            ? readU16LE(payloadOffset + 4)
            : (dibHeaderSize >= 40 ? readU32LE(payloadOffset + 4) : 0);
          const dibStoredHeight = dibHeaderSize === 12
            ? readU16LE(payloadOffset + 6)
            : (dibHeaderSize >= 40 ? readU32LE(payloadOffset + 8) : 0);
          if (dibWidth) width = Math.max(width, dibWidth);
          if (dibStoredHeight) height = Math.max(height, Math.ceil(dibStoredHeight / 2));
        }
      }
      if (Math.min(width, height) > Math.min(bestWidth, bestHeight)) {
        bestWidth = width;
        bestHeight = height;
      } else {
        bestWidth = Math.max(bestWidth, width);
        bestHeight = Math.max(bestHeight, height);
      }
    }
    return { width: bestWidth, height: bestHeight };
  }
  if (type === "image/jpeg" && bytes.length >= 4) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 1 >= bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6]
        };
      }
      offset += length;
    }
  }
  if (type === "image/webp" && bytes.length >= 25 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = readU16LE(26) & 0x3fff;
      const height = readU16LE(28) & 0x3fff;
      return { width, height };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
      const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
      return { width, height };
    }
  }
  return { width: 0, height: 0 };
}

function imageDimensionsSafeForRemoteDecode(dimensions) {
  const width = Math.max(0, Number(dimensions?.width) || 0);
  const height = Math.max(0, Number(dimensions?.height) || 0);
  // Unknown dimensions are not permission to hand untrusted compressed bytes to
  // the browser decoder. Every accepted remote raster format has a bounded
  // header parser; failure to obtain both sides therefore fails closed.
  if (!width || !height) return false;
  if (width > REMOTE_IMAGE_MAX_DECODE_DIMENSION || height > REMOTE_IMAGE_MAX_DECODE_DIMENSION) return false;
  if (width * height > REMOTE_IMAGE_MAX_DECODED_PIXELS) return false;
  return true;
}

function faviconQualitySide(candidate) {
  const width = Math.max(0, Number(candidate?.width) || 0);
  const height = Math.max(0, Number(candidate?.height) || 0);
  if (width && height) return Math.min(width, height);
  return Math.max(0, Number(candidate?.qualitySide) || 0, width, height);
}

function betterFaviconCandidate(current, candidate) {
  if (!candidate?.image) return current;
  if (!current?.image) return candidate;
  const currentSide = faviconQualitySide(current);
  const candidateSide = faviconQualitySide(candidate);
  if (candidateSide !== currentSide) return candidateSide > currentSide ? candidate : current;
  // Prefer page-declared artwork when measured quality is tied. It is more
  // likely to be the site's intentional modern asset than a legacy favicon.ico.
  return candidate.declared && !current.declared ? candidate : current;
}

async function encodeOptimizedFaviconBitmap(bitmap, { maxSide = FAVICON_LOCAL_MAX_SIDE, targetBytes = FAVICON_LOCAL_TARGET_BYTES } = {}) {
  if (!bitmap || typeof OffscreenCanvas !== "function") return null;
  const sourceWidth = Number(bitmap.width) || 0;
  const sourceHeight = Number(bitmap.height) || 0;
  if (!sourceWidth || !sourceHeight || !imageDimensionsSafeForRemoteDecode({ width: sourceWidth, height: sourceHeight })) return null;

  const ratio = Math.min(1, maxSide / sourceWidth, maxSide / sourceHeight);
  let width = Math.max(1, Math.round(sourceWidth * ratio));
  let height = Math.max(1, Math.round(sourceHeight * ratio));
  const minWidth = Math.min(width, 64);
  const minHeight = Math.min(height, 64);
  let best = null;

  for (let scalePass = 0; scalePass < 5; scalePass += 1) {
    const canvas = new OffscreenCanvas(width, height);
    try {
      const context = canvas.getContext("2d", { alpha: true });
      if (!context || typeof canvas.convertToBlob !== "function") return best;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.90, 0.80, 0.70, 0.58, 0.46]) {
        const blob = await canvas.convertToBlob({ type: "image/webp", quality });
        if (!blob?.size) continue;
        if (!best || blob.size < best.blob.size) best = { blob, width, height };
        if (blob.size <= targetBytes) return { blob, width, height };
      }
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
    const nextWidth = Math.max(minWidth, Math.round(width * 0.82));
    const nextHeight = Math.max(minHeight, Math.round(height * 0.82));
    if (nextWidth === width && nextHeight === height) break;
    width = nextWidth;
    height = nextHeight;
  }
  return best;
}

async function optimizedFaviconFromBytes(bytes, type, dimensions = { width: 0, height: 0 }) {
  if (!bytes?.length || typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  const largestSide = Math.max(Number(dimensions?.width) || 0, Number(dimensions?.height) || 0);
  if (!imageDimensionsSafeForRemoteDecode(dimensions)) return null;
  if (bytes.length <= FAVICON_LOCAL_TARGET_BYTES && (!largestSide || largestSide <= FAVICON_LOCAL_MAX_SIDE)) return null;
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type }));
    const encoded = await encodeOptimizedFaviconBitmap(bitmap);
    if (!encoded?.blob?.size) return null;
    // If the source was already compact and not oversized, preserving its exact
    // pixels is better than recompressing solely for a negligible byte saving.
    if (bytes.length <= FAVICON_LOCAL_TARGET_BYTES && largestSide && largestSide <= FAVICON_LOCAL_MAX_SIDE) return null;
    const output = new Uint8Array(await encoded.blob.arrayBuffer());
    return {
      image: `data:image/webp;base64,${bytesToBase64(output)}`,
      width: encoded.width,
      height: encoded.height
    };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

async function rasterizeSafeSvg(bytes) {
  if (!bytes?.length || bytes.length > REMOTE_IMAGE_MAX_BYTES) return { image: "", width: 0, height: 0 };
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return { image: "", width: 0, height: 0 };
  const source = textDecoder.decode(bytes);
  // Rasterize only a self-contained SVG subset. The pure validator rejects
  // script/event handlers, XML entities/stylesheets, embedded documents/images,
  // and every href/CSS url() that is not a same-document fragment reference.
  if (!isSafeSelfContainedSvgText(source)) return { image: "", width: 0, height: 0 };
  const declaredDimensions = svgRasterDimensionsFromText(source);
  if (!declaredDimensions.valid || !imageDimensionsSafeForRemoteDecode(declaredDimensions)) {
    return { image: "", width: 0, height: 0 };
  }
  let bitmap = null;
  try {
    const svgBlob = new Blob([bytes], { type: "image/svg+xml" });
    const declaredWidth = Math.max(1, Number(declaredDimensions.width) || 1);
    const declaredHeight = Math.max(1, Number(declaredDimensions.height) || 1);
    const declaredSide = Math.max(declaredWidth, declaredHeight);
    const scale = FAVICON_LOCAL_MAX_SIDE / declaredSide;
    const targetWidth = Math.max(1, Math.min(FAVICON_LOCAL_MAX_SIDE, Math.round(declaredWidth * scale)));
    const targetHeight = Math.max(1, Math.min(FAVICON_LOCAL_MAX_SIDE, Math.round(declaredHeight * scale)));
    // Never hand a remote SVG to an unbounded decoder call. Even if future SVG
    // geometry parsing gains another edge case, the browser is asked to produce
    // only a small tile-sized bitmap rather than the document's intrinsic size.
    bitmap = await createImageBitmap(svgBlob, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: "high"
    });
    const encoded = await encodeOptimizedFaviconBitmap(bitmap);
    if (!encoded?.blob?.size) return { image: "", width: 0, height: 0 };
    const resultBytes = new Uint8Array(await encoded.blob.arrayBuffer());
    return { image: `data:image/webp;base64,${bytesToBase64(resultBytes)}`, width: encoded.width, height: encoded.height };
  } catch {
    return { image: "", width: 0, height: 0 };
  } finally {
    bitmap?.close?.();
  }
}

async function fetchImageDataUrlDetailed(value, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS, declared = false, qualityHint = 0 } = {}) {
  const inline = typeof value === "string" && /^data:/i.test(value);
  if (inline && !declared) return { image: "", sourceUrl: "", reason: "unsupported-image", width: 0, height: 0, qualitySide: 0, declared };
  const resource = inline
    ? decodeInlineFaviconResource(value)
    : await fetchBoundedResource(value, { maxBytes: REMOTE_IMAGE_MAX_BYTES, deadlineAt });
  const sourceUrl = inline ? "" : (resource.url || value);
  if (!resource.ok) return { image: "", sourceUrl, reason: resource.reason, width: 0, height: 0, qualitySide: 0, declared };
  const type = inline ? resource.type : sniffImageMime(resource.bytes, resource.type);
  if (!type) return { image: "", sourceUrl, reason: "unsupported-image", width: 0, height: 0, qualitySide: 0, declared };
  if (type === "image/svg+xml") {
    const raster = await rasterizeSafeSvg(resource.bytes);
    return raster.image
      ? { ...raster, qualitySide: Math.min(raster.width, raster.height), sourceUrl, reason: "", declared }
      : { image: "", sourceUrl, reason: "unsupported-svg", width: 0, height: 0, qualitySide: 0, declared };
  }
  const dimensions = imageDimensionsFromBytes(resource.bytes, type);
  if (!imageDimensionsSafeForRemoteDecode(dimensions)) {
    return { image: "", sourceUrl, reason: "image-too-large", width: 0, height: 0, qualitySide: 0, declared };
  }
  const optimized = await optimizedFaviconFromBytes(resource.bytes, type, dimensions);
  const width = optimized?.width || dimensions.width;
  const height = optimized?.height || dimensions.height;
  return {
    image: optimized?.image || `data:${type};base64,${bytesToBase64(resource.bytes)}`,
    sourceUrl,
    reason: "",
    width,
    height,
    qualitySide: dimensions.width && dimensions.height ? Math.min(dimensions.width, dimensions.height) : Math.max(0, Number(qualityHint) || 0),
    declared
  };
}

async function fetchImageDataUrl(value) {
  return (await fetchImageDataUrlDetailed(value)).image || "";
}
async function normalizeLocalFaviconDataUrl(image) {
  if (typeof image !== "string" || image.length <= 22_000) return image;
  const match = /^data:(image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon));base64,(.+)$/i.exec(image);
  if (!match) return image;
  try {
    const binary = atob(match[2]);
    if (!binary.length || binary.length > REMOTE_IMAGE_MAX_BYTES) return image;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const type = sniffImageMime(bytes, match[1].toLowerCase());
    if (!type || type === "image/svg+xml") return "";
    const dimensions = imageDimensionsFromBytes(bytes, type);
    if (!imageDimensionsSafeForRemoteDecode(dimensions)) return "";
    const optimized = await optimizedFaviconFromBytes(bytes, type, dimensions);
    return optimized?.image || image;
  } catch {
    return image;
  }
}


function htmlAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

async function fetchHtmlHead(pageUrl, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS } = {}) {
  if (!(await canReadOrigin(pageUrl))) return { ok: false, reason: "permission", finalPageUrl: pageUrl, text: "" };
  const remaining = Math.max(0, Number(deadlineAt) - Date.now());
  if (remaining <= 0) return { ok: false, reason: "timeout", finalPageUrl: pageUrl, text: "" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(4_000, remaining)));
  try {
    const response = await fetch(pageUrl, {
      credentials: "omit",
      cache: "force-cache",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    const finalPageUrl = response.url || pageUrl;
    if (!response.ok) return { ok: false, reason: `http-${response.status}`, finalPageUrl, text: "" };
    const type = String(response.headers.get("content-type") || "").toLowerCase().split(";")[0];
    if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      return { ok: false, reason: "not-html", finalPageUrl, text: "" };
    }
    if (!response.body?.getReader) {
      const declaredLength = Number(response.headers.get("content-length")) || 0;
      if (declaredLength > REMOTE_HTML_HEAD_MAX_BYTES) return { ok: false, reason: "too-large", finalPageUrl, text: "" };
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > REMOTE_HTML_HEAD_MAX_BYTES) return { ok: false, reason: "too-large", finalPageUrl, text: "" };
      const text = textDecoder.decode(bytes);
      const headEnd = text.search(/<\/head\s*>/i);
      return { ok: true, reason: "", finalPageUrl, text: headEnd >= 0 ? text.slice(0, headEnd + 7) : text };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let total = 0;
    try {
      while (total < REMOTE_HTML_HEAD_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        total += value.length;
        if (total > REMOTE_HTML_HEAD_MAX_BYTES) {
          const allowed = value.length - (total - REMOTE_HTML_HEAD_MAX_BYTES);
          if (allowed > 0) text += decoder.decode(value.subarray(0, allowed), { stream: true });
          break;
        }
        text += decoder.decode(value, { stream: true });
        const headEnd = text.search(/<\/head\s*>/i);
        if (headEnd >= 0) {
          text = text.slice(0, headEnd + 7);
          break;
        }
      }
      text += decoder.decode();
    } finally {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock?.(); } catch {}
    }
    return { ok: true, reason: "", finalPageUrl, text };
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === "AbortError";
    return { ok: false, reason: timedOut ? "timeout" : "network", finalPageUrl: pageUrl, text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverManifestIconCandidates(manifestUrl, pageUrl, { deadlineAt }) {
  const resource = await fetchBoundedResource(manifestUrl, { maxBytes: REMOTE_MANIFEST_MAX_BYTES, deadlineAt });
  if (!resource.ok) return [];
  let manifest;
  try { manifest = JSON.parse(textDecoder.decode(resource.bytes)); }
  catch { return []; }
  const result = [];
  let order = 0;
  for (const icon of Array.isArray(manifest?.icons) ? manifest.icons : []) {
    if (!icon || typeof icon.src !== "string" || !icon.src.trim()) continue;
    let url;
    try { url = new URL(icon.src, resource.url || manifestUrl || pageUrl).href; } catch { continue; }
    if (!/^https?:/i.test(url)) continue;
    const sizes = String(icon.sizes || "").toLowerCase();
    let largestSide = sizes.includes("any") ? 512 : 0;
    for (const match of sizes.matchAll(/(\d+)x(\d+)/g)) {
      largestSide = Math.max(largestSide, Number(match[1]) || 0, Number(match[2]) || 0);
    }
    const purposes = String(icon.purpose || "any").toLowerCase().split(/\s+/);
    const purposeBonus = purposes.includes("maskable") ? 60 : purposes.includes("any") ? 40 : 0;
    result.push({
      url,
      score: 1100 + purposeBonus + Math.min(largestSide, 1024),
      sideHint: largestSide,
      order: order++,
      source: "manifest"
    });
    if (result.length >= 16) break;
  }
  return result;
}

async function discoverPageIconInfo(pageUrl, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS } = {}) {
  const resource = await fetchHtmlHead(pageUrl, { deadlineAt });
  if (!resource.ok) return { urls: [], candidates: [], finalPageUrl: resource.finalPageUrl || pageUrl, reason: resource.reason };
  const baseUrl = resource.finalPageUrl || pageUrl;
  const icons = [];
  const manifests = [];
  const seen = new Set();
  let order = 0;
  for (const tag of resource.text.match(/<link\b[^>]*>/gi) || []) {
    const rel = htmlAttribute(tag, "rel").toLowerCase().split(/\s+/).filter(Boolean);
    if (rel.includes("manifest")) {
      const href = htmlAttribute(tag, "href");
      if (href) {
        try {
          const resolved = new URL(href, baseUrl).href;
          if (/^https?:/i.test(resolved) && !manifests.includes(resolved)) manifests.push(resolved);
        } catch {}
      }
      continue;
    }
    const isStandardIcon = rel.includes("icon") || (rel.includes("shortcut") && rel.includes("icon"));
    const isTouchIcon = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    const isMaskIcon = rel.includes("mask-icon");
    if (!isStandardIcon && !isTouchIcon && !isMaskIcon) continue;
    const href = htmlAttribute(tag, "href");
    if (!href) continue;
    let resolved;
    try { resolved = new URL(href, baseUrl).href; } catch { continue; }
    const isNetworkIcon = /^https?:/i.test(resolved);
    const isInlineImage = /^data:image\//i.test(resolved);
    if ((!isNetworkIcon && !isInlineImage) || seen.has(resolved)) continue;
    seen.add(resolved);

    const sizes = htmlAttribute(tag, "sizes").toLowerCase();
    let largestSide = sizes === "any" ? 512 : 0;
    for (const match of sizes.matchAll(/(\d+)x(\d+)/g)) {
      largestSide = Math.max(largestSide, Number(match[1]) || 0, Number(match[2]) || 0);
    }
    const type = htmlAttribute(tag, "type").toLowerCase();
    const vectorBonus = type === "image/svg+xml" || /\.svg(?:$|[?#])/i.test(resolved) ? 350 : 0;
    const roleBonus = isTouchIcon ? 180 : isMaskIcon ? 140 : 100;
    const score = 600 + roleBonus + vectorBonus + Math.min(largestSide, 1024);
    icons.push({ url: resolved, score, sideHint: largestSide, order: order++, source: isTouchIcon ? "touch" : isMaskIcon ? "mask" : "link" });
    if (icons.length >= 20) break;
  }

  // Windows/legacy sites often advertise a substantially better square tile
  // image through msapplication metadata even when favicon.ico is only 16px.
  for (const tag of resource.text.match(/<meta\b[^>]*>/gi) || []) {
    const name = htmlAttribute(tag, "name").toLowerCase();
    if (name !== "msapplication-tileimage") continue;
    const content = htmlAttribute(tag, "content");
    if (!content) continue;
    try {
      const resolved = new URL(content, baseUrl).href;
      if (/^https?:/i.test(resolved) && !seen.has(resolved)) {
        seen.add(resolved);
        icons.push({ url: resolved, score: 900, sideHint: 270, order: order++, source: "tile" });
      }
    } catch {}
  }

  for (const manifestUrl of manifests.slice(0, 2)) {
    if (Date.now() >= deadlineAt) break;
    const manifestIcons = await discoverManifestIconCandidates(manifestUrl, baseUrl, { deadlineAt });
    for (const candidate of manifestIcons) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      icons.push({ ...candidate, order: order++ });
    }
  }

  icons.sort((a, b) => b.score - a.score || b.sideHint - a.sideHint || a.order - b.order);
  return { urls: icons.map(icon => icon.url), candidates: icons, finalPageUrl: baseUrl, reason: "" };
}

async function resolveBrowserCachedFavicon(pageUrl) {
  // Chrome exposes its own favicon cache through the private _favicon endpoint.
  // This is local browser data: no website request and no external favicon proxy.
  try {
    const image = await readNativeFaviconDataUrl(pageUrl, 128);
    if (image) {
      // `_favicon?size=128` describes Chrome's output canvas, not the intrinsic
      // quality of the cached source. A 16/32px favicon may simply be enlarged
      // to 128px, so keep native pixels as a fast provisional fallback but do
      // not let the requested canvas size block declared-site quality recovery.
      return { image, sourceUrl: "", reason: "", width: 0, height: 0, qualitySide: 0, declared: false, native: true };
    }
  } catch {}
  return null;
}

function parentHostFaviconUrl(pageUrl) {
  // Safe, intentionally conservative brand fallback for one-label app
  // subdomains such as chat.example.com -> example.com. Avoid guessing public
  // suffixes such as example.co.uk without shipping a PSL implementation.
  try {
    const parsed = new URL(pageUrl);
    const labels = parsed.hostname.toLowerCase().split(".").filter(Boolean);
    if (labels.length !== 3 || labels[0] === "www") return "";
    return `${parsed.protocol}//${labels.slice(1).join(".")}/favicon.ico`;
  } catch {
    return "";
  }
}

async function probeConventionalFaviconFallbacks(origin, { deadlineAt }) {
  if (!origin || Date.now() >= deadlineAt) return null;
  // These are common standards/conventions that can still be reachable when an
  // SPA shell or anti-bot page cannot be fetched from an extension context.
  for (const path of ["/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]) {
    if (Date.now() >= deadlineAt) break;
    const candidate = await fetchImageDataUrlDetailed(`${origin}${path}`, { deadlineAt, declared: true });
    if (candidate.image) return candidate;
  }
  return null;
}

async function probeConventionalFaviconQualityUpgrade(origin, current, { deadlineAt }) {
  if (!origin || !current?.image || Date.now() >= deadlineAt) return current;
  let best = current;
  // Last-resort quality fallback after declared HTML/manifest artwork has been
  // attempted. The caller supplies a small isolated deadline so guessed paths
  // can never consume the authoritative discovery budget.
  for (const path of ["/icon.ico", "/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]) {
    if (Date.now() >= deadlineAt) break;
    const candidate = await fetchImageDataUrlDetailed(`${origin}${path}`, { deadlineAt, declared: true });
    if (!candidate.image) continue;
    best = betterFaviconCandidate(best, candidate);
    if (faviconQualitySide(best) >= ICON_RECOVERY_HIGH_QUALITY_SIDE) break;
  }
  return best;
}

async function probeOriginalOriginDeclaredIcons(origin, current, { deadlineAt }) {
  if (!origin || Date.now() >= deadlineAt) return current;
  const rootUrl = `${origin}/`;
  const discovered = await discoverPageIconInfo(rootUrl, { deadlineAt });
  let finalOrigin = "";
  try { finalOrigin = new URL(discovered.finalPageUrl || rootUrl).origin; } catch {}
  // Only trust this recovery pass when the public root stayed on the original
  // site. If it also redirects to an account/login provider, its icons describe
  // that provider rather than the shortcut site.
  if (finalOrigin !== origin) return current;

  let best = current;
  const candidates = discovered.candidates || [];
  for (let index = 0; index < candidates.length; index += 2) {
    if (Date.now() >= deadlineAt) break;
    const batch = candidates.slice(index, index + 2);
    const images = await Promise.all(batch.map(candidate => fetchImageDataUrlDetailed(candidate.url, {
      deadlineAt,
      declared: true,
      qualityHint: candidate.sideHint
    })));
    for (const image of images) {
      if (image.image) best = betterFaviconCandidate(best, image);
    }
    if (faviconQualitySide(best) >= ICON_RECOVERY_HIGH_QUALITY_SIDE) break;
  }
  return best;
}

async function resolveFaviconForUrl(pageUrl, { timeoutMs = ICON_RECOVERY_FETCH_TIMEOUT_MS, preferQuality = false } = {}) {
  // Chrome Web Store pages cannot be fetched by extensions even with host
  // permission. Chrome's local favicon cache is authoritative for them.
  if (isProtectedChromeStoreUrl(pageUrl)) {
    const native = await resolveBrowserCachedFavicon(pageUrl);
    return native ? { ...native, provisional: false } : { image: "", sourceUrl: "", reason: "protected", provisional: false };
  }

  // Chrome's _favicon cache is browser-local and does not need website access.
  // Read it before the optional host-permission gate so a known site still gets
  // a fast fallback. A brand-new site can then be resolved from the network as
  // soon as the existing Website Access permission is granted.
  const native = await resolveBrowserCachedFavicon(pageUrl);
  const webAccess = await hasWebAccess();
  if (!webAccess) {
    return native?.image
      ? { ...native, provisional: true }
      : { image: "", sourceUrl: "", reason: "permission", provisional: false };
  }

  const deadlineAt = Date.now() + Math.max(1_000, Number(timeoutMs) || ICON_RECOVERY_FETCH_TIMEOUT_MS);
  let initialOrigin = "";
  try { initialOrigin = new URL(pageUrl).origin; } catch {}
  let sawTimeout = false;
  let qualityUnresolved = false;
  let best = native?.image ? native : null;

  if (best?.image && !preferQuality) return { ...best, provisional: true };

  // The normal first pass remains favicon-first so a new shortcut gets artwork
  // quickly. Quality retries deliberately skip this re-fetch until after the
  // site's declared metadata has had the first chance to provide better art.
  if (!preferQuality && initialOrigin) {
    const conventional = await fetchImageDataUrlDetailed(`${initialOrigin}/favicon.ico`, { deadlineAt });
    if (conventional.image) {
      best = betterFaviconCandidate(best, conventional);
      const side = faviconQualitySide(conventional);
      return { ...best, provisional: !side || side < ICON_RECOVERY_HIGH_QUALITY_SIDE };
    }
    sawTimeout = sawTimeout || conventional.reason === "timeout";
  }

  if (!preferQuality && !best?.image) {
    const parentUrl = parentHostFaviconUrl(pageUrl);
    if (parentUrl) {
      const parentDeadline = Math.min(deadlineAt, Date.now() + 2_500);
      const parent = await fetchImageDataUrlDetailed(parentUrl, { deadlineAt: parentDeadline, declared: true });
      if (parent.image) return { ...parent, provisional: true };
      if (parent.reason === "timeout") sawTimeout = true;
    }
  }

  // Quality discovery is independent of Chrome's local favicon database. This
  // path can resolve a never-before-visited site directly from its declared
  // HTML/manifest artwork, provided the user granted MosaicSync Website Access.
  const discovered = await discoverPageIconInfo(pageUrl, { deadlineAt });
  sawTimeout = sawTimeout || discovered.reason === "timeout";
  qualityUnresolved = discovered.reason === "timeout" || discovered.reason === "network" || /^http-/.test(discovered.reason || "");

  let discoveredFinalOrigin = "";
  try { discoveredFinalOrigin = new URL(discovered.finalPageUrl || pageUrl).origin; } catch {}
  if (preferQuality && initialOrigin && discoveredFinalOrigin && discoveredFinalOrigin !== initialOrigin && Date.now() < deadlineAt) {
    best = await probeOriginalOriginDeclaredIcons(initialOrigin, best, { deadlineAt });
    if (faviconQualitySide(best) >= ICON_RECOVERY_HIGH_QUALITY_SIDE) {
      return { ...best, provisional: false };
    }
  }

  const candidates = discovered.candidates || [];
  for (let index = 0; index < candidates.length; index += 2) {
    if (Date.now() >= deadlineAt) { sawTimeout = true; qualityUnresolved = true; break; }
    const batch = candidates.slice(index, index + 2);
    const images = await Promise.all(batch.map(candidate => fetchImageDataUrlDetailed(candidate.url, {
      deadlineAt,
      declared: true,
      qualityHint: candidate.sideHint
    })));
    for (const image of images) {
      if (image.image) best = betterFaviconCandidate(best, image);
      else if (image.reason === "timeout" || image.reason === "network") qualityUnresolved = true;
      sawTimeout = sawTimeout || image.reason === "timeout";
    }
    if (faviconQualitySide(best) >= ICON_RECOVERY_HIGH_QUALITY_SIDE) {
      return { ...best, provisional: false };
    }
  }

  if (preferQuality && initialOrigin && Date.now() < deadlineAt) {
    const fallbackDeadline = Math.min(deadlineAt, Date.now() + 1_500);
    const conventional = await fetchImageDataUrlDetailed(`${initialOrigin}/favicon.ico`, { deadlineAt: fallbackDeadline });
    if (conventional.image) best = betterFaviconCandidate(best, conventional);
    else if (conventional.reason === "timeout" || conventional.reason === "network") qualityUnresolved = true;
    sawTimeout = sawTimeout || conventional.reason === "timeout";

    if (best?.image && faviconQualitySide(best) < ICON_RECOVERY_HIGH_QUALITY_SIDE && Date.now() < fallbackDeadline) {
      best = await probeConventionalFaviconQualityUpgrade(initialOrigin, best, { deadlineAt: fallbackDeadline });
    }
    if (faviconQualitySide(best) >= ICON_RECOVERY_HIGH_QUALITY_SIDE) {
      return { ...best, provisional: false };
    }
  }

  const finalOrigin = discoveredFinalOrigin;
  if (finalOrigin && finalOrigin !== initialOrigin && Date.now() < deadlineAt) {
    const redirected = await fetchImageDataUrlDetailed(`${finalOrigin}/favicon.ico`, { deadlineAt });
    if (redirected.image) best = betterFaviconCandidate(best, redirected);
    else if (redirected.reason === "timeout" || redirected.reason === "network") qualityUnresolved = true;
    sawTimeout = sawTimeout || redirected.reason === "timeout";
  }

  if (!best?.image && initialOrigin && Date.now() < deadlineAt) {
    const direct = await probeConventionalFaviconFallbacks(initialOrigin, { deadlineAt });
    if (direct?.image) best = direct;
  }

  if (best?.image) {
    const side = faviconQualitySide(best);
    const lowResolution = !side || side < ICON_RECOVERY_HIGH_QUALITY_SIDE;
    return { ...best, provisional: lowResolution && qualityUnresolved };
  }
  return { image: "", sourceUrl: "", reason: sawTimeout ? "timeout" : "not-found", provisional: false };
}

function flattenShortcuts(state) {
  const shortcuts = [];
  const seen = new Set();
  const collect = items => {
    for (const item of items || []) {
      if (item?.type === "folder") collect(item.items || []);
      else if (item?.type === "shortcut" && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        shortcuts.push(item);
      }
    }
  };

  // Favicon repair is device work, not a visible-Space-only feature. When the
  // state contains the canonical Spaces map, inspect both workspaces instead of
  // only the active `state.shortcuts` projection. This prevents missing icons in
  // the inactive Space from being silently skipped until that Space is opened.
  if (state?.spaces && typeof state.spaces === "object") {
    collect(state.spaces?.[PERSONAL_SPACE_ID]?.shortcuts);
    collect(state.spaces?.[WORK_SPACE_ID]?.shortcuts);
  } else {
    collect(state?.shortcuts);
  }
  return shortcuts;
}

function shortcutNeedsProactiveFavicon(shortcut) {
  if (!shortcut || shortcut.type !== "shortcut" || !/^https?:/i.test(shortcut.url || "")) return false;
  const sourceKind = shortcut.imageSourceKind || "none";
  if (sourceKind === "firefox") return true;
  if (sourceKind === "favicon") return !shortcut.image;
  if (sourceKind === "none") return !shortcut.image;
  return !shortcut.image && sourceKind === "upload" && shortcut.imageSyncKind === "device";
}

function findShortcutInItems(items, id) {
  for (const item of items || []) {
    if (item?.type === "shortcut" && item.id === id) return item;
    if (item?.type === "folder") {
      const child = (item.items || []).find(candidate => candidate?.id === id);
      if (child) return child;
    }
  }
  return null;
}

function findShortcutById(state, id) {
  return findShortcutInItems(state?.shortcuts, id);
}

function findShortcutLocationById(state, id) {
  if (state?.spaces && typeof state.spaces === "object") {
    const orderedSpaceIds = [state.activeSpaceId, PERSONAL_SPACE_ID, WORK_SPACE_ID]
      .filter((value, index, list) => (value === PERSONAL_SPACE_ID || value === WORK_SPACE_ID) && list.indexOf(value) === index);
    for (const spaceId of orderedSpaceIds) {
      const workspace = state.spaces?.[spaceId];
      const shortcut = findShortcutInItems(workspace?.shortcuts, id);
      if (shortcut) return { spaceId, workspace, shortcut };
    }
  }
  const shortcut = findShortcutById(state, id);
  return shortcut
    ? { spaceId: state?.activeSpaceId || PERSONAL_SPACE_ID, workspace: state, shortcut }
    : null;
}

function workspaceAllowsAutoIcons(state, shortcutId) {
  const location = findShortcutLocationById(state, shortcutId);
  return Boolean(location?.workspace?.settings?.autoSiteIcons);
}

function iconRecoveryItemStillRelevantInState(state, item) {
  const location = findShortcutLocationById(state, item?.id);
  if (!location || !workspaceAllowsAutoIcons(state, item?.id)) return false;
  return iconRecoveryItemStillRelevant(location.shortcut, item);
}


async function applyProactiveFaviconResults(results) {
  const appliedIds = new Set();
  const unchangedIds = new Set();
  if (!results.length) return { appliedIds, unchangedIds };
  const loaded = await ensureLocalStorage();
  const writeBaseline = createWriteBaseline(loaded.state);
  for (const result of results) {
    // Network recovery is intentionally Space-agnostic while in flight. Resolve
    // ownership again at commit time so a Personal→Work move neither discards
    // useful work nor applies it under the wrong Space's auto-icon preference.
    const location = findShortcutLocationById(loaded.state, result.id);
    if (!location || !workspaceAllowsAutoIcons(loaded.state, result.id)) continue;
    const shortcut = location.shortcut;
    if (shortcut.url !== result.url) continue;
    const upgradingRecoveredFavicon = Boolean(result.allowFaviconUpgrade) &&
      ["favicon", "firefox"].includes(shortcut.imageSourceKind) &&
      shortcut.imageSyncKind === "device" && Boolean(shortcut.image);
    if (!shortcutNeedsProactiveFavicon(shortcut) && !upgradingRecoveredFavicon) continue;
    const customUploadFallback = shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
    if (shortcut.image === result.image && shortcut.imageSyncKind === "device" && !shortcut.imageAssetId &&
        shortcut.imageIsFallback === customUploadFallback &&
        (customUploadFallback || (shortcut.imageSourceKind === "favicon" && shortcut.imageSourceUrl === result.sourceUrl))) {
      unchangedIds.add(result.id);
      continue;
    }
    shortcut.image = result.image;
    shortcut.imageSyncData = "";
    shortcut.imageAssetId = "";
    shortcut.imageSyncKind = "device";
    shortcut.imageIsFallback = customUploadFallback;
    if (!customUploadFallback) {
      shortcut.imageSourceKind = "favicon";
      shortcut.imageSourceUrl = result.sourceUrl;
    }
    appliedIds.add(result.id);
  }
  if (!appliedIds.size) return { appliedIds, unchangedIds };
  // Persist the whole network batch once. This avoids three independent
  // normalize/write/session-cache/storage-event cycles when three favicon
  // recoveries complete together. Core Sync clocks remain untouched.
  await writeLocalState(loaded.state, { baseState: writeBaseline });
  return { appliedIds, unchangedIds };
}

function normalizeIconRecoveryQueue(raw) {
  const source = raw && typeof raw === "object" && Number(raw.version) === ICON_RECOVERY_QUEUE_VERSION ? raw : {};
  const items = [];
  const seen = new Set();
  for (const item of Array.isArray(source.items) ? source.items : []) {
    const id = typeof item?.id === "string" ? item.id : "";
    const url = typeof item?.url === "string" ? item.url : "";
    if (!id || !/^https?:/i.test(url) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      url,
      attempts: Math.max(0, Math.min(ICON_RECOVERY_MAX_ATTEMPTS, Number(item.attempts) || 0)),
      nextAttemptAt: Math.max(0, Number(item.nextAttemptAt) || 0),
      qualityUpgrade: Boolean(item.qualityUpgrade),
      lastReason: typeof item.lastReason === "string" ? item.lastReason.slice(0, 48) : "",
      lastAttemptAt: Math.max(0, Number(item.lastAttemptAt) || 0)
    });
  }
  return { version: ICON_RECOVERY_QUEUE_VERSION, items, updatedAt: Math.max(0, Number(source.updatedAt) || 0) };
}

function iconRecoveryItemStillRelevant(shortcut, item) {
  if (!shortcut || shortcut.type !== "shortcut" || shortcut.url !== item?.url) return false;
  if (!item?.qualityUpgrade) return shortcutNeedsProactiveFavicon(shortcut);
  // A quality-upgrade retry belongs only to reconstructable browser/site artwork.
  // User uploads supersede it and are never replaced by automatic recovery.
  return ["favicon", "firefox"].includes(shortcut.imageSourceKind) &&
    shortcut.imageSyncKind === "device" && Boolean(shortcut.image);
}

async function dropIconRecoveryQualityJobs() {
  const queue = await readIconRecoveryQueue();
  if (!queue.items.some(item => item.qualityUpgrade)) return queue;
  return writeIconRecoveryQueue({
    ...queue,
    items: queue.items.filter(item => !item.qualityUpgrade)
  });
}

async function readIconRecoveryQueue() {
  try {
    const stored = await browser.storage.local.get(LOCAL_ICON_RECOVERY_QUEUE_KEY);
    return normalizeIconRecoveryQueue(stored?.[LOCAL_ICON_RECOVERY_QUEUE_KEY]);
  } catch {
    return normalizeIconRecoveryQueue(null);
  }
}

async function writeIconRecoveryQueue(queue) {
  const normalized = normalizeIconRecoveryQueue({ ...queue, version: ICON_RECOVERY_QUEUE_VERSION, updatedAt: Date.now() });
  if (!normalized.items.length) {
    try { await browser.storage.local.remove(LOCAL_ICON_RECOVERY_QUEUE_KEY); } catch {}
    return normalized;
  }
  await browser.storage.local.set({ [LOCAL_ICON_RECOVERY_QUEUE_KEY]: normalized });
  return normalized;
}

async function writeIconRecoveryStatus(status) {
  try {
    await browser.storage.local.set({
      [LOCAL_ICON_RECOVERY_STATUS_KEY]: {
        at: Date.now(),
        attempted: Math.max(0, Number(status.attempted) || 0),
        hydrated: Math.max(0, Number(status.hydrated) || 0),
        unchanged: Math.max(0, Number(status.unchanged) || 0),
        failed: Math.max(0, Number(status.failed) || 0),
        timedOut: Math.max(0, Number(status.timedOut) || 0),
        exhausted: Math.max(0, Number(status.exhausted) || 0),
        blockedByPermission: Math.max(0, Number(status.blockedByPermission) || 0),
        pending: Math.max(0, Number(status.pending) || 0)
      }
    });
  } catch {}
}

async function scheduleIconRecoveryAlarm(queue, { watchdog = false } = {}) {
  if (!browser.alarms?.create || !browser.alarms?.clear) return;
  const items = Array.isArray(queue?.items) ? queue.items : [];
  if (!items.length) {
    try { await browser.alarms.clear(ICON_RECOVERY_ALARM); } catch {}
    return;
  }
  let when;
  if (watchdog) {
    when = Date.now() + ICON_RECOVERY_WATCHDOG_MS;
  } else {
    const earliest = Math.min(...items.map(item => Math.max(0, Number(item.nextAttemptAt) || 0)));
    when = Math.max(Date.now() + 750, earliest || Date.now() + 750);
  }
  try { await browser.alarms.create(ICON_RECOVERY_ALARM, { when }); }
  catch (error) { console.warn(`${PRODUCT_NAME}: could not schedule favicon recovery`, error); }
}

function scheduleImmediateIconRecoveryContinuation() {
  if (iconRecoveryContinuationTimer) return;
  iconRecoveryContinuationTimer = setTimeout(() => {
    iconRecoveryContinuationTimer = null;
    void processIconRecoveryQueue().catch(error => {
      console.warn(`${PRODUCT_NAME}: favicon recovery continuation failed`, error);
    });
  }, ICON_RECOVERY_CONTINUE_DELAY_MS);
}

async function seedIconRecoveryQueue({ shortcutIds = [], force = false, upgradeRecoveredFavicons = false } = {}) {
  const loaded = await ensureLocalStorage();
  const requested = new Set(Array.isArray(shortcutIds) ? shortcutIds.filter(value => typeof value === "string" && value) : []);
  const targeted = requested.size > 0;
  const current = await readIconRecoveryQueue();
  const existing = new Map(current.items.map(item => [item.id, item]));

  // Keep valid jobs from the other Space even when automatic site icons are
  // disabled in the currently visible Space. Each item's owning Space decides
  // its own eligibility through iconRecoveryItemStillRelevantInState().
  const nextItems = current.items.filter(item => iconRecoveryItemStillRelevantInState(loaded.state, item));
  const nextById = new Map(nextItems.map(item => [item.id, item]));

  const eligible = flattenShortcuts(loaded.state).filter(shortcut => {
    const location = findShortcutLocationById(loaded.state, shortcut.id);
    if (!workspaceAllowsAutoIcons(loaded.state, shortcut.id)) return false;
    if (targeted && !requested.has(shortcut.id)) return false;
    if (shortcutNeedsProactiveFavicon(shortcut)) return true;
    return Boolean(upgradeRecoveredFavicons) && ["favicon", "firefox"].includes(shortcut.imageSourceKind) &&
      shortcut.imageSyncKind === "device" && Boolean(shortcut.image) && /^https?:/i.test(shortcut.url || "");
  });

  for (const shortcut of eligible) {
    const previous = existing.get(shortcut.id);
    const reset = force || !previous || previous.url !== shortcut.url;
    const migrationUpgrade = Boolean(upgradeRecoveredFavicons) && ["favicon", "firefox"].includes(shortcut.imageSourceKind) &&
      shortcut.imageSyncKind === "device" && Boolean(shortcut.image);
    nextById.set(shortcut.id, {
      id: shortcut.id,
      url: shortcut.url,
      attempts: reset ? 0 : previous.attempts,
      nextAttemptAt: reset ? 0 : previous.nextAttemptAt,
      qualityUpgrade: migrationUpgrade || (!reset && Boolean(previous.qualityUpgrade)),
      lastReason: reset ? "" : (previous.lastReason || ""),
      lastAttemptAt: reset ? 0 : (previous.lastAttemptAt || 0)
    });
  }

  const queue = await writeIconRecoveryQueue({ version: ICON_RECOVERY_QUEUE_VERSION, items: [...nextById.values()] });
  const canAttemptNow = (await hasWebAccess()) || platformHasPermissionFreeFaviconSource();
  if (queue.items.length && canAttemptNow) await scheduleIconRecoveryAlarm(queue);
  return queue;
}

async function pruneIconRecoveryQueueAgainstState(queue, state) {
  const items = queue.items.filter(item => iconRecoveryItemStillRelevantInState(state, item));
  return items.length === queue.items.length ? queue : writeIconRecoveryQueue({ ...queue, items });
}

function nextIconRecoveryFailure(item) {
  const attempts = Math.max(0, Number(item.attempts) || 0) + 1;
  const exhausted = attempts >= ICON_RECOVERY_MAX_ATTEMPTS;
  const delay = exhausted
    ? ICON_RECOVERY_EXHAUSTED_RETRY_MS
    : ICON_RECOVERY_RETRY_DELAYS_MS[Math.min(attempts - 1, ICON_RECOVERY_RETRY_DELAYS_MS.length - 1)];
  return {
    exhausted,
    item: {
      ...item,
      attempts: Math.min(attempts, ICON_RECOVERY_MAX_ATTEMPTS),
      nextAttemptAt: Date.now() + delay
    }
  };
}

function nextIconRecoveryQualityRetry(item) {
  // The first quality pass is intentional follow-up work, not a failure. Make it
  // due immediately so the live background context can continue after ~120 ms;
  // the persisted alarm remains the durable fallback if MV3 suspends the worker.
  if (!item?.qualityUpgrade) {
    return {
      exhausted: false,
      item: { ...item, qualityUpgrade: true, nextAttemptAt: Date.now() }
    };
  }
  const next = nextIconRecoveryFailure({ ...item, qualityUpgrade: true });
  return { ...next, item: { ...next.item, qualityUpgrade: true } };
}

async function processIconRecoveryQueue() {
  if (iconRecoveryRun) return iconRecoveryRun;
  devMark("background:favicon-recovery-start");
  iconRecoveryRun = (async () => {
    let queue = await readIconRecoveryQueue();
    const loaded = await ensureLocalStorage();
    queue = await pruneIconRecoveryQueueAgainstState(queue, loaded.state);
    if (!queue.items.length) {
      await scheduleIconRecoveryAlarm(queue);
      const empty = { ok: true, granted: await hasWebAccess(), attempted: 0, hydrated: 0, unchanged: 0, failed: 0, timedOut: 0, exhausted: 0, pending: 0 };
      await writeIconRecoveryStatus(empty);
      return empty;
    }
    // Website Access controls remote discovery, but it must not gate the entire
    // recovery engine. Chromium can satisfy a queued shortcut from its local
    // favicon database without host access, and the resolver itself is the
    // authoritative place to decide which sources are available.
    const webAccessGranted = await hasWebAccess();
    const canAutonomouslyRetry = webAccessGranted || platformHasPermissionFreeFaviconSource();

    const now = Date.now();
    const due = queue.items.filter(item => Number(item.nextAttemptAt) <= now).slice(0, ICON_RECOVERY_CONCURRENCY);
    if (!due.length) {
      if (canAutonomouslyRetry) await scheduleIconRecoveryAlarm(queue);
      else { try { await browser.alarms?.clear?.(ICON_RECOVERY_ALARM); } catch {} }
      const waiting = { ok: true, granted: webAccessGranted, attempted: 0, hydrated: 0, unchanged: 0, failed: 0, timedOut: 0, exhausted: 0, blockedByPermission: 0, pending: queue.items.length };
      await writeIconRecoveryStatus(waiting);
      return waiting;
    }

    // Arm the durable wake-up *before* networking. If Firefox/Chromium suspends
    // the MV3 background context in the middle of this batch, the untouched
    // queue is retried on the next alarm instead of dying with JavaScript state.
    await scheduleIconRecoveryAlarm(queue, { watchdog: true });

    const resolved = await Promise.all(due.map(async item => {
      const result = await resolveFaviconForUrl(item.url, { timeoutMs: ICON_RECOVERY_FETCH_TIMEOUT_MS, preferQuality: Boolean(item.qualityUpgrade) });
      return { item, result };
    }));
    const successfulResults = resolved
      .filter(entry => entry.result?.image)
      .map(({ item, result }) => ({
        id: item.id,
        url: item.url,
        ...result,
        allowFaviconUpgrade: Boolean(item.qualityUpgrade)
      }));
    const application = successfulResults.length
      ? await enqueue(() => applyProactiveFaviconResults(successfulResults), { persistSyncError: false })
      : { appliedIds: new Set(), unchangedIds: new Set() };
    // enqueue() intentionally converts task failures to { ok:false, error } so
    // callers outside the serialized queue do not receive an unhandled rejection.
    // A favicon *commit* failure is not a stale network result, though: keep the
    // durable recovery item and route it through the normal backoff/retry path.
    const applicationFailed = application?.ok === false;
    const appliedIds = applicationFailed ? new Set() : (application?.appliedIds || new Set());
    const unchangedIds = applicationFailed ? new Set() : (application?.unchangedIds || new Set());
    const outcomes = resolved.map(({ item, result }) => {
      if (!result?.image) return { item, ok: false, reason: result?.reason || "not-found" };
      if (applicationFailed) return { item, ok: false, reason: "commit-error" };
      if (appliedIds.has(item.id)) return { item, ok: true, changed: true, reason: "", provisional: Boolean(result.provisional) };
      if (unchangedIds.has(item.id)) return { item, ok: true, changed: false, reason: "unchanged", provisional: Boolean(result.provisional) };
      return { item, ok: false, reason: "stale" };
    });

    // Re-read after the network batch so a newer Sync restore, Space move, URL
    // edit, or targeted icon request cannot be overwritten by stale queue state.
    queue = await readIconRecoveryQueue();
    const byId = new Map(queue.items.map(item => [item.id, item]));
    let hydrated = 0;
    let unchanged = 0;
    let failed = 0;
    let timedOut = 0;
    let exhausted = 0;
    let blockedByPermission = 0;
    for (const outcome of outcomes) {
      const current = byId.get(outcome.item.id);
      if (!current || current.url !== outcome.item.url) continue;
      if (outcome.ok) {
        if (outcome.changed) hydrated += 1;
        else unchanged += 1;
        if (outcome.provisional && webAccessGranted) {
          byId.set(outcome.item.id, nextIconRecoveryQualityRetry(current).item);
        } else {
          // Without Website Access a successful browser-native result is the
          // best source currently available. Do not retain a quality-only job
          // forever; an explicit later grant re-seeds upgrade candidates.
          byId.delete(outcome.item.id);
        }
        continue;
      }
      if (outcome.reason === "permission") {
        // A missing optional permission is a capability state, not a failed
        // website. Keep the durable job immediately retryable without consuming
        // the retry budget; the next explicit permission grant forces a run.
        blockedByPermission += 1;
        const retryAt = platformHasPermissionFreeFaviconSource()
          ? Date.now() + ICON_RECOVERY_EXHAUSTED_RETRY_MS
          : Number(current.nextAttemptAt) || 0;
        byId.set(outcome.item.id, {
          ...current,
          // Chromium can re-check its browser-local favicon database later even
          // without Website Access. Keep that capability retry bounded to once
          // per day instead of spinning every 750 ms; opening a New Tab also
          // performs the normal native-cache hydration path. Firefox has no
          // permission-free native source, so it simply waits for a grant event.
          nextAttemptAt: retryAt,
          lastReason: "permission",
          lastAttemptAt: Date.now()
        });
        continue;
      }
      failed += 1;
      if (outcome.reason === "timeout") timedOut += 1;
      if (outcome.reason === "stale" || outcome.reason === "protected") {
        // Protected Chrome pages (notably Chrome Web Store) cannot succeed via
        // network discovery; the local _favicon path is the only valid source,
        // so a miss must not become an infinite retry queue entry.
        byId.delete(outcome.item.id);
        continue;
      }
      const next = nextIconRecoveryFailure(current);
      byId.set(outcome.item.id, {
        ...next.item,
        lastReason: String(outcome.reason || "not-found").slice(0, 48),
        lastAttemptAt: Date.now()
      });
      if (next.exhausted) exhausted += 1;
    }

    const currentState = (await ensureLocalStorage()).state;
    queue = await writeIconRecoveryQueue({
      version: ICON_RECOVERY_QUEUE_VERSION,
      items: [...byId.values()].filter(item => iconRecoveryItemStillRelevantInState(currentState, item))
    });
    if (canAutonomouslyRetry) await scheduleIconRecoveryAlarm(queue);
    else { try { await browser.alarms?.clear?.(ICON_RECOVERY_ALARM); } catch {} }
    const summary = {
      ok: true,
      granted: webAccessGranted,
      attempted: outcomes.length,
      hydrated,
      unchanged,
      failed,
      timedOut,
      exhausted,
      blockedByPermission,
      pending: queue.items.length
    };
    await writeIconRecoveryStatus(summary);

    // Continue rapidly while this background context is alive. The alarm above
    // remains the durable fallback, so this optimization is never required for
    // correctness on a non-persistent MV3 background context.
    if (canAutonomouslyRetry && queue.items.some(item => Number(item.nextAttemptAt) <= Date.now())) scheduleImmediateIconRecoveryContinuation();
    return summary;
  })().finally(() => {
    devMark("background:favicon-recovery-end");
    devMeasure("background:favicon-recovery", "background:favicon-recovery-start", "background:favicon-recovery-end");
    iconRecoveryRun = null;
  });
  return iconRecoveryRun;
}

async function requestMissingShortcutIconHydration(options = {}) {
  const queue = await seedIconRecoveryQueue(options);
  if (!queue.items.length) return { ok: true, granted: await hasWebAccess(), attempted: 0, hydrated: 0, unchanged: 0, failed: 0, timedOut: 0, exhausted: 0, pending: 0 };
  return processIconRecoveryQueue();
}

async function scheduleMissingShortcutIconHydrationAfterSync({ force = true } = {}) {
  // Remote Sync deliberately contains shortcut URLs but not learned favicon
  // pixels. Persist the complete device-local recovery queue before reporting
  // the restore as finished. Networking starts on the next turn so it cannot
  // deadlock against the serialized Sync/state mutation queue.
  const recoveryQueue = await seedIconRecoveryQueue({ force });
  if (recoveryQueue.items.length) scheduleImmediateIconRecoveryContinuation();
  return recoveryQueue;
}

async function cleanupLegacyIconHydrationState() {
  try { await browser.alarms?.clear?.(LEGACY_ICON_HYDRATION_ALARM); } catch {}
  try { await browser.storage.session?.remove?.(LEGACY_SESSION_ICON_HYDRATION_FAILURES_KEY); } catch {}
}

async function runOneTimeLegacyMaintenance() {
  let completed = 0;
  try {
    const stored = await browser.storage.local.get(LOCAL_MAINTENANCE_MIGRATIONS_KEY);
    completed = Number(stored?.[LOCAL_MAINTENANCE_MIGRATIONS_KEY]) || 0;
    if (completed >= 2) return;
  } catch {}

  if (completed < 1) {
    await cleanupLegacyIconHydrationState();
    await cleanupLegacyWebOriginPermissions();
  }

  // ensureLocalStorage() runs before this maintenance hook. Reaching here means
  // any pre-Spaces state and inline artwork have already committed in the current
  // schema, so the one-time safety backup is no longer an authoritative copy.
  // Remove it only after successful migration; a failed migration never reaches
  // this cleanup point and therefore keeps the recovery copy intact.
  try {
    await browser.storage.local.remove(LOCAL_PRE_SPACES_BACKUP_KEY);
    await browser.storage.local.set({ [LOCAL_MAINTENANCE_MIGRATIONS_KEY]: 2 });
  } catch {
    // Retry next startup rather than marking cleanup complete after a storage error.
  }
}


function shortcutOrigin(value) {
  try { return new URL(value).origin; } catch { return ""; }
}

function shortcutHostKey(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    // A very common first navigation is example.com -> www.example.com. Treat
    // those as the same shortcut site without broadening matching to unrelated
    // subdomains or trying to implement the Public Suffix List ourselves.
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

async function applyLearnedFavicon(loaded, targets, { image, sourceKind, sourceUrl = "" }) {
  if (!image) return false;
  image = await normalizeLocalFaviconDataUrl(image);
  if (!image) return false;
  const writeBaseline = createWriteBaseline(loaded.state);
  let changed = false;
  for (const shortcut of targets) {
    const customUploadFallback = shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
    const nextSourceKind = customUploadFallback ? shortcut.imageSourceKind : sourceKind;
    const nextSourceUrl = customUploadFallback ? shortcut.imageSourceUrl : sourceUrl;
    const nextFallback = customUploadFallback;
    if (shortcut.image === image &&
        shortcut.imageAssetId === "" &&
        shortcut.imageSyncKind === "device" &&
        shortcut.imageIsFallback === nextFallback &&
        shortcut.imageSourceKind === nextSourceKind &&
        shortcut.imageSourceUrl === nextSourceUrl) continue;

    shortcut.image = image;
    shortcut.imageSyncData = "";
    shortcut.imageAssetId = "";
    shortcut.imageSyncKind = "device";
    shortcut.imageIsFallback = nextFallback;
    if (!customUploadFallback) {
      shortcut.imageSourceKind = nextSourceKind;
      shortcut.imageSourceUrl = nextSourceUrl;
    }
    changed = true;
  }
  if (changed) await writeLocalState(loaded.state, { baseState: writeBaseline });
  return changed;
}

function findFaviconLearningTargets(state, pageUrl, shortcutId = "") {
  const pageOrigin = shortcutOrigin(pageUrl);
  const pageHostKey = shortcutHostKey(pageUrl);
  if (!pageOrigin || !pageHostKey) return [];

  return flattenShortcuts(state).filter(shortcut => {
    const requestedShortcut = shortcutId && shortcut.id === shortcutId;
    const sameSiteFallback = !shortcutId &&
      (shortcutOrigin(shortcut.url) === pageOrigin || shortcutHostKey(shortcut.url) === pageHostKey);
    const refreshableSiteArtwork = ["favicon", "firefox"].includes(shortcut.imageSourceKind || "none");
    const missingNormalArtwork = !shortcut.image && (shortcut.imageSourceKind || "none") === "none";
    const missingCustomFallback = !shortcut.image && shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
    return (requestedShortcut || sameSiteFallback) && (refreshableSiteArtwork || missingNormalArtwork || missingCustomFallback);
  });
}

async function prepareFaviconLearning(pageUrl, shortcutId = "") {
  if (!pageUrl || !/^https?:/i.test(pageUrl)) return false;
  const loaded = await ensureLocalStorage();
  // Browser-provided tab favicons are already local browser data. Do not make
  // that click/visit fallback depend on the optional all-sites host permission;
  // only the subsequent remote quality pass needs Website Access.
  if (!loaded.state.settings.autoSiteIcons) return false;
  return findFaviconLearningTargets(loaded.state, pageUrl, shortcutId).length > 0;
}

async function applyLearnedFaviconForTab(pageUrl, shortcutId, candidate) {
  if (!candidate?.image || !pageUrl || !/^https?:/i.test(pageUrl)) return false;
  const loaded = await ensureLocalStorage();
  if (!loaded.state.settings.autoSiteIcons) return false;
  const targets = findFaviconLearningTargets(loaded.state, pageUrl, shortcutId);
  if (!targets.length) return false;
  return applyLearnedFavicon(loaded, targets, candidate);
}

async function resolveTabNativeFavicon(tab) {
  // Chrome's local favicon cache is the fastest and safest native fallback.
  // Resolve it outside the serialized state queue. The legacy `firefox`
  // source-kind name is retained for Firefox/Chrome profile interoperability.
  const protectedStore = isProtectedChromeStoreUrl(tab?.url || "");
  const sourceUrl = /^https?:/i.test(tab?.favIconUrl || "") ? tab.favIconUrl : "";
  let image = /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(tab?.favIconUrl || "")
    ? tab.favIconUrl
    : "";
  if (!image) {
    try { image = await readNativeFaviconDataUrl(tab.url, 128); } catch {}
  }
  if (!image && sourceUrl && !protectedStore) {
    try { image = await fetchImageDataUrl(sourceUrl); } catch {}
  }
  return image ? {
    image,
    sourceKind: "firefox",
    sourceUrl: protectedStore ? "" : sourceUrl
  } : null;
}

async function learnFaviconFromTab(tab, shortcutId = "") {
  if (!tab?.url || !/^https?:/i.test(tab.url)) return false;

  // Only short state/permission work lives on MosaicSync's serialized queue.
  // Native/favicon network resolution happens after this preflight has released
  // the queue, so a slow website can no longer delay Sync reconciliation.
  const eligible = await enqueue(() => prepareFaviconLearning(tab.url, shortcutId), { persistSyncError: false });
  if (eligible !== true) return false;

  let learned = false;
  let nativeCandidate = null;
  try { nativeCandidate = await resolveTabNativeFavicon(tab); } catch {}
  if (nativeCandidate?.image) {
    const applied = await enqueue(
      () => applyLearnedFaviconForTab(tab.url, shortcutId, nativeCandidate),
      { persistSyncError: false }
    );
    learned = applied === true || learned;
  }

  // A click is an explicit opportunity to retry immediately even if a previous
  // background lookup was in backoff. This potentially slow quality pass also
  // runs outside the state queue; its commit re-reads current state before write.
  let discovered = null;
  if (!isProtectedChromeStoreUrl(tab.url)) {
    try { discovered = await resolveFaviconForUrl(tab.url, { preferQuality: true }); } catch {}
  }
  if (discovered?.image) {
    const applied = await enqueue(
      () => applyLearnedFaviconForTab(tab.url, shortcutId, {
        image: discovered.image,
        sourceKind: "favicon",
        sourceUrl: discovered.sourceUrl
      }),
      { persistSyncError: false }
    );
    learned = applied === true || learned;
  }

  return learned;
}

async function runTabFaviconLearningJob(tabId, job) {
  const request = job.latest;
  job.latest = null;
  if (!request) return;
  const learned = await learnFaviconFromTab(request.tab, request.shortcutId);
  if (learned) {
    await enqueue(() => clearPendingShortcutNavigation(tabId), { persistSyncError: false });
  }
}

function pumpTabFaviconLearningQueue() {
  while (activeTabFaviconLearningJobs < TAB_FAVICON_LEARN_CONCURRENCY && tabFaviconLearningQueue.length) {
    const tabId = tabFaviconLearningQueue.shift();
    const job = tabFaviconLearningJobs.get(tabId);
    if (!job || job.running || !job.latest) continue;

    job.running = true;
    activeTabFaviconLearningJobs += 1;
    void runTabFaviconLearningJob(tabId, job).catch(error => {
      console.warn(`${PRODUCT_NAME}: tab favicon learning failed`, error);
    }).finally(() => {
      job.running = false;
      activeTabFaviconLearningJobs = Math.max(0, activeTabFaviconLearningJobs - 1);
      if (job.latest) {
        tabFaviconLearningQueue.push(tabId);
      } else {
        tabFaviconLearningJobs.delete(tabId);
      }
      pumpTabFaviconLearningQueue();
    });
  }
}

function scheduleTabFaviconLearning(tabId, tab, shortcutId = "") {
  if (!Number.isInteger(tabId) || !tab?.url || !/^https?:/i.test(tab.url) || !shortcutId) return;
  const request = {
    tab: { url: String(tab.url), favIconUrl: String(tab.favIconUrl || "") },
    shortcutId
  };
  const existing = tabFaviconLearningJobs.get(tabId);
  if (existing) {
    // Coalesce repeated favicon/status events for one tab to the newest snapshot.
    existing.latest = request;
    return;
  }
  if (tabFaviconLearningJobs.size >= PENDING_NAVIGATION_MAX_ENTRIES) return;
  tabFaviconLearningJobs.set(tabId, { latest: request, running: false });
  tabFaviconLearningQueue.push(tabId);
  pumpTabFaviconLearningQueue();
}

browser.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo?.favIconUrl && changeInfo?.status !== "complete") return;
  const tabSnapshot = { url: String(tab?.url || ""), favIconUrl: String(tab?.favIconUrl || "") };
  if (!tabSnapshot.url) return;
  // Reading the durable navigation marker is short serialized work. The
  // potentially slow favicon job is scheduled only after this queue turn ends.
  void enqueue(() => readPendingShortcutNavigation(tabId), { persistSyncError: false }).then(pending => {
    if (!validPendingNavigation(pending)) return; // Ignore unrelated browsing tabs even with all-sites permission.
    scheduleTabFaviconLearning(tabId, tabSnapshot, pending.shortcutId);
  });
});

browser.runtime.onMessage.addListener((message, sender) => {
  // runtime.onMessage is intended for our own extension contexts; external
  // extensions use onMessageExternal. Keep an explicit sender assertion anyway
  // so a future manifest/API change cannot accidentally widen this privileged
  // command surface.
  if (sender?.id && sender.id !== browser.runtime.id) return undefined;
  if (!message || typeof message !== "object" || !String(message.type || "").startsWith("mosaicsync:")) return undefined;

  switch (message.type) {
    case "mosaicsync:expect-shortcut-navigation":
      return enqueue(() => rememberPendingShortcutNavigation(sender?.tab?.id, message.shortcutId));
    case "mosaicsync:hydrate-missing-icons":
      return requestMissingShortcutIconHydration({
        shortcutIds: message.shortcutIds,
        force: message.force === true,
        upgradeRecoveredFavicons: message.upgradeRecoveredFavicons === true
      });
    case "mosaicsync:get-sync-status":
      return enqueue(getSyncStatus, { persistSyncError: false });
    case "mosaicsync:set-sync-enabled":
      return enqueue(() => setSyncEnabled(message.enabled === true));
    case "mosaicsync:bootstrap-local":
      return enqueue(bootstrapLocal);
    case "mosaicsync:bootstrap-remote":
      return enqueue(() => bootstrapRemote({ waitIfMissing: false }));
    case "mosaicsync:wait-for-remote":
      return enqueue(() => bootstrapRemote({ waitIfMissing: true }));
    case "mosaicsync:reconcile-if-needed":
      return enqueue(reconcileIfNewCommit);
    case "mosaicsync:reconcile-now":
      return enqueue(() => reconcile("merge"));
    case "mosaicsync:restore-from-sync":
      return enqueue(() => bootstrapRemote({ waitIfMissing: false, force: true }));
    case "mosaicsync:clear-sync-data":
      return enqueue(clearSyncData);
    default:
      return Promise.resolve({ ok: false, error: "Unknown MosaicSync message." });
  }
});

// -----------------------------------------------------------------------------
// Sync bootstrap and reconciliation
// -----------------------------------------------------------------------------
async function setSyncEnabled(enabled) {
  const previous = await readLocalMeta();

  if (!enabled) {
    await clearAllPendingSyncRecoveryState();
    const next = await writeLocalMeta({
      ...previous,
      syncEnabled: false,
      syncInitialized: false,
      syncBootstrapMode: "none",
      syncStatus: "off",
      lastSyncError: "",
      lastSyncWarning: "",
      syncSkippedAssets: 0,
      syncFastSnapshotFallback: false,
      syncWaitStartedAt: 0,
      lastAppliedSyncRevision: "",
      lastAppliedWorkSyncRevision: "",
      lastAppliedDeviceSnapshotRevision: "",
      lastRemoteReceiptAt: 0,
      lastRemoteReceiptRevision: "",
      lastRemoteReceiptUpdatedAt: 0,
      lastRemoteReceiptOriginDeviceId: ""
    });
    await ensureSyncWatchAlarm(next);
    return { ok: true, meta: next, action: "disabled" };
  }

  // Granting consent is deliberately separate from choosing which copy wins.
  // This prevents a newly installed second computer from publishing an empty
  // layout before Firefox has downloaded the existing storage.sync snapshot.
  const next = await writeLocalMeta({
    ...previous,
    syncEnabled: true,
    syncInitialized: previous.syncInitialized === true,
    syncBootstrapMode: previous.syncInitialized ? "none" : previous.syncBootstrapMode,
    syncStatus: previous.syncInitialized ? "ready" : "waiting",
    lastSyncError: "",
    lastSyncWarning: "",
    syncSkippedAssets: 0,
    syncFastSnapshotFallback: false,
    syncWaitStartedAt: previous.syncInitialized ? 0 : (previous.syncWaitStartedAt || 0)
  });
  await ensureSyncWatchAlarm(next);
  return { ok: true, meta: next, action: previous.syncInitialized ? "already-initialized" : "needs-source" };
}

function hasSnapshotData(snapshot) {
  return Boolean(snapshot?.settings) ||
    Boolean(snapshot?.dataset) ||
    [...(snapshot?.records?.values?.() || [])].some(record => record?.kind !== "deleted");
}

function deviceSnapshotKey(deviceId) {
  return `${SYNC_DEVICE_SNAPSHOT_PREFIX}${encodeURIComponent(String(deviceId || ""))}`;
}

function deviceSnapshotChunkKey(deviceId, slot, index) {
  return `${deviceSnapshotKey(deviceId)}.chunk.${slot}.${index}`;
}

function deviceSnapshotSlotKeys(deviceId, slot) {
  if (!["a", "b"].includes(slot)) return [];
  return Array.from({ length: 96 }, (_, index) => deviceSnapshotChunkKey(deviceId, slot, index));
}

function obsoleteOwnDeviceSnapshotChunkKeys(all, deviceId, publication) {
  const prefix = `${deviceSnapshotKey(deviceId)}.chunk.`;
  const keep = publication?.mode === "chunked"
    ? new Set(Object.keys(publication.chunkWrites || {}))
    : new Set();
  return Object.keys(all || {}).filter(key => key.startsWith(prefix) && !keep.has(key));
}

function isDeviceSnapshotKey(key) {
  return typeof key === "string" && key.startsWith(SYNC_DEVICE_SNAPSHOT_PREFIX);
}

function isDeviceSnapshotChunkKey(key) {
  return isDeviceSnapshotKey(key) && key.includes(".chunk.");
}

function isDeviceSnapshotRootKey(key) {
  return isDeviceSnapshotKey(key) && !isDeviceSnapshotChunkKey(key);
}

function base64ToBytes(value) {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(value);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readBoundedStreamBytes(stream, maxBytes) {
  if (!stream?.getReader || !Number.isFinite(maxBytes) || maxBytes < 1) return null;
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      if (total + chunk.byteLength > maxBytes) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function encodeDeviceSnapshotPayload(payload) {
  if (typeof CompressionStream !== "function") return null;
  const json = JSON.stringify(payload);
  const input = new TextEncoder().encode(json);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data: bytesToBase64(compressed), jsonChars: json.length, compressedBytes: compressed.length };
}

function deviceSnapshotMetadata(records, settings, deviceId, commitId, publishedAt, encoded) {
  return {
    schemaVersion: DEVICE_SNAPSHOT_SCHEMA_VERSION,
    deviceId,
    commitId,
    publishedAt,
    updatedAt: datasetUpdatedAt(records, settings, 0),
    liveRecordCount: liveRecordCount(records),
    recordFingerprint: recordFingerprint(records),
    settingsModifiedAt: Number(settings?.modifiedAt) || 0,
    encoding: "gzip-base64",
    compressedBytes: encoded.compressedBytes,
    jsonChars: encoded.jsonChars
  };
}

async function decodeDeviceSnapshotData(value, data) {
  if (!value || value.schemaVersion !== DEVICE_SNAPSHOT_SCHEMA_VERSION) return null;
  if (value.encoding !== "gzip-base64" || typeof data !== "string" || !data) return null;
  if (typeof DecompressionStream !== "function") return null;
  try {
    const compressed = base64ToBytes(data);
    if (Number(value.compressedBytes) > 0 && compressed.byteLength !== Number(value.compressedBytes)) return null;
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    // Bound decompressed bytes while streaming rather than allocating the entire
    // payload first. A corrupt/high-ratio snapshot can therefore never turn the
    // post-decode size check itself into an avoidable MV3 worker memory spike.
    const decompressed = await readBoundedStreamBytes(stream, DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES);
    if (!decompressed) return null;
    const payload = JSON.parse(new TextDecoder().decode(decompressed));
    if (!payload || payload.version !== DEVICE_SNAPSHOT_SCHEMA_VERSION || !Array.isArray(payload.records) || !payload.settings) return null;
    const records = new Map();
    for (const record of payload.records) {
      if (!record?.id || !["shortcut", "folder", "deleted"].includes(record.kind)) continue;
      records.set(record.id, record);
    }
    const settings = payload.settings?.kind === "settings" ? payload.settings : null;
    if (!settings) return null;
    if (Number(value.liveRecordCount) !== liveRecordCount(records)) return null;
    if (value.recordFingerprint && value.recordFingerprint !== recordFingerprint(records)) return null;
    if (Number(value.settingsModifiedAt) !== Number(settings.modifiedAt || 0)) return null;
    return {
      kind: "device-snapshot",
      deviceId: typeof value.deviceId === "string" ? value.deviceId : "",
      commitId: typeof value.commitId === "string" ? value.commitId : "",
      publishedAt: Number(value.publishedAt) || 0,
      updatedAt: Number(value.updatedAt) || 0,
      records,
      settings
    };
  } catch {
    return null;
  }
}

async function decodeDeviceSnapshotPayload(value, all = null) {
  if (!value || value.schemaVersion !== DEVICE_SNAPSHOT_SCHEMA_VERSION) return null;

  if (value.kind === "device-snapshot") {
    return decodeDeviceSnapshotData(value, value.data);
  }

  if (value.kind !== "device-snapshot-manifest" || value.chunkSchemaVersion !== DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION) return null;
  if (!all || typeof all !== "object") return null;
  if (!value.deviceId || !value.commitId || !["a", "b"].includes(value.slot)) return null;
  const parts = Number(value.parts);
  if (!Number.isInteger(parts) || parts < 1 || parts > 96) return null;

  const chunks = [];
  for (let index = 0; index < parts; index += 1) {
    const chunk = all[deviceSnapshotChunkKey(value.deviceId, value.slot, index)];
    if (!chunk || chunk.kind !== "device-snapshot-chunk" || chunk.schemaVersion !== DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION) return null;
    if (chunk.deviceId !== value.deviceId || chunk.commitId !== value.commitId || chunk.slot !== value.slot) return null;
    if (Number(chunk.index) !== index || Number(chunk.total) !== parts || typeof chunk.data !== "string") return null;
    chunks.push(chunk.data);
  }
  const data = chunks.join("");
  if (Number(value.dataChars) !== data.length) return null;
  if (value.dataFingerprint && value.dataFingerprint !== fnv1a(data)) return null;
  return decodeDeviceSnapshotData(value, data);
}

function retainTombstones(target, source) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const [id, record] of source?.entries?.() || []) {
    if (target.has(id) || record?.kind !== "deleted") continue;
    if (Number.isFinite(record.deletedAt) && record.deletedAt < cutoff) continue;
    target.set(id, record);
  }
  return target;
}

async function readDeviceSnapshots(all) {
  const snapshots = [];
  for (const [key, value] of Object.entries(all || {})) {
    if (!isDeviceSnapshotRootKey(key)) continue;
    const decoded = await decodeDeviceSnapshotPayload(value, all);
    if (decoded) snapshots.push(decoded);
  }
  return snapshots;
}

function mergeDeviceSnapshots(snapshots) {
  if (!Array.isArray(snapshots) || !snapshots.length) return null;
  let records = new Map();
  let settings = null;
  let updatedAt = 0;
  let latestPublishedAt = 0;
  let latestOriginDeviceId = "";
  const revisions = [];
  for (const snapshot of snapshots) {
    records = mergeRecordMaps(records, snapshot.records);
    settings = settings ? chooseNewerRecord(settings, snapshot.settings) : snapshot.settings;
    updatedAt = Math.max(updatedAt, Number(snapshot.updatedAt) || 0);
    if (Number(snapshot.publishedAt) >= latestPublishedAt) {
      latestPublishedAt = Number(snapshot.publishedAt) || 0;
      latestOriginDeviceId = snapshot.deviceId || latestOriginDeviceId;
    }
    revisions.push(`${snapshot.deviceId}:${snapshot.commitId}:${snapshot.updatedAt}`);
  }
  if (!settings) return null;
  revisions.sort(compareStableText);
  return {
    records: pruneExpiredTombstones(records),
    settings,
    dataset: null,
    assets: new Map(),
    sourceKind: "device-snapshots",
    revision: `devices:${fnv1a(revisions.join("|"))}`,
    updatedAt,
    publishedAt: latestPublishedAt,
    originDeviceId: latestOriginDeviceId
  };
}

async function buildDeviceSnapshotPublication(records, settings, deviceId, currentRoot = null, { commitId = uid("device-commit"), publishedAt = Date.now() } = {}) {
  const payload = {
    version: DEVICE_SNAPSHOT_SCHEMA_VERSION,
    records: [...records.values()],
    settings
  };
  const encoded = await encodeDeviceSnapshotPayload(payload);
  if (!encoded) return null;
  const metadata = deviceSnapshotMetadata(records, settings, deviceId, commitId, publishedAt, encoded);
  const atomic = {
    ...metadata,
    kind: "device-snapshot",
    data: encoded.data
  };
  const rootKey = deviceSnapshotKey(deviceId);
  if (syncEntryBytes(rootKey, atomic) <= SYNC_QUOTA_BYTES_PER_ITEM) {
    return { mode: "atomic", rootKey, rootValue: atomic, chunkWrites: {} };
  }

  const slot = currentRoot?.kind === "device-snapshot-manifest" && currentRoot.slot === "a" ? "b" : "a";
  const dataChunks = [];
  for (let offset = 0; offset < encoded.data.length; offset += DEVICE_SNAPSHOT_CHUNK_DATA_CHARS) {
    dataChunks.push(encoded.data.slice(offset, offset + DEVICE_SNAPSHOT_CHUNK_DATA_CHARS));
  }
  if (!dataChunks.length || dataChunks.length > 96) return null;

  const chunkWrites = {};
  dataChunks.forEach((data, index) => {
    const key = deviceSnapshotChunkKey(deviceId, slot, index);
    chunkWrites[key] = {
      schemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
      kind: "device-snapshot-chunk",
      deviceId,
      commitId,
      slot,
      index,
      total: dataChunks.length,
      data
    };
  });
  for (const [key, value] of Object.entries(chunkWrites)) {
    if (syncEntryBytes(key, value) > SYNC_QUOTA_BYTES_PER_ITEM) return null;
  }

  const manifest = {
    ...metadata,
    kind: "device-snapshot-manifest",
    chunkSchemaVersion: DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
    slot,
    parts: dataChunks.length,
    dataChars: encoded.data.length,
    dataFingerprint: fnv1a(encoded.data)
  };
  if (syncEntryBytes(rootKey, manifest) > SYNC_QUOTA_BYTES_PER_ITEM) return null;
  return { mode: "chunked", rootKey, rootValue: manifest, chunkWrites };
}

async function readOwnDeviceSnapshot(deviceId) {
  const rootKey = deviceSnapshotKey(deviceId);
  const rootRead = await browser.storage.sync.get(rootKey);
  const root = rootRead?.[rootKey];
  if (!root) return { root: null, decoded: null };
  if (root.kind !== "device-snapshot-manifest") {
    return { root, decoded: await decodeDeviceSnapshotPayload(root, rootRead) };
  }
  const parts = Number(root.parts);
  if (!Number.isInteger(parts) || parts < 1 || parts > 96 || !["a", "b"].includes(root.slot)) return { root, decoded: null };
  const keys = Array.from({ length: parts }, (_, index) => deviceSnapshotChunkKey(deviceId, root.slot, index));
  const chunks = await browser.storage.sync.get(keys);
  return { root, decoded: await decodeDeviceSnapshotPayload(root, { ...rootRead, ...chunks }) };
}

async function publishDeviceSnapshot(records, settings, meta, { previousRecords = null, extraTombstones = null } = {}) {
  if (!meta?.deviceId) return { written: false, reason: "missing-device" };

  // The active computer owns its snapshot namespace. For chunked snapshots we
  // double-buffer two fixed chunk slots: write the inactive slot completely,
  // then switch the tiny root manifest last. A receiver therefore never accepts
  // a torn generation, while repeated edits do not leak a new set of chunk keys.
  const currentOwn = await readOwnDeviceSnapshot(meta.deviceId);
  const snapshotRecords = new Map(records);
  retainTombstones(snapshotRecords, currentOwn.decoded?.records);
  retainTombstones(snapshotRecords, previousRecords);
  retainTombstones(snapshotRecords, extraTombstones);

  const publication = await buildDeviceSnapshotPublication(snapshotRecords, settings, meta.deviceId, currentOwn.root);
  if (!publication) return { written: false, reason: "too-large", setRevision: "" };

  try {
    if (publication.mode === "chunked") {
      // The target slot is inactive, so stale chunks from an older generation in
      // that slot are non-authoritative and safe to reclaim before writing. This
      // prevents historical large snapshots from consuming quota forever after a
      // profile shrinks, while the currently active slot remains untouched.
      try {
        const targetSlot = publication.rootValue.slot;
        const oldInactive = await browser.storage.sync.get(deviceSnapshotSlotKeys(meta.deviceId, targetSlot));
        const obsoleteInactiveKeys = Object.keys(oldInactive || {});
        if (obsoleteInactiveKeys.length) await removeSyncItems(obsoleteInactiveKeys);
      } catch {}

      // Chunks first, root manifest last. Firefox can deliver keys in any order;
      // decodeDeviceSnapshotPayload refuses the new generation until every chunk
      // named by the manifest is present and matches its commit ID/fingerprint.
      await writeSyncItems(publication.chunkWrites, { skipPreflight: true });
    }
    await writeSyncItems({ [publication.rootKey]: publication.rootValue }, { skipPreflight: true });
  } catch (error) {
    if (publication.mode === "chunked") {
      // If the manifest was never committed, these inactive-slot chunks are not
      // authoritative. Best-effort removal prevents quota leaks after failures.
      try { await removeSyncItems(Object.keys(publication.chunkWrites)); } catch {}
    }
    if (isQuotaError(error)) return { written: false, reason: "quota", setRevision: "" };
    throw error;
  }

  // Revision bookkeeping is intentionally after the latency-critical write.
  const all = await browser.storage.sync.get(null);
  // Once the root has committed, only the chunks named by that root can ever be
  // authoritative. Reclaim the opposite slot and any stale tail chunks left by
  // an older, larger generation. Failure is harmless and retried by a later publish.
  const obsoleteChunks = obsoleteOwnDeviceSnapshotChunkKeys(all, meta.deviceId, publication);
  if (obsoleteChunks.length) {
    try {
      await removeSyncItems(obsoleteChunks);
      for (const key of obsoleteChunks) delete all[key];
    } catch {}
  }
  const knownDeviceSnapshots = await readDeviceSnapshots(all);
  return {
    written: true,
    mode: publication.mode,
    value: publication.rootValue,
    setRevision: mergeDeviceSnapshots(knownDeviceSnapshots)?.revision || ""
  };
}


async function readCoreSources(all = null, { includeAssets = true } = {}) {
  const values = all && typeof all === "object" ? all : await browser.storage.sync.get(null);
  const [shared, deviceSnapshots] = await Promise.all([
    readSyncSnapshot(values, { includeAssets }),
    readDeviceSnapshots(values)
  ]);
  const device = mergeDeviceSnapshots(deviceSnapshots);
  return { all: values, shared, device, deviceSnapshots };
}


function deviceRootDescriptor(key, value) {
  if (!isDeviceSnapshotRootKey(key) || !value || !["device-snapshot", "device-snapshot-manifest"].includes(value.kind)) return null;
  const deviceId = typeof value.deviceId === "string" ? value.deviceId : "";
  if (!deviceId) return null;
  return { key, deviceId, publishedAt: Number(value.publishedAt) || 0 };
}

async function maybeGarbageCollectStaleDeviceSnapshots(meta, { force = false } = {}) {
  if (!meta?.syncEnabled || !meta?.deviceId) return meta;
  const now = Date.now();
  if (!force && now - (Number(meta.lastDeviceSnapshotGcAt) || 0) < DEVICE_SNAPSHOT_GC_INTERVAL_MS) return meta;

  try {
    const all = await browser.storage.sync.get(null);
    const roots = Object.entries(all)
      .map(([key, value]) => deviceRootDescriptor(key, value))
      .filter(Boolean)
      .sort((a, b) => b.publishedAt - a.publishedAt || compareStableText(a.deviceId, b.deviceId));

    const keepRecent = new Set(roots.slice(0, DEVICE_SNAPSHOT_MAX_RECENT_DEVICES).map(entry => entry.deviceId));
    keepRecent.add(meta.deviceId);
    const staleIds = new Set();
    roots.forEach((entry, index) => {
      if (entry.deviceId === meta.deviceId) return;
      const age = now - entry.publishedAt;
      const expired = entry.publishedAt > 0 && age >= DEVICE_SNAPSHOT_RETENTION_MS;
      const overCapAndMature = index >= DEVICE_SNAPSHOT_MAX_RECENT_DEVICES && age >= DEVICE_SNAPSHOT_CAP_MIN_AGE_MS && !keepRecent.has(entry.deviceId);
      if (expired || overCapAndMature) staleIds.add(entry.deviceId);
    });

    if (staleIds.size) {
      const keys = Object.keys(all).filter(key => {
        for (const deviceId of staleIds) {
          const root = deviceSnapshotKey(deviceId);
          if (key === root || key.startsWith(`${root}.chunk.`)) return true;
        }
        return false;
      });
      if (keys.length) await removeSyncItems(keys);
    }

    const next = { ...meta, lastDeviceSnapshotGcAt: now };
    await writeLocalMeta(next);
    return next;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: stale device snapshot cleanup skipped`, error);
    return meta;
  }
}

function combinedRemoteCore(shared, device) {
  const sharedUsable = isSnapshotUsable(shared);
  if (!device && !sharedUsable) return null;
  if (!device) {
    return {
      records: pruneExpiredTombstones(shared.records),
      settings: shared.settings,
      assets: shared.assets || new Map(),
      sourceKind: "shared-ledger",
      revision: datasetRevision(shared.dataset),
      updatedAt: Number(shared.dataset?.updatedAt) || datasetUpdatedAt(shared.records, shared.settings, 0),
      originDeviceId: typeof shared.dataset?.originDeviceId === "string" ? shared.dataset.originDeviceId : ""
    };
  }

  let records = new Map(device.records);
  let settings = device.settings;
  if (sharedUsable) {
    records = mergeRecordMaps(records, shared.records);
    settings = chooseNewerRecord(settings, shared.settings);
  }
  const revisionParts = [device.revision];
  if (sharedUsable) revisionParts.push(datasetRevision(shared.dataset));
  revisionParts.sort(compareStableText);
  return {
    records: pruneExpiredTombstones(records),
    settings,
    assets: shared.assets || new Map(),
    sourceKind: sharedUsable ? "device+shared" : "device-snapshots",
    revision: `core:${fnv1a(revisionParts.join("|"))}`,
    updatedAt: Math.max(device.updatedAt || 0, sharedUsable ? Number(shared.dataset?.updatedAt) || 0 : 0),
    originDeviceId: device.originDeviceId || (sharedUsable ? String(shared.dataset?.originDeviceId || "") : "")
  };
}

function remoteCoreUsable(core) {
  return Boolean(core?.settings && core?.records instanceof Map);
}

function assetIdsByUsage(all) {
  const shortcut = new Set();
  for (const value of Object.values(all || {})) {
    if (value?.kind === "shortcut" && ["sync", "local"].includes(value.imageKind) && value.imageAssetId) {
      shortcut.add(value.imageAssetId);
    }
  }
  return { shortcut };
}

async function syncUsageBreakdown(all, totalBytes) {
  const { shortcut } = assetIdsByUsage(all);
  const coreKeys = [];
  const shortcutKeys = [];
  const overheadKeys = [];

  for (const [key, value] of Object.entries(all || {})) {
    if (!key.startsWith(SYNC_PREFIX)) continue;
    const workNamespace = syncNamespace(WORK_SPACE_ID);
    if (key === SYNC_SETTINGS_KEY || key.startsWith(SYNC_ITEM_PREFIX) || isDeviceSnapshotKey(key) ||
        key === workNamespace.settingsKey || key === workNamespace.datasetKey || key.startsWith(workNamespace.itemPrefix)) {
      coreKeys.push(key);
      continue;
    }
    if (value?.kind === "asset" || value?.kind === "asset-part") {
      // Release 1.9 has no wallpaper binary Sync. Any unreferenced legacy wallpaper
      // chunks therefore appear under cleanup/metadata until orphan GC removes them.
      if (shortcut.has(value.id)) shortcutKeys.push(key);
      else overheadKeys.push(key);
      continue;
    }
    overheadKeys.push(key);
  }

  const bytesFor = keys => keys.length ? browser.storage.sync.getBytesInUse(keys) : Promise.resolve(0);
  const [core, shortcutArtwork, overhead] = await Promise.all([
    bytesFor(coreKeys), bytesFor(shortcutKeys), bytesFor(overheadKeys)
  ]);
  const total = Math.max(0, Number(totalBytes) || 0);
  return {
    core: Math.max(0, Number(core) || 0),
    shortcutArtwork: Math.max(0, Number(shortcutArtwork) || 0),
    overhead: Math.max(0, Number(overhead) || 0),
    free: Math.max(0, SYNC_QUOTA_BYTES - total),
    total
  };
}

function datasetRevision(dataset) {
  if (!dataset || typeof dataset !== "object") return "";
  const commitId = typeof dataset.commitId === "string" ? dataset.commitId : "";
  if (commitId) return `commit:${commitId}`;
  const updatedAt = Number(dataset.updatedAt) || 0;
  const fingerprint = typeof dataset.recordFingerprint === "string" ? dataset.recordFingerprint : "";
  if (!updatedAt && !fingerprint) return "";
  return `legacy:${updatedAt}:${fingerprint}`;
}

function markAppliedSnapshot(meta, dataset) {
  const revision = datasetRevision(dataset);
  return revision ? { ...meta, lastAppliedSyncRevision: revision } : meta;
}

function markAppliedWorkSnapshot(meta, dataset) {
  const revision = datasetRevision(dataset);
  return revision ? { ...meta, lastAppliedWorkSyncRevision: revision } : meta;
}

function observeRemoteCore(meta, core) {
  if (!remoteCoreUsable(core) || !core.revision) return meta;
  const originDeviceId = typeof core.originDeviceId === "string" ? core.originDeviceId : "";
  if (originDeviceId && originDeviceId === meta.deviceId) return meta;
  if (meta.lastRemoteReceiptRevision === core.revision) return meta;
  return {
    ...meta,
    lastRemoteReceiptAt: Date.now(),
    lastRemoteReceiptRevision: core.revision,
    lastRemoteReceiptUpdatedAt: Number(core.updatedAt) || 0,
    lastRemoteReceiptOriginDeviceId: originDeviceId
  };
}

function markAppliedRemoteCore(meta, deviceRevision = "") {
  if (!deviceRevision) return meta;
  return { ...meta, lastAppliedDeviceSnapshotRevision: deviceRevision };
}

async function reconcileIfNewCommit() {
  let meta = await readLocalMeta();
  if (!meta.syncEnabled) return { ok: true, skipped: true, reason: "sync-off", meta };
  if (!meta.syncInitialized) {
    if (meta.syncBootstrapMode === "await-remote") return bootstrapRemote({ waitIfMissing: true });
    return { ok: true, skipped: true, reason: "sync-not-ready", meta };
  }

  meta = await retryPendingLocalSyncMutation(meta);
  const all = await browser.storage.sync.get(null);
  const sources = await readCoreSources(all, { includeAssets: false });
  const sharedRevision = datasetRevision(sources.shared.dataset);
  const deviceRevision = sources.device?.revision || "";
  const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
  const workRevision = datasetRevision(workSnapshot.dataset);
  const sharedUnchanged = !sharedRevision || sharedRevision === meta.lastAppliedSyncRevision;
  const devicesUnchanged = !deviceRevision || deviceRevision === meta.lastAppliedDeviceSnapshotRevision;
  const workUnchanged = !workRevision || workRevision === meta.lastAppliedWorkSyncRevision;

  // Commit markers are a fast signal, not proof that every storage.sync record
  // visible in this running browser has already been applied. Firefox can deliver
  // a multi-key extension snapshot in batches, and an event can be delayed or
  // missed. Compare the actual usable remote semantic content with the current
  // local workspaces before taking the cheap "already applied" exit.
  let contentUnchanged = true;
  if (sharedUnchanged && devicesUnchanged && workUnchanged) {
    const core = combinedRemoteCore(sources.shared, sources.device);
    const local = await ensureLocalStorage();
    if (remoteCoreUsable(core)) {
      const personal = workspaceStateNormalized(local.state, PERSONAL_SPACE_ID);
      const localRecords = flattenStateNormalized(personal, meta.deviceId);
      const localSettings = makeSettingsRecordNormalized(personal, meta.deviceId);
      contentUnchanged = recordFingerprint(core.records) === recordFingerprint(localRecords) &&
        settingsRecordEqual(core.settings, localSettings);
    }
    if (contentUnchanged && isSnapshotUsable(workSnapshot)) {
      const work = workspaceStateNormalized(local.state, WORK_SPACE_ID);
      const localRecords = flattenStateNormalized(work, meta.deviceId);
      const localSettings = makeSettingsRecordNormalized(work, meta.deviceId);
      contentUnchanged = recordFingerprint(workSnapshot.records) === recordFingerprint(localRecords) &&
        settingsRecordEqual(workSnapshot.settings, localSettings);
    }
  }
  if (sharedUnchanged && devicesUnchanged && workUnchanged && contentUnchanged) {
    return { ok: true, skipped: true, reason: "already-applied", meta };
  }
  return reconcile("merge");
}

async function getSyncStatus() {
  // One full Sync read is enough for both quota item-count and snapshot parsing.
  // Avoiding a second storage.sync.get(null) makes opening Settings cheaper.
  const [baseMeta, all, usedBytes] = await Promise.all([
    readLocalMeta(),
    browser.storage.sync.get(null),
    browser.storage.sync.getBytesInUse(null)
  ]);
  let count = 0;
  let remoteAssets = 0;
  let hasDeviceSnapshotSignal = false;
  for (const key in all) {
    if (key.startsWith(SYNC_PREFIX)) count += 1;
    if (all[key]?.kind === "asset") remoteAssets += 1;
    if (!hasDeviceSnapshotSignal && isDeviceSnapshotKey(key)) hasDeviceSnapshotSignal = true;
  }
  const exceeded = count > SYNC_QUOTA_MAX_ITEMS || usedBytes > SYNC_QUOTA_BYTES;
  const usage = await syncUsageBreakdown(all, usedBytes);
  const meta = {
    ...baseMeta,
    syncBytesInUse: Math.max(0, Number(usedBytes) || 0),
    syncItemCount: count,
    syncStatus: exceeded ? "error" : baseMeta.syncStatus,
    lastSyncError: exceeded ? "Firefox Sync storage quota was exceeded." : baseMeta.lastSyncError
  };

  // Status checks are read-only. Firefox may deliver a multi-key snapshot in
  // several batches, so never delete apparent "orphans" while merely inspecting.
  // Status only needs the core snapshot. Skip base64 concatenation/hash checks for
  // artwork; those are reserved for actual restore/reconcile operations.
  const sources = await readCoreSources(all, { includeAssets: false });
  const snapshot = sources.shared;
  const core = combinedRemoteCore(snapshot, sources.device);
  const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
  const workUsable = isSnapshotUsable(workSnapshot);
  const personalItems = remoteCoreUsable(core) ? liveRecordCount(core.records) : liveRecordCount(snapshot.records);
  const workItems = workUsable ? liveRecordCount(workSnapshot.records) : 0;
  const remoteItems = personalItems + workItems;
  const hasRemoteSignal = hasSnapshotData(snapshot) || hasSnapshotData(workSnapshot) || sources.deviceSnapshots.length > 0 || hasDeviceSnapshotSignal;
  const hasRemoteData = remoteCoreUsable(core);
  const expectedItems = (hasRemoteData
    ? liveRecordCount(core.records)
    : (Number.isInteger(Number(snapshot.dataset?.liveRecordCount)) ? Number(snapshot.dataset.liveRecordCount) : 0)) +
    (workUsable ? liveRecordCount(workSnapshot.records) : 0);
  const latestDevice = sources.deviceSnapshots.reduce((latest, candidate) =>
    !latest || Number(candidate.publishedAt) > Number(latest.publishedAt) ? candidate : latest, null);
  return {
    ok: true,
    meta,
    remoteItems,
    remoteExpectedItems: expectedItems,
    remoteAssets,
    usage,
    hasRemoteSignal,
    hasRemoteData,
    remoteState: !hasRemoteSignal ? "none" : (hasRemoteData ? "complete" : "partial"),
    remoteUpdatedAt: Math.max(
      Number(core?.updatedAt) || (Number.isFinite(snapshot.dataset?.updatedAt) ? snapshot.dataset.updatedAt : 0),
      Number(workSnapshot.dataset?.updatedAt) || 0
    ),
    remoteReceiptAt: meta.lastRemoteReceiptAt,
    lastRemoteReceiptUpdatedAt: meta.lastRemoteReceiptUpdatedAt,
    lastRemoteReceiptOriginDeviceId: meta.lastRemoteReceiptOriginDeviceId,
    remoteCommitId: latestDevice?.commitId || (typeof snapshot.dataset?.commitId === "string" ? snapshot.dataset.commitId : ""),
    remoteOriginDeviceId: core?.originDeviceId || (typeof snapshot.dataset?.originDeviceId === "string" ? snapshot.dataset.originDeviceId : ""),
    remoteSourceKind: core?.sourceKind || ""
  };
}

async function publishWorkspaceAuthoritative(fullState, meta, spaceId) {
  const namespace = syncNamespace(spaceId);
  const localState = workspaceStateNormalized(fullState, spaceId);
  let snapshot = await prepareSyncSnapshot(spaceId);
  const records = flattenStateNormalized(localState, meta.deviceId);
  const settings = makeSettingsRecordNormalized(localState, meta.deviceId);
  const timestamp = nextMutationTime(
    localState.updatedAt, localState.settingsModifiedAt, newestRecordTimestamp(records),
    snapshot.dataset?.updatedAt, snapshot.settings?.modifiedAt, newestRecordTimestamp(snapshot.records)
  );
  const writes = { [namespace.settingsKey]: settings };

  for (const [id, record] of records) writes[itemKey(id, spaceId)] = record;
  for (const [id, remoteRecord] of snapshot.records) {
    if (!records.has(id) && remoteRecord?.kind !== "deleted") {
      writes[itemKey(id, spaceId)] = makeTombstone(id, meta.deviceId, timestamp);
    }
  }

  await writeSyncItems(writes);
  const dataset = datasetRecord(timestamp, records, settings, { commitId: uid("commit"), originDeviceId: meta.deviceId });
  await writeSyncItems({ [namespace.datasetKey]: dataset });

  snapshot = await readSyncSnapshot(null, { spaceId });
  const desiredAssets = collectLocalAssetsNormalized(localState);
  const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets, spaceId);
  const desiredAssetIds = new Set(desiredAssets.keys());
  const staleAssetKeys = [];
  for (const [assetId, keys] of snapshot.assetKeysById) {
    if (!desiredAssetIds.has(assetId)) staleAssetKeys.push(...keys);
  }
  if (staleAssetKeys.length) await removeSyncItems([...new Set(staleAssetKeys)]);
  return { dataset, timestamp, assetResult };
}

async function bootstrapLocal() {
  const { state, meta } = await ensureLocalStorage();
  const personalState = workspaceStateNormalized(state, PERSONAL_SPACE_ID);
  if (!meta.syncEnabled) {
    return { ok: false, error: "Firefox Account Sync permission is not enabled on this device.", meta };
  }

  await markSyncing(meta);

  // Authoritative local publish without an empty-window race. Older builds
  // cleared every MosaicSync key before writing the new snapshot, which
  // could briefly look like a legitimate empty cloud copy on another device.
  // Instead, write the complete core first and represent removed records with
  // tombstones. The dataset commit marker is written last.
  let snapshot = await prepareSyncSnapshot();
  const records = flattenStateNormalized(personalState, meta.deviceId);
  const settings = makeSettingsRecordNormalized(personalState, meta.deviceId);
  const timestamp = nextMutationTime(
    personalState.updatedAt, personalState.settingsModifiedAt, newestRecordTimestamp(records),
    snapshot.dataset?.updatedAt, snapshot.settings?.modifiedAt, newestRecordTimestamp(snapshot.records)
  );
  const writes = { [SYNC_SETTINGS_KEY]: settings };
  const deviceRecords = new Map(records);

  for (const [id, record] of records) writes[itemKey(id)] = record;
  for (const [id, remoteRecord] of snapshot.records) {
    if (!records.has(id) && remoteRecord?.kind !== "deleted") {
      const tombstone = makeTombstone(id, meta.deviceId, timestamp);
      writes[itemKey(id)] = tombstone;
      deviceRecords.set(id, tombstone);
    } else if (!records.has(id) && remoteRecord?.kind === "deleted") {
      deviceRecords.set(id, remoteRecord);
    }
  }

  // Release 1.14 publishes one compact, device-owned core snapshot first. No other
  // computer writes this key, so Firefox's server-precedence rule cannot clobber
  // a newer local edit with another device's older value. A receiving Firefox
  // can restore the full layout from this one atomic item instead of waiting for
  // dozens of record keys to arrive in the same Sync cycle.
  const fastPublish = await publishDeviceSnapshot(deviceRecords, settings, meta);

  await writeSyncItems(writes);
  const publishedDataset = datasetRecord(timestamp, records, settings, { commitId: uid("commit"), originDeviceId: meta.deviceId });
  await writeSyncItems({ [SYNC_DATASET_KEY]: publishedDataset });

  snapshot = await readSyncSnapshot();
  const desiredAssets = collectLocalAssetsNormalized(personalState);
  const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets);

  // A deliberate authoritative publish is the one safe time to clean stale
  // artwork, including incomplete chunks left behind by old alpha builds.
  const desiredAssetIds = new Set(desiredAssets.keys());
  const staleAssetKeys = [];
  for (const [assetId, keys] of snapshot.assetKeysById) {
    if (!desiredAssetIds.has(assetId)) staleAssetKeys.push(...keys);
  }
  if (staleAssetKeys.length) await removeSyncItems([...new Set(staleAssetKeys)]);
  await clearAssetGcLedger();

  const workPublish = await publishWorkspaceAuthoritative(state, meta, WORK_SPACE_ID);
  const totalSkippedAssets = assetResult.skipped + workPublish.assetResult.skipped;
  const warningState = syncWarningState(totalSkippedAssets, !fastPublish.written);
  const refreshed = await refreshQuota({
    ...markAppliedSnapshot(meta, publishedDataset),
    lastAppliedDeviceSnapshotRevision: fastPublish.setRevision || meta.lastAppliedDeviceSnapshotRevision || "",
    lastAppliedWorkSyncRevision: datasetRevision(workPublish.dataset),
    syncEnabled: true,
    syncInitialized: true,
    syncBootstrapMode: "none",
    syncStatus: "ready",
    lastSyncAt: timestamp,
    lastSyncError: "",
    ...warningState,
    syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  await clearPendingLocalSyncMutation();
  await ensureSyncWatchAlarm(refreshed);
  return { ok: true, meta: refreshed, action: "published", remoteUpdatedAt: timestamp };
}

async function bootstrapRemote({ waitIfMissing = false, force = false } = {}) {
  const { state: fullLocalState, meta } = await ensureLocalStorage();
  const localState = workspaceStateNormalized(fullLocalState, PERSONAL_SPACE_ID);
  if (!meta.syncEnabled) {
    return { ok: false, error: "Firefox Account Sync permission is not enabled on this device.", meta };
  }

  const sources = await readCoreSources();
  const core = combinedRemoteCore(sources.shared, sources.device);
  if (!remoteCoreUsable(core)) {
    // A manual restore on an already initialized device is read-only until a
    // complete remote source exists. Release 1.14 can accept a single atomic
    // device-owned snapshot even while the legacy shared ledger is still partial.
    const preserveInitializedDevice = force && meta.syncInitialized === true;
    const waitingMeta = await writeLocalMeta({
      ...meta,
      syncEnabled: true,
      syncInitialized: preserveInitializedDevice ? true : false,
      syncBootstrapMode: preserveInitializedDevice ? "none" : (waitIfMissing ? "await-remote" : "none"),
      syncStatus: waitIfMissing ? "waiting" : "error",
      lastSyncError: waitIfMissing ? "" : snapshotArrivalMessage(sources.shared),
      lastSyncWarning: "",
      syncSkippedAssets: 0,
      syncFastSnapshotFallback: false,
      syncWaitStartedAt: preserveInitializedDevice ? 0 : (waitIfMissing ? (meta.syncWaitStartedAt || Date.now()) : 0)
    });
    await ensureSyncWatchAlarm(waitingMeta);
    return {
      ok: waitIfMissing,
      pending: waitIfMissing,
      error: waitIfMissing ? "" : waitingMeta.lastSyncError,
      meta: waitingMeta,
      remoteUpdatedAt: 0
    };
  }

  await markSyncing(meta);
  const restoredPersonalState = stateFromRecords(core.records, core.settings, localState, core.assets);
  let restoredState = replaceWorkspaceNormalized(fullLocalState, PERSONAL_SPACE_ID, workspaceStateNormalized(restoredPersonalState, PERSONAL_SPACE_ID));
  const workSnapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
  if (isSnapshotUsable(workSnapshot)) {
    const localWorkState = workspaceStateNormalized(restoredState, WORK_SPACE_ID);
    const restoredWorkState = stateFromRecords(workSnapshot.records, workSnapshot.settings, localWorkState, workSnapshot.assets);
    restoredState = replaceWorkspaceNormalized(restoredState, WORK_SPACE_ID, workspaceStateNormalized(restoredWorkState, PERSONAL_SPACE_ID));
  }
  await setLocalStateSilently(restoredState);

  const completedWaitingOnboarding = !meta.onboardingCompleted && meta.syncBootstrapMode === "await-remote";
  const observedMeta = observeRemoteCore(meta, core);
  let appliedMeta = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
  if (isSnapshotUsable(sources.shared)) appliedMeta = markAppliedSnapshot(appliedMeta, sources.shared.dataset);
  if (isSnapshotUsable(workSnapshot)) appliedMeta = markAppliedWorkSnapshot(appliedMeta, workSnapshot.dataset);
  const refreshed = await refreshQuota({
    ...appliedMeta,
    syncEnabled: true,
    syncInitialized: true,
    syncBootstrapMode: "none",
    syncStatus: "ready",
    lastSyncAt: Date.now(),
    lastSyncError: "",
    lastSyncWarning: "",
    syncSkippedAssets: 0,
    syncFastSnapshotFallback: false,
    onboardingCompleted: meta.onboardingCompleted || completedWaitingOnboarding,
    onboardingVersion: completedWaitingOnboarding ? VERSION : meta.onboardingVersion,
    syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  await clearPendingLocalSyncMutation();
  await ensureSyncWatchAlarm(refreshed);
  await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
  return {
    ok: true,
    meta: refreshed,
    restored: true,
    action: force ? "restored" : "bootstrapped-remote",
    remoteUpdatedAt: Number(core.updatedAt) || 0,
    sourceKind: core.sourceKind
  };
}


const CROSS_SPACE_SYNC_TRANSACTION_VERSION = 1;

async function readPendingCrossSpaceSyncEntries() {
  try {
    const stored = await browser.storage.local.get(null);
    const entries = [];
    for (const [key, value] of Object.entries(stored || {})) {
      if (!key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) continue;
      if (!value || value.schemaVersion !== CROSS_SPACE_SYNC_TRANSACTION_VERSION) continue;
      if (!SPACE_IDS_FOR_SYNC.has(value.fromSpaceId) || !SPACE_IDS_FOR_SYNC.has(value.toSpaceId) || value.fromSpaceId === value.toSpaceId) continue;
      if (value.kind === "intent") {
        if (!value.destination || !value.source) continue;
      } else if (value.kind !== "transaction" || !value.destination?.writes || !value.source?.writes) {
        continue;
      }
      entries.push({ key, value });
    }
    entries.sort((a, b) => {
      const timeDiff = (Number(a.value?.createdAt) || 0) - (Number(b.value?.createdAt) || 0);
      return timeDiff || (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));
    });
    return entries;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read pending cross-Space Sync transactions`, error);
    return [];
  }
}

async function writePendingCrossSpaceSync(key, transaction) {
  if (typeof key !== "string" || !key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) {
    throw new Error("Invalid pending cross-Space Sync transaction key.");
  }
  await browser.storage.local.set({ [key]: transaction });
  return transaction;
}

async function clearPendingCrossSpaceSync(key) {
  if (typeof key !== "string" || !key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) return;
  await browser.storage.local.remove(key);
}

async function clearAllPendingCrossSpaceSync() {
  const entries = await readPendingCrossSpaceSyncEntries();
  if (entries.length) await browser.storage.local.remove(entries.map(entry => entry.key));
}

async function readPendingLocalSyncMutation() {
  try {
    const stored = await browser.storage.local.get(LOCAL_PENDING_SYNC_MUTATION_KEY);
    const value = stored?.[LOCAL_PENDING_SYNC_MUTATION_KEY];
    if (!value || value.schemaVersion !== 1 || typeof value.journalId !== "string" || !value.journalId) return null;
    if (!value.before || typeof value.before !== "object" || !value.after || typeof value.after !== "object") return null;
    return value;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read pending local Sync mutation`, error);
    return null;
  }
}

async function clearPendingLocalSyncMutation(journalId = "") {
  try {
    if (journalId) {
      const current = await readPendingLocalSyncMutation();
      if (!current || current.journalId !== journalId) return false;
    }
    await browser.storage.local.remove(LOCAL_PENDING_SYNC_MUTATION_KEY);
    return true;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not clear pending local Sync mutation`, error);
    return false;
  }
}

async function clearAllPendingSyncRecoveryState() {
  await Promise.allSettled([
    clearAllPendingCrossSpaceSync(),
    clearPendingLocalSyncMutation()
  ]);
}

function pendingCrossSpaceSyncKey(transaction) {
  const id = typeof transaction?.intentId === "string" && transaction.intentId
    ? transaction.intentId
    : (typeof transaction?.transactionId === "string" ? transaction.transactionId : "");
  if (!id) return "";
  return `${LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX}${id}`;
}

const SPACE_IDS_FOR_SYNC = new Set([PERSONAL_SPACE_ID, WORK_SPACE_ID]);

function workspaceMutationPayload(oldFullState, newFullState, meta, spaceId, timestamp) {
  const oldState = workspaceStateNormalized(oldFullState, spaceId);
  const newState = workspaceStateNormalized(newFullState, spaceId);
  const namespace = syncNamespace(spaceId);
  const oldRecords = flattenStateNormalized(oldState, meta.deviceId);
  const newRecords = flattenStateNormalized(newState, meta.deviceId);
  const oldSettings = makeSettingsRecordNormalized(oldState, meta.deviceId);
  const newSettings = makeSettingsRecordNormalized(newState, meta.deviceId);
  const writes = {};
  const deletionRecords = new Map();

  for (const [id, record] of newRecords) {
    const previous = oldRecords.get(id);
    if (!previous || !syncRecordEqual(previous, record)) {
      writes[itemKey(id, spaceId)] = { ...record, deviceId: meta.deviceId };
    }
  }
  for (const id of oldRecords.keys()) {
    if (!newRecords.has(id)) {
      const tombstone = makeTombstone(id, meta.deviceId, timestamp);
      writes[itemKey(id, spaceId)] = tombstone;
      deletionRecords.set(id, tombstone);
    }
  }
  if (!settingsRecordEqual(oldSettings, newSettings)) writes[namespace.settingsKey] = newSettings;

  const oldAssets = collectLocalAssetsNormalized(oldState);
  const newAssets = collectLocalAssetsNormalized(newState);
  const droppedAssetIds = [...oldAssets.keys()].filter(id => !newAssets.has(id));
  const dataset = hasOwnEnumerable(writes)
    ? datasetRecord(
        datasetUpdatedAt(newRecords, newSettings, timestamp),
        newRecords,
        newSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId }
      )
    : null;

  return {
    spaceId,
    timestamp,
    writes,
    dataset,
    newRecords: [...newRecords.entries()],
    newSettings,
    deletionRecords: [...deletionRecords.entries()],
    droppedAssetIds
  };
}

function shortcutRecordMap(fullState, spaceId, deviceId) {
  return flattenStateNormalized(workspaceStateNormalized(fullState, spaceId), deviceId);
}

function detectCrossSpaceMove(oldFullState, newFullState, meta) {
  const oldPersonal = shortcutRecordMap(oldFullState, PERSONAL_SPACE_ID, meta.deviceId);
  const newPersonal = shortcutRecordMap(newFullState, PERSONAL_SPACE_ID, meta.deviceId);
  const oldWork = shortcutRecordMap(oldFullState, WORK_SPACE_ID, meta.deviceId);
  const newWork = shortcutRecordMap(newFullState, WORK_SPACE_ID, meta.deviceId);

  const movedPersonalToWork = [];
  for (const [id, oldRecord] of oldPersonal) {
    if (oldRecord?.kind !== "shortcut" || newPersonal.has(id)) continue;
    const destination = newWork.get(id);
    if (destination?.kind !== "shortcut") continue;
    if (Number(destination.spaceMoveAt) <= Number(oldRecord.spaceMoveAt || 0)) continue;
    movedPersonalToWork.push(id);
  }

  const movedWorkToPersonal = [];
  for (const [id, oldRecord] of oldWork) {
    if (oldRecord?.kind !== "shortcut" || newWork.has(id)) continue;
    const destination = newPersonal.get(id);
    if (destination?.kind !== "shortcut") continue;
    if (Number(destination.spaceMoveAt) <= Number(oldRecord.spaceMoveAt || 0)) continue;
    movedWorkToPersonal.push(id);
  }

  if (movedPersonalToWork.length && !movedWorkToPersonal.length) {
    return { fromSpaceId: PERSONAL_SPACE_ID, toSpaceId: WORK_SPACE_ID, shortcutIds: movedPersonalToWork };
  }
  if (movedWorkToPersonal.length && !movedPersonalToWork.length) {
    return { fromSpaceId: WORK_SPACE_ID, toSpaceId: PERSONAL_SPACE_ID, shortcutIds: movedWorkToPersonal };
  }
  return null;
}


function workspacePayloadFromIntent(part, meta, timestamp) {
  const spaceId = part?.spaceId;
  if (!SPACE_IDS_FOR_SYNC.has(spaceId)) return null;
  const namespace = syncNamespace(spaceId);
  const writes = {};
  const deletionRecords = [];
  for (const record of Array.isArray(part.upserts) ? part.upserts : []) {
    if (!record?.id || (record.kind !== "shortcut" && record.kind !== "folder")) continue;
    writes[itemKey(record.id, spaceId)] = { ...record, deviceId: meta.deviceId };
  }
  for (const id of Array.isArray(part.deletes) ? part.deletes : []) {
    if (typeof id !== "string" || !id) continue;
    const tombstone = makeTombstone(id, meta.deviceId, timestamp);
    writes[itemKey(id, spaceId)] = tombstone;
    deletionRecords.push([id, tombstone]);
  }
  if (part.settings && typeof part.settings === "object") {
    writes[namespace.settingsKey] = { ...part.settings, deviceId: meta.deviceId };
  }
  return {
    spaceId,
    timestamp,
    writes,
    dataset: null,
    newRecords: [],
    newSettings: part.settings || null,
    deletionRecords,
    droppedAssetIds: []
  };
}

function transactionFromPersistedIntent(intent, meta) {
  const timestamp = Number(intent?.createdAt) || Date.now();
  const destination = workspacePayloadFromIntent(intent.destination, meta, timestamp);
  const source = workspacePayloadFromIntent(intent.source, meta, timestamp);
  if (!destination || !source) return null;
  return {
    schemaVersion: CROSS_SPACE_SYNC_TRANSACTION_VERSION,
    kind: "transaction",
    transactionId: uid("space-sync"),
    intentId: typeof intent.intentId === "string" ? intent.intentId : "",
    createdAt: timestamp,
    phase: "destination",
    fromSpaceId: intent.fromSpaceId,
    toSpaceId: intent.toSpaceId,
    shortcutIds: Array.isArray(intent.shortcutIds) ? [...intent.shortcutIds] : [],
    destination,
    source
  };
}

function makeCrossSpaceSyncTransaction(oldFullState, newFullState, meta, move) {
  const timestamp = nextMutationTime(
    oldFullState?.spaces?.personal?.updatedAt, oldFullState?.spaces?.work?.updatedAt,
    newFullState?.spaces?.personal?.updatedAt, newFullState?.spaces?.work?.updatedAt
  );
  return {
    schemaVersion: CROSS_SPACE_SYNC_TRANSACTION_VERSION,
    kind: "transaction",
    transactionId: uid("space-sync"),
    createdAt: timestamp,
    phase: "destination",
    fromSpaceId: move.fromSpaceId,
    toSpaceId: move.toSpaceId,
    shortcutIds: [...move.shortcutIds],
    destination: workspaceMutationPayload(oldFullState, newFullState, meta, move.toSpaceId, timestamp),
    source: workspaceMutationPayload(oldFullState, newFullState, meta, move.fromSpaceId, timestamp)
  };
}

async function publishWorkspaceMutationPayload(payload, fullCurrentState, meta) {
  if (!payload || !SPACE_IDS_FOR_SYNC.has(payload.spaceId)) return meta;
  const spaceId = payload.spaceId;
  const namespace = syncNamespace(spaceId);
  const writes = payload.writes && typeof payload.writes === "object" ? payload.writes : {};
  const hasCoreWrites = hasOwnEnumerable(writes);
  let fastPublish = { written: true, setRevision: "" };
  let committedDataset = null;
  if (hasCoreWrites) {
    await writeSyncItems(writes);
    // Build the commit marker from the ledger that actually exists after the
    // idempotent writes, not only from this device's pre-move snapshot. That way
    // a concurrent record delivered by another Firefox is not made "invisible"
    // merely because it was absent from our local payload when the move began.
    const committedSnapshot = await readSyncSnapshot(null, { includeAssets: false, spaceId });
    const committedSettings = committedSnapshot.settings || payload.newSettings;
    committedDataset = datasetRecord(
      datasetUpdatedAt(committedSnapshot.records, committedSettings, Number(payload.timestamp) || Date.now()),
      committedSnapshot.records,
      committedSettings,
      { commitId: uid("commit"), originDeviceId: meta.deviceId }
    );
    await writeSyncItems({ [namespace.datasetKey]: committedDataset });

    // For transactional Personal writes, publish the fast device snapshot from
    // the ledger that has just committed, not from the current local UI state.
    // The local state may already contain a *later queued move*. Using it here
    // would let the fast snapshot jump ahead of the durable transaction journal.
    if (spaceId === PERSONAL_SPACE_ID) {
      fastPublish = await publishDeviceSnapshot(
        committedSnapshot.records,
        committedSettings,
        meta,
        { extraTombstones: new Map(Array.isArray(payload.deletionRecords) ? payload.deletionRecords : []) }
      );
    }
  }

  // Binary artwork is intentionally outside the durable core transaction. It is
  // best-effort and can be reconstructed/retried; the shortcut/folder move cannot.
  let snapshot = await readSyncSnapshot(null, { spaceId });
  const droppedIds = new Set(Array.isArray(payload.droppedAssetIds) ? payload.droppedAssetIds : []);
  if (droppedIds.size) {
    const dropped = await removeKnownUnreferencedAssets(snapshot, droppedIds);
    if (dropped.removedKeys) snapshot = await readSyncSnapshot(null, { spaceId });
  }
  if (spaceId === PERSONAL_SPACE_ID) {
    const gcResult = await garbageCollectOrphanAssets(snapshot);
    if (gcResult.removedKeys) snapshot = await readSyncSnapshot(null, { spaceId });
  }
  const currentWorkspace = workspaceStateNormalized(fullCurrentState, spaceId);
  const assetResult = await uploadMissingAssets(collectLocalAssetsNormalized(currentWorkspace), snapshot.assets, spaceId);

  const warningState = syncWarningState(
    assetResult.skipped,
    spaceId === PERSONAL_SPACE_ID && !fastPublish.written
  );
  let nextMeta = meta;
  if (committedDataset) {
    nextMeta = spaceId === PERSONAL_SPACE_ID
      ? markAppliedSnapshot(nextMeta, committedDataset)
      : markAppliedWorkSnapshot(nextMeta, committedDataset);
  }
  if (spaceId === PERSONAL_SPACE_ID && fastPublish.setRevision) {
    nextMeta = { ...nextMeta, lastAppliedDeviceSnapshotRevision: fastPublish.setRevision };
  }
  return refreshQuota({
    ...nextMeta,
    syncStatus: "ready",
    lastSyncAt: Number(payload.timestamp) || Date.now(),
    lastSyncError: "",
    ...warningState
  });
}

async function executePendingCrossSpaceSync(entry, meta = null) {
  if (!entry?.key || !entry?.value) return meta || await readLocalMeta();
  const storageKey = entry.key;
  let pending = entry.value;
  let currentMeta = meta || await readLocalMeta();
  if (!currentMeta.syncEnabled || !currentMeta.syncInitialized) return currentMeta;

  if (pending.kind === "intent") {
    pending = transactionFromPersistedIntent(pending, currentMeta);
    if (!pending) throw new Error("The pending cross-Space Sync intent is invalid.");
    // Upgrade the UI-written intent to the richer retry journal before the first
    // storage.sync call. From here onward every network phase is idempotent.
    await writePendingCrossSpaceSync(storageKey, pending);
  }

  const { state: currentState } = await ensureLocalStorage();
  await markSyncing(currentMeta);

  // Destination first is deliberate. If Firefox or the browser process dies
  // between the two namespaces, the worst temporary state is a duplicate, never
  // a disappeared shortcut. The journal survives the interruption and retries.
  if (pending.phase === "destination") {
    currentMeta = await publishWorkspaceMutationPayload(pending.destination, currentState, currentMeta);
    pending = { ...pending, phase: "source", destinationPublishedAt: Date.now() };
    await writePendingCrossSpaceSync(storageKey, pending);
  }

  currentMeta = await publishWorkspaceMutationPayload(pending.source, currentState, currentMeta);
  await clearPendingCrossSpaceSync(storageKey);
  currentMeta = await writeLocalMeta({
    ...currentMeta,
    syncStatus: "ready",
    lastSyncError: "",
    lastSyncAt: Date.now()
  });
  await ensureSyncWatchAlarm(currentMeta);
  return currentMeta;
}

async function retryPendingCrossSpaceSync(meta = null) {
  const entries = await readPendingCrossSpaceSyncEntries();
  let currentMeta = meta || await readLocalMeta();
  for (const entry of entries) {
    currentMeta = await executePendingCrossSpaceSync(entry, currentMeta);
  }
  return currentMeta;
}

async function pushPersonalMutation(oldRaw, newRaw, meta) {
  const oldState = workspaceStateNormalized(oldRaw, PERSONAL_SPACE_ID);
  const newState = workspaceStateNormalized(newRaw, PERSONAL_SPACE_ID);
  const oldRecords = flattenStateNormalized(oldState, meta.deviceId);
  const newRecords = flattenStateNormalized(newState, meta.deviceId);
  const newSettings = makeSettingsRecordNormalized(newState, meta.deviceId);
  const oldAssets = collectLocalAssetsNormalized(oldState);
  const newAssets = collectLocalAssetsNormalized(newState);
  const explicitlyDroppedAssetIds = new Set([...oldAssets.keys()].filter(id => !newAssets.has(id)));
  const writes = {};
  const deletionRecords = new Map();
  const timestamp = nextMutationTime(
    oldState.updatedAt, newState.updatedAt, oldState.settingsModifiedAt, newState.settingsModifiedAt,
    newestRecordTimestamp(oldRecords), newestRecordTimestamp(newRecords)
  );

  await markSyncing(meta);

  for (const [id, record] of newRecords) {
    const previous = oldRecords.get(id);
    if (!previous || !syncRecordEqual(previous, record)) writes[itemKey(id)] = { ...record, deviceId: meta.deviceId };
  }
  for (const id of oldRecords.keys()) {
    if (!newRecords.has(id)) {
      const tombstone = makeTombstone(id, meta.deviceId, timestamp);
      writes[itemKey(id)] = tombstone;
      deletionRecords.set(id, tombstone);
    }
  }

  const oldSettings = makeSettingsRecordNormalized(oldState, meta.deviceId);
  if (!settingsRecordEqual(oldSettings, newSettings)) writes[SYNC_SETTINGS_KEY] = newSettings;

  let publishedDataset = null;
  let fastPublish = { written: true };
  if (hasOwnEnumerable(writes)) {
    // Publish the active computer's complete core state to its own atomic key
    // before any full-store read, GC, artwork work, or shared-ledger repair.
    // This is the lowest-latency path MosaicSync can control; Firefox Account
    // Sync then transports that single key on Firefox's own schedule.
    fastPublish = await publishDeviceSnapshot(newRecords, newSettings, meta, {
      extraTombstones: deletionRecords
    });
  }

  // The detailed shared ledger remains the compatibility/conflict/artwork
  // layer. It is deliberately maintained after the latency-critical snapshot.
  let snapshot = await prepareSyncSnapshot();
  if (hasOwnEnumerable(writes)) {
    await writeSyncItems(writes);
    // Dataset is a commit marker and is intentionally written last.
    publishedDataset = datasetRecord(
      datasetUpdatedAt(newRecords, newSettings, timestamp),
      newRecords,
      newSettings,
      { commitId: uid("commit"), originDeviceId: meta.deviceId }
    );
    await writeSyncItems({ [SYNC_DATASET_KEY]: publishedDataset });
  }

  // Core layout data is always written before binary artwork. Images are
  // best-effort: a full Firefox Sync store must never prevent the shortcut
  // layout itself from synchronizing.
  snapshot = await readSyncSnapshot();
  if (explicitlyDroppedAssetIds.size) {
    const dropped = await removeKnownUnreferencedAssets(snapshot, explicitlyDroppedAssetIds);
    if (dropped.removedKeys) snapshot = await readSyncSnapshot();
  }
  const gcResult = await garbageCollectOrphanAssets(snapshot);
  if (gcResult.removedKeys) snapshot = await readSyncSnapshot();
  const assetResult = await uploadMissingAssets(newAssets, snapshot.assets);

  const warningState = syncWarningState(assetResult.skipped, !fastPublish.written);
  const refreshed = await refreshQuota({
    ...(publishedDataset ? markAppliedSnapshot(meta, publishedDataset) : meta),
    lastAppliedDeviceSnapshotRevision: fastPublish.setRevision || meta.lastAppliedDeviceSnapshotRevision || "",
    syncStatus: "ready",
    lastSyncAt: timestamp,
    lastSyncError: "",
    ...warningState
  });
  await writeLocalMeta(refreshed);
}

function workspaceCoreSignature(fullState, spaceId, deviceId = "") {
  const localState = workspaceStateNormalized(fullState, spaceId);
  return stableStringify({
    records: [...flattenStateNormalized(localState, deviceId).values()],
    settings: makeSettingsRecordNormalized(localState, deviceId)
  });
}

async function pushWorkMutation(oldRaw, newRaw, meta) {
  const oldState = workspaceStateNormalized(oldRaw, WORK_SPACE_ID);
  const newState = workspaceStateNormalized(newRaw, WORK_SPACE_ID);
  const namespace = syncNamespace(WORK_SPACE_ID);
  const oldRecords = flattenStateNormalized(oldState, meta.deviceId);
  const newRecords = flattenStateNormalized(newState, meta.deviceId);
  const oldSettings = makeSettingsRecordNormalized(oldState, meta.deviceId);
  const newSettings = makeSettingsRecordNormalized(newState, meta.deviceId);
  const oldAssets = collectLocalAssetsNormalized(oldState);
  const newAssets = collectLocalAssetsNormalized(newState);
  const explicitlyDroppedAssetIds = new Set([...oldAssets.keys()].filter(id => !newAssets.has(id)));
  const writes = {};
  const timestamp = nextMutationTime(
    oldState.updatedAt, newState.updatedAt, oldState.settingsModifiedAt, newState.settingsModifiedAt,
    newestRecordTimestamp(oldRecords), newestRecordTimestamp(newRecords)
  );

  await markSyncing(meta);
  for (const [id, record] of newRecords) {
    const previous = oldRecords.get(id);
    if (!previous || !syncRecordEqual(previous, record)) writes[itemKey(id, WORK_SPACE_ID)] = { ...record, deviceId: meta.deviceId };
  }
  for (const id of oldRecords.keys()) {
    if (!newRecords.has(id)) writes[itemKey(id, WORK_SPACE_ID)] = makeTombstone(id, meta.deviceId, timestamp);
  }
  if (!settingsRecordEqual(oldSettings, newSettings)) writes[namespace.settingsKey] = newSettings;

  let snapshot = await prepareSyncSnapshot(WORK_SPACE_ID);
  let publishedDataset = null;
  if (hasOwnEnumerable(writes)) {
    await writeSyncItems(writes);
    publishedDataset = datasetRecord(
      datasetUpdatedAt(newRecords, newSettings, timestamp),
      newRecords,
      newSettings,
      { commitId: uid("commit"), originDeviceId: meta.deviceId }
    );
    await writeSyncItems({ [namespace.datasetKey]: publishedDataset });
  }

  snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
  if (explicitlyDroppedAssetIds.size) {
    const dropped = await removeKnownUnreferencedAssets(snapshot, explicitlyDroppedAssetIds);
    if (dropped.removedKeys) snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
  }
  const assetResult = await uploadMissingAssets(newAssets, snapshot.assets, WORK_SPACE_ID);
  const refreshed = await refreshQuota({
    ...(publishedDataset ? markAppliedWorkSnapshot(meta, publishedDataset) : meta),
    syncStatus: "ready",
    lastSyncAt: timestamp,
    lastSyncError: "",
    ...syncWarningState(assetResult.skipped)
  });
  await writeLocalMeta(refreshed);
  return { ok: true, meta: refreshed, dataset: publishedDataset };
}


function pendingMatchesMove(pending, move) {
  if (!pending || !move) return false;
  if (pending.fromSpaceId !== move.fromSpaceId || pending.toSpaceId !== move.toSpaceId) return false;
  const pendingIds = new Set(Array.isArray(pending.shortcutIds) ? pending.shortcutIds : []);
  return move.shortcutIds.every(id => pendingIds.has(id));
}

async function pushLocalMutation(oldRaw, newRaw, meta) {
  const oldState = normalizeState(oldRaw);
  const newState = normalizeState(newRaw);
  const personalChanged = workspaceCoreSignature(oldState, PERSONAL_SPACE_ID, meta.deviceId) !==
    workspaceCoreSignature(newState, PERSONAL_SPACE_ID, meta.deviceId);
  const workChanged = workspaceCoreSignature(oldState, WORK_SPACE_ID, meta.deviceId) !==
    workspaceCoreSignature(newState, WORK_SPACE_ID, meta.deviceId);
  if (!personalChanged && !workChanged) return;

  // Never begin a second cross-namespace publication while an earlier one is
  // incomplete. The durable journal is replayed first and each step is idempotent.
  const existingPendingEntries = await readPendingCrossSpaceSyncEntries();
  for (const entry of existingPendingEntries) {
    meta = await executePendingCrossSpaceSync(entry, meta);
  }

  const crossSpaceMove = personalChanged && workChanged
    ? detectCrossSpaceMove(oldState, newState, meta)
    : null;
  // The New Tab writes an intent atomically with the moved local state. If that
  // exact intent was just replayed above, do not manufacture a second journal
  // from the same storage.onChanged event. Independent intent keys mean rapid
  // consecutive moves cannot overwrite one another before the worker runs.
  if (crossSpaceMove && existingPendingEntries.some(entry => pendingMatchesMove(entry.value, crossSpaceMove))) return;
  if (crossSpaceMove) {
    const transaction = makeCrossSpaceSyncTransaction(oldState, newState, meta, crossSpaceMove);
    const transactionKey = pendingCrossSpaceSyncKey(transaction);
    if (!transactionKey) throw new Error("Could not create a durable cross-Space Sync transaction key.");
    // Persist before the first storage.sync write. From this point onward a
    // browser crash, worker shutdown, quota failure, or network interruption is
    // recoverable from storage.local on startup/the Sync watch alarm.
    await writePendingCrossSpaceSync(transactionKey, transaction);
    await executePendingCrossSpaceSync({ key: transactionKey, value: transaction }, meta);
    return;
  }

  if (personalChanged) await pushPersonalMutation(oldState, newState, meta);
  if (workChanged) await pushWorkMutation(oldState, newState, personalChanged ? await readLocalMeta() : meta);
}

async function retryPendingLocalSyncMutation(meta) {
  const pending = await readPendingLocalSyncMutation();
  if (!pending || !meta?.syncEnabled || !meta?.syncInitialized) return meta;
  await pushLocalMutation(pending.before, pending.after, meta);
  await clearPendingLocalSyncMutation(pending.journalId);
  return readLocalMeta();
}

async function reconcilePersonal(strategy = "merge") {
  const { state: fullLocalState, meta } = await ensureLocalStorage();
  const localState = workspaceStateNormalized(fullLocalState, PERSONAL_SPACE_ID);
  if (!meta.syncEnabled) return { ok: true, meta, skipped: true };
  if (!meta.syncInitialized) {
    if (meta.syncBootstrapMode === "await-remote") {
      return bootstrapRemote({ waitIfMissing: true });
    }
    return {
      ok: false,
      error: "Choose whether this device should use its local layout or the synchronized MosaicSync layout first.",
      meta
    };
  }

  await markSyncing(meta);
  const sources = await readCoreSources();
  let snapshot = sources.shared;
  const core = combinedRemoteCore(snapshot, sources.device);

  // Release 1.14 prefers the atomic per-device snapshots when available. The
  // legacy shared ledger can legitimately be partial for several minutes while
  // Firefox delivers its keys; that no longer blocks a complete device snapshot.
  if (!remoteCoreUsable(core)) {
    const waitingMeta = await refreshQuota({
      ...meta,
      syncStatus: "waiting",
      lastSyncError: "",
      lastSyncWarning: snapshotArrivalMessage(snapshot),
      syncWaitStartedAt: meta.syncInitialized ? 0 : (meta.syncWaitStartedAt || Date.now())
    });
    await writeLocalMeta(waitingMeta);
    await ensureSyncWatchAlarm(waitingMeta);
    return { ok: true, pending: true, meta: waitingMeta };
  }

  const observedMeta = observeRemoteCore(meta, core);
  const localRecords = flattenStateNormalized(localState, meta.deviceId);
  const localSettings = makeSettingsRecordNormalized(localState, meta.deviceId);
  const localAssets = collectLocalAssetsNormalized(localState);

  if (strategy === "remote") {
    const restoredPersonalState = stateFromRecords(core.records, core.settings, localState, core.assets);
    const restoredState = replaceWorkspaceNormalized(fullLocalState, PERSONAL_SPACE_ID, workspaceStateNormalized(restoredPersonalState, PERSONAL_SPACE_ID));
    await setLocalStateSilently(restoredState);
    let applied = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
    if (isSnapshotUsable(snapshot)) applied = markAppliedSnapshot(applied, snapshot.dataset);
    const refreshed = await refreshQuota({
      ...applied,
      syncStatus: "ready",
      lastSyncAt: Date.now(),
      lastSyncError: "",
      lastSyncWarning: "",
      syncSkippedAssets: 0,
      syncFastSnapshotFallback: false,
      syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    await ensureSyncWatchAlarm(refreshed);
    await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return { ok: true, meta: refreshed, restored: true };
  }

  let mergedRecords = mergeRecordMaps(localRecords, core.records);
  let mergedSettings = chooseSettings(localSettings, core.settings, localState);

  mergedRecords = pruneExpiredTombstones(mergedRecords);
  const combinedAssets = new Map([...core.assets, ...localAssets]);
  const mergedPersonalState = stateFromRecords(mergedRecords, mergedSettings, localState, combinedAssets);
  const mergedStateChanged = stableStringify(workspaceStateNormalized(mergedPersonalState, PERSONAL_SPACE_ID)) !== stableStringify(localState);
  const mergedState = mergedStateChanged
    ? replaceWorkspaceNormalized(fullLocalState, PERSONAL_SPACE_ID, workspaceStateNormalized(mergedPersonalState, PERSONAL_SPACE_ID))
    : fullLocalState;
  if (mergedStateChanged) {
    await setLocalStateSilently(mergedState, { baseState: fullLocalState });
  }

  const desiredPersonalState = workspaceStateNormalized(mergedState, PERSONAL_SPACE_ID);
  const desiredRecords = flattenStateNormalized(desiredPersonalState, meta.deviceId);
  const desiredAssets = collectLocalAssetsNormalized(desiredPersonalState);

  // Firefox/Chrome can expose a newer atomic device snapshot before every key of
  // the compatibility shared ledger has arrived. The device snapshot is safe to
  // apply locally, but repairing the visibly partial ledger at that moment would
  // republish an older/incomplete view and amplify Sync writes. Wait for the
  // ledger to become coherent; the periodic semantic watchdog will revisit it.
  const sharedLedgerPartial = hasSnapshotData(snapshot) && !isSnapshotUsable(snapshot);
  if (sharedLedgerPartial) {
    const appliedMeta = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
    const refreshed = await refreshQuota({
      ...appliedMeta,
      syncStatus: "ready",
      lastSyncAt: Date.now(),
      lastSyncError: "",
      lastSyncWarning: "",
      syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    await ensureSyncWatchAlarm(refreshed);
    if (mergedStateChanged) await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return { ok: true, meta: refreshed, sharedLedgerPending: true };
  }

  // Repair/maintain the shared record ledger for compatibility and for binary
  // artwork references. It is no longer allowed to block the fast core path.
  const syncWrites = {};
  for (const [id, record] of desiredRecords) {
    const winner = mergedRecords.get(id);
    const desired = winner?.kind === "deleted" ? winner : recordWithWinnerIdentity(record, winner, meta.deviceId);
    const remote = snapshot.records.get(id);
    if (!remote || stableStringify(remote) !== stableStringify(desired)) syncWrites[itemKey(id)] = desired;
  }

  for (const [id, winner] of mergedRecords) {
    if (winner?.kind !== "deleted") continue;
    const remote = snapshot.records.get(id);
    if (!remote || stableStringify(remote) !== stableStringify(winner)) syncWrites[itemKey(id)] = winner;
  }

  if (!snapshot.settings || stableStringify(snapshot.settings) !== stableStringify(mergedSettings)) {
    syncWrites[SYNC_SETTINGS_KEY] = mergedSettings;
  }

  const hasCoreWrites = hasOwnEnumerable(syncWrites);
  const desiredDataset = hasCoreWrites
    ? datasetRecord(
        datasetUpdatedAt(mergedRecords, mergedSettings, Number(snapshot.dataset?.updatedAt) || 0),
        mergedRecords,
        mergedSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId }
      )
    : snapshot.dataset;
  await writeSyncItems(syncWrites);
  if (hasCoreWrites && desiredDataset) {
    await writeSyncItems({ [SYNC_DATASET_KEY]: desiredDataset });
  }

  snapshot = await readSyncSnapshot();
  const gcResult = await garbageCollectOrphanAssets(snapshot);
  if (gcResult.removedKeys) snapshot = await readSyncSnapshot();
  const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets);

  const staleKeys = snapshot.expiredKeys.filter(key => !(key in syncWrites));
  if (staleKeys.length) await removeSyncItems([...new Set(staleKeys)]);

  const warningState = syncWarningState(assetResult.skipped);
  let appliedMeta = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
  if (snapshot.dataset || desiredDataset) appliedMeta = markAppliedSnapshot(appliedMeta, snapshot.dataset || desiredDataset);
  const refreshed = await refreshQuota({
    ...appliedMeta,
    syncStatus: "ready",
    lastSyncAt: Date.now(),
    lastSyncError: "",
    ...warningState,
    syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  await ensureSyncWatchAlarm(refreshed);
  if (mergedStateChanged) await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
  return { ok: true, meta: refreshed };
}

async function reconcileWork(strategy = "merge") {
  const { state: fullLocalState, meta } = await ensureLocalStorage();
  if (!meta.syncEnabled || !meta.syncInitialized) return { ok: true, meta, skipped: true };
  const namespace = syncNamespace(WORK_SPACE_ID);
  let snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });

  // Work did not exist before Spaces. Absence is therefore a valid empty remote
  // state during a rolling upgrade and must never block Personal restoration.
  if (!hasSnapshotData(snapshot)) return { ok: true, meta, skipped: true, remoteMissing: true };
  if (!isSnapshotUsable(snapshot)) return { ok: true, meta, pending: true, workPending: true };

  const localState = workspaceStateNormalized(fullLocalState, WORK_SPACE_ID);
  const localRecords = flattenStateNormalized(localState, meta.deviceId);
  const localSettings = makeSettingsRecordNormalized(localState, meta.deviceId);
  const localAssets = collectLocalAssetsNormalized(localState);

  if (strategy === "remote") {
    const restoredLegacy = stateFromRecords(snapshot.records, snapshot.settings, localState, snapshot.assets);
    const restoredState = replaceWorkspaceNormalized(fullLocalState, WORK_SPACE_ID, workspaceStateNormalized(restoredLegacy, PERSONAL_SPACE_ID));
    await setLocalStateSilently(restoredState);
    const refreshed = await refreshQuota({
      ...markAppliedWorkSnapshot(meta, snapshot.dataset),
      syncStatus: "ready",
      lastSyncAt: Date.now(),
      lastSyncError: "",
      lastSyncWarning: "",
      syncSkippedAssets: 0,
      syncFastSnapshotFallback: false,
      syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return { ok: true, meta: refreshed, restored: true };
  }

  let mergedRecords = pruneExpiredTombstones(mergeRecordMaps(localRecords, snapshot.records));
  const mergedSettings = chooseSettings(localSettings, snapshot.settings, localState);
  const combinedAssets = new Map([...snapshot.assets, ...localAssets]);
  const mergedLegacy = stateFromRecords(mergedRecords, mergedSettings, localState, combinedAssets);
  const mergedWorkspace = workspaceStateNormalized(mergedLegacy, PERSONAL_SPACE_ID);
  const mergedStateChanged = stableStringify(mergedWorkspace) !== stableStringify(localState);
  const mergedFullState = mergedStateChanged
    ? replaceWorkspaceNormalized(fullLocalState, WORK_SPACE_ID, mergedWorkspace)
    : fullLocalState;
  if (mergedStateChanged) await setLocalStateSilently(mergedFullState, { baseState: fullLocalState });

  const desiredState = workspaceStateNormalized(mergedFullState, WORK_SPACE_ID);
  const desiredRecords = flattenStateNormalized(desiredState, meta.deviceId);
  const desiredAssets = collectLocalAssetsNormalized(desiredState);
  const syncWrites = {};
  for (const [id, record] of desiredRecords) {
    const winner = mergedRecords.get(id);
    const desired = winner?.kind === "deleted" ? winner : recordWithWinnerIdentity(record, winner, meta.deviceId);
    const remote = snapshot.records.get(id);
    if (!remote || stableStringify(remote) !== stableStringify(desired)) syncWrites[itemKey(id, WORK_SPACE_ID)] = desired;
  }
  for (const [id, winner] of mergedRecords) {
    if (winner?.kind !== "deleted") continue;
    const remote = snapshot.records.get(id);
    if (!remote || stableStringify(remote) !== stableStringify(winner)) syncWrites[itemKey(id, WORK_SPACE_ID)] = winner;
  }
  if (!snapshot.settings || stableStringify(snapshot.settings) !== stableStringify(mergedSettings)) {
    syncWrites[namespace.settingsKey] = mergedSettings;
  }

  const hasCoreWrites = hasOwnEnumerable(syncWrites);
  const desiredDataset = hasCoreWrites
    ? datasetRecord(
        datasetUpdatedAt(mergedRecords, mergedSettings, Number(snapshot.dataset?.updatedAt) || 0),
        mergedRecords,
        mergedSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId }
      )
    : snapshot.dataset;
  await writeSyncItems(syncWrites);
  if (hasCoreWrites && desiredDataset) await writeSyncItems({ [namespace.datasetKey]: desiredDataset });

  snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
  const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets, WORK_SPACE_ID);
  const staleKeys = snapshot.expiredKeys.filter(key => !(key in syncWrites));
  if (staleKeys.length) await removeSyncItems([...new Set(staleKeys)]);

  const refreshed = await refreshQuota({
    ...markAppliedWorkSnapshot(meta, snapshot.dataset || desiredDataset),
    syncStatus: "ready",
    lastSyncAt: Date.now(),
    lastSyncError: "",
    ...syncWarningState(assetResult.skipped),
    syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  if (mergedStateChanged) await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
  return { ok: true, meta: refreshed };
}

async function reconcile(strategy = "merge") {
  devMark("background:reconcile-start");
  try {
    if (strategy === "merge") {
      const meta = await readLocalMeta();
      if (meta.syncEnabled && meta.syncInitialized) await retryPendingCrossSpaceSync(meta);
    }
    const personal = await reconcilePersonal(strategy);
    if (!personal?.ok || personal?.pending) return personal;
    const work = await reconcileWork(strategy);
    return work?.ok ? { ...personal, meta: work.meta || personal.meta, work } : personal;
  } finally {
    devMark("background:reconcile-end");
    devMeasure("background:reconcile", "background:reconcile-start", "background:reconcile-end");
  }
}

function chooseSettings(localSettings, remoteSettings, localState) {
  if (!remoteSettings) return localSettings;
  if (!localState.shortcuts.length && !localState.settingsModifiedAt) return remoteSettings;
  return chooseNewerRecord(localSettings, remoteSettings);
}

function recordWithWinnerIdentity(record, winner, fallbackDeviceId) {
  if (!winner || winner.kind === "deleted") return record;
  const result = {
    ...record,
    modifiedAt: winner.modifiedAt ?? record.modifiedAt,
    deviceId: winner.deviceId || fallbackDeviceId
  };
  if (result.kind === "shortcut" && ["sync", "local"].includes(result.imageKind) && !result.imageAssetId && winner.imageAssetId) {
    result.imageAssetId = winner.imageAssetId;
  }
  return result;
}

async function clearSyncData() {
  const meta = await readLocalMeta();
  const all = await browser.storage.sync.get(null);
  const keys = Object.keys(all).filter(key => key.startsWith(SYNC_PREFIX));
  if (keys.length) await removeSyncItems(keys);
  await clearAssetGcLedger();
  await clearAllPendingSyncRecoveryState();

  const next = await writeLocalMeta({
    ...meta,
    syncEnabled: false,
    syncInitialized: false,
    syncBootstrapMode: "none",
    syncStatus: "off",
    lastSyncAt: 0,
    lastSyncError: "",
    lastSyncWarning: "",
    syncSkippedAssets: 0,
    syncFastSnapshotFallback: false,
    syncWaitStartedAt: 0,
    lastAppliedSyncRevision: "",
      lastAppliedWorkSyncRevision: "",
    lastAppliedDeviceSnapshotRevision: "",
    lastRemoteReceiptAt: 0,
    lastRemoteReceiptRevision: "",
    lastRemoteReceiptUpdatedAt: 0,
    lastRemoteReceiptOriginDeviceId: "",
    syncBytesInUse: 0,
    syncItemCount: 0
  });
  await ensureSyncWatchAlarm(next);
  return { ok: true, meta: next, removed: keys.length };
}

async function readSyncSnapshot(preloaded = null, { includeAssets = true, spaceId = PERSONAL_SPACE_ID } = {}) {
  const namespace = syncNamespace(spaceId);
  const all = preloaded && typeof preloaded === "object"
    ? preloaded
    : await browser.storage.sync.get(null);
  const records = new Map();
  let settings = null;
  let dataset = null;
  const expiredKeys = [];
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const assetMetas = new Map();
  const assetParts = new Map();
  const assetKeysById = new Map();

  for (const key in all) {
    const value = all[key];
    if (!key.startsWith(namespace.prefix)) continue;
    if (key === namespace.settingsKey) {
      if (value?.kind === "settings") settings = value;
      continue;
    }
    if (key === namespace.datasetKey) {
      if (value?.kind === "dataset") dataset = value;
      continue;
    }

    if (key.startsWith(namespace.assetPrefix)) {
      if (!includeAssets) continue;
      const assetId = value?.id;
      if (!assetId) continue;
      if (!assetKeysById.has(assetId)) assetKeysById.set(assetId, []);
      assetKeysById.get(assetId).push(key);
      if (value.kind === "asset") assetMetas.set(assetId, value);
      if (value.kind === "asset-part" && Number.isInteger(value.index) && typeof value.data === "string") {
        if (!assetParts.has(assetId)) assetParts.set(assetId, new Map());
        assetParts.get(assetId).set(value.index, value.data);
      }
      continue;
    }

    if (!key.startsWith(namespace.itemPrefix) || !value?.id) continue;
    if (value.kind === "deleted" && Number.isFinite(value.deletedAt) && value.deletedAt < cutoff) {
      expiredKeys.push(key);
      continue;
    }
    if (["shortcut", "folder", "deleted"].includes(value.kind)) records.set(value.id, value);
  }

  const assets = new Map();
  const incompleteAssetKeys = [];
  const allAssetIds = new Set([...assetKeysById.keys(), ...assetMetas.keys(), ...assetParts.keys()]);
  for (const assetId of allAssetIds) {
    const meta = assetMetas.get(assetId);
    const parts = assetParts.get(assetId);
    let complete = Boolean(meta && parts && Number.isInteger(meta.parts) && meta.parts >= 1 && parts.size >= meta.parts);
    const chunks = [];
    if (complete) {
      for (let index = 0; index < meta.parts; index += 1) {
        const chunk = parts.get(index);
        if (typeof chunk !== "string") {
          complete = false;
          break;
        }
        chunks.push(chunk);
      }
    }
    if (complete) {
      const dataUrl = chunks.join("");
      complete = Number(meta.chars) === dataUrl.length && assetIdForDataUrl(dataUrl) === assetId;
      if (complete) assets.set(assetId, dataUrl);
    }
    if (!complete) incompleteAssetKeys.push(...(assetKeysById.get(assetId) || []));
  }

  return { records, settings, dataset, assets, assetMetas, assetKeysById, expiredKeys, incompleteAssetKeys };
}


function referencedAssetIds(snapshot) {
  const referenced = new Set();
  for (const record of snapshot?.records?.values?.() || []) {
    if (record?.kind === "shortcut" && ["sync", "local"].includes(record.imageKind) && typeof record.imageAssetId === "string" && record.imageAssetId) {
      referenced.add(record.imageAssetId);
    }
  }
  // Custom wallpapers are device-local in Release 1.9, so settings records never
  // keep binary wallpaper assets alive in Firefox Sync.
  return referenced;
}

function normalizeAssetGcLedger(raw) {
  const source = raw && typeof raw === "object" && raw.candidates && typeof raw.candidates === "object"
    ? raw.candidates
    : {};
  const candidates = {};
  for (const [assetId, value] of Object.entries(source)) {
    if (!assetId || !value || typeof value !== "object") continue;
    const firstUnreferencedAt = Number(value.firstUnreferencedAt) || 0;
    const lastObservedAt = Number(value.lastObservedAt) || firstUnreferencedAt;
    const observations = Math.max(1, Math.min(1000, Number(value.observations) || 1));
    if (!firstUnreferencedAt) continue;
    candidates[assetId] = {
      firstUnreferencedAt,
      lastObservedAt,
      observations,
      firstCommitId: typeof value.firstCommitId === "string" ? value.firstCommitId : "",
      lastCommitId: typeof value.lastCommitId === "string" ? value.lastCommitId : ""
    };
  }
  return { version: ASSET_GC_LEDGER_VERSION, candidates };
}

async function readAssetGcLedger() {
  try {
    const stored = await browser.storage.local.get(LOCAL_ASSET_GC_KEY);
    return normalizeAssetGcLedger(stored?.[LOCAL_ASSET_GC_KEY]);
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read artwork cleanup ledger`, error);
    return { version: ASSET_GC_LEDGER_VERSION, candidates: {} };
  }
}

async function writeAssetGcLedger(ledger) {
  try {
    const normalized = normalizeAssetGcLedger(ledger);
    const entries = Object.entries(normalized.candidates)
      .sort((a, b) => Number(a[1].lastObservedAt) - Number(b[1].lastObservedAt));
    while (entries.length > SYNC_QUOTA_MAX_ITEMS) entries.shift();
    await browser.storage.local.set({
      [LOCAL_ASSET_GC_KEY]: { version: ASSET_GC_LEDGER_VERSION, candidates: Object.fromEntries(entries) }
    });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not persist artwork cleanup ledger`, error);
  }
}

async function clearAssetGcLedger() {
  await writeAssetGcLedger({ version: ASSET_GC_LEDGER_VERSION, candidates: {} });
}

/**
 * Reclaim synchronized artwork only after a complete committed core snapshot has
 * repeatedly shown it as unreferenced for a long grace period. This is deliberately
 * conservative: Firefox can deliver storage.sync keys in separate batches, so an
 * artwork asset that arrives before its future shortcut record must not be deleted.
 */
async function removeKnownUnreferencedAssets(snapshot, assetIds) {
  if (!assetIds?.size || !isSnapshotUsable(snapshot)) return { removedAssets: 0, removedKeys: 0 };
  const referenced = referencedAssetIds(snapshot);
  const keys = [];
  let removedAssets = 0;
  for (const assetId of assetIds) {
    if (referenced.has(assetId)) continue;
    const assetKeys = snapshot.assetKeysById.get(assetId) || [];
    if (!assetKeys.length) continue;
    keys.push(...assetKeys);
    removedAssets += 1;
  }
  if (!keys.length) return { removedAssets: 0, removedKeys: 0 };
  const unique = [...new Set(keys)];
  await removeSyncItems(unique);
  return { removedAssets, removedKeys: unique.length };
}

async function garbageCollectOrphanAssets(snapshot) {
  const commitId = typeof snapshot?.dataset?.commitId === "string" ? snapshot.dataset.commitId : "";
  if (!commitId || !isSnapshotUsable(snapshot)) return { removedAssets: 0, removedKeys: 0 };

  const now = Date.now();
  const referenced = referencedAssetIds(snapshot);
  const completeAssetIds = new Set(snapshot.assets?.keys?.() || []);
  const ledger = await readAssetGcLedger();
  const candidates = ledger.candidates;
  let ledgerChanged = false;

  // Forget candidates that disappeared or became referenced before eligibility.
  for (const assetId of Object.keys(candidates)) {
    if (!completeAssetIds.has(assetId) || referenced.has(assetId)) {
      delete candidates[assetId];
      ledgerChanged = true;
    }
  }

  const eligible = [];
  for (const assetId of completeAssetIds) {
    if (referenced.has(assetId)) continue;
    const existing = candidates[assetId];
    if (!existing) {
      candidates[assetId] = {
        firstUnreferencedAt: now,
        lastObservedAt: now,
        observations: 1,
        firstCommitId: commitId,
        lastCommitId: commitId
      };
      ledgerChanged = true;
      continue;
    }

    const newCommit = existing.lastCommitId !== commitId;
    const enoughTimeSinceObservation = now - existing.lastObservedAt >= ASSET_GC_MIN_OBSERVATION_GAP_MS;
    if (newCommit || enoughTimeSinceObservation) {
      existing.observations = Math.min(1000, existing.observations + 1);
      existing.lastObservedAt = now;
      existing.lastCommitId = commitId;
      ledgerChanged = true;
    }

    const uploadedAt = Number(snapshot.assetMetas?.get?.(assetId)?.uploadedAt) || 0;
    const oldEnoughByLedger = now - existing.firstUnreferencedAt >= ASSET_ORPHAN_GRACE_MS;
    const oldEnoughByAsset = !uploadedAt || now - uploadedAt >= ASSET_ORPHAN_GRACE_MS;
    if (oldEnoughByLedger && oldEnoughByAsset && existing.observations >= 2) eligible.push(assetId);
  }

  if (ledgerChanged) await writeAssetGcLedger(ledger);
  if (!eligible.length) return { removedAssets: 0, removedKeys: 0 };

  // Re-read immediately before deletion. If Firefox delivered a new complete
  // core snapshot meanwhile, this second check sees the new references.
  const latest = await readSyncSnapshot();
  if (!isSnapshotUsable(latest) || !latest.dataset?.commitId) return { removedAssets: 0, removedKeys: 0 };
  const latestReferenced = referencedAssetIds(latest);
  const keys = [];
  const removedIds = [];
  for (const assetId of eligible) {
    if (latestReferenced.has(assetId) || !latest.assets.has(assetId)) continue;
    const latestUploadedAt = Number(latest.assetMetas?.get?.(assetId)?.uploadedAt) || 0;
    if (latestUploadedAt && now - latestUploadedAt < ASSET_ORPHAN_GRACE_MS) continue;
    const assetKeys = latest.assetKeysById.get(assetId) || [];
    if (!assetKeys.length) continue;
    keys.push(...assetKeys);
    removedIds.push(assetId);
  }

  if (!keys.length) return { removedAssets: 0, removedKeys: 0 };
  await removeSyncItems([...new Set(keys)]);
  const finalLedger = await readAssetGcLedger();
  for (const assetId of removedIds) delete finalLedger.candidates[assetId];
  await writeAssetGcLedger(finalLedger);
  return { removedAssets: removedIds.length, removedKeys: new Set(keys).size };
}

async function prepareSyncSnapshot(spaceId = PERSONAL_SPACE_ID) {
  let snapshot = await readSyncSnapshot(null, { spaceId });
  // Only expired deletion tombstones are safe to remove automatically. Artwork
  // chunks are intentionally left alone because Firefox may be in the middle of
  // delivering a multi-key snapshot from another device.
  if (snapshot.expiredKeys.length) {
    await removeSyncItems([...new Set(snapshot.expiredKeys)]);
    snapshot = await readSyncSnapshot(null, { spaceId });
  }
  return snapshot;
}

function pruneExpiredTombstones(records) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const result = new Map();
  for (const [id, record] of records) {
    if (record?.kind === "deleted" && Number.isFinite(record.deletedAt) && record.deletedAt < cutoff) continue;
    result.set(id, record);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Best-effort binary artwork sync
// -----------------------------------------------------------------------------
async function uploadMissingAssets(assets, existingAssets, spaceId = PERSONAL_SPACE_ID) {
  let skipped = 0;
  let uploaded = 0;
  const budget = await createSyncBudget(SYNC_CORE_RESERVE_BYTES);

  for (const [assetId, dataUrl] of assets) {
    if (existingAssets.has(assetId)) continue;
    const payload = assetPayload(assetId, dataUrl, spaceId);
    if (!reserveSyncBudget(payload, budget)) {
      skipped += 1;
      continue;
    }

    try {
      // The budget was computed once for the whole asset pass. Firefox still
      // enforces the real quota on set(), so a concurrent Sync change remains
      // safe without re-reading the entire storage area for every favicon.
      await writeSyncItems(payload, { skipPreflight: true });
      uploaded += 1;
    } catch (error) {
      if (isQuotaError(error)) {
        skipped += 1;
        break;
      }
      throw error;
    }
  }

  return { uploaded, skipped };
}

function syncWarningState(skipped = 0, fastSnapshotFallback = false) {
  return {
    // User-facing wording is rendered by New Tab through the localization
    // catalog. Background code persists only structured warning state so Chrome
    // and every locale cannot accidentally inherit Firefox-branded English.
    lastSyncWarning: "",
    syncSkippedAssets: Math.max(0, Number(skipped) || 0),
    syncFastSnapshotFallback: fastSnapshotFallback === true
  };
}

function assetPayload(assetId, dataUrl, spaceId = PERSONAL_SPACE_ID) {
  const chunks = [];
  for (let offset = 0; offset < dataUrl.length; offset += SYNC_ASSET_CHUNK_CHARS) {
    chunks.push(dataUrl.slice(offset, offset + SYNC_ASSET_CHUNK_CHARS));
  }
  const payload = {
    [assetMetaKey(assetId, spaceId)]: {
      schemaVersion: 1,
      kind: "asset",
      id: assetId,
      parts: chunks.length,
      chars: dataUrl.length,
      uploadedAt: Date.now()
    }
  };
  chunks.forEach((data, index) => {
    payload[assetPartKey(assetId, index, spaceId)] = {
      schemaVersion: 1,
      kind: "asset-part",
      id: assetId,
      index,
      total: chunks.length,
      data
    };
  });
  return payload;
}

// -----------------------------------------------------------------------------
// storage.sync quota accounting and writes
// -----------------------------------------------------------------------------
async function writeSyncItems(items, { reserveBytes = 0, skipPreflight = false } = {}) {
  const entries = Object.entries(items);
  if (!entries.length) return;

  for (const [key, value] of entries) {
    const estimatedBytes = syncEntryBytes(key, value);
    if (estimatedBytes > SYNC_QUOTA_BYTES_PER_ITEM) {
      throw new Error(`A synchronized item is too large for Firefox Sync (${estimatedBytes} bytes).`);
    }
  }

  if (!skipPreflight && !(await canFitSyncItems(items, reserveBytes))) {
    const error = new Error("Firefox Sync storage is full. MosaicSync kept your local data unchanged.");
    error.name = "QuotaExceededError";
    throw error;
  }

  for (let index = 0; index < entries.length; index += 40) {
    const chunkEntries = entries.slice(index, index + 40);
    const chunk = Object.fromEntries(chunkEntries);
    const expectedEntries = chunkEntries.map(([key, value]) => [key, stableStringify(value)]);
    for (const [key, signature] of expectedEntries) rememberSyncChange(key, signature);
    await rememberDurableSyncChanges(expectedEntries);
    try {
      await browser.storage.sync.set(chunk);
    } catch (error) {
      for (const [key] of chunkEntries) expectedSyncChanges.delete(key);
      throw error;
    }
  }
}

async function createSyncBudget(reserveBytes = 0) {
  const [bytes, all] = await Promise.all([
    browser.storage.sync.getBytesInUse(null),
    browser.storage.sync.get(null)
  ]);
  const entryBytes = new Map(
    Object.entries(all).map(([key, value]) => [key, syncEntryBytes(key, value)])
  );
  return {
    bytes: Math.max(0, Number(bytes) || 0),
    count: countOwnEnumerable(all),
    entryBytes,
    byteLimit: Math.max(0, SYNC_QUOTA_BYTES - Math.max(0, reserveBytes))
  };
}

function reserveSyncBudget(items, budget) {
  const entries = Object.entries(items);
  let byteDelta = 0;
  let extraCount = 0;
  const nextSizes = [];

  for (const [key, value] of entries) {
    const nextBytes = syncEntryBytes(key, value);
    const previousBytes = budget.entryBytes.get(key) || 0;
    byteDelta += nextBytes - previousBytes;
    if (!budget.entryBytes.has(key)) extraCount += 1;
    nextSizes.push([key, nextBytes]);
  }

  if (budget.bytes + byteDelta > budget.byteLimit || budget.count + extraCount > SYNC_QUOTA_MAX_ITEMS) return false;
  budget.bytes += byteDelta;
  budget.count += extraCount;
  for (const [key, nextBytes] of nextSizes) budget.entryBytes.set(key, nextBytes);
  return true;
}

async function canFitSyncItems(items, reserveBytes = 0) {
  const entries = Object.entries(items);
  if (!entries.length) return true;

  const keys = entries.map(([key]) => key);
  const [currentBytes, replacedBytes, all] = await Promise.all([
    browser.storage.sync.getBytesInUse(null),
    browser.storage.sync.getBytesInUse(keys),
    browser.storage.sync.get(null)
  ]);
  const existingCount = countOwnEnumerable(all);
  const replacingCount = keys.filter(key => Object.prototype.hasOwnProperty.call(all, key)).length;
  const projectedCount = existingCount - replacingCount + entries.length;
  const projectedBytes = currentBytes - replacedBytes + entries.reduce((sum, [key, value]) => sum + syncEntryBytes(key, value), 0);

  return projectedCount <= SYNC_QUOTA_MAX_ITEMS &&
    projectedBytes <= Math.max(0, SYNC_QUOTA_BYTES - Math.max(0, reserveBytes));
}

function syncEntryBytes(key, value) {
  return textEncoder.encode(String(key)).length +
    textEncoder.encode(JSON.stringify(value)).length;
}

function isQuotaError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  return name === "QuotaExceededError" || /quota|storage\.sync.*full|exceeded/i.test(message);
}

async function removeSyncItems(keys) {
  if (!keys.length) return;
  for (const key of keys) rememberSyncChange(key, REMOVED);
  await rememberDurableSyncChanges(keys.map(key => [key, REMOVED]));
  try {
    await browser.storage.sync.remove(keys);
  } catch (error) {
    for (const key of keys) expectedSyncChanges.delete(key);
    throw error;
  }
}

async function setLocalStateSilently(state, { baseState = null } = {}) {
  let signature = "";
  try {
    await writeLocalState(state, {
      baseState,
      beforeWrite: async normalized => {
        signature = localStateSyncSignature(normalized);
        rememberLocalSignature(signature);
        await rememberDurableLocalSignature(signature);
      }
    });
  } catch (error) {
    if (signature) {
      ignoredLocalStateSignatures.delete(signature);
      await forgetDurableLocalSignature(signature);
    }
    throw error;
  }
}

async function markSyncing(meta) {
  return writeLocalMeta({
    ...meta,
    syncStatus: "syncing",
    lastSyncError: "",
    lastSyncWarning: "",
    syncSkippedAssets: 0,
    syncFastSnapshotFallback: false,
  });
}

async function refreshQuota(meta) {
  let bytes = 0;
  let count = 0;
  try {
    const [usedBytes, all] = await Promise.all([
      browser.storage.sync.getBytesInUse(null),
      browser.storage.sync.get(null)
    ]);
    bytes = usedBytes;
    count = Object.keys(all).filter(key => key.startsWith(SYNC_PREFIX)).length;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read sync quota`, error);
  }

  const exceeded = count > SYNC_QUOTA_MAX_ITEMS || bytes > SYNC_QUOTA_BYTES;
  return {
    ...meta,
    syncBytesInUse: bytes,
    syncItemCount: count,
    syncStatus: exceeded ? "error" : meta.syncStatus,
    lastSyncError: exceeded ? "Firefox Sync storage quota was exceeded." : meta.lastSyncError
  };
}

function itemKey(id, spaceId = PERSONAL_SPACE_ID) {
  return `${syncNamespace(spaceId).itemPrefix}${encodeURIComponent(id)}`;
}

function assetMetaKey(assetId, spaceId = PERSONAL_SPACE_ID) {
  return `${syncNamespace(spaceId).assetPrefix}${encodeURIComponent(assetId)}.meta`;
}

function assetPartKey(assetId, index, spaceId = PERSONAL_SPACE_ID) {
  return `${syncNamespace(spaceId).assetPrefix}${encodeURIComponent(assetId)}.part.${index}`;
}

// -----------------------------------------------------------------------------
// Snapshot commit markers / completeness validation
// -----------------------------------------------------------------------------
function datasetRecord(timestamp, records, settings, commit = {}) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    kind: "dataset",
    updatedAt: Number.isFinite(timestamp) ? timestamp : 0,
    liveRecordCount: liveRecordCount(records),
    recordFingerprint: recordFingerprint(records),
    settingsModifiedAt: Number(settings?.modifiedAt) || 0,
    commitId: typeof commit.commitId === "string" ? commit.commitId : "",
    originDeviceId: typeof commit.originDeviceId === "string" ? commit.originDeviceId : ""
  };
}

function liveRecordCount(records) {
  let count = 0;
  for (const record of records?.values?.() || []) {
    if (record?.kind === "shortcut" || record?.kind === "folder") count += 1;
  }
  return count;
}

function compareStableText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function recordFingerprint(records) {
  const live = [];
  for (const record of records?.values?.() || []) {
    if (record?.kind !== "shortcut" && record?.kind !== "folder") continue;
    const { deviceId: _deviceId, ...semantic } = record;
    live.push(semantic);
  }
  live.sort((a, b) => compareStableText(a.id, b.id));
  return fnv1a(stableStringify(live));
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function datasetUpdatedAt(records, settings, fallback = 0) {
  return Math.max(
    Number(fallback) || 0,
    newestRecordTimestamp(records),
    Number(settings?.modifiedAt) || 0
  );
}

function isSnapshotUsable(snapshot) {
  if (!snapshot?.settings) return false;
  const dataset = snapshot.dataset;
  if (!dataset) return snapshot.records.size > 0;

  const expected = Number(dataset.liveRecordCount);
  if (Number.isInteger(expected) && expected >= 0 && liveRecordCount(snapshot.records) !== expected) {
    return false;
  }

  if (typeof dataset.recordFingerprint === "string" && dataset.recordFingerprint) {
    if (recordFingerprint(snapshot.records) !== dataset.recordFingerprint) return false;
  }

  if (Number.isFinite(dataset.settingsModifiedAt) &&
      Number(dataset.settingsModifiedAt) !== Number(snapshot.settings.modifiedAt || 0)) {
    return false;
  }

  // Legacy datasets did not include a fingerprint. Exact record count plus a
  // settings record is the strongest compatibility signal available.
  if (Number.isInteger(expected) && expected >= 0) return true;
  if (Number(dataset.updatedAt) > 0) return true;
  return snapshot.records.size > 0;
}

function snapshotArrivalMessage(snapshot) {
  if (snapshot?.settings && snapshot?.dataset && !isSnapshotUsable(snapshot)) {
    const expected = Number(snapshot.dataset.liveRecordCount);
    if (Number.isInteger(expected) && expected >= 0) {
      return `Firefox Sync is still delivering the MosaicSync snapshot (${liveRecordCount(snapshot.records)} of ${expected} shortcut/folder records are available).`;
    }
    return "Firefox Sync is still delivering the MosaicSync snapshot to this profile.";
  }
  if (hasSnapshotData(snapshot)) return "A partial MosaicSync snapshot has arrived, but it is not complete yet.";
  return "No synchronized MosaicSync layout has arrived in this Firefox profile yet.";
}
