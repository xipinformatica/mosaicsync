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
 * - keep layout records authoritative and artwork best-effort under browser Sync quota;
 * - never let a newly installed device publish until the user chooses a source.
 */
import {
  ASSET_ORPHAN_GRACE_MS,
  DEVICE_SNAPSHOT_GC_INTERVAL_MS,
  EXPECTATION_TTL_MS,
  FAVICON_QUALITY_AUDIT_MAX_ENTRIES,
  FAVICON_QUALITY_AUDIT_POLICY_VERSION,
  FAVICON_QUALITY_AUDIT_TTL_MS,
  ICON_RECOVERY_ALARM,
  ICON_RECOVERY_CONCURRENCY,
  ICON_RECOVERY_CONTINUE_DELAY_MS,
  ICON_RECOVERY_EXHAUSTED_RETRY_MS,
  ICON_RECOVERY_FETCH_TIMEOUT_MS,
  ICON_RECOVERY_MAX_ATTEMPTS,
  ICON_RECOVERY_QUEUE_VERSION,
  ICON_RECOVERY_RETRY_DELAYS_MS,
  ICON_RECOVERY_WATCHDOG_MS,
  LEGACY_ICON_HYDRATION_ALARM,
  LEGACY_SESSION_ICON_HYDRATION_FAILURES_KEY,
  LOCAL_ASSET_GC_KEY,
  LOCAL_FAVICON_QUALITY_AUDIT_KEY,
  LOCAL_ICON_RECOVERY_QUEUE_KEY,
  LOCAL_ICON_RECOVERY_STATUS_KEY,
  LOCAL_MAINTENANCE_MIGRATIONS_KEY,
  LOCAL_SYNC_DIAGNOSTICS_KEY,
  LOCAL_SYNC_CONTINUITY_KEY,
  LOCAL_SYNC_RECOVERY_STATUS_KEY,
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
  SYNC_DEVICE_NAME_PREFIX,
  SYNC_DEVICE_NAME_SCHEMA_VERSION,
  SYNC_RESET_INTENT_KEY,
  SYNC_RESET_INTENT_SCHEMA_VERSION,
  SYNC_RECOVERY_STATUS_SCHEMA_VERSION,
  SYNC_ITEM_PREFIX,
  SYNC_PREFIX,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_BYTES_PER_ITEM,
  SYNC_QUOTA_MAX_ITEMS,
  SYNC_SETTINGS_KEY,
  SYNC_SPACE_PREFIX,
  SYNC_SCHEMA_VERSION,
  SYNC_WATCH_ALARM,
  SYNC_RECOVERY_ALARM,
  SYNC_WATCH_PERIOD_MINUTES,
  TOMBSTONE_TTL_MS,
  VERSION,
  WEB_ACCESS_CACHE_MS
} from "../core/constants.js";
import {
  assetIdForDataUrl,
  chooseNewerRecord,
  collectLocalAssetsNormalized,
  faviconPreferenceMatchesCandidate,
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  makeTombstone,
  mergeSettingsRecords,
  localStateSyncClockSignature,
  localStateSyncRawSignature,
  localStateSyncSignature,
  mergeRecordMaps,
  newestRecordTimestamp,
  nextMutationTime,
  normalizeDeviceName,
  normalizeFaviconPreference,
  normalizeState,
  replaceWorkspaceNormalized,
  settingsRecordEqual,
  stableStringify,
  stampSettingsMutationClocks,
  stateFromRecords,
  syncRecordEqual,
  uid,
  workspaceStateNormalized
} from "../core/model.js";
import {
  clearSessionFrequentlyVisitedSnapshot,
  clearSessionFrequentlyVisitedSuppression,
  ensureLocalStorage,
  readLocalMeta,
  updateLocalMeta,
  writeLocalMeta,
  writeLocalState
} from "../core/storage.js";
import { compactSignature as compactRuntimeSignature, consumeExactExpectation, consumeExactSessionExpectations, countOwnEnumerable, hasOwnEnumerable, syncNamespaceFor, trimExpectationMap, trimSessionEntries } from "./runtime-utils.js";
import { selectAtomicRecoverySnapshot } from "./sync-source-policy.js";
import { createRecoveryContinuity } from "./recovery-continuity.js";
import { createRecoveryGenerationFormat } from "./recovery-generation-format.js";
import { createRecoveryGenerationLifecycle } from "./recovery-generation-lifecycle.js";
import { createRecoveryGenerationStore } from "./recovery-generation-store.js";
import { devMark, devMeasure } from "../core/perf.js";
import { isSafeSelfContainedSvgText, svgRasterDimensionsFromText } from "../core/svg-safety.js";

let backgroundStarted = false;

export function startBackground(adapter) {
  if (backgroundStarted) return false;
  backgroundStarted = true;
  if (!adapter || typeof adapter !== "object") throw new TypeError("MosaicSync background adapter is required.");
  const {
    cleanupLegacyWebOriginPermissions,
    permissionChangeAffectsTopSites,
    platformHasPermissionFreeFaviconSource,
    resolveBrowserCachedFavicon: resolveBrowserCachedFaviconAdapter,
    resolveTabNativeFavicon: resolveTabNativeFaviconAdapter,
    isProtectedFaviconUrl,
    handlesDataCollectionPermission = false,
    resetProfileProtectionOnSyncDisable = false
  } = adapter;
  for (const [name, fn] of Object.entries({
    cleanupLegacyWebOriginPermissions,
    permissionChangeAffectsTopSites,
    platformHasPermissionFreeFaviconSource,
    resolveBrowserCachedFaviconAdapter,
    resolveTabNativeFaviconAdapter,
    isProtectedFaviconUrl
  })) {
    if (typeof fn !== "function") throw new TypeError(`Invalid MosaicSync background adapter capability: ${name}`);
  }

  let queue = Promise.resolve();
  let foregroundReconcileInFlight = null;
  const ignoredLocalStateSignatures = new Map();
  const expectedSyncChanges = new Map();
  const deliveredCoreEvidence = new Map();
  const REMOVED = Symbol("removed");
  const DELIVERED_CORE_EVIDENCE_TTL_MS = Math.max(EXPECTATION_TTL_MS, 10 * 60 * 1000);
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
  let faviconQualityAuditWriteQueue = Promise.resolve();
  let syncDiagnosticsWriteQueue = Promise.resolve();
  const pendingSyncStorageChanges = new Map();
  let pendingSyncStorageOverwrittenEvidence = 0;
  let syncStorageReconcileScheduled = false;

  const PERSONAL_SPACE_ID = "personal";
  const WORK_SPACE_ID = "work";

  // Step 4 keeps Recovery representation, lifecycle decisions and storage
  // mechanics behind explicit browser-neutral seams. The core owns browser
  // effects, publication trust, merges, journals and catastrophic continuity.
  const recoveryGenerationFormat = createRecoveryGenerationFormat({
    bytesToBase64,
    compareStableText,
    datasetUpdatedAt,
    fnv1a,
    liveRecordCount,
    recordFingerprint
  });
  const {
    clearDeviceSnapshotDecodeCache,
    compareDeviceSnapshotGenerationRecency,
    isDeviceSnapshotKey,
  } = recoveryGenerationFormat;
  const recoveryGenerationLifecycle = createRecoveryGenerationLifecycle({
    format: recoveryGenerationFormat,
    compareStableText,
    syncEntryBytes
  });
  const {
    confirmedDeviceSnapshotGarbageCollectionKeys,
    confirmedSupersededDeviceSnapshotKeys,
    planDeviceSnapshotGarbageCollection,
    planDeviceSnapshotPublicationCapacity,
    supersededDeviceSnapshotRootKeys,
    syncItemsFitInSnapshot
  } = recoveryGenerationLifecycle;
  const recoveryGenerationStore = createRecoveryGenerationStore({
    format: recoveryGenerationFormat,
    readAllSyncItems: () => browser.storage.sync.get(null),
    removeSyncItems,
    syncEntryBytes,
    writeSyncItems
  });
  const {
    commitProfileDeviceSnapshotPublication,
    prepareProfileDeviceSnapshotPublication,
    readDeviceSnapshots,
    readOwnDeviceSnapshot,
    verifyProfileDeviceSnapshotPublication
  } = recoveryGenerationStore;

  function syncNamespace(spaceId = PERSONAL_SPACE_ID) {
    return syncNamespaceFor(spaceId, { personalSpaceId: PERSONAL_SPACE_ID, syncPrefix: SYNC_PREFIX, syncSettingsKey: SYNC_SETTINGS_KEY, syncDatasetKey: SYNC_DATASET_KEY, syncItemPrefix: SYNC_ITEM_PREFIX, syncAssetPrefix: SYNC_ASSET_PREFIX, syncSpacePrefix: SYNC_SPACE_PREFIX });
  }

  function compactSignature(signature) { return compactRuntimeSignature(signature, REMOVED); }

  function rememberLocalSignature(signature) {
    // Exact own-write signatures are one-shot capabilities, not wall-clock leases.
    // A large system-clock correction must not turn a delayed exact echo into an
    // external local mutation. Bounded size + consume-once provides the cleanup.
    trimExpectationMap(ignoredLocalStateSignatures, { max: MAX_EXPECTATIONS - 1 });
    ignoredLocalStateSignatures.set(signature, { signature, expiresAt: Date.now() + EXPECTATION_TTL_MS });
  }

  function consumeLocalSignature(signature) {
    const expected = ignoredLocalStateSignatures.get(signature);
    ignoredLocalStateSignatures.delete(signature);
    return Boolean(expected && (typeof expected === "object" ? expected.signature === signature : true));
  }

  async function rememberDurableLocalSignature(signature) {
    if (!browser.storage.session) return;
    try {
      const fingerprint = compactSignature(signature);
      const stored = await browser.storage.session.get(SESSION_LOCAL_IGNORE_KEY);
      const entries = trimSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY], { max: MAX_EXPECTATIONS - 1 });
      entries[fingerprint] = { signature: fingerprint, expiresAt: Date.now() + EXPECTATION_TTL_MS };
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
      const entries = trimSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY]);
      const expected = entries[fingerprint];
      delete entries[fingerprint];
      await browser.storage.session.set({ [SESSION_LOCAL_IGNORE_KEY]: entries });
      return Boolean(expected && (typeof expected === "object" ? expected.signature === fingerprint : true));
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
      const entries = trimSessionEntries(stored?.[SESSION_LOCAL_IGNORE_KEY]);
      if (!Object.prototype.hasOwnProperty.call(entries, fingerprint)) return;
      delete entries[fingerprint];
      await browser.storage.session.set({ [SESSION_LOCAL_IGNORE_KEY]: entries });
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: could not roll back local write suppression`, error);
    }
  }

  function rememberSyncChange(key, signature) {
    // Exact Sync echoes remain suppressible across RTC/NTP clock corrections.
    // `expiresAt` is retained only for backward-compatible session payload shape;
    // it is not consulted when an exact key+signature echo is consumed.
    trimExpectationMap(expectedSyncChanges, { max: MAX_EXPECTATIONS - 1 });
    expectedSyncChanges.set(key, { signature, expiresAt: Date.now() + EXPECTATION_TTL_MS });
  }

  function consumeSyncChange(key, signature) {
    return consumeExactExpectation(expectedSyncChanges, key, signature);
  }

  function coreEvidenceDescriptor(key, value) {
    if (!key || !value || typeof value !== "object") return null;
    for (const spaceId of [PERSONAL_SPACE_ID, WORK_SPACE_ID]) {
      const namespace = syncNamespace(spaceId);
      if (key === namespace.settingsKey) {
        return value.kind === "settings" ? { spaceId, key, value } : null;
      }
      if (!key.startsWith(namespace.itemPrefix) || typeof value.id !== "string" || !value.id) continue;
      if (!["shortcut", "folder", "deleted"].includes(value.kind)) return null;
      if (key !== itemKey(value.id, spaceId)) return null;
      return { spaceId, key, value };
    }
    return null;
  }

  function pruneDeliveredCoreEvidence(now = Date.now()) {
    for (const [key, entry] of deliveredCoreEvidence) {
      if (!entry || entry.expiresAt < now) deliveredCoreEvidence.delete(key);
    }
    while (deliveredCoreEvidence.size > MAX_EXPECTATIONS) {
      deliveredCoreEvidence.delete(deliveredCoreEvidence.keys().next().value);
    }
  }

  function clearDeliveredCoreEvidence() {
    deliveredCoreEvidence.clear();
  }

  function rememberDeliveredCoreEvidence(key, value) {
    const descriptor = coreEvidenceDescriptor(key, value);
    if (!descriptor) return false;
    pruneDeliveredCoreEvidence();
    const existing = deliveredCoreEvidence.get(key);
    const winner = existing?.value ? chooseNewerRecord(existing.value, descriptor.value) : descriptor.value;
    deliveredCoreEvidence.set(key, {
      spaceId: descriptor.spaceId,
      value: structuredClone(winner),
      expiresAt: Date.now() + DELIVERED_CORE_EVIDENCE_TTL_MS
    });
    pruneDeliveredCoreEvidence();
    return true;
  }

  function rememberOverwrittenCoreEvidence(key, oldValue, newValue) {
    const oldDescriptor = coreEvidenceDescriptor(key, oldValue);
    const newDescriptor = coreEvidenceDescriptor(key, newValue);
    if (!oldDescriptor || !newDescriptor || oldDescriptor.spaceId !== newDescriptor.spaceId) return false;
    if (stableStringify(oldValue) === stableStringify(newValue)) return false;
    return chooseNewerRecord(newValue, oldValue) === oldValue
      ? rememberDeliveredCoreEvidence(key, oldValue)
      : false;
  }

  async function repairDeliveredCoreEvidence(spaceId = PERSONAL_SPACE_ID) {
    pruneDeliveredCoreEvidence();
    const evidence = [...deliveredCoreEvidence.entries()].filter(([, entry]) => entry?.spaceId === spaceId);
    if (!evidence.length) return { repaired: 0, resolved: 0 };

    const keys = evidence.map(([key]) => key);
    const current = await browser.storage.sync.get(keys);
    const writes = {};
    const resolved = new Set();
    const writeTokens = new Map();

    for (const [key, entry] of evidence) {
      const currentValue = current?.[key];
      const currentDescriptor = coreEvidenceDescriptor(key, currentValue);
      if (!currentDescriptor) {
        writes[key] = entry.value;
        writeTokens.set(key, entry);
        continue;
      }
      const winner = chooseNewerRecord(currentValue, entry.value);
      if (winner === entry.value && stableStringify(currentValue) !== stableStringify(entry.value)) {
        writes[key] = entry.value;
        writeTokens.set(key, entry);
      } else {
        resolved.add(key);
      }
    }

    if (hasOwnEnumerable(writes)) await writeSyncItems(writes);

    for (const [key, entry] of evidence) {
      if (!resolved.has(key) && !writeTokens.has(key)) continue;
      if (deliveredCoreEvidence.get(key) === entry) deliveredCoreEvidence.delete(key);
    }
    return { repaired: writeTokens.size, resolved: resolved.size };
  }

  async function rememberDurableSyncChanges(entries) {
    if (!browser.storage.session || !entries.length) return;
    try {
      const stored = await browser.storage.session.get(SESSION_SYNC_EXPECTATIONS_KEY);
      const expectations = trimSessionEntries(stored?.[SESSION_SYNC_EXPECTATIONS_KEY], { max: Math.max(0, MAX_EXPECTATIONS - entries.length) });
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
      const compactEntries = entries.map(([key, signature]) => [key, compactSignature(signature)]);
      const consumed = consumeExactSessionExpectations(
        stored?.[SESSION_SYNC_EXPECTATIONS_KEY],
        compactEntries,
        { max: MAX_EXPECTATIONS }
      );
      await browser.storage.session.set({ [SESSION_SYNC_EXPECTATIONS_KEY]: consumed.expectations });
      return consumed.hasExternalChange;
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

  async function enqueueForegroundReconcile() {
    if (foregroundReconcileInFlight) return foregroundReconcileInFlight;
    const run = enqueue(() => reconcileIfNewCommit("foreground"));
    foregroundReconcileInFlight = run;
    void run.then(
      () => { if (foregroundReconcileInFlight === run) foregroundReconcileInFlight = null; },
      () => { if (foregroundReconcileInFlight === run) foregroundReconcileInFlight = null; }
    );
    return run;
  }

  async function openMosaicHomeTab() {
    try {
      await browser.tabs.create({ url: browser.runtime.getURL("newtab/newtab.html"), active: true });
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: could not open MosaicSync home`, error);
    }
  }

  const SYNC_DIAGNOSTICS_VERSION = 1;
  const SYNC_DIAGNOSTIC_REASONS = new Set(["alarm", "foreground", "message", "newtab-startup", "settings", "startup", "storage-event"]);

  function finiteDiagnosticTime(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function normalizeSyncDiagnostics(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const text = key => typeof source[key] === "string" ? source[key].slice(0, 160) : "";
    const count = key => {
      const value = Number(source[key]);
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    };
    return {
      version: SYNC_DIAGNOSTICS_VERSION,
      lastSyncWatchCheckAt: finiteDiagnosticTime(source.lastSyncWatchCheckAt),
      lastForegroundSyncCheckAt: finiteDiagnosticTime(source.lastForegroundSyncCheckAt),
      lastSyncStorageChangeEventAt: finiteDiagnosticTime(source.lastSyncStorageChangeEventAt),
      lastSyncStorageChangeRelevantCount: count("lastSyncStorageChangeRelevantCount"),
      lastSyncStorageChangeUnresolvedCount: count("lastSyncStorageChangeUnresolvedCount"),
      lastCheckAt: finiteDiagnosticTime(source.lastCheckAt),
      lastCheckReason: SYNC_DIAGNOSTIC_REASONS.has(source.lastCheckReason) ? source.lastCheckReason : "",
      lastCheckOutcome: text("lastCheckOutcome"),
      lastObservedSharedRevision: text("lastObservedSharedRevision"),
      lastObservedDeviceRevision: text("lastObservedDeviceRevision"),
      lastObservedWorkRevision: text("lastObservedWorkRevision"),
      lastObservedProfileRevision: text("lastObservedProfileRevision"),
      lastReconcileAt: finiteDiagnosticTime(source.lastReconcileAt),
      lastReconcileReason: SYNC_DIAGNOSTIC_REASONS.has(source.lastReconcileReason) ? source.lastReconcileReason : "",
      lastReconcileOutcome: text("lastReconcileOutcome")
    };
  }

  function mutateSyncDiagnostics(mutator) {
    const run = syncDiagnosticsWriteQueue.then(async () => {
      const stored = await browser.storage.local.get(LOCAL_SYNC_DIAGNOSTICS_KEY);
      const current = normalizeSyncDiagnostics(stored?.[LOCAL_SYNC_DIAGNOSTICS_KEY]);
      const candidate = typeof mutator === "function" ? mutator(current) : { ...current, ...(mutator || {}) };
      const next = normalizeSyncDiagnostics(candidate);
      await browser.storage.local.set({ [LOCAL_SYNC_DIAGNOSTICS_KEY]: next });
      return next;
    });
    syncDiagnosticsWriteQueue = run.catch(() => {});
    return run.catch(() => null);
  }

  function noteSyncDiagnostic(patch) {
    return mutateSyncDiagnostics(current => ({ ...current, ...(patch || {}) }));
  }

  function syncCheckReason(value) {
    return SYNC_DIAGNOSTIC_REASONS.has(value) ? value : "message";
  }

  const recoveryContinuity = createRecoveryContinuity({ compareStableText, fnv1a });

  function normalizeContinuityTombstones(value) {
    return recoveryContinuity.normalizeContinuityTombstones(value, Date.now());
  }

  function continuityTombstonesFromRecords(records) {
    return recoveryContinuity.continuityTombstonesFromRecords(records, Date.now());
  }

  async function readSyncContinuity(meta = null) {
    const stored = await browser.storage.local.get(LOCAL_SYNC_CONTINUITY_KEY);
    return recoveryContinuity.normalizeSyncContinuity(stored?.[LOCAL_SYNC_CONTINUITY_KEY], meta, Date.now());
  }

  async function writeSyncContinuity(value, meta = null) {
    const next = recoveryContinuity.normalizeSyncContinuity(value, meta, Date.now());
    await browser.storage.local.set({ [LOCAL_SYNC_CONTINUITY_KEY]: next });
    return next;
  }

  async function writeSyncRecoveryStatus(state) {
    const allowed = new Set(["recovering", "restored", "failed"]);
    if (!allowed.has(state)) return;
    await browser.storage.local.set({
      [LOCAL_SYNC_RECOVERY_STATUS_KEY]: {
        schemaVersion: SYNC_RECOVERY_STATUS_SCHEMA_VERSION,
        state,
        eventId: uid("sync-recovery"),
        updatedAt: Date.now()
      }
    });
  }

  function validResetIntent(value) {
    return Boolean(value && value.kind === "reset-intent" &&
      Number(value.schemaVersion) === SYNC_RESET_INTENT_SCHEMA_VERSION &&
      Number.isFinite(Number(value.epoch)) && Number(value.epoch) > 0 &&
      typeof value.initiatedByDevice === "string" && value.initiatedByDevice.length > 0);
  }

  async function scheduleSyncRecoveryAlarm(when = 0) {
    if (!browser.alarms?.create || !browser.alarms?.clear) return;
    try {
      await browser.alarms.clear(SYNC_RECOVERY_ALARM);
      if (Number(when) > Date.now()) await browser.alarms.create(SYNC_RECOVERY_ALARM, { when: Number(when) });
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: could not schedule Sync recovery check`, error);
    }
  }

  async function deferPersistedSyncRecoveryAfterBrowserStartup(meta) {
    const continuity = await readSyncContinuity(meta);
    const now = Date.now();
    // Time spent with the browser closed is not evidence that Firefox Sync had a
    // chance to download Extension-Storage. Give every persisted loss state one
    // fresh startup window before any authoritative recovery publication.
    const plan = recoveryContinuity.planStartupRecoveryDeferral(continuity, now);
    if (!plan) return continuity;
    const next = await writeSyncContinuity(plan.continuity, meta);
    await scheduleSyncRecoveryAlarm(plan.alarmAt);
    return next;
  }

  async function markSyncContinuityHealthy(meta, descriptor = {}) {
    const current = await readSyncContinuity(meta);
    const planned = recoveryContinuity.planHealthyContinuity(current, descriptor, Date.now());
    const next = await writeSyncContinuity(planned, meta);
    await scheduleSyncRecoveryAlarm(0);
    return next;
  }

  async function markIntentionalSyncReset(meta, epoch) {
    const current = await readSyncContinuity(meta);
    const planned = recoveryContinuity.planIntentionalReset(current, epoch);
    const next = await writeSyncContinuity(planned, meta);
    await scheduleSyncRecoveryAlarm(0);
    return next;
  }

  function hasLiveSyncCoreSignal(all) {
    if (!all || typeof all !== "object") return false;
    const workNamespace = syncNamespace(WORK_SPACE_ID);
    return Object.keys(all).some(key =>
      key === SYNC_SETTINGS_KEY ||
      key === SYNC_DATASET_KEY ||
      key.startsWith(SYNC_ITEM_PREFIX) ||
      key === workNamespace.settingsKey ||
      key === workNamespace.datasetKey ||
      key.startsWith(workNamespace.itemPrefix)
    );
  }

  function completeRemoteDescriptor(sources, workSnapshot) {
    const personal = combinedRemoteCore(sources.shared, sources.device);
    const work = combinedWorkRemoteCore(workSnapshot, sources.profile);
    const complete = remoteCoreUsable(personal) && remoteCoreUsable(work) &&
      (sources.profile?.complete === true || (isSnapshotUsable(sources.shared) && isSnapshotUsable(workSnapshot)));
    if (!complete) return null;
    return {
      revision: sources.profile?.revision || `${personal.revision || ""}|${work.revision || ""}`,
      publisherDeviceId: sources.profile?.originDeviceId || personal.originDeviceId || work.originDeviceId || "",
      personalTombstones: continuityTombstonesFromRecords(personal.records),
      workTombstones: continuityTombstonesFromRecords(work.records)
    };
  }

  function completeLiveRemoteDescriptor(sources, workSnapshot) {
    if (!isSnapshotUsable(sources?.shared) || !isSnapshotUsable(workSnapshot)) return null;
    const personalRevision = datasetRevision(sources.shared.dataset);
    const workRevision = datasetRevision(workSnapshot.dataset);
    const personalPublisher = typeof sources.shared.dataset?.originDeviceId === "string" ? sources.shared.dataset.originDeviceId : "";
    const workPublisher = typeof workSnapshot.dataset?.originDeviceId === "string" ? workSnapshot.dataset.originDeviceId : "";
    return {
      revision: `${personalRevision}|${workRevision}`,
      // A two-ledger live profile can contain contributions from several devices;
      // only retain a publisher identity when both final dataset commits agree.
      publisherDeviceId: personalPublisher && personalPublisher === workPublisher ? personalPublisher : "",
      personalTombstones: continuityTombstonesFromRecords(sources.shared.records),
      workTombstones: continuityTombstonesFromRecords(workSnapshot.records)
    };
  }

  async function observeRemoteResetIntent(intent, meta) {
    if (!validResetIntent(intent)) return null;
    await markIntentionalSyncReset(meta, Number(intent.epoch));
    await clearAllPendingSyncRecoveryState();
    const next = await writeLocalMeta({
      ...meta,
      // A peer that observes an explicit reset must never resurrect its old local
      // copy, but it also should not silently drop out of Sync forever. Keep it in
      // the existing safe await-remote mode so a later explicit “Use this device”
      // publication from any peer can automatically become the new source.
      syncEnabled: true,
      syncInitialized: false,
      syncBootstrapMode: "await-remote",
      syncStatus: "waiting",
      lastSyncError: "",
      lastSyncWarning: "",
      syncWaitStartedAt: Date.now()
    });
    await ensureSyncWatchAlarm(next);
    return { ok: true, skipped: true, reason: "intentional-remote-reset", meta: next };
  }

  async function beginOrContinueCatastrophicSyncRecovery(meta, checkReason = "message") {
    let continuity = await readSyncContinuity(meta);
    if (!continuity.established) return null;

    // Once a loss has been observed, partial recovery fragments remain quarantined
    // until a complete Personal+Work profile validates. A failed mid-publication
    // must not strand every other device merely because a few keys made the
    // namespace non-zero.
    if (continuity.lossState !== "none") {
      const all = await browser.storage.sync.get(null);
      const reset = all?.[SYNC_RESET_INTENT_KEY];
      if (validResetIntent(reset)) return observeRemoteResetIntent(reset, meta);
      const sources = await readCoreSources(all, { includeAssets: false });
      const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
      // Once live-core loss is quarantined, locally retained immutable recovery
      // generations cannot prove that Firefox/Mozilla Sync has recovered. Only a
      // coherent live Personal+Work ledger cancels the quarantine. This prevents
      // stale local Recovery roots from masking a real remote namespace wipe.
      const complete = completeLiveRemoteDescriptor(sources, workSnapshot);
      if (complete) {
        const hadConfirmedRecovery = continuity.lossState === "recovering" || continuity.recoveryAttempts > 0;
        await markSyncContinuityHealthy(meta, complete);
        if (hadConfirmedRecovery) await writeSyncRecoveryStatus("restored");
        return null;
      }
    } else {
      // Recovery generations and device-name records are safety/metadata, not proof
      // that the live shared Personal+Work ledgers still exist. Firefox can retain
      // stale local recovery keys after the server-side Extension Storage namespace
      // was wiped. If those keys count as "non-empty", no survivor would ever enter
      // catastrophic-loss recovery. Double-confirm the *live core* instead.
      const firstCoreCheck = await browser.storage.sync.get(null);
      const firstReset = firstCoreCheck?.[SYNC_RESET_INTENT_KEY];
      if (validResetIntent(firstReset)) return observeRemoteResetIntent(firstReset, meta);
      if (hasLiveSyncCoreSignal(firstCoreCheck)) return null;

      // A second independent namespace read protects startup/staggered-delivery
      // races. Quarantine is still only a waiting state; the existing recovery
      // grace gives Firefox ample time to deliver a coherent live ledger before any
      // survivor can republish from its protected local profile.
      const secondCoreCheck = await browser.storage.sync.get(null);
      const secondReset = secondCoreCheck?.[SYNC_RESET_INTENT_KEY];
      if (validResetIntent(secondReset)) return observeRemoteResetIntent(secondReset, meta);
      if (hasLiveSyncCoreSignal(secondCoreCheck)) return null;
      const now = Date.now();
      const quarantine = recoveryContinuity.planLossQuarantine(continuity, meta.deviceId, now);
      continuity = await writeSyncContinuity(quarantine.continuity, meta);
      await scheduleSyncRecoveryAlarm(quarantine.alarmAt);
      await noteSyncDiagnostic({
        lastCheckAt: now,
        lastCheckReason: syncCheckReason(checkReason),
        lastCheckOutcome: "remote-loss-quarantine"
      });
      return { ok: true, pending: true, reason: "remote-loss-quarantine", meta };
    }

    const now = Date.now();
    const readiness = recoveryContinuity.recoveryReadiness(continuity, now);
    if (readiness === "failed") {
      return { ok: false, reason: "remote-loss-recovery-failed", error: "MosaicSync couldn't restore the synchronized copy. Your local profile is still safe.", meta };
    }
    if (readiness === "wait") {
      await scheduleSyncRecoveryAlarm(continuity.recoveryEligibleAt);
      return { ok: true, pending: true, reason: "remote-loss-quarantine", meta };
    }

    const attemptPlan = recoveryContinuity.planRecoveryAttempt(continuity, now);
    const attempt = attemptPlan.attempt;
    // Persist a one-shot grace deadline before starting the publication. It is not
    // consulted by this live attempt, but if MV3 kills the worker halfway through,
    // the replacement worker waits briefly before publishing a second generation.
    continuity = await writeSyncContinuity(attemptPlan.continuity, meta);
    await writeSyncRecoveryStatus("recovering");

    try {
      const result = await bootstrapLocal({
        recovery: true,
        markContinuity: false,
        preservePendingSyncRecovery: true,
        retainedPersonalTombstones: continuity.personalTombstones,
        retainedWorkTombstones: continuity.workTombstones
      });
      if (!result?.ok) throw new Error(result?.error || "Sync recovery publication failed.");

      let currentMeta = result.meta || await readLocalMeta();
      currentMeta = await retryPendingCrossSpaceSync(currentMeta);
      currentMeta = await retryPendingLocalSyncMutation(currentMeta);
      const status = await getSyncStatus();
      if (!status?.hasRemoteData) throw new Error("The recovered synchronized copy could not be verified.");

      const all = await browser.storage.sync.get(null);
      const sources = await readCoreSources(all, { includeAssets: false });
      const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
      const descriptor = completeRemoteDescriptor(sources, workSnapshot);
      if (!descriptor) throw new Error("The recovered synchronized copy is incomplete.");
      const healthy = await markSyncContinuityHealthy(currentMeta, descriptor);
      await writeSyncContinuity(recoveryContinuity.planRecoverySuccess(healthy, Date.now()), currentMeta);
      await writeSyncRecoveryStatus("restored");
      return { ok: true, recovered: true, reason: "remote-loss-recovered", meta: await readLocalMeta() };
    } catch (error) {
      const currentMeta = await readLocalMeta();
      const failure = recoveryContinuity.planRecoveryFailure(continuity, attempt, meta.deviceId, Date.now());
      if (failure.failed) {
        await writeSyncContinuity(failure.continuity, currentMeta);
        await scheduleSyncRecoveryAlarm(0);
        await writeSyncRecoveryStatus("failed");
        const failedMeta = await writeLocalMeta({
          ...currentMeta,
          syncStatus: "error",
          lastSyncError: "MosaicSync couldn't restore the synchronized copy. Your local profile is still safe."
        });
        return { ok: false, reason: "remote-loss-recovery-failed", error: failedMeta.lastSyncError, meta: failedMeta };
      }
      await writeSyncContinuity(failure.continuity, currentMeta);
      await scheduleSyncRecoveryAlarm(failure.alarmAt);
      return { ok: true, pending: true, reason: "remote-loss-retry", meta: currentMeta };
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

      // `runtime.onInstalled({ reason: "install" })` is lifecycle metadata, not
      // proof that MosaicSync has never existed in this browser profile. Firefox
      // can report install-like transitions during recovery/reinstallation, and
      // extension-local storage may legitimately survive such a transition.
      //
      // Therefore this event must never reset durable MosaicSync state, Sync
      // bookkeeping or onboarding by itself. `ensureLocalStorage()` already
      // creates the normal defaults when the authoritative keys are truly absent;
      // when they exist, preserving them is the only fail-safe behavior. Any
      // destructive reset belongs behind an explicit user action, never an
      // ambiguous browser lifecycle reason.

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
          force: resolverQualityUpgrade,
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
      await deferPersistedSyncRecoveryAfterBrowserStartup(meta);
      if (meta.syncEnabled && meta.syncInitialized) {
        // Startup must run the catastrophic-loss guard before replaying a pending
        // local mutation. A crash-surviving journal must never become the first
        // write that recreates a browser-wiped Sync namespace.
        const result = await reconcileIfNewCommit("startup", meta, false);
        await noteSyncDiagnostic({
          lastReconcileAt: Date.now(),
          lastReconcileReason: "startup",
          lastReconcileOutcome: result?.pending ? "waiting" : (result?.ok === false ? "error" : "reconciled")
        });
      } else if (meta.syncEnabled && meta.syncBootstrapMode === "await-remote") {
        const result = await reconcileIfNewCommit("startup");
        await noteSyncDiagnostic({
          lastReconcileAt: Date.now(),
          lastReconcileReason: "startup",
          lastReconcileOutcome: result?.pending ? "waiting" : (result?.ok === false ? "error" : "reconciled")
        });
      }
      return readLocalMeta();
    });
    void lifecycle.then(meta => {
      if (meta?.onboardingCompleted) return requestMissingShortcutIconHydration();
      return null;
    }).catch(() => {});
  });

  function scheduleSyncStorageReconciliation() {
    if (syncStorageReconcileScheduled) return;
    syncStorageReconcileScheduled = true;
    void enqueue(async () => {
      try {
        // Collapse an arbitrarily large Firefox delivery burst into at most one
        // reconciliation per semantic batch. Events raised by our own writes while
        // this task runs are folded into the next loop turn instead of enqueueing a
        // second unbounded chain of `storage-event` jobs.
        while (pendingSyncStorageChanges.size || pendingSyncStorageOverwrittenEvidence) {
          const unresolvedChanges = [...pendingSyncStorageChanges.entries()];
          pendingSyncStorageChanges.clear();
          const overwrittenEvidenceCount = pendingSyncStorageOverwrittenEvidence;
          pendingSyncStorageOverwrittenEvidence = 0;

          const durableExternalChange = unresolvedChanges.length
            ? await consumeDurableSyncChanges(unresolvedChanges)
            : false;
          if (!durableExternalChange && !overwrittenEvidenceCount) continue;

          const meta = await readLocalMeta();
          if (!meta.syncEnabled) {
            clearDeliveredCoreEvidence();
            continue;
          }
          if (!meta.syncInitialized && meta.syncBootstrapMode === "await-remote") {
            const result = await bootstrapRemote({ waitIfMissing: true });
            await noteSyncDiagnostic({
              lastReconcileAt: Date.now(),
              lastReconcileReason: "storage-event",
              lastReconcileOutcome: result?.pending ? "waiting" : (result?.ok === false ? "error" : "reconciled")
            });
            continue;
          }
          if (meta.syncInitialized) {
            const result = await reconcileIfNewCommit("storage-event");
            await noteSyncDiagnostic({
              lastReconcileAt: Date.now(),
              lastReconcileReason: "storage-event",
              lastReconcileOutcome: result?.pending ? "waiting" : (result?.ok === false ? "error" : (result?.skipped ? (result.reason || "already-applied") : "reconciled"))
            });
          }
        }
      } finally {
        syncStorageReconcileScheduled = false;
        if (pendingSyncStorageChanges.size || pendingSyncStorageOverwrittenEvidence) scheduleSyncStorageReconciliation();
      }
    }).catch(error => {
      syncStorageReconcileScheduled = false;
      console.warn(`${PRODUCT_NAME}: coalesced Sync storage reconciliation failed`, error);
      if (pendingSyncStorageChanges.size || pendingSyncStorageOverwrittenEvidence) scheduleSyncStorageReconciliation();
    });
  }

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
          const continuity = await readSyncContinuity(meta);
          if (continuity.lossState !== "none") return;
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
    const relevant = Object.entries(changes).filter(([key]) => key.startsWith(SYNC_PREFIX) && !key.startsWith(SYNC_DEVICE_NAME_PREFIX));
    if (!relevant.length) return;

    const unresolvedChanges = [];
    let overwrittenEvidenceCount = 0;
    for (const [key, change] of relevant) {
      // storage.onChanged carries both sides of the write. If our expected write
      // replaced a deterministically newer value that Firefox had delivered in
      // the tiny read->set publication window, oldValue is the last evidence of
      // that winner. Preserve it before the queued reconciliation reads storage.
      if (rememberOverwrittenCoreEvidence(key, change.oldValue, change.newValue)) overwrittenEvidenceCount += 1;
      const actual = change.newValue === undefined ? REMOVED : stableStringify(change.newValue);
      if (!consumeSyncChange(key, actual)) {
        if (change.newValue !== undefined) rememberDeliveredCoreEvidence(key, change.newValue);
        unresolvedChanges.push([key, actual]);
      }
    }

    if (unresolvedChanges.length || overwrittenEvidenceCount) {
      const storageEventAt = Date.now();
      for (const [key, signature] of unresolvedChanges) pendingSyncStorageChanges.set(key, signature);
      pendingSyncStorageOverwrittenEvidence += overwrittenEvidenceCount;
      void noteSyncDiagnostic({
        lastSyncStorageChangeEventAt: storageEventAt,
        lastSyncStorageChangeRelevantCount: relevant.length,
        lastSyncStorageChangeUnresolvedCount: unresolvedChanges.length + overwrittenEvidenceCount
      });
      scheduleSyncStorageReconciliation();
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
    if (alarm?.name === SYNC_RECOVERY_ALARM) {
      enqueue(() => reconcileIfNewCommit("alarm"));
      return;
    }
    if (alarm?.name !== SYNC_WATCH_ALARM) return;
    enqueue(async () => {
      let meta = await readLocalMeta();
      if (!meta.syncEnabled) {
        await ensureSyncWatchAlarm(meta);
        await noteSyncDiagnostic({
          lastSyncWatchCheckAt: Date.now(),
          lastCheckAt: Date.now(),
          lastCheckReason: "alarm",
          lastCheckOutcome: "sync-off"
        });
        return;
      }
      if (!meta.syncInitialized && meta.syncBootstrapMode === "await-remote") {
        const result = await bootstrapRemote({ waitIfMissing: true });
        const checkedAt = Date.now();
        await noteSyncDiagnostic({
          lastSyncWatchCheckAt: checkedAt,
          lastCheckAt: checkedAt,
          lastCheckReason: "alarm",
          lastCheckOutcome: result?.pending ? "waiting-remote" : (result?.ok === false ? "error" : "bootstrapped")
        });
        return;
      }
      if (meta.syncInitialized) {
        // Catastrophic namespace loss must be checked before replaying any pending
        // local mutation; otherwise an ordinary edit could accidentally become the
        // first write that recreates an externally wiped cloud namespace.
        await reconcileIfNewCommit("alarm", meta, false);
        meta = await readLocalMeta();
        await maybeGarbageCollectStaleDeviceSnapshots(meta);
      }
    });
  });

  browser.permissions?.onAdded?.addListener(permissions => {
    if (permissionChangeAffectsTopSites(permissions)) {
      void clearSessionFrequentlyVisitedSuppression();
    }
    const origins = Array.isArray(permissions?.origins) ? permissions.origins : [];
    const webAccessChanged = origins.some(origin => WEB_ORIGINS.includes(origin));
    if (!webAccessChanged) return;
    webAccessCacheValue = true;
    webAccessCacheAt = Date.now();
    // A fresh grant can improve already-present browser/native or low-resolution
    // artwork as well as fill genuinely missing icons. Re-seed both classes.
    void requestMissingShortcutIconHydration({ force: true }).catch(error => {
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
    if (!handlesDataCollectionPermission || !permissions?.data_collection?.length) return;
    enqueue(async () => {
      await clearAllPendingSyncRecoveryState();
      const meta = await readLocalMeta();
      if (!meta.syncEnabled) return;
      const next = await writeLocalMeta({
        ...meta,
        syncEnabled: false,
        syncInitialized: false,
        syncBootstrapMode: "none",
        syncStatus: "off",
        lastSyncError: "",
        lastSyncWarning: "",
        syncSkippedAssets: 0,
        syncFastSnapshotFallback: false,
        syncProfileProtection: "unknown",
        syncProfileProtectionReason: "",
        syncWaitStartedAt: 0,
        lastAppliedSyncRevision: "",
        lastAppliedWorkSyncRevision: "",
        lastAppliedDeviceSnapshotRevision: "",
        lastAppliedProfileSnapshotRevision: "",
        lastProfileSnapshotPublishedAt: 0,
        lastRemoteReceiptAt: 0,
        lastRemoteReceiptRevision: "",
        lastRemoteReceiptUpdatedAt: 0,
        lastRemoteReceiptOriginDeviceId: "",
        lastRemoteReceiptProvenanceExact: false
      });
      await ensureSyncWatchAlarm(next);
    });
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

  function linkedFetchAbortController(signal, timeoutMs) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener?.("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      callerAborted: () => signal?.aborted === true,
      cleanup() {
        clearTimeout(timeout);
        try { signal?.removeEventListener?.("abort", abortFromCaller); } catch {}
      }
    };
  }

  async function fetchBoundedResource(value, { maxBytes, deadlineAt, signal = null }) {
    if (!(await canReadOrigin(value))) return { ok: false, reason: "permission", url: value, type: "", bytes: null };
    const remaining = Math.max(0, Number(deadlineAt) - Date.now());
    if (remaining <= 0) return { ok: false, reason: "timeout", url: value, type: "", bytes: null };
    const timeoutMs = Math.max(250, Math.min(4_000, remaining));
    const abort = linkedFetchAbortController(signal, timeoutMs);
    try {
      const response = await fetch(value, {
        credentials: "omit",
        cache: "force-cache",
        referrerPolicy: "no-referrer",
        signal: abort.signal
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
      const aborted = abort.signal.aborted || error?.name === "AbortError";
      return { ok: false, reason: abort.callerAborted() ? "cancelled" : (aborted ? "timeout" : "network"), url: value, type: "", bytes: null };
    } finally {
      abort.cleanup();
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

  function faviconCandidateSuitability(candidate) {
    if (!candidate?.image) return -1;
    const side = faviconQualitySide(candidate);
    // Resolution is valuable only until it is comfortably tile-ready. A 512px
    // manifest/touch asset must not beat a crisp conventional favicon merely
    // because it is larger; provenance and geometry matter once quality is enough.
    const resolutionScore = side >= 128 ? 230 : side >= 64 ? 220 : side >= 32 ? 200 : side >= 16 ? 150 : Math.min(120, side * 6);
    const sourceKind = String(candidate.sourceKind || (candidate.native ? "browser" : ""));
    const sourceScore = ({
      link: 130,
      favicon: 120,
      browser: 115,
      touch: 65,
      manifest: 60,
      conventional: 55,
      tile: 40,
      parent: 30,
      redirect: 30,
      mask: 10
    })[sourceKind] ?? (candidate.declared ? 55 : 45);
    const width = Math.max(0, Number(candidate.width) || 0);
    const height = Math.max(0, Number(candidate.height) || 0);
    let geometryScore = 0;
    if (width && height) {
      const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
      geometryScore = ratio <= 1.08 ? 20 : ratio <= 1.20 ? 5 : -40;
    }
    return resolutionScore + sourceScore + geometryScore + (candidate.declared ? 5 : 0);
  }

  const FAVICON_AUTHORITATIVE_SUITABILITY = 375;

  function faviconCandidatePreference(left, right) {
    const leftScore = faviconCandidateSuitability(left);
    const rightScore = faviconCandidateSuitability(right);
    if (leftScore !== rightScore) return leftScore > rightScore ? 1 : -1;
    const leftSide = faviconQualitySide(left);
    const rightSide = faviconQualitySide(right);
    if (leftSide !== rightSide) return leftSide > rightSide ? 1 : -1;
    const leftDeclared = left?.declared === true;
    const rightDeclared = right?.declared === true;
    if (leftDeclared !== rightDeclared) return leftDeclared ? 1 : -1;
    const leftSource = String(left?.sourceKind || left?.source || "");
    const rightSource = String(right?.sourceKind || right?.source || "");
    if (leftSource === rightSource) return 0;
    return leftSource.localeCompare(rightSource) < 0 ? 1 : -1;
  }

  function faviconCandidateIsAuthoritativelyGoodEnough(candidate) {
    // Preserve bounded discovery, but stop only on artwork that is both genuinely
    // tile-ready and semantically strong. Large manifest/touch assets no longer
    // terminate discovery merely because their raw dimensions cross 128px.
    return faviconCandidateSuitability(candidate) >= FAVICON_AUTHORITATIVE_SUITABILITY;
  }

  function betterFaviconCandidate(current, candidate) {
    if (!candidate?.image) return current;
    if (!current?.image) return candidate;
    return faviconCandidatePreference(candidate, current) > 0 ? candidate : current;
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

  async function fetchImageDataUrlDetailed(value, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS, declared = false, qualityHint = 0, sourceKind = "", signal = null } = {}) {
    const inline = typeof value === "string" && /^data:/i.test(value);
    if (inline && !declared) return { image: "", sourceUrl: "", reason: "unsupported-image", width: 0, height: 0, qualitySide: 0, declared, sourceKind };
    const resource = inline
      ? decodeInlineFaviconResource(value)
      : await fetchBoundedResource(value, { maxBytes: REMOTE_IMAGE_MAX_BYTES, deadlineAt, signal });
    const sourceUrl = inline ? "" : (resource.url || value);
    if (!resource.ok) return { image: "", sourceUrl, reason: resource.reason, width: 0, height: 0, qualitySide: 0, declared, sourceKind };
    const type = inline ? resource.type : sniffImageMime(resource.bytes, resource.type);
    if (!type) return { image: "", sourceUrl, reason: "unsupported-image", width: 0, height: 0, qualitySide: 0, declared, sourceKind };
    if (type === "image/svg+xml") {
      const raster = await rasterizeSafeSvg(resource.bytes);
      return raster.image
        ? { ...raster, qualitySide: Math.min(raster.width, raster.height), sourceUrl, reason: "", declared, sourceKind }
        : { image: "", sourceUrl, reason: "unsupported-svg", width: 0, height: 0, qualitySide: 0, declared, sourceKind };
    }
    const dimensions = imageDimensionsFromBytes(resource.bytes, type);
    if (!imageDimensionsSafeForRemoteDecode(dimensions)) {
      return { image: "", sourceUrl, reason: "image-too-large", width: 0, height: 0, qualitySide: 0, declared, sourceKind };
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
      declared,
      sourceKind
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

  async function fetchHtmlHead(pageUrl, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS, signal = null } = {}) {
    if (!(await canReadOrigin(pageUrl))) return { ok: false, reason: "permission", finalPageUrl: pageUrl, text: "" };
    const remaining = Math.max(0, Number(deadlineAt) - Date.now());
    if (remaining <= 0) return { ok: false, reason: "timeout", finalPageUrl: pageUrl, text: "" };
    const abort = linkedFetchAbortController(signal, Math.max(250, Math.min(4_000, remaining)));
    try {
      const response = await fetch(pageUrl, {
        credentials: "omit",
        cache: "force-cache",
        referrerPolicy: "no-referrer",
        signal: abort.signal
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
      const aborted = abort.signal.aborted || error?.name === "AbortError";
      return { ok: false, reason: abort.callerAborted() ? "cancelled" : (aborted ? "timeout" : "network"), finalPageUrl: pageUrl, text: "" };
    } finally {
      abort.cleanup();
    }
  }

  async function discoverManifestIconCandidates(manifestUrl, pageUrl, { deadlineAt, signal = null }) {
    const resource = await fetchBoundedResource(manifestUrl, { maxBytes: REMOTE_MANIFEST_MAX_BYTES, deadlineAt, signal });
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

  async function discoverPageIconInfo(pageUrl, { deadlineAt = Date.now() + ICON_RECOVERY_FETCH_TIMEOUT_MS, signal = null } = {}) {
    const resource = await fetchHtmlHead(pageUrl, { deadlineAt, signal });
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
      if (signal?.aborted) break;
      const manifestIcons = await discoverManifestIconCandidates(manifestUrl, baseUrl, { deadlineAt, signal });
      for (const candidate of manifestIcons) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        icons.push({ ...candidate, order: order++ });
      }
    }

    icons.sort((a, b) => b.score - a.score || b.sideHint - a.sideHint || a.order - b.order);
    return { urls: icons.map(icon => icon.url), candidates: icons, finalPageUrl: baseUrl, reason: "" };
  }

  async function resolveBrowserCachedFavicon(pageUrl, { signal = null } = {}) {
    return resolveBrowserCachedFaviconAdapter(pageUrl, {
      signal,
      hasWebAccess,
      normalizeLocalFaviconDataUrl,
      fetchImageDataUrlDetailed
    });
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
      const sourceKind = path.includes("apple-touch") ? "touch" : (path.includes("favicon") || path.endsWith(".ico") ? "favicon" : "conventional");
      const candidate = await fetchImageDataUrlDetailed(`${origin}${path}`, { deadlineAt, declared: true, sourceKind });
      if (candidate.image) return candidate;
    }
    return null;
  }

  async function probeConventionalFaviconQualityUpgrade(origin, current, { deadlineAt }) {
    if (!origin || !current?.image || Date.now() >= deadlineAt) {
      const expired = Date.now() >= deadlineAt;
      return { best: current, complete: false, qualityUnresolved: expired, sawTimeout: expired };
    }
    let best = current;
    let complete = true;
    let qualityUnresolved = false;
    let sawTimeout = false;
    // Last-resort quality fallback after declared HTML/manifest artwork has been
    // attempted. The caller supplies a small isolated deadline so guessed paths
    // can never consume the authoritative discovery budget.
    for (const path of ["/icon.ico", "/favicon.svg", "/favicon.png", "/apple-touch-icon.png"]) {
      if (Date.now() >= deadlineAt) {
        complete = false;
        qualityUnresolved = true;
        sawTimeout = true;
        break;
      }
      const sourceKind = path.includes("apple-touch") ? "touch" : (path.includes("favicon") || path.endsWith(".ico") ? "favicon" : "conventional");
      const candidate = await fetchImageDataUrlDetailed(`${origin}${path}`, { deadlineAt, declared: true, sourceKind });
      if (candidate.image) {
        best = betterFaviconCandidate(best, candidate);
        continue;
      }
      if (candidate.reason === "timeout" || candidate.reason === "network") {
        complete = false;
        qualityUnresolved = true;
        sawTimeout = sawTimeout || candidate.reason === "timeout";
      }
    }
    return { best, complete, qualityUnresolved, sawTimeout };
  }

  async function probeOriginalOriginDeclaredIcons(origin, current, { deadlineAt }) {
    if (!origin || Date.now() >= deadlineAt) {
      return { best: current, complete: false, qualityUnresolved: true, sawTimeout: true };
    }
    const rootUrl = `${origin}/`;
    const discovered = await discoverPageIconInfo(rootUrl, { deadlineAt });
    const discoveryReason = String(discovered?.reason || "");
    const discoveryUnresolved = discoveryReason === "timeout" || discoveryReason === "network" || /^http-/.test(discoveryReason);
    let finalOrigin = "";
    try { finalOrigin = new URL(discovered.finalPageUrl || rootUrl).origin; } catch {}
    // Only trust this recovery pass when the public root stayed on the original
    // site. If it also redirects to an account/login provider, its icons describe
    // that provider rather than the shortcut site. A deterministic redirect is not
    // itself a transient quality failure, but it cannot justify the early return.
    if (finalOrigin !== origin || discoveryReason) {
      return {
        best: current,
        complete: false,
        qualityUnresolved: discoveryUnresolved,
        sawTimeout: discoveryReason === "timeout"
      };
    }

    let best = current;
    let complete = true;
    let qualityUnresolved = false;
    let sawTimeout = false;
    const candidates = (discovered.candidates || []).slice(0, 16);
    for (let index = 0; index < candidates.length; index += 2) {
      if (Date.now() >= deadlineAt) {
        complete = false;
        qualityUnresolved = true;
        sawTimeout = true;
        break;
      }
      const batch = candidates.slice(index, index + 2);
      const images = await Promise.all(batch.map(candidate => fetchImageDataUrlDetailed(candidate.url, {
        deadlineAt,
        declared: true,
        qualityHint: candidate.sideHint,
        sourceKind: candidate.source || "declared"
      })));
      for (const image of images) {
        if (image.image) best = betterFaviconCandidate(best, image);
        else if (image.reason === "timeout" || image.reason === "network") {
          complete = false;
          qualityUnresolved = true;
          sawTimeout = sawTimeout || image.reason === "timeout";
        }
      }
    }
    return { best, complete, qualityUnresolved, sawTimeout };
  }

  async function resolveFaviconForUrl(pageUrl, { timeoutMs = ICON_RECOVERY_FETCH_TIMEOUT_MS, preferQuality = false } = {}) {
    // Browser-protected pages (currently Chrome Web Store) cannot be fetched by
    // extensions. A platform-native cache may still provide their favicon.
    if (typeof isProtectedFaviconUrl === "function" && isProtectedFaviconUrl(pageUrl)) {
      const native = await resolveBrowserCachedFavicon(pageUrl);
      return native ? { ...native, provisional: false } : { image: "", sourceUrl: "", reason: "protected", provisional: false };
    }

    // A permission-free native cache (Chromium's _favicon) is allowed to provide
    // a local provisional fallback before Website Access. Firefox returns false
    // here, preserving its existing host-permission gate.
    const permissionFreeNative = platformHasPermissionFreeFaviconSource();
    let native = null;
    if (permissionFreeNative) native = await resolveBrowserCachedFavicon(pageUrl);
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

    if (!permissionFreeNative && !best?.image) {
      native = await resolveBrowserCachedFavicon(pageUrl);
      if (native?.image) best = native;
    }
    if (best?.image && !preferQuality) return { ...best, provisional: true };

    // The normal first pass remains favicon-first so a new shortcut gets artwork
    // quickly. Quality retries deliberately skip this re-fetch until after the
    // site's declared metadata has had the first chance to provide better art.
    if (!preferQuality && initialOrigin) {
      const conventional = await fetchImageDataUrlDetailed(`${initialOrigin}/favicon.ico`, { deadlineAt, sourceKind: "favicon" });
      if (conventional.image) {
        best = betterFaviconCandidate(best, conventional);
        return { ...best, provisional: true };
      }
      sawTimeout = sawTimeout || conventional.reason === "timeout";
    }

    // App subdomains can expose no usable favicon while the parent brand does.
    // Keep this as a fast first-pass fallback only; quality retries should spend
    // their budget on authoritative page metadata before guessing more paths.
    if (!preferQuality && !best?.image) {
      const parentUrl = parentHostFaviconUrl(pageUrl);
      if (parentUrl) {
        const parentDeadline = Math.min(deadlineAt, Date.now() + 2_500);
        const parent = await fetchImageDataUrlDetailed(parentUrl, { deadlineAt: parentDeadline, declared: true, sourceKind: "parent" });
        if (parent.image) return { ...parent, provisional: true };
        if (parent.reason === "timeout") sawTimeout = true;
      }
    }

    // Quality pass: declared HTML/manifest artwork is authoritative and gets the
    // healthy part of the budget. This is what finds modern icons living on CDN
    // hosts (for example static.example.com) without forcing users to visit first.
    const discovered = await discoverPageIconInfo(pageUrl, { deadlineAt });
    sawTimeout = sawTimeout || discovered.reason === "timeout";
    qualityUnresolved = discovered.reason === "timeout" || discovered.reason === "network" || /^http-/.test(discovered.reason || "");

    let discoveredFinalOrigin = "";
    try { discoveredFinalOrigin = new URL(discovered.finalPageUrl || pageUrl).origin; } catch {}

    // Anonymous requests for authenticated deep links can land on a generic login
    // provider. Inspect the original site's public root before considering the
    // redirected page's artwork, so the shortcut keeps the site's own identity.
    if (preferQuality && initialOrigin && discoveredFinalOrigin && discoveredFinalOrigin !== initialOrigin && Date.now() < deadlineAt) {
      const originalOriginScan = await probeOriginalOriginDeclaredIcons(initialOrigin, best, { deadlineAt });
      best = originalOriginScan.best;
      qualityUnresolved = qualityUnresolved || originalOriginScan.qualityUnresolved === true;
      sawTimeout = sawTimeout || originalOriginScan.sawTimeout === true;
      // This return is safe only after the original site's complete bounded declared
      // candidate set has been inspected. It avoids replacing the site's own strong
      // identity with artwork from an anonymous login-provider redirect.
      if (originalOriginScan.complete && faviconCandidateIsAuthoritativelyGoodEnough(best) && !qualityUnresolved) {
        return { ...best, qualityComplete: true, provisional: false };
      }
    }

    const candidates = (discovered.candidates || []).slice(0, 16);
    for (let index = 0; index < candidates.length; index += 2) {
      if (Date.now() >= deadlineAt) { sawTimeout = true; qualityUnresolved = true; break; }
      const batch = candidates.slice(index, index + 2);
      const images = await Promise.all(batch.map(candidate => fetchImageDataUrlDetailed(candidate.url, {
        deadlineAt,
        declared: true,
        qualityHint: candidate.sideHint,
        sourceKind: candidate.source || "declared"
      })));
      for (const image of images) {
        if (image.image) best = betterFaviconCandidate(best, image);
        else if (image.reason === "timeout" || image.reason === "network") qualityUnresolved = true;
        sawTimeout = sawTimeout || image.reason === "timeout";
      }
      if (!preferQuality && faviconCandidateIsAuthoritativelyGoodEnough(best)) {
        return { ...best, provisional: true };
      }
    }

    // Only after authoritative metadata has been tried do quality retries spend
    // time on conventional guessed filenames. Give that guesswork its own small
    // sub-budget so it can never starve page/manifest discovery again.
    if (preferQuality && initialOrigin && Date.now() < deadlineAt && (!best?.image || !faviconCandidateIsAuthoritativelyGoodEnough(best) || qualityUnresolved)) {
      const fallbackDeadline = Math.min(deadlineAt, Date.now() + 2_500);
      const conventional = await fetchImageDataUrlDetailed(`${initialOrigin}/favicon.ico`, { deadlineAt: fallbackDeadline, sourceKind: "favicon" });
      if (conventional.image) best = betterFaviconCandidate(best, conventional);
      else if (conventional.reason === "timeout" || conventional.reason === "network") qualityUnresolved = true;
      sawTimeout = sawTimeout || conventional.reason === "timeout";

      if (best?.image && Date.now() < fallbackDeadline) {
        const conventionalScan = await probeConventionalFaviconQualityUpgrade(initialOrigin, best, { deadlineAt: fallbackDeadline });
        best = conventionalScan.best;
        qualityUnresolved = qualityUnresolved || conventionalScan.qualityUnresolved === true || conventionalScan.complete !== true;
        sawTimeout = sawTimeout || conventionalScan.sawTimeout === true;
      }
    }

    const finalOrigin = discoveredFinalOrigin;
    if (finalOrigin && finalOrigin !== initialOrigin && Date.now() < deadlineAt) {
      const redirected = await fetchImageDataUrlDetailed(`${finalOrigin}/favicon.ico`, { deadlineAt, sourceKind: "redirect" });
      if (redirected.image) best = betterFaviconCandidate(best, redirected);
      else if (redirected.reason === "timeout" || redirected.reason === "network") qualityUnresolved = true;
      sawTimeout = sawTimeout || redirected.reason === "timeout";
    }

    // Last resort when neither declared metadata nor favicon.ico produced pixels.
    if (!best?.image && initialOrigin && Date.now() < deadlineAt) {
      const direct = await probeConventionalFaviconFallbacks(initialOrigin, { deadlineAt });
      if (direct?.image) best = direct;
    }

    if (best?.image) {
      const qualityComplete = Boolean(preferQuality) && !qualityUnresolved && !sawTimeout;
      return {
        ...best,
        qualityComplete,
        provisional: preferQuality ? !qualityComplete : (!faviconCandidateIsAuthoritativelyGoodEnough(best) && qualityUnresolved)
      };
    }
    return { image: "", sourceUrl: "", reason: sawTimeout ? "timeout" : "not-found", provisional: false };
  }

  const FAVICON_CHOICE_CACHE_TTL_MS = 30_000;
  const FAVICON_CHOICE_CACHE_MAX_ENTRIES = 4;
  const FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS = 400_000;
  const FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS = 800_000;
  const faviconChoiceCache = new Map();
  const faviconChoiceRequests = new Map();

  function normalizeFaviconChoiceRequestId(value) {
    const requestId = String(value || "");
    return /^[A-Za-z0-9._:-]{8,128}$/.test(requestId) ? requestId : "";
  }

  function cancelFaviconChoiceRequest(value) {
    const requestId = normalizeFaviconChoiceRequestId(value);
    if (!requestId) return false;
    const controller = faviconChoiceRequests.get(requestId);
    if (!controller) return false;
    faviconChoiceRequests.delete(requestId);
    try { controller.abort(); } catch {}
    return true;
  }

  async function runFaviconChoiceRequest(pageUrl, value) {
    const requestId = normalizeFaviconChoiceRequestId(value);
    if (!requestId) return { ok: false, error: "invalid-request", candidates: [] };
    cancelFaviconChoiceRequest(requestId);
    const controller = new AbortController();
    faviconChoiceRequests.set(requestId, controller);
    try {
      return await discoverFaviconChoicesForUrl(pageUrl, { signal: controller.signal });
    } finally {
      if (faviconChoiceRequests.get(requestId) === controller) faviconChoiceRequests.delete(requestId);
    }
  }

  function faviconChoiceResultChars(result) {
    return (result?.candidates || []).reduce((total, candidate) => total + String(candidate?.image || "").length, 0);
  }

  function cloneFaviconChoiceResult(result) {
    return {
      ok: result?.ok === true,
      error: String(result?.error || ""),
      candidates: (Array.isArray(result?.candidates) ? result.candidates : []).map(candidate => ({ ...candidate }))
    };
  }

  function readCachedFaviconChoices(cacheKey, now = Date.now()) {
    const entry = faviconChoiceCache.get(cacheKey);
    if (!entry) return null;
    if (now - entry.createdAt > FAVICON_CHOICE_CACHE_TTL_MS) {
      faviconChoiceCache.delete(cacheKey);
      return null;
    }
    // Refresh insertion order so the tiny map behaves as an LRU during repeated
    // user-triggered editing without retaining favicon pixels for long periods.
    faviconChoiceCache.delete(cacheKey);
    faviconChoiceCache.set(cacheKey, entry);
    return cloneFaviconChoiceResult(entry.result);
  }

  function rememberFaviconChoices(cacheKey, result, now = Date.now()) {
    if (!cacheKey || result?.ok !== true) return;
    const chars = faviconChoiceResultChars(result);
    if (chars > FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS) return;
    const copy = cloneFaviconChoiceResult(result);
    faviconChoiceCache.delete(cacheKey);
    faviconChoiceCache.set(cacheKey, { createdAt: now, chars, result: copy });

    let totalChars = 0;
    for (const entry of faviconChoiceCache.values()) totalChars += entry.chars;
    while (faviconChoiceCache.size > FAVICON_CHOICE_CACHE_MAX_ENTRIES || totalChars > FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS) {
      const oldestKey = faviconChoiceCache.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = faviconChoiceCache.get(oldestKey);
      faviconChoiceCache.delete(oldestKey);
      totalChars -= oldest?.chars || 0;
    }
  }

  async function discoverFaviconChoicesForUrl(pageUrl, { timeoutMs = 10_000, signal = null } = {}) {
    if (signal?.aborted) return { ok: false, error: "cancelled", candidates: [] };
    // This picker is explicitly user-triggered, so prefer a live permission read
    // before consulting even the short-lived in-memory candidate cache. This
    // prevents a just-revoked Website Access grant from exposing stale cached
    // candidates during the browser permission-event reconciliation window.
    if (!(await hasWebAccess({ refresh: true }))) return { ok: false, error: "permission", candidates: [] };
    let parsed;
    try {
      parsed = new URL(pageUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      return { ok: false, error: "invalid-url", candidates: [] };
    }

    const cacheKey = parsed.href;
    const cached = readCachedFaviconChoices(cacheKey);
    if (cached) return cached;

    const deadlineAt = Date.now() + Math.max(2_000, Math.min(15_000, Number(timeoutMs) || 10_000));
    const choices = [];
    const seenImages = new Set();
    const seenResources = new Set();
    const maxChoices = 8;

    const addChoice = (candidate, source = "") => {
      if (!candidate?.image || seenImages.has(candidate.image)) return;
      seenImages.add(candidate.image);
      let sourceUrl = "";
      try {
        const value = String(candidate.sourceUrl || "");
        if (/^https?:/i.test(value)) sourceUrl = new URL(value).href;
      } catch {}
      choices.push({
        image: candidate.image,
        sourceUrl,
        width: Math.max(0, Math.trunc(Number(candidate.width) || 0)),
        height: Math.max(0, Math.trunc(Number(candidate.height) || 0)),
        qualitySide: faviconQualitySide(candidate),
        declared: candidate.declared === true,
        source: String(source || "").slice(0, 24)
      });
    };

    const prepareResource = (value, { declared = false } = {}) => {
      if (signal?.aborted || Date.now() >= deadlineAt || choices.length >= maxChoices) return "";
      const raw = String(value || "");
      let resourceKey = "";
      if (declared && /^data:/i.test(raw)) {
        // Site-declared inline favicons were already supported by the chooser and
        // remain subject to decodeInlineFaviconResource/image/SVG bounds.
        resourceKey = raw;
      } else {
        try {
          const parsedResource = new URL(raw);
          if (!/^https?:$/.test(parsedResource.protocol)) return "";
          resourceKey = parsedResource.href;
        } catch { return ""; }
      }
      if (seenResources.has(resourceKey)) return "";
      seenResources.add(resourceKey);
      return resourceKey;
    };

    const fetchChoice = async (value, { declared = false, qualityHint = 0, source = "site" } = {}) => {
      const resourceKey = prepareResource(value, { declared });
      if (!resourceKey) return null;
      const candidate = await fetchImageDataUrlDetailed(resourceKey, { deadlineAt, declared, qualityHint, sourceKind: source, signal });
      return candidate?.image ? { candidate, source } : null;
    };

    // Candidate image work is bounded to two simultaneous fetch/decode jobs. This
    // mirrors the mature automatic resolver's conservative concurrency without
    // changing its ranking, helpers, single-flight key or winner selection.
    const fetchChoiceBatches = async entries => {
      const values = Array.isArray(entries) ? entries : [];
      for (let index = 0; index < values.length; index += 2) {
        if (signal?.aborted || Date.now() >= deadlineAt || choices.length >= maxChoices) break;
        const batch = values.slice(index, index + 2);
        const results = await Promise.all(batch.map(entry => fetchChoice(entry.value, entry.options)));
        for (const result of results) {
          if (result?.candidate) addChoice(result.candidate, result.source);
          if (choices.length >= maxChoices) break;
        }
      }
    };

    // Browser-local artwork is a useful user-selectable candidate, but unlike the
    // automatic resolver the picker keeps going so the user can compare it with
    // the site's own declared alternatives.
    try { addChoice(await resolveBrowserCachedFavicon(parsed.href, { signal }), "browser"); } catch {}
    if (signal?.aborted) return { ok: false, error: "cancelled", candidates: [] };

    const initialOrigin = parsed.origin;
    const parentUrl = parentHostFaviconUrl(parsed.href);
    await fetchChoiceBatches([
      { value: `${initialOrigin}/favicon.ico`, options: { source: "favicon" } },
      ...(parentUrl ? [{ value: parentUrl, options: { declared: true, source: "parent" } }] : [])
    ]);

    const discovered = await discoverPageIconInfo(parsed.href, { deadlineAt, signal });
    if (signal?.aborted) return { ok: false, error: "cancelled", candidates: [] };
    const pageDiscoveryReason = String(discovered?.reason || "");
    await fetchChoiceBatches((discovered.candidates || []).slice(0, 16).map(candidate => ({
      value: candidate.url,
      options: {
        declared: true,
        qualityHint: candidate.sideHint,
        source: candidate.source || "declared"
      }
    })));

    let finalOrigin = "";
    try { finalOrigin = new URL(discovered.finalPageUrl || parsed.href).origin; } catch {}
    // Keep the same redirect-before-conventional priority, but let the redirected
    // favicon share the existing two-wide manual-discovery batch with the first
    // conventional fallback instead of leaving one network slot idle.
    await fetchChoiceBatches([
      ...(finalOrigin && finalOrigin !== initialOrigin
        ? [{ value: `${finalOrigin}/favicon.ico`, options: { source: "redirect" } }]
        : []),
      ...["/favicon.svg", "/favicon.png", "/apple-touch-icon.png", "/icon.ico"].map(path => ({
        value: `${initialOrigin}${path}`,
        options: {
          declared: true,
          source: path.includes("apple-touch") ? "touch" : (path.includes("favicon") || path.endsWith(".ico") ? "favicon" : "conventional")
        }
      }))
    ]);

    if (signal?.aborted) return { ok: false, error: "cancelled", candidates: [] };
    if (!choices.length && pageDiscoveryReason) {
      if (pageDiscoveryReason === "permission") return { ok: false, error: "permission", reason: pageDiscoveryReason, candidates: [] };
      if (pageDiscoveryReason === "cancelled") return { ok: false, error: "cancelled", reason: pageDiscoveryReason, candidates: [] };
      return { ok: false, error: "discovery-failed", reason: pageDiscoveryReason, candidates: [] };
    }
    choices.sort((a, b) => faviconCandidatePreference(
      { ...b, sourceKind: b.source },
      { ...a, sourceKind: a.source }
    ));
    const result = { ok: true, error: "", candidates: choices.slice(0, maxChoices) };

    // Do not retain candidates if the optional host permission disappeared while
    // discovery was in flight. Otherwise keep only a tiny, short-lived in-memory
    // cache for repeated clicks in the same editor session.
    if (!(await hasWebAccess({ refresh: true }))) return { ok: false, error: "permission", candidates: [] };
    rememberFaviconChoices(cacheKey, result);
    return cloneFaviconChoiceResult(result);
  }

  async function resolveFaviconForUrlWithPreference(pageUrl, preference, { timeoutMs = ICON_RECOVERY_FETCH_TIMEOUT_MS, preferQuality = false } = {}) {
    const wanted = normalizeFaviconPreference(preference);
    if (!wanted) return resolveFaviconForUrl(pageUrl, { timeoutMs, preferQuality });

    if (wanted === "b") {
      const browserCandidate = await resolveBrowserCachedFavicon(pageUrl);
      if (browserCandidate?.image) {
        return {
          ...browserCandidate,
          preferenceMatched: true,
          provisional: false,
          qualityComplete: true
        };
      }
      return { image: "", sourceUrl: "", reason: "not-found", preferenceMatched: false, provisional: false };
    }

    // New manually selected Browser candidates use an exact compact image token.
    // First try the permission-free browser source so a matching local cache can
    // satisfy the user's choice without Website Access or any synchronized pixels.
    if (wanted.startsWith("i:")) {
      const browserCandidate = await resolveBrowserCachedFavicon(pageUrl);
      if (browserCandidate?.image && faviconPreferenceMatchesCandidate(wanted, {
        ...browserCandidate,
        source: "browser"
      })) {
        return {
          ...browserCandidate,
          preferenceMatched: true,
          provisional: false,
          qualityComplete: true
        };
      }
    }

    // URL/inline preferences deliberately require Website Access. The preference
    // itself is harmless Sync metadata; fetching the chosen resource remains a
    // normal device-local website operation and never prompts outside a user gesture.
    if (!(await hasWebAccess())) return { image: "", sourceUrl: "", reason: "permission", preferenceMatched: false, provisional: false };
    const discovered = await discoverFaviconChoicesForUrl(pageUrl, { timeoutMs });
    if (discovered?.ok === true) {
      const candidates = Array.isArray(discovered.candidates) ? discovered.candidates : [];
      const exact = candidates.find(candidate => faviconPreferenceMatchesCandidate(wanted, candidate));
      if (exact?.image) {
        return {
          image: exact.image,
          sourceUrl: exact.sourceUrl || "",
          width: exact.width || 0,
          height: exact.height || 0,
          qualitySide: exact.qualitySide || 0,
          declared: exact.declared === true,
          sourceKind: exact.source || "favicon",
          preferenceMatched: true,
          provisional: false,
          qualityComplete: true
        };
      }
      // The site may have moved/changed the chosen favicon. Show the best currently
      // discoverable local fallback but retain the preference and retry it through
      // the existing bounded recovery backoff rather than forgetting user intent.
      const fallback = candidates[0];
      if (fallback?.image) {
        return {
          image: fallback.image,
          sourceUrl: fallback.sourceUrl || "",
          width: fallback.width || 0,
          height: fallback.height || 0,
          qualitySide: fallback.qualitySide || 0,
          declared: fallback.declared === true,
          sourceKind: fallback.source || "favicon",
          preferenceMatched: false,
          provisional: true,
          qualityComplete: false
        };
      }
    }
    return {
      image: "",
      sourceUrl: "",
      reason: discovered?.error || discovered?.reason || "not-found",
      preferenceMatched: false,
      provisional: false
    };
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

  function automaticFaviconArtwork(shortcut) {
    return Boolean(shortcut?.image) && shortcut.imageSyncKind === "device" &&
      ["favicon", "firefox"].includes(shortcut.imageSourceKind || "none") && /^https?:/i.test(shortcut.url || "");
  }

  function manualFaviconPreferencePending(shortcut) {
    const preference = normalizeFaviconPreference(shortcut?.faviconPreference);
    return Boolean(preference && shortcut?.imageSourceKind === "upload" && shortcut?.imageSyncKind === "device" &&
      (!shortcut?.image || shortcut.imageIsFallback === true));
  }

  function shortcutNeedsProactiveFavicon(shortcut) {
    if (!shortcut || shortcut.type !== "shortcut" || shortcut.builtinIcon || !/^https?:/i.test(shortcut.url || "")) return false;
    if (manualFaviconPreferencePending(shortcut)) return true;
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


  function shortcutAllowsFaviconRecovery(state, shortcutId) {
    const location = findShortcutLocationById(state, shortcutId);
    if (!location) return false;
    // Explicit manual favicon intent is independent of the workspace's automatic
    // site-icon preference. A receiving device must be allowed to reconstruct the
    // user's chosen candidate even when automatic favicon learning is disabled.
    return manualFaviconPreferencePending(location.shortcut) || Boolean(location.workspace?.settings?.autoSiteIcons);
  }

  function iconRecoveryItemStillRelevantInState(state, item) {
    const location = findShortcutLocationById(state, item?.id);
    if (!location || !shortcutAllowsFaviconRecovery(state, item?.id)) return false;
    return iconRecoveryItemStillRelevant(location.shortcut, item);
  }


  async function applyProactiveFaviconResults(results) {
    const appliedIds = new Set();
    const unchangedIds = new Set();
    if (!results.length) return { appliedIds, unchangedIds };
    const loaded = await ensureLocalStorage();
    const writeBaseline = loaded.compactBaseline;
    for (const result of results) {
      // Network recovery is intentionally Space-agnostic while in flight. Resolve
      // ownership again at commit time so a Personal→Work move neither discards
      // useful work nor applies it under the wrong Space's auto-icon preference.
      const location = findShortcutLocationById(loaded.state, result.id);
      if (!location || !shortcutAllowsFaviconRecovery(loaded.state, result.id)) continue;
      const shortcut = location.shortcut;
      if (shortcut.url !== result.url) continue;
      const currentPreference = normalizeFaviconPreference(shortcut.faviconPreference);
      const resultPreference = normalizeFaviconPreference(result.faviconPreference);
      if (currentPreference !== resultPreference) continue;
      const preferenceUpgrade = Boolean(result.allowFaviconUpgrade) && manualFaviconPreferencePending(shortcut);
      const upgradingRecoveredFavicon = Boolean(result.allowFaviconUpgrade) && automaticFaviconArtwork(shortcut);
      if (!shortcutNeedsProactiveFavicon(shortcut) && !upgradingRecoveredFavicon && !preferenceUpgrade) continue;
      const customUploadFallback = shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
      const nextFallback = customUploadFallback
        ? (currentPreference ? result.preferenceMatched !== true : true)
        : false;
      if (shortcut.image === result.image && shortcut.imageSyncKind === "device" && !shortcut.imageAssetId &&
          shortcut.imageIsFallback === nextFallback &&
          (customUploadFallback || (shortcut.imageSourceKind === "favicon" && shortcut.imageSourceUrl === result.sourceUrl))) {
        unchangedIds.add(result.id);
        continue;
      }
      shortcut.image = result.image;
      shortcut.imageSyncData = "";
      shortcut.imageAssetId = "";
      shortcut.imageSyncKind = "device";
      shortcut.imageIsFallback = nextFallback;
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
    await writeLocalState(loaded.state, { baseState: writeBaseline, baseStateIsCompact: Boolean(writeBaseline) });
    return { appliedIds, unchangedIds };
  }

  function normalizeFaviconQualityAuditLedger(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const byUrl = new Map();
    for (const item of Array.isArray(source.items) ? source.items : []) {
      let url = "";
      try {
        const parsed = new URL(String(item?.url || ""));
        if (!/^https?:$/.test(parsed.protocol)) continue;
        url = parsed.href;
      } catch { continue; }
      const checkedAt = Number(item?.checkedAt);
      const policyVersion = Number(item?.policyVersion);
      if (!Number.isFinite(checkedAt) || checkedAt <= 0 ||
          !Number.isFinite(policyVersion) || policyVersion <= 0) continue;
      const previous = byUrl.get(url);
      if (!previous || checkedAt > previous.checkedAt) byUrl.set(url, { url, checkedAt, policyVersion });
    }
    const items = [...byUrl.values()]
      .sort((a, b) => b.checkedAt - a.checkedAt || a.url.localeCompare(b.url))
      .slice(0, FAVICON_QUALITY_AUDIT_MAX_ENTRIES);
    return { version: 1, items };
  }

  async function readFaviconQualityAuditLedger() {
    try {
      const stored = await browser.storage.local.get(LOCAL_FAVICON_QUALITY_AUDIT_KEY);
      return normalizeFaviconQualityAuditLedger(stored?.[LOCAL_FAVICON_QUALITY_AUDIT_KEY]);
    } catch {
      return normalizeFaviconQualityAuditLedger(null);
    }
  }

  function faviconQualityAuditNeeded(ledger, value, now = Date.now()) {
    let url = "";
    try { url = new URL(String(value || "")).href; } catch { return false; }
    const item = (ledger?.items || []).find(entry => entry.url === url);
    if (!item || item.policyVersion !== FAVICON_QUALITY_AUDIT_POLICY_VERSION) return true;
    return now - item.checkedAt >= FAVICON_QUALITY_AUDIT_TTL_MS;
  }

  async function markFaviconQualityAuditsComplete(urls) {
    const values = [...new Set((urls || []).filter(value => /^https?:/i.test(String(value || ""))))];
    if (!values.length) return;
    const run = faviconQualityAuditWriteQueue.catch(() => {}).then(async () => {
      const ledger = await readFaviconQualityAuditLedger();
      const byUrl = new Map((ledger.items || []).map(item => [item.url, item]));
      const checkedAt = Date.now();
      for (const value of values) {
        try {
          const url = new URL(String(value)).href;
          byUrl.set(url, { url, checkedAt, policyVersion: FAVICON_QUALITY_AUDIT_POLICY_VERSION });
        } catch {}
      }
      const normalized = normalizeFaviconQualityAuditLedger({ items: [...byUrl.values()] });
      try { await browser.storage.local.set({ [LOCAL_FAVICON_QUALITY_AUDIT_KEY]: normalized }); } catch {}
    });
    faviconQualityAuditWriteQueue = run.catch(() => {});
    return run;
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
        faviconPreference: normalizeFaviconPreference(item.faviconPreference),
        attempts: Math.max(0, Math.min(ICON_RECOVERY_MAX_ATTEMPTS, Number(item.attempts) || 0)),
        nextAttemptAt: Number.isFinite(Number(item.nextAttemptAt)) ? Math.max(0, Number(item.nextAttemptAt)) : 0,
        qualityUpgrade: Boolean(item.qualityUpgrade),
        lastReason: typeof item.lastReason === "string" ? item.lastReason.slice(0, 48) : "",
        lastAttemptAt: Number.isFinite(Number(item.lastAttemptAt)) ? Math.max(0, Number(item.lastAttemptAt)) : 0
      });
    }
    const rawUpdatedAt = Number(source.updatedAt);
    return { version: ICON_RECOVERY_QUEUE_VERSION, items, updatedAt: Number.isFinite(rawUpdatedAt) ? Math.max(0, rawUpdatedAt) : 0 };
  }

  function iconRecoveryItemStillRelevant(shortcut, item) {
    if (!shortcut || shortcut.type !== "shortcut" || shortcut.url !== item?.url) return false;
    if (normalizeFaviconPreference(shortcut.faviconPreference) !== normalizeFaviconPreference(item?.faviconPreference)) return false;
    if (!item?.qualityUpgrade) return shortcutNeedsProactiveFavicon(shortcut);
    // Automatic quality upgrades and unresolved explicit favicon preferences both
    // use the same bounded retry engine. Exact manual matches stop retrying by
    // clearing imageIsFallback when they commit.
    return automaticFaviconArtwork(shortcut) || manualFaviconPreferencePending(shortcut);
  }

  async function dropIconRecoveryQualityJobs() {
    return mutateIconRecoveryQueue(queue => {
      if (!queue.items.some(item => item.qualityUpgrade)) return null;
      return { ...queue, items: queue.items.filter(item => !item.qualityUpgrade) };
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

  let iconRecoveryQueueMutationTail = Promise.resolve();

  function mutateIconRecoveryQueue(mutator) {
    const run = iconRecoveryQueueMutationTail.catch(() => {}).then(async () => {
      const current = await readIconRecoveryQueue();
      const next = await mutator(current);
      if (!next || next === current) return current;
      return writeIconRecoveryQueue(next);
    });
    // A failed storage write must not poison the serialization tail. The caller
    // still receives the original rejection while later mutations can proceed.
    iconRecoveryQueueMutationTail = run.catch(() => {});
    return run;
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
    const [qualityLedger, webAccessGranted] = await Promise.all([
      readFaviconQualityAuditLedger(),
      hasWebAccess()
    ]);
    const eligible = flattenShortcuts(loaded.state).filter(shortcut => {
      if (!shortcutAllowsFaviconRecovery(loaded.state, shortcut.id)) return false;
      if (targeted && !requested.has(shortcut.id)) return false;
      if (shortcutNeedsProactiveFavicon(shortcut)) return true;
      return webAccessGranted && automaticFaviconArtwork(shortcut) &&
        (faviconQualityAuditNeeded(qualityLedger, shortcut.url) || Boolean(upgradeRecoveredFavicons));
    });

    const queue = await mutateIconRecoveryQueue(current => {
      const existing = new Map(current.items.map(item => [item.id, item]));
      // Rebase the seed onto the latest persisted queue inside the short mutation
      // critical section. This prevents a recovery batch and a newly requested job
      // from overwriting one another. No network work is serialized here.
      const nextItems = current.items.filter(item => iconRecoveryItemStillRelevantInState(loaded.state, item));
      const nextById = new Map(nextItems.map(item => [item.id, item]));
      for (const shortcut of eligible) {
        const previous = existing.get(shortcut.id);
        const faviconPreference = normalizeFaviconPreference(shortcut.faviconPreference);
        const reset = force || !previous || previous.url !== shortcut.url ||
          normalizeFaviconPreference(previous.faviconPreference) !== faviconPreference;
        const migrationUpgrade = automaticFaviconArtwork(shortcut) &&
          (faviconQualityAuditNeeded(qualityLedger, shortcut.url) || Boolean(upgradeRecoveredFavicons));
        nextById.set(shortcut.id, {
          id: shortcut.id,
          url: shortcut.url,
          faviconPreference,
          attempts: reset ? 0 : previous.attempts,
          nextAttemptAt: reset ? 0 : previous.nextAttemptAt,
          qualityUpgrade: migrationUpgrade || (!reset && Boolean(previous.qualityUpgrade)),
          lastReason: reset ? "" : (previous.lastReason || ""),
          lastAttemptAt: reset ? 0 : (previous.lastAttemptAt || 0)
        });
      }
      return { version: ICON_RECOVERY_QUEUE_VERSION, items: [...nextById.values()] };
    });
    const canAttemptNow = webAccessGranted || platformHasPermissionFreeFaviconSource();
    if (queue.items.length && canAttemptNow) await scheduleIconRecoveryAlarm(queue);
    return queue;
  }

  async function pruneIconRecoveryQueueAgainstState(queue, state) {
    return mutateIconRecoveryQueue(current => {
      const items = current.items.filter(item => iconRecoveryItemStillRelevantInState(state, item));
      return items.length === current.items.length ? null : { ...current, items };
    });
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
      const dueGroups = [];
      const dueByResolutionKey = new Map();
      for (const item of queue.items) {
        if (Number(item.nextAttemptAt) > now) continue;
        // Deduplicate only semantically identical resolver work. Different pages
        // on the same origin can legitimately declare different icons, and the
        // fast and quality passes intentionally use different resolver ordering.
        const key = `${item.qualityUpgrade ? "quality" : "fast"}\n${item.url}\n${normalizeFaviconPreference(item.faviconPreference)}`;
        const existing = dueByResolutionKey.get(key);
        if (existing) {
          existing.items.push(item);
          continue;
        }
        // Concurrency limits distinct resolver jobs. Duplicates for an already
        // selected job still join this turn, while a new unique URL waits for the
        // next durable queue pass.
        if (dueGroups.length >= ICON_RECOVERY_CONCURRENCY) continue;
        const group = { representative: item, items: [item] };
        dueByResolutionKey.set(key, group);
        dueGroups.push(group);
      }
      if (!dueGroups.length) {
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

      // Resolve each exact URL + quality mode once per queue turn, then fan the
      // already-validated result out to every matching shortcut record. This
      // removes duplicate cold-network/HTML/image work without conflating distinct
      // pages that merely share an origin.
      const resolvedGroups = await Promise.all(dueGroups.map(async group => {
        const item = group.representative;
        const result = await resolveFaviconForUrlWithPreference(item.url, item.faviconPreference, {
          timeoutMs: ICON_RECOVERY_FETCH_TIMEOUT_MS,
          preferQuality: Boolean(item.qualityUpgrade)
        });
        return { group, result };
      }));
      const resolved = resolvedGroups.flatMap(({ group, result }) =>
        group.items.map(item => ({ item, result }))
      );
      const successfulResults = resolved
        .filter(entry => entry.result?.image)
        .map(({ item, result }) => ({
          id: item.id,
          url: item.url,
          faviconPreference: normalizeFaviconPreference(item.faviconPreference),
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
        if (appliedIds.has(item.id)) return { item, ok: true, changed: true, reason: "", provisional: Boolean(result.provisional), qualityComplete: result.qualityComplete === true };
        if (unchangedIds.has(item.id)) return { item, ok: true, changed: false, reason: "unchanged", provisional: Boolean(result.provisional), qualityComplete: result.qualityComplete === true };
        return { item, ok: false, reason: "stale" };
      });

      let hydrated = 0;
      let unchanged = 0;
      let failed = 0;
      let timedOut = 0;
      let exhausted = 0;
      let blockedByPermission = 0;
      const completedQualityAuditUrls = new Set();
      // Apply network outcomes as one short mutation against the latest persisted
      // queue. A seed that lands while networking is in flight is therefore kept.
      queue = await mutateIconRecoveryQueue(async currentQueue => {
        const byId = new Map(currentQueue.items.map(item => [item.id, item]));
        for (const outcome of outcomes) {
          const current = byId.get(outcome.item.id);
          if (!current || current.url !== outcome.item.url ||
              normalizeFaviconPreference(current.faviconPreference) !== normalizeFaviconPreference(outcome.item.faviconPreference)) continue;
          if (outcome.ok) {
            if (outcome.changed) hydrated += 1;
            else unchanged += 1;
            if (current.qualityUpgrade && outcome.qualityComplete) {
              completedQualityAuditUrls.add(current.url);
              byId.delete(outcome.item.id);
            } else if (outcome.provisional && webAccessGranted) {
              const next = nextIconRecoveryQualityRetry(current);
              if (current.qualityUpgrade && next.exhausted) {
                completedQualityAuditUrls.add(current.url);
                byId.delete(outcome.item.id);
                exhausted += 1;
              } else {
                byId.set(outcome.item.id, next.item);
              }
            } else {
              byId.delete(outcome.item.id);
            }
            continue;
          }
          if (outcome.reason === "permission") {
            blockedByPermission += 1;
            const retryAt = platformHasPermissionFreeFaviconSource()
              ? Date.now() + ICON_RECOVERY_EXHAUSTED_RETRY_MS
              : Number(current.nextAttemptAt) || 0;
            byId.set(outcome.item.id, {
              ...current,
              nextAttemptAt: retryAt,
              lastReason: "permission",
              lastAttemptAt: Date.now()
            });
            continue;
          }
          failed += 1;
          if (outcome.reason === "timeout") timedOut += 1;
          if (outcome.reason === "stale" || outcome.reason === "protected") {
            byId.delete(outcome.item.id);
            continue;
          }
          const next = nextIconRecoveryFailure(current);
          if (current.qualityUpgrade && next.exhausted) {
            completedQualityAuditUrls.add(current.url);
            byId.delete(outcome.item.id);
            exhausted += 1;
          } else {
            byId.set(outcome.item.id, {
              ...next.item,
              lastReason: String(outcome.reason || "not-found").slice(0, 48),
              lastAttemptAt: Date.now()
            });
            if (next.exhausted) exhausted += 1;
          }
        }
        const currentState = (await ensureLocalStorage()).state;
        return {
          version: ICON_RECOVERY_QUEUE_VERSION,
          items: [...byId.values()].filter(item => iconRecoveryItemStillRelevantInState(currentState, item))
        };
      });
      if (completedQualityAuditUrls.size) await markFaviconQualityAuditsComplete([...completedQualityAuditUrls]);
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
    const writeBaseline = loaded.compactBaseline;
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
    if (changed) await writeLocalState(loaded.state, { baseState: writeBaseline, baseStateIsCompact: Boolean(writeBaseline) });
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
    return resolveTabNativeFaviconAdapter(tab, { fetchImageDataUrl });
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
    if (!(typeof isProtectedFaviconUrl === "function" && isProtectedFaviconUrl(tab.url))) {
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
      if (discovered.qualityComplete === true) await markFaviconQualityAuditsComplete([tab.url]);
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

  // Frequently Visited sites are device-local. If Top Sites permission disappears
  // while no New Tab is alive, clear only the disposable session copy so the next
  // startup layer cannot carry cached history cards forward before permission UI
  // reconciliation. The synchronized Show/Count preference is intentionally kept.
  browser.permissions?.onRemoved?.addListener?.(change => {
    if (!permissionChangeAffectsTopSites(change)) return;
    void clearSessionFrequentlyVisitedSnapshot();
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
      case "mosaicsync:discover-favicon-choices":
        return runFaviconChoiceRequest(message.pageUrl, message.requestId);
      case "mosaicsync:cancel-favicon-choices":
        return Promise.resolve({ ok: true, cancelled: cancelFaviconChoiceRequest(message.requestId) });
      case "mosaicsync:get-sync-status":
        return enqueue(getSyncStatus, { persistSyncError: false });
      case "mosaicsync:set-device-name":
        return enqueue(() => setDeviceName(message.deviceName));
      case "mosaicsync:set-sync-enabled":
        return enqueue(() => setSyncEnabled(message.enabled === true));
      case "mosaicsync:bootstrap-local":
        return enqueue(bootstrapLocal);
      case "mosaicsync:bootstrap-remote":
        return enqueue(() => bootstrapRemote({ waitIfMissing: false }));
      case "mosaicsync:wait-for-remote":
        return enqueue(() => bootstrapRemote({ waitIfMissing: true }));
      case "mosaicsync:reconcile-if-needed": {
        const reason = syncCheckReason(message.reason);
        return reason === "foreground"
          ? enqueueForegroundReconcile()
          : enqueue(() => reconcileIfNewCommit(reason));
      }
      case "mosaicsync:reconcile-now":
        return enqueue(() => reconcileIfNewCommit("message"));
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
  function deviceNameSyncKey(deviceId) {
    const id = String(deviceId || "");
    return id ? `${SYNC_DEVICE_NAME_PREFIX}${encodeURIComponent(id)}` : "";
  }

  function readSyncedDeviceName(all, deviceId) {
    const key = deviceNameSyncKey(deviceId);
    const record = key ? all?.[key] : null;
    if (!record || record.kind !== "device-name" || Number(record.schemaVersion) !== SYNC_DEVICE_NAME_SCHEMA_VERSION) return "";
    if (record.deviceId !== deviceId) return "";
    return normalizeDeviceName(record.name);
  }

  async function publishDeviceName(meta) {
    const deviceId = typeof meta?.deviceId === "string" ? meta.deviceId : "";
    const name = normalizeDeviceName(meta?.deviceName);
    const key = deviceNameSyncKey(deviceId);
    if (!meta?.syncEnabled || !key || !name) return false;
    await writeSyncItems({ [key]: {
      schemaVersion: SYNC_DEVICE_NAME_SCHEMA_VERSION,
      kind: "device-name",
      deviceId,
      name,
      updatedAt: Date.now()
    }}, { trackExpected: false });
    return true;
  }

  async function setDeviceName(value) {
    const deviceName = normalizeDeviceName(value);
    if (!deviceName) return { ok: false, error: "Enter a name for this device." };
    const next = await updateLocalMeta({ deviceName });
    if (next.syncEnabled) await publishDeviceName(next);
    return { ok: true, meta: next, deviceName };
  }

  async function setSyncEnabled(enabled) {
    const previous = await readLocalMeta();

    if (!enabled) {
      clearDeviceSnapshotDecodeCache();
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
        ...(resetProfileProtectionOnSyncDisable ? {
          syncProfileProtection: "unknown",
          syncProfileProtectionReason: ""
        } : {}),
        syncWaitStartedAt: 0,
        lastAppliedSyncRevision: "",
        lastAppliedWorkSyncRevision: "",
        lastAppliedDeviceSnapshotRevision: "",
        lastAppliedProfileSnapshotRevision: "",
        lastProfileSnapshotPublishedAt: 0,
        lastRemoteReceiptAt: 0,
        lastRemoteReceiptRevision: "",
        lastRemoteReceiptUpdatedAt: 0,
        lastRemoteReceiptOriginDeviceId: "",
        lastRemoteReceiptProvenanceExact: false
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
    await publishDeviceName(next);
    await ensureSyncWatchAlarm(next);
    return { ok: true, meta: next, action: previous.syncInitialized ? "already-initialized" : "needs-source" };
  }

  function hasSnapshotData(snapshot) {
    return Boolean(snapshot?.settings) ||
      Boolean(snapshot?.dataset) ||
      [...(snapshot?.records?.values?.() || [])].some(record => record?.kind !== "deleted");
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

  function deviceSnapshotRevision(snapshot, prefix = "device") {
    if (!snapshot?.deviceId || !snapshot?.commitId) return "";
    return `${prefix}:${snapshot.deviceId}:${snapshot.commitId}:${Number(snapshot.updatedAt) || 0}`;
  }

  function selectDeviceSnapshotSource(snapshots) {
    if (!Array.isArray(snapshots) || !snapshots.length) return null;
    const completeProfile = selectAtomicRecoverySnapshot(snapshots, {
      compareRecency: compareDeviceSnapshotGenerationRecency,
      requireCompleteProfile: true
    });
    const selected = completeProfile || selectAtomicRecoverySnapshot(snapshots, {
      compareRecency: compareDeviceSnapshotGenerationRecency,
      requireCompleteProfile: false
    });
    if (!selected) return null;
    return {
      records: pruneExpiredTombstones(new Map(selected.records)),
      settings: selected.settings,
      dataset: null,
      assets: new Map(),
      sourceKind: "device-snapshot",
      revision: deviceSnapshotRevision(selected, "device"),
      updatedAt: datasetUpdatedAt(selected.records, selected.settings, 0),
      publishedAt: Number(selected.publishedAt) || 0,
      originDeviceId: selected.deviceId || "",
      commitId: selected.commitId || "",
      provenanceExact: true,
      snapshot: selected
    };
  }

  function selectProfileDeviceSnapshotSource(snapshots) {
    const selected = selectAtomicRecoverySnapshot(snapshots, {
      compareRecency: compareDeviceSnapshotGenerationRecency,
      requireCompleteProfile: true
    });
    if (!selected) return null;
    const personalUpdatedAt = datasetUpdatedAt(selected.records, selected.settings, 0);
    const workUpdatedAt = datasetUpdatedAt(selected.workRecords, selected.workSettings, 0);
    return {
      personal: {
        records: pruneExpiredTombstones(new Map(selected.records)),
        settings: selected.settings,
        assets: new Map(),
        updatedAt: personalUpdatedAt
      },
      work: {
        records: pruneExpiredTombstones(new Map(selected.workRecords)),
        settings: selected.workSettings,
        assets: new Map(),
        updatedAt: workUpdatedAt
      },
      revision: deviceSnapshotRevision(selected, "profile"),
      updatedAt: Math.max(personalUpdatedAt, workUpdatedAt),
      publishedAt: Number(selected.publishedAt) || 0,
      originDeviceId: selected.deviceId || "",
      commitId: selected.commitId || "",
      complete: true,
      provenanceExact: true,
      snapshot: selected
    };
  }

  function profilePublicationTrusted(meta) {
    return Boolean(meta?.syncInitialized && (meta.lastAppliedWorkSyncRevision || meta.lastAppliedProfileSnapshotRevision));
  }

  async function buildProfileDeviceSnapshotPublication(fullState, meta, currentOwn, sharedPersonal, sharedWork) {
    const personalState = workspaceStateNormalized(fullState, PERSONAL_SPACE_ID);
    const workState = workspaceStateNormalized(fullState, WORK_SPACE_ID);
    const personalRecords = new Map(flattenStateNormalized(personalState, meta.deviceId));
    const workRecords = new Map(flattenStateNormalized(workState, meta.deviceId));
    retainTombstones(personalRecords, currentOwn?.decoded?.records);
    retainTombstones(workRecords, currentOwn?.decoded?.workRecords);
    retainTombstones(personalRecords, sharedPersonal?.records);
    retainTombstones(workRecords, sharedWork?.records);
    const personalSettings = makeSettingsRecordNormalized(personalState, meta.deviceId);
    const workSettings = makeSettingsRecordNormalized(workState, meta.deviceId);
    const commitId = uid("profile-commit");
    const publishedAt = Date.now();
    return prepareProfileDeviceSnapshotPublication({
      deviceId: meta.deviceId,
      commitId,
      publishedAt,
      personalRecords,
      personalSettings,
      workRecords,
      workSettings,
      previousRoot: currentOwn?.root || null
    });
  }

  async function publishProfileDeviceSnapshot(fullState, meta, { force = false } = {}) {
    const profileRevisionFor = snapshot => {
      if (!snapshot?.deviceId || !snapshot?.commitId) return "";
      return `profile:${snapshot.deviceId}:${snapshot.commitId}:${Number(snapshot.updatedAt) || 0}`;
    };
    if (!meta?.deviceId) return { written: false, reason: "missing-device", setRevision: "" };
    if (!force && !profilePublicationTrusted(meta)) {
      // Never infer profile completeness from local Work content alone. A fresh
      // device may legitimately receive an incomplete/blank Work Space and then
      // get a user edit before remote delivery finishes. Only previously applied
      // Work/profile revisions are strong enough evidence to publish a complete
      // recovery snapshot.
      return { written: false, reason: "untrusted-local-profile", setRevision: "" };
    }
    let all = await browser.storage.sync.get(null);
    const currentOwn = await readOwnDeviceSnapshot(meta.deviceId, all);
    if (!force && currentOwn.decoded?.profileComplete === true) {
      const personalState = workspaceStateNormalized(fullState, PERSONAL_SPACE_ID);
      const workState = workspaceStateNormalized(fullState, WORK_SPACE_ID);
      const personalRecords = flattenStateNormalized(personalState, meta.deviceId);
      const workRecords = flattenStateNormalized(workState, meta.deviceId);
      const personalSettings = makeSettingsRecordNormalized(personalState, meta.deviceId);
      const workSettings = makeSettingsRecordNormalized(workState, meta.deviceId);
      const same = recordFingerprint(currentOwn.decoded.records) === recordFingerprint(personalRecords) &&
        settingsRecordEqual(currentOwn.decoded.settings, personalSettings) &&
        recordFingerprint(currentOwn.decoded.workRecords) === recordFingerprint(workRecords) &&
        settingsRecordEqual(currentOwn.decoded.workSettings, workSettings);
      if (same) {
        return {
          written: false,
          unchanged: true,
          reason: "unchanged",
          setRevision: profileRevisionFor(currentOwn.decoded) || meta.lastAppliedProfileSnapshotRevision || meta.lastAppliedDeviceSnapshotRevision || "",
          publishedAt: Number(currentOwn.decoded.publishedAt) || meta.lastProfileSnapshotPublishedAt || 0
        };
      }
    }
    const [sharedPersonal, sharedWork] = await Promise.all([
      readSyncSnapshot(all, { includeAssets: false }),
      readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID })
    ]);
    const publication = await buildProfileDeviceSnapshotPublication(fullState, meta, currentOwn, sharedPersonal, sharedWork);
    if (!publication) return { written: false, reason: "too-large", setRevision: "" };
    all = await prepareDeviceSnapshotPublicationCapacity(all, meta.deviceId, publication);
    try {
      await commitProfileDeviceSnapshotPublication(publication);
    } catch (error) {
      if (isQuotaError(error)) return { written: false, reason: "quota", setRevision: "" };
      throw error;
    }

    let refreshedAll = await browser.storage.sync.get(null);
    let verification = await verifyProfileDeviceSnapshotPublication(publication, refreshedAll);
    if (!verification.committedSnapshot) {
      return { written: false, reason: "verification", setRevision: "", publishedAt: 0 };
    }
    // A successful storage.sync.set() is not enough to retire a fallback. Prove
    // that the new immutable root and every chunk are readable first; Firefox can
    // expose multi-key Sync changes out of order on another worker/device.
    try {
      const removed = await pruneSupersededDeviceSnapshotGenerations(refreshedAll, meta.deviceId, {
        protectRootKey: publication.rootKey,
        verifiedSnapshots: verification.snapshots
      });
      if (removed) {
        refreshedAll = await browser.storage.sync.get(null);
        verification = await verifyProfileDeviceSnapshotPublication(publication, refreshedAll);
        if (!verification.committedSnapshot) {
          return { written: false, reason: "verification", setRevision: "", publishedAt: 0 };
        }
      }
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: superseded device snapshot cleanup skipped`, error);
    }
    return {
      written: true,
      value: publication.rootValue,
      setRevision: profileRevisionFor(verification.committedSnapshot),
      publishedAt: Number(publication.rootValue.publishedAt) || Date.now()
    };
  }

  async function readCoreSources(all = null, { includeAssets = true } = {}) {
    const values = all && typeof all === "object" ? all : await browser.storage.sync.get(null);
    const [shared, deviceSnapshots] = await Promise.all([
      readSyncSnapshot(values, { includeAssets }),
      readDeviceSnapshots(values)
    ]);
    const device = selectDeviceSnapshotSource(deviceSnapshots);
    const profile = selectProfileDeviceSnapshotSource(deviceSnapshots);
    return { all: values, shared, device, profile, deviceSnapshots };
  }


  async function prepareDeviceSnapshotPublicationCapacity(all, deviceId, publication) {
    const publicationItems = { ...publication.chunkWrites, [publication.rootKey]: publication.rootValue };
    if (syncItemsFitInSnapshot(all, publicationItems)) return all;
    const snapshots = await readDeviceSnapshots(all);
    const plan = planDeviceSnapshotPublicationCapacity(all, deviceId, publication, snapshots);
    if (!plan.removeKeys.length) return all;
    await removeSyncItems(plan.removeKeys);
    return plan.all;
  }

  async function pruneSupersededDeviceSnapshotGenerations(all, deviceId, { protectRootKey = "", verifiedSnapshots = null } = {}) {
    const values = all && typeof all === "object" ? all : {};
    const snapshots = Array.isArray(verifiedSnapshots) ? verifiedSnapshots : await readDeviceSnapshots(values);
    const candidates = supersededDeviceSnapshotRootKeys(values, snapshots, deviceId, { protectRootKey });
    if (!candidates.length) return 0;

    // Re-read immediately before destructive work. Immutable roots cannot be
    // overwritten by normal publishers, but their visible set can still change
    // while an MV3 worker yields to storage.sync.
    const latest = await browser.storage.sync.get(null);
    const latestSnapshots = await readDeviceSnapshots(latest);
    const keys = confirmedSupersededDeviceSnapshotKeys(
      latest,
      latestSnapshots,
      candidates,
      deviceId,
      { protectRootKey }
    );
    if (!keys.length) return 0;
    await removeSyncItems(keys);
    return keys.length;
  }

  async function maybeGarbageCollectStaleDeviceSnapshots(meta, { force = false } = {}) {
    if (!meta?.syncEnabled || !meta?.deviceId) return meta;
    const now = Date.now();
    if (!force && now - (Number(meta.lastDeviceSnapshotGcAt) || 0) < DEVICE_SNAPSHOT_GC_INTERVAL_MS) return meta;

    try {
      const all = await browser.storage.sync.get(null);
      const snapshots = await readDeviceSnapshots(all);
      const observation = planDeviceSnapshotGarbageCollection(all, snapshots, meta, now);

      let keys = [];
      if (observation.staleRootKeys.length || observation.eligibleOrphanRoots.length) {
        // Browser reads and writes remain in this orchestrator. The lifecycle
        // boundary revalidates eligibility against this fresh pre-delete view.
        const latest = await browser.storage.sync.get(null);
        const latestSnapshots = await readDeviceSnapshots(latest);
        keys = confirmedDeviceSnapshotGarbageCollectionKeys(latest, latestSnapshots, observation);
      }
      if (keys.length) await removeSyncItems(keys);

      const next = {
        ...meta,
        lastDeviceSnapshotGcAt: now,
        deviceSnapshotGcPass: observation.gcPass,
        deviceSnapshotRootSeenPass: observation.deviceSnapshotRootSeenPass,
        deviceSnapshotOrphanSeenAt: observation.deviceSnapshotOrphanSeenAt,
        deviceSnapshotOrphanSeenPass: observation.deviceSnapshotOrphanSeenPass
      };
      await writeLocalMeta(next);
      return next;
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: stale device snapshot cleanup skipped`, error);
      return meta;
    }
  }

  function combinedRemoteCore(shared, device) {
    const sharedUsable = isSnapshotUsable(shared);
    if (sharedUsable) {
      return {
        records: pruneExpiredTombstones(shared.records),
        settings: shared.settings,
        assets: shared.assets || new Map(),
        sourceKind: "shared-ledger",
        revision: datasetRevision(shared.dataset),
        updatedAt: Number(shared.dataset?.updatedAt) || datasetUpdatedAt(shared.records, shared.settings, 0),
        originDeviceId: typeof shared.dataset?.originDeviceId === "string" ? shared.dataset.originDeviceId : "",
        provenanceExact: false
      };
    }
    if (!device) return null;
    // Immutable device snapshots are coherent recovery generations. They are a
    // fallback only while the live shared ledger is missing/torn; never union a
    // partial or complete shared ledger into an atomic generation.
    return {
      records: new Map(device.records),
      settings: device.settings,
      assets: shared?.assets || new Map(),
      sourceKind: "device-snapshot",
      revision: device.revision,
      updatedAt: Number(device.updatedAt) || 0,
      originDeviceId: device.originDeviceId || "",
      provenanceExact: true
    };
  }

  function combinedWorkRemoteCore(shared, profile) {
    const sharedUsable = isSnapshotUsable(shared);
    if (sharedUsable) {
      return {
        records: pruneExpiredTombstones(shared.records),
        settings: shared.settings,
        assets: shared.assets || new Map(),
        sourceKind: "shared-work-ledger",
        revision: datasetRevision(shared.dataset),
        updatedAt: Number(shared.dataset?.updatedAt) || datasetUpdatedAt(shared.records, shared.settings, 0),
        originDeviceId: typeof shared.dataset?.originDeviceId === "string" ? shared.dataset.originDeviceId : "",
        provenanceExact: false
      };
    }
    const profileWork = profile?.complete === true ? profile.work : null;
    if (!profileWork) return null;
    return {
      records: new Map(profileWork.records),
      settings: profileWork.settings,
      assets: shared?.assets || new Map(),
      sourceKind: "profile-snapshot",
      revision: profile.revision,
      updatedAt: Number(profileWork.updatedAt) || datasetUpdatedAt(profileWork.records, profileWork.settings, 0),
      originDeviceId: profile.originDeviceId || "",
      provenanceExact: true
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
    const recoveryKeys = [];
    const shortcutKeys = [];
    const overheadKeys = [];

    for (const [key, value] of Object.entries(all || {})) {
      if (!key.startsWith(SYNC_PREFIX)) continue;
      const workNamespace = syncNamespace(WORK_SPACE_ID);
      if (isDeviceSnapshotKey(key)) {
        recoveryKeys.push(key);
        continue;
      }
      if (key === SYNC_SETTINGS_KEY || key.startsWith(SYNC_ITEM_PREFIX) ||
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
    const [core, recovery, shortcutArtwork, overhead] = await Promise.all([
      bytesFor(coreKeys), bytesFor(recoveryKeys), bytesFor(shortcutKeys), bytesFor(overheadKeys)
    ]);
    const total = Math.max(0, Number(totalBytes) || 0);
    return {
      core: Math.max(0, Number(core) || 0),
      recovery: Math.max(0, Number(recovery) || 0),
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
    const provenanceExact = core.provenanceExact === true;
    const exactOriginDeviceId = provenanceExact && typeof core.originDeviceId === "string"
      ? core.originDeviceId
      : "";
    if (exactOriginDeviceId && exactOriginDeviceId === meta.deviceId) return meta;

    // 1.30.18.41 could persist a device name against a collaborative ledger merely
    // because that device had the newest recovery publication. Clear that stale
    // attribution even when the ledger revision itself has not changed. Do not
    // manufacture a new receipt timestamp for this metadata-only correction.
    if (meta.lastRemoteReceiptRevision === core.revision) {
      if ((meta.lastRemoteReceiptOriginDeviceId || "") === exactOriginDeviceId &&
          meta.lastRemoteReceiptProvenanceExact === provenanceExact) return meta;
      return {
        ...meta,
        lastRemoteReceiptOriginDeviceId: exactOriginDeviceId,
        lastRemoteReceiptProvenanceExact: provenanceExact
      };
    }
    return {
      ...meta,
      lastRemoteReceiptAt: Date.now(),
      lastRemoteReceiptRevision: core.revision,
      lastRemoteReceiptUpdatedAt: Number(core.updatedAt) || 0,
      // Shared ledgers are collaborative merge products. Naming their last writer
      // as the source of the whole received layout is false provenance. Only an
      // atomic device/profile generation has exact source attribution.
      lastRemoteReceiptOriginDeviceId: exactOriginDeviceId,
      lastRemoteReceiptProvenanceExact: provenanceExact
    };
  }

  function markAppliedRemoteCore(meta, deviceRevision = "") {
    if (!deviceRevision) return meta;
    return { ...meta, lastAppliedDeviceSnapshotRevision: deviceRevision };
  }

  async function reconcileIfNewCommit(reason = "message", providedMeta = null, pendingLocalAlreadyRetried = false) {
    const checkReason = syncCheckReason(reason);
    const checkedAt = Date.now();
    let meta = providedMeta || await readLocalMeta();
    if (checkReason === "foreground") await ensureSyncWatchAlarm(meta);
    if (!meta.syncEnabled) {
      clearDeliveredCoreEvidence();
      clearDeviceSnapshotDecodeCache();
      await noteSyncDiagnostic({
        ...(checkReason === "foreground" ? { lastForegroundSyncCheckAt: checkedAt } : {}),
        ...(checkReason === "alarm" ? { lastSyncWatchCheckAt: checkedAt } : {}),
        lastCheckAt: checkedAt,
        lastCheckReason: checkReason,
        lastCheckOutcome: "sync-off"
      });
      return { ok: true, skipped: true, reason: "sync-off", meta };
    }
    if (!meta.syncInitialized) {
      let result;
      if (meta.syncBootstrapMode === "await-remote") result = await bootstrapRemote({ waitIfMissing: true });
      else result = { ok: true, skipped: true, reason: "sync-not-ready", meta };
      await noteSyncDiagnostic({
        ...(checkReason === "foreground" ? { lastForegroundSyncCheckAt: checkedAt } : {}),
        ...(checkReason === "alarm" ? { lastSyncWatchCheckAt: checkedAt } : {}),
        lastCheckAt: checkedAt,
        lastCheckReason: checkReason,
        lastCheckOutcome: result?.pending ? "waiting-remote" : (result?.ok === false ? "error" : (result?.reason || "bootstrapped"))
      });
      return result;
    }

    const lossGuard = await beginOrContinueCatastrophicSyncRecovery(meta, checkReason);
    if (lossGuard) return lossGuard;

    if (!pendingLocalAlreadyRetried) meta = await retryPendingLocalSyncMutation(meta);
    await repairDeliveredCoreEvidence(PERSONAL_SPACE_ID);
    await repairDeliveredCoreEvidence(WORK_SPACE_ID);
    const all = await browser.storage.sync.get(null);
    const resetIntent = all?.[SYNC_RESET_INTENT_KEY];
    if (validResetIntent(resetIntent)) return observeRemoteResetIntent(resetIntent, meta);
    const sources = await readCoreSources(all, { includeAssets: false });
    const sharedRevision = datasetRevision(sources.shared.dataset);
    const deviceRevision = sources.device?.revision || "";
    const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
    const workRevision = datasetRevision(workSnapshot.dataset);
    const profileRevision = sources.profile?.revision || "";
    const completeDescriptor = completeRemoteDescriptor(sources, workSnapshot);
    if (completeDescriptor) await markSyncContinuityHealthy(meta, completeDescriptor);
    const diagnosticObservation = {
      lastObservedSharedRevision: sharedRevision,
      lastObservedDeviceRevision: deviceRevision,
      lastObservedWorkRevision: workRevision,
      lastObservedProfileRevision: profileRevision
    };
    const liveRevisionChanged = Boolean(
      (sharedRevision && sharedRevision !== meta.lastAppliedSyncRevision) ||
      (workRevision && workRevision !== meta.lastAppliedWorkSyncRevision)
    );

    // Recovery generations are safety copies, not live merge inputs. A device or
    // profile snapshot arriving before its compatibility ledger must therefore not
    // trigger an initialized device to reconcile local state. Only coherent live
    // ledgers (or an explicit restore/bootstrap path) can drive normal Sync changes.
    let contentUnchanged = true;
    if (!liveRevisionChanged) {
      const personalLiveUsable = isSnapshotUsable(sources.shared);
      const workLiveUsable = isSnapshotUsable(workSnapshot);
      if (personalLiveUsable || workLiveUsable) {
        const local = await ensureLocalStorage();
        if (personalLiveUsable) {
          const personal = workspaceStateNormalized(local.state, PERSONAL_SPACE_ID);
          const localRecords = flattenStateNormalized(personal, meta.deviceId);
          const localSettings = makeSettingsRecordNormalized(personal, meta.deviceId);
          contentUnchanged = recordFingerprint(sources.shared.records) === recordFingerprint(localRecords) &&
            settingsRecordEqual(sources.shared.settings, localSettings);
        }
        if (contentUnchanged && workLiveUsable) {
          const work = workspaceStateNormalized(local.state, WORK_SPACE_ID);
          const localRecords = flattenStateNormalized(work, meta.deviceId);
          const localSettings = makeSettingsRecordNormalized(work, meta.deviceId);
          contentUnchanged = recordFingerprint(workSnapshot.records) === recordFingerprint(localRecords) &&
            settingsRecordEqual(workSnapshot.settings, localSettings);
        }
      }
    }
    if (!liveRevisionChanged && contentUnchanged) {
      await noteSyncDiagnostic({
        ...(checkReason === "foreground" ? { lastForegroundSyncCheckAt: checkedAt } : {}),
        ...(checkReason === "alarm" ? { lastSyncWatchCheckAt: checkedAt } : {}),
        lastCheckAt: checkedAt,
        lastCheckReason: checkReason,
        lastCheckOutcome: "already-applied",
        ...diagnosticObservation
      });
      return { ok: true, skipped: true, reason: "already-applied", meta };
    }
    const result = await reconcile("merge");
    const outcome = result?.pending ? "waiting" : (result?.ok === false ? "error" : "reconciled");
    await noteSyncDiagnostic({
      ...(checkReason === "foreground" ? { lastForegroundSyncCheckAt: checkedAt } : {}),
      ...(checkReason === "alarm" ? { lastSyncWatchCheckAt: checkedAt } : {}),
      lastCheckAt: checkedAt,
      lastCheckReason: checkReason,
      lastCheckOutcome: outcome,
      ...diagnosticObservation,
      lastReconcileAt: checkedAt,
      lastReconcileReason: checkReason,
      lastReconcileOutcome: outcome
    });
    return result;
  }

  function latestSyncOrigin(core, snapshot, workCore, workSnapshot) {
    const personalUpdatedAt = Number(core?.updatedAt) || (Number.isFinite(snapshot?.dataset?.updatedAt) ? snapshot.dataset.updatedAt : 0);
    const workUpdatedAt = Number(workCore?.updatedAt) || Number(workSnapshot?.dataset?.updatedAt) || 0;
    const useWork = workUpdatedAt > personalUpdatedAt;
    const preferredCore = useWork ? workCore : core;
    const preferredDataset = useWork ? workSnapshot?.dataset : snapshot?.dataset;
    return {
      updatedAt: Math.max(personalUpdatedAt, workUpdatedAt),
      deviceId: preferredCore?.originDeviceId || (typeof preferredDataset?.originDeviceId === "string" ? preferredDataset.originDeviceId : "")
    };
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
    const workCore = combinedWorkRemoteCore(workSnapshot, sources.profile);
    const workUsable = remoteCoreUsable(workCore);
    const personalItems = remoteCoreUsable(core) ? liveRecordCount(core.records) : liveRecordCount(snapshot.records);
    const workItems = workUsable ? liveRecordCount(workCore.records) : 0;
    const remoteItems = personalItems + workItems;
    const hasRemoteSignal = hasSnapshotData(snapshot) || hasSnapshotData(workSnapshot) || sources.deviceSnapshots.length > 0 || hasDeviceSnapshotSignal;
    // "complete" is now a profile-level property: Personal alone can never make
    // Settings report a synchronized copy as complete/ready.
    const hasRemoteData = remoteCoreUsable(core) && workUsable &&
      (sources.profile?.complete === true || isSnapshotUsable(workSnapshot));
    const expectedItems = (remoteCoreUsable(core)
      ? liveRecordCount(core.records)
      : (Number.isInteger(Number(snapshot.dataset?.liveRecordCount)) ? Number(snapshot.dataset.liveRecordCount) : 0)) +
      (workUsable ? liveRecordCount(workCore.records) : (Number.isInteger(Number(workSnapshot.dataset?.liveRecordCount)) ? Number(workSnapshot.dataset.liveRecordCount) : 0));
    const latestDevice = sources.deviceSnapshots.reduce((latest, candidate) =>
      !latest || Number(candidate.publishedAt) > Number(latest.publishedAt) ? candidate : latest, null);
    const statusMeta = !exceeded && meta.syncEnabled && !hasRemoteData
      ? { ...meta, syncStatus: "waiting", lastSyncError: "" }
      : meta;
    const latestOrigin = latestSyncOrigin(core, snapshot, workCore, workSnapshot);
    const remoteOriginDeviceId = latestOrigin.deviceId;
    const remoteOriginDeviceName = readSyncedDeviceName(all, remoteOriginDeviceId);
    const receiptOriginDeviceName = readSyncedDeviceName(all, statusMeta.lastRemoteReceiptOriginDeviceId);
    return {
      ok: true,
      meta: statusMeta,
      remoteItems,
      remoteExpectedItems: expectedItems,
      remoteAssets,
      usage,
      hasRemoteSignal,
      hasRemoteData,
      remoteState: !hasRemoteSignal ? "none" : (hasRemoteData ? "complete" : "partial"),
      remoteUpdatedAt: latestOrigin.updatedAt,
      remoteReceiptAt: statusMeta.lastRemoteReceiptAt,
      lastRemoteReceiptUpdatedAt: statusMeta.lastRemoteReceiptUpdatedAt,
      lastRemoteReceiptOriginDeviceId: statusMeta.lastRemoteReceiptOriginDeviceId,
      lastRemoteReceiptProvenanceExact: statusMeta.lastRemoteReceiptProvenanceExact === true,
      remoteCommitId: latestDevice?.commitId || (typeof snapshot.dataset?.commitId === "string" ? snapshot.dataset.commitId : ""),
      remoteOriginDeviceId,
      remoteOriginDeviceName,
      lastRemoteReceiptOriginDeviceName: receiptOriginDeviceName,
      remoteSourceKind: sources.profile?.complete ? "complete-profile" : (core?.sourceKind || ""),
      recoveryProtection: statusMeta.syncProfileProtection || "unknown",
      recoveryProtectionReason: statusMeta.syncProfileProtectionReason || ""
    };
  }

  async function publishWorkspaceAuthoritative(fullState, meta, spaceId, { retainedTombstones = [] } = {}) {
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
    for (const tombstone of normalizeContinuityTombstones(retainedTombstones)) {
      if (!records.has(tombstone.id)) writes[itemKey(tombstone.id, spaceId)] = tombstone;
    }
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

  async function bootstrapLocal({ recovery = false, markContinuity = true, preservePendingSyncRecovery = false, retainedPersonalTombstones = [], retainedWorkTombstones = [] } = {}) {
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
    for (const tombstone of normalizeContinuityTombstones(retainedPersonalTombstones)) {
      if (!records.has(tombstone.id)) {
        writes[itemKey(tombstone.id)] = tombstone;
        deviceRecords.set(tombstone.id, tombstone);
      }
    }
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
    // 1.27.8.8 keeps the previous complete device profile active while the two
    // compatibility ledgers are published. The new Personal+Work snapshot is
    // committed only after both namespaces have complete dataset markers.
    const fastPublish = { written: true, setRevision: "" };

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

    const workPublish = await publishWorkspaceAuthoritative(state, meta, WORK_SPACE_ID, { retainedTombstones: retainedWorkTombstones });
    const workRevision = datasetRevision(workPublish.dataset);
    const profilePublishMeta = { ...meta, syncInitialized: true, lastAppliedWorkSyncRevision: workRevision };
    const profilePublish = await publishProfileDeviceSnapshot(state, profilePublishMeta, { force: true });
    const totalSkippedAssets = assetResult.skipped + workPublish.assetResult.skipped;
    const warningState = syncWarningState(totalSkippedAssets);
    const protectionState = profileProtectionState(profilePublish, meta);
    const refreshed = await refreshQuota({
      ...markAppliedSnapshot(meta, publishedDataset),
      lastAppliedDeviceSnapshotRevision: profilePublish.setRevision || fastPublish.setRevision || meta.lastAppliedDeviceSnapshotRevision || "",
      lastAppliedProfileSnapshotRevision: profilePublish.setRevision || meta.lastAppliedProfileSnapshotRevision || "",
      lastProfileSnapshotPublishedAt: profilePublish.publishedAt || meta.lastProfileSnapshotPublishedAt || 0,
      lastAppliedWorkSyncRevision: workRevision,
      syncEnabled: true,
      syncInitialized: true,
      syncBootstrapMode: "none",
      syncStatus: "ready",
      lastSyncAt: timestamp,
      lastSyncError: "",
      ...warningState,
      ...protectionState,
      syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    // A normal/user-authoritative publish intentionally supersedes any old reset
    // sentinel, but only after a complete Personal+Work copy has been committed.
    const resetRead = await browser.storage.sync.get(SYNC_RESET_INTENT_KEY);
    if (validResetIntent(resetRead?.[SYNC_RESET_INTENT_KEY])) await removeSyncItems([SYNC_RESET_INTENT_KEY]);
    if (!preservePendingSyncRecovery) await clearPendingLocalSyncMutation();
    await ensureSyncWatchAlarm(refreshed);
    if (markContinuity) {
      const all = await browser.storage.sync.get(null);
      const sources = await readCoreSources(all, { includeAssets: false });
      const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
      const descriptor = completeRemoteDescriptor(sources, workSnapshot);
      if (descriptor) await markSyncContinuityHealthy(refreshed, descriptor);
    }
    return { ok: true, meta: refreshed, action: recovery ? "recovery-published" : "published", remoteUpdatedAt: timestamp };
  }

  async function bootstrapRemote({ waitIfMissing = false, force = false } = {}) {
    const { state: fullLocalState, meta } = await ensureLocalStorage();
    if (!meta.syncEnabled) {
      return { ok: false, error: "Firefox Account Sync permission is not enabled on this device.", meta };
    }

    const sources = await readCoreSources();
    const resetIntent = sources.all?.[SYNC_RESET_INTENT_KEY];
    if (validResetIntent(resetIntent) && meta.syncInitialized) return observeRemoteResetIntent(resetIntent, meta);
    const workSnapshot = await readSyncSnapshot(sources.all, { spaceId: WORK_SPACE_ID });
    const atomicProfile = sources.profile?.complete === true ? sources.profile : null;
    const liveProfileComplete = isSnapshotUsable(sources.shared) && isSnapshotUsable(workSnapshot);
    const settingsModern = settings => Number(settings?.schemaVersion) >= SYNC_SCHEMA_VERSION && settings?.settingsClock && typeof settings.settingsClock === "object";
    const atomicModern = Boolean(atomicProfile && settingsModern(atomicProfile.personal.settings) && settingsModern(atomicProfile.work.settings));
    const liveModern = Boolean(liveProfileComplete && settingsModern(sources.shared.settings) && settingsModern(workSnapshot.settings));
    const atomicMatchesLive = Boolean(atomicProfile && liveProfileComplete &&
      recordFingerprint(atomicProfile.personal.records) === recordFingerprint(sources.shared.records) &&
      settingsRecordEqual(atomicProfile.personal.settings, sources.shared.settings) &&
      recordFingerprint(atomicProfile.work.records) === recordFingerprint(workSnapshot.records) &&
      settingsRecordEqual(atomicProfile.work.settings, workSnapshot.settings));

    // Restore/bootstrap chooses one coherent profile source. Prefer the atomic
    // generation when it is the only complete profile, when it exactly represents
    // the coherent live ledgers, or when it protects modern field-clock Settings
    // from a raw legacy whole-record ledger. Otherwise a complete modern live
    // Personal+Work pair is newer operational state and wins as a whole.
    const useAtomicProfile = Boolean(atomicProfile && (
      !liveProfileComplete ||
      atomicMatchesLive ||
      (atomicModern && !liveModern)
    ));
    const personalCore = useAtomicProfile
      ? {
          records: new Map(atomicProfile.personal.records),
          settings: atomicProfile.personal.settings,
          assets: sources.shared?.assets || new Map(),
          sourceKind: "profile-snapshot",
          revision: atomicProfile.revision,
          updatedAt: Number(atomicProfile.personal.updatedAt) || 0,
          originDeviceId: atomicProfile.originDeviceId || "",
          provenanceExact: true
        }
      : combinedRemoteCore(sources.shared, null);
    const workCore = useAtomicProfile
      ? {
          records: new Map(atomicProfile.work.records),
          settings: atomicProfile.work.settings,
          assets: workSnapshot?.assets || new Map(),
          sourceKind: "profile-snapshot",
          revision: atomicProfile.revision,
          updatedAt: Number(atomicProfile.work.updatedAt) || 0,
          originDeviceId: atomicProfile.originDeviceId || "",
          provenanceExact: true
        }
      : combinedWorkRemoteCore(workSnapshot, null);
    const profileComplete = Boolean(useAtomicProfile && remoteCoreUsable(personalCore) && remoteCoreUsable(workCore));
    const legacyComplete = Boolean(!useAtomicProfile && remoteCoreUsable(personalCore) && isSnapshotUsable(workSnapshot));

    // A new 1.27.8.8 profile never finalizes from Personal alone. Either a complete
    // Personal+Work device generation exists, or both compatibility namespaces
    // must independently validate. Missing/partial Work means "still arriving",
    // not "intentionally empty". An intentional empty Work has a valid settings +
    // dataset marker with liveRecordCount=0 and therefore passes this gate.
    if (!remoteCoreUsable(personalCore) || (!profileComplete && !legacyComplete)) {
      const preserveInitializedDevice = force && meta.syncInitialized === true;
      const waitingMeta = await writeLocalMeta({
        ...meta,
        syncEnabled: true,
        syncInitialized: preserveInitializedDevice ? true : false,
        syncBootstrapMode: preserveInitializedDevice ? "none" : (waitIfMissing ? "await-remote" : "none"),
        syncStatus: waitIfMissing ? "waiting" : "error",
        lastSyncError: waitIfMissing ? "" : snapshotArrivalMessage(!isSnapshotUsable(workSnapshot) ? workSnapshot : sources.shared),
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

    const remotePersonal = personalCore;
    const remoteWork = workCore;

    // First reconstruct the exact verified remote profile. This is our baseline
    // for publishing any edits the user made locally while the fresh profile was
    // waiting for Firefox Sync to finish delivery.
    const personalLocal = workspaceStateNormalized(fullLocalState, PERSONAL_SPACE_ID);
    const remotePersonalLegacy = stateFromRecords(remotePersonal.records, remotePersonal.settings, personalLocal, remotePersonal.assets);
    let remoteOnlyState = replaceWorkspaceNormalized(
      fullLocalState,
      PERSONAL_SPACE_ID,
      workspaceStateNormalized(remotePersonalLegacy, PERSONAL_SPACE_ID)
    );
    const workLocalForRemote = workspaceStateNormalized(remoteOnlyState, WORK_SPACE_ID);
    const remoteWorkLegacy = stateFromRecords(remoteWork.records, remoteWork.settings, workLocalForRemote, remoteWork.assets);
    remoteOnlyState = replaceWorkspaceNormalized(
      remoteOnlyState,
      WORK_SPACE_ID,
      workspaceStateNormalized(remoteWorkLegacy, PERSONAL_SPACE_ID)
    );

    // A peer that observed an explicit reset is deliberately waiting for a new
    // authoritative source. Its pre-reset local profile is preserved while waiting
    // for safety/UX, but it must NOT be merged back into the first complete
    // post-reset profile or the reset would resurrect old shortcuts/settings.
    const continuity = await readSyncContinuity(meta);
    const awaitingPostResetReplacement = meta.syncBootstrapMode === "await-remote" &&
      continuity.established === false && Number(continuity.lastResetEpoch) > 0;

    // Ordinary fresh-device delivery still merges edits the user made while Sync
    // was arriving. A reset observer instead applies the exact verified remote
    // replacement, because the old local semantic state belongs to the reset epoch.
    let mergedState = remoteOnlyState;
    if (!awaitingPostResetReplacement) {
      for (const [spaceId, remote] of [[PERSONAL_SPACE_ID, remotePersonal], [WORK_SPACE_ID, remoteWork]]) {
        const localWorkspace = workspaceStateNormalized(fullLocalState, spaceId);
        const localRecords = flattenStateNormalized(localWorkspace, meta.deviceId);
        const localSettings = makeSettingsRecordNormalized(localWorkspace, meta.deviceId);
        const mergedRecords = pruneExpiredTombstones(mergeRecordMaps(remote.records, localRecords));
        const mergedSettings = chooseSettings(localSettings, remote.settings, localWorkspace);
        const mergedAssets = new Map([...(remote.assets || new Map()), ...collectLocalAssetsNormalized(localWorkspace)]);
        const mergedLegacy = stateFromRecords(mergedRecords, mergedSettings, localWorkspace, mergedAssets);
        mergedState = replaceWorkspaceNormalized(
          mergedState,
          spaceId,
          workspaceStateNormalized(mergedLegacy, PERSONAL_SPACE_ID)
        );
      }
    }
    await setLocalStateSilently(mergedState);

    const completedWaitingOnboarding = !meta.onboardingCompleted && meta.syncBootstrapMode === "await-remote";
    const observedMeta = observeRemoteCore(meta, remotePersonal);
    let appliedMeta = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
    if (isSnapshotUsable(sources.shared)) appliedMeta = markAppliedSnapshot(appliedMeta, sources.shared.dataset);
    if (isSnapshotUsable(workSnapshot)) appliedMeta = markAppliedWorkSnapshot(appliedMeta, workSnapshot.dataset);
    if (sources.profile?.revision) {
      appliedMeta = {
        ...appliedMeta,
        lastAppliedProfileSnapshotRevision: sources.profile.revision,
        lastAppliedDeviceSnapshotRevision: sources.profile.revision
      };
    }
    let refreshed = await refreshQuota({
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
    refreshed = await writeLocalMeta(refreshed, { allowOnboardingChange: completedWaitingOnboarding });
    await markSyncContinuityHealthy(refreshed, {
      revision: sources.profile?.revision || `${remotePersonal.revision || ""}|${remoteWork.revision || ""}`,
      publisherDeviceId: sources.profile?.originDeviceId || remotePersonal.originDeviceId || remoteWork.originDeviceId || "",
      personalTombstones: continuityTombstonesFromRecords(remotePersonal.records),
      workTombstones: continuityTombstonesFromRecords(remoteWork.records)
    });

    // If the user created/edited anything while the fresh profile was waiting,
    // publish only that semantic delta after the complete remote baseline exists.
    if (workspaceCoreSignature(remoteOnlyState, PERSONAL_SPACE_ID, refreshed.deviceId) !== workspaceCoreSignature(mergedState, PERSONAL_SPACE_ID, refreshed.deviceId) ||
        workspaceCoreSignature(remoteOnlyState, WORK_SPACE_ID, refreshed.deviceId) !== workspaceCoreSignature(mergedState, WORK_SPACE_ID, refreshed.deviceId)) {
      await pushLocalMutation(remoteOnlyState, mergedState, refreshed);
      refreshed = await readLocalMeta();
    }

    // Establish/refresh this device's complete 1.27.8.8 safety generation even when
    // the remote source was the old two-ledger format and there were no local edits.
    const profilePublish = await publishProfileDeviceSnapshot(mergedState, refreshed, { force: true });
    refreshed = await writeLocalMeta({
      ...refreshed,
      lastAppliedDeviceSnapshotRevision: profilePublish.setRevision || refreshed.lastAppliedDeviceSnapshotRevision || "",
      lastAppliedProfileSnapshotRevision: profilePublish.setRevision || refreshed.lastAppliedProfileSnapshotRevision || "",
      lastProfileSnapshotPublishedAt: profilePublish.publishedAt || refreshed.lastProfileSnapshotPublishedAt || 0,
      syncStatus: "ready",
      ...profileProtectionState(profilePublish, refreshed)
    });
    await clearPendingLocalSyncMutation();
    await ensureSyncWatchAlarm(refreshed);
    await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return {
      ok: true,
      meta: refreshed,
      restored: true,
      action: force ? "restored" : "bootstrapped-remote",
      remoteUpdatedAt: Math.max(Number(remotePersonal.updatedAt) || 0, Number(remoteWork.updatedAt) || 0),
      sourceKind: profileComplete ? "profile-snapshot" : "complete-legacy-ledgers"
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

      // Do not publish a device snapshot between the two halves of a cross-Space
      // move. 1.27.8.8 publishes one complete Personal+Work generation only after
      // destination and source commits both finish.
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
    const profilePublish = await publishProfileDeviceSnapshot(currentState, currentMeta);
    await clearPendingCrossSpaceSync(storageKey);
    currentMeta = await writeLocalMeta({
      ...currentMeta,
      lastAppliedDeviceSnapshotRevision: profilePublish.setRevision || currentMeta.lastAppliedDeviceSnapshotRevision || "",
      lastAppliedProfileSnapshotRevision: profilePublish.setRevision || currentMeta.lastAppliedProfileSnapshotRevision || "",
      lastProfileSnapshotPublishedAt: profilePublish.publishedAt || currentMeta.lastProfileSnapshotPublishedAt || 0,
      syncStatus: "ready",
      lastSyncError: "",
      lastSyncAt: Date.now(),
      ...profileProtectionState(profilePublish, currentMeta)
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

  function rebaseCoreWritesAgainstDeliveredSnapshot(writes, snapshot, spaceId = PERSONAL_SPACE_ID) {
    if (!writes || typeof writes !== "object") return {};
    const namespace = syncNamespace(spaceId);
    const rebased = {};
    for (const [key, candidate] of Object.entries(writes)) {
      if (!candidate || typeof candidate !== "object") continue;
      if (key === namespace.settingsKey) {
        const remote = snapshot?.settings;
        const winner = remote ? chooseNewerRecord(candidate, remote) : candidate;
        if (winner === remote) continue;
        rebased[key] = winner;
        continue;
      }
      const id = typeof candidate.id === "string" ? candidate.id : "";
      const remote = id && snapshot?.records instanceof Map ? snapshot.records.get(id) : null;
      const winner = remote ? chooseNewerRecord(candidate, remote) : candidate;
      if (winner === remote) continue;
      rebased[key] = winner;
    }
    return rebased;
  }

  async function pushPersonalMutation(oldStateInput, newStateInput, meta) {
    // Inputs already crossed normalizeState() in pushLocalMutation(). Keep the
    // names explicit so future callers do not mistake this for a raw-state API.
    const oldState = workspaceStateNormalized(oldStateInput, PERSONAL_SPACE_ID);
    const newState = workspaceStateNormalized(newStateInput, PERSONAL_SPACE_ID);
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
    let fastPublish = { written: true, setRevision: "", publishedAt: 0 };

    // The detailed shared ledger remains the compatibility/conflict/artwork
    // layer. It is deliberately maintained after the latency-critical snapshot.
    let snapshot = await prepareSyncSnapshot();
    const rebasedWrites = rebaseCoreWritesAgainstDeliveredSnapshot(writes, snapshot, PERSONAL_SPACE_ID);
    if (hasOwnEnumerable(rebasedWrites)) {
      await writeSyncItems(rebasedWrites);
      await repairDeliveredCoreEvidence(PERSONAL_SPACE_ID);
      // Dataset is a commit marker and is intentionally written last. Build it
      // from the ledger that actually exists after our idempotent record writes,
      // not only from this tab's pre-mutation snapshot. A remote record that was
      // already delivered locally but whose storage.onChanged event was missed
      // must remain part of the committed generation rather than being hidden by
      // a too-small liveRecordCount/fingerprint.
      const committedSnapshot = await readSyncSnapshot(null, { includeAssets: false });
      const committedSettings = committedSnapshot.settings || newSettings;
      publishedDataset = datasetRecord(
        datasetUpdatedAt(committedSnapshot.records, committedSettings, timestamp),
        committedSnapshot.records,
        committedSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId }
      );
      await writeSyncItems({ [SYNC_DATASET_KEY]: publishedDataset });
      // Publish the complete Personal+Work device generation only after the
      // compatibility commit marker exists, so deletions/tombstones are retained.
      fastPublish = await publishProfileDeviceSnapshot(newStateInput, meta);
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

    const warningState = syncWarningState(assetResult.skipped);
    const protectionState = profileProtectionState(fastPublish, meta);
    const refreshed = await refreshQuota({
      ...(publishedDataset ? markAppliedSnapshot(meta, publishedDataset) : meta),
      lastAppliedDeviceSnapshotRevision: fastPublish.setRevision || meta.lastAppliedDeviceSnapshotRevision || "",
      lastAppliedProfileSnapshotRevision: fastPublish.setRevision || meta.lastAppliedProfileSnapshotRevision || "",
      lastProfileSnapshotPublishedAt: fastPublish.publishedAt || meta.lastProfileSnapshotPublishedAt || 0,
      syncStatus: "ready",
      lastSyncAt: timestamp,
      lastSyncError: "",
      ...warningState,
      ...protectionState
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

  async function pushWorkMutation(oldStateInput, newStateInput, meta) {
    // Inputs already crossed normalizeState() in pushLocalMutation().
    const oldState = workspaceStateNormalized(oldStateInput, WORK_SPACE_ID);
    const newState = workspaceStateNormalized(newStateInput, WORK_SPACE_ID);
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
    const rebasedWrites = rebaseCoreWritesAgainstDeliveredSnapshot(writes, snapshot, WORK_SPACE_ID);
    if (hasOwnEnumerable(rebasedWrites)) {
      await writeSyncItems(rebasedWrites);
      await repairDeliveredCoreEvidence(WORK_SPACE_ID);
      // Preserve concurrently delivered Work records in the commit marker for
      // the same reason as Personal: the post-write ledger is authoritative for
      // record count/fingerprint, even if its storage event was missed locally.
      const committedSnapshot = await readSyncSnapshot(null, { includeAssets: false, spaceId: WORK_SPACE_ID });
      const committedSettings = committedSnapshot.settings || newSettings;
      publishedDataset = datasetRecord(
        datasetUpdatedAt(committedSnapshot.records, committedSettings, timestamp),
        committedSnapshot.records,
        committedSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId }
      );
      await writeSyncItems({ [namespace.datasetKey]: publishedDataset });
    }
    const profilePublish = hasOwnEnumerable(rebasedWrites)
      ? await publishProfileDeviceSnapshot(newStateInput, meta)
      : { written: true, setRevision: "", publishedAt: 0 };

    snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
    if (explicitlyDroppedAssetIds.size) {
      const dropped = await removeKnownUnreferencedAssets(snapshot, explicitlyDroppedAssetIds);
      if (dropped.removedKeys) snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
    }
    const assetResult = await uploadMissingAssets(newAssets, snapshot.assets, WORK_SPACE_ID);
    const refreshed = await refreshQuota({
      ...(publishedDataset ? markAppliedWorkSnapshot(meta, publishedDataset) : meta),
      lastAppliedDeviceSnapshotRevision: profilePublish.setRevision || meta.lastAppliedDeviceSnapshotRevision || "",
      lastAppliedProfileSnapshotRevision: profilePublish.setRevision || meta.lastAppliedProfileSnapshotRevision || "",
      lastProfileSnapshotPublishedAt: profilePublish.publishedAt || meta.lastProfileSnapshotPublishedAt || 0,
      syncStatus: "ready",
      lastSyncAt: timestamp,
      lastSyncError: "",
      ...syncWarningState(assetResult.skipped),
      ...profileProtectionState(profilePublish, meta)
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

  function workspaceCoreChanged(oldState, newState, spaceId, deviceId = "") {
    const oldWorkspace = oldState?.spaces?.[spaceId];
    const newWorkspace = newState?.spaces?.[spaceId];
    if (Number(oldWorkspace?.updatedAt) !== Number(newWorkspace?.updatedAt) ||
        Number(oldWorkspace?.settingsModifiedAt) !== Number(newWorkspace?.settingsModifiedAt)) return true;
    // Equal clocks are not proof of equality: legacy clients and device-local
    // artwork paths can preserve clocks. Keep the exact semantic signature as the
    // defensive fallback for that uncommon case.
    return workspaceCoreSignature(oldState, spaceId, deviceId) !==
      workspaceCoreSignature(newState, spaceId, deviceId);
  }

  async function pushLocalMutation(oldRaw, newRaw, meta) {
    const oldState = normalizeState(oldRaw);
    // The normal storage writer already stamps fine-grained Settings clocks.
    // Repeat the inference defensively at the background boundary so a legacy/
    // direct storage.local writer with a newer whole settingsModifiedAt cannot
    // publish an unstamped Settings mutation or trigger clock oscillation.
    const newState = stampSettingsMutationClocks(oldState, normalizeState(newRaw));
    const personalChanged = workspaceCoreChanged(oldState, newState, PERSONAL_SPACE_ID, meta.deviceId);
    const workChanged = workspaceCoreChanged(oldState, newState, WORK_SPACE_ID, meta.deviceId);
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

    const sources = await readCoreSources();
    let snapshot = sources.shared;
    const core = combinedRemoteCore(snapshot, sources.device);

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

    // On an initialized device, immutable recovery generations never participate
    // in the automatic live merge. If Firefox exposes an atomic generation before
    // the shared ledger is coherent, preserve the current local Personal Space and
    // wait for the dataset/records to finish arriving. Explicit Restore/bootstrap
    // paths may still consume the atomic generation as a whole.
    if (strategy === "merge" && !isSnapshotUsable(snapshot)) {
      const refreshed = await refreshQuota({
        ...meta,
        syncStatus: "ready",
        lastSyncError: "",
        lastSyncWarning: "",
        syncWaitStartedAt: 0
      });
      await writeLocalMeta(refreshed);
      await ensureSyncWatchAlarm(refreshed);
      return { ok: true, skipped: true, reason: "shared-ledger-pending", meta: refreshed, sharedLedgerPending: true };
    }

    const observedMeta = observeRemoteCore(meta, core);
    const localRecords = flattenStateNormalized(localState, meta.deviceId);
    const localSettings = makeSettingsRecordNormalized(localState, meta.deviceId);
    const localAssets = collectLocalAssetsNormalized(localState);

    if (strategy === "remote") {
      await markSyncing(meta);
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

    // The live shared ledger is coherent here. Atomic safety generations were
    // already excluded from automatic merge above.

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
    const shouldCommitDataset = hasCoreWrites;
    const desiredDataset = shouldCommitDataset
      ? datasetRecord(
          datasetUpdatedAt(mergedRecords, mergedSettings, Number(snapshot.dataset?.updatedAt) || 0),
          mergedRecords,
          mergedSettings,
          { commitId: uid("commit"), originDeviceId: meta.deviceId }
        )
      : snapshot.dataset;
    await writeSyncItems(syncWrites);
    if (shouldCommitDataset && desiredDataset) {
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
    const all = await browser.storage.sync.get(null);
    const sources = await readCoreSources(all, { includeAssets: false });
    let snapshot = await readSyncSnapshot(all, { spaceId: WORK_SPACE_ID });
    let core = combinedWorkRemoteCore(snapshot, sources.profile);

    // Missing/partial Work is never silently interpreted as an empty Space.
    // A complete profile generation may satisfy explicit Restore/bootstrap, but
    // automatic live reconciliation waits for the shared Work ledger itself.
    if (!remoteCoreUsable(core)) {
      const waiting = await writeLocalMeta({
        ...meta,
        syncStatus: "waiting",
        lastSyncError: "",
        syncWaitStartedAt: meta.syncWaitStartedAt || Date.now()
      });
      return { ok: true, meta: waiting, pending: true, workPending: true };
    }

    // Work follows the same safety boundary as Personal: a complete profile
    // generation is an atomic Restore/bootstrap fallback, not an automatic
    // per-record merge source while the live Work ledger is torn or absent.
    if (strategy === "merge" && !isSnapshotUsable(snapshot)) {
      const refreshed = await refreshQuota({
        ...meta,
        syncStatus: "ready",
        lastSyncError: "",
        lastSyncWarning: "",
        syncWaitStartedAt: 0
      });
      await writeLocalMeta(refreshed);
      return { ok: true, skipped: true, reason: "work-ledger-pending", meta: refreshed, sharedLedgerPending: true };
    }

    const localState = workspaceStateNormalized(fullLocalState, WORK_SPACE_ID);
    const localRecords = flattenStateNormalized(localState, meta.deviceId);
    const localSettings = makeSettingsRecordNormalized(localState, meta.deviceId);
    const localAssets = collectLocalAssetsNormalized(localState);

    const markRemoteApplied = base => {
      let next = base;
      if (isSnapshotUsable(snapshot)) next = markAppliedWorkSnapshot(next, snapshot.dataset);
      if (sources.profile?.revision) {
        next = {
          ...next,
          lastAppliedProfileSnapshotRevision: sources.profile.revision,
          lastAppliedDeviceSnapshotRevision: sources.profile.revision
        };
      }
      return next;
    };

    if (strategy === "remote") {
      const restoredLegacy = stateFromRecords(core.records, core.settings, localState, core.assets);
      const restoredState = replaceWorkspaceNormalized(fullLocalState, WORK_SPACE_ID, workspaceStateNormalized(restoredLegacy, PERSONAL_SPACE_ID));
      await setLocalStateSilently(restoredState);
      const refreshed = await refreshQuota({
        ...markRemoteApplied(meta),
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
      return { ok: true, meta: refreshed, restored: true, sourceKind: core.sourceKind };
    }

    let mergedRecords = pruneExpiredTombstones(mergeRecordMaps(localRecords, core.records));
    const mergedSettings = chooseSettings(localSettings, core.settings, localState);
    const combinedAssets = new Map([...(core.assets || new Map()), ...localAssets]);
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

    // The live Work ledger is coherent here. Atomic profile generations were
    // already excluded from automatic merge above.

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
    const shouldCommitDataset = hasCoreWrites;
    const desiredDataset = shouldCommitDataset
      ? datasetRecord(
          datasetUpdatedAt(mergedRecords, mergedSettings, Number(snapshot.dataset?.updatedAt) || 0),
          mergedRecords,
          mergedSettings,
          { commitId: uid("commit"), originDeviceId: meta.deviceId }
        )
      : snapshot.dataset;
    await writeSyncItems(syncWrites);
    if (shouldCommitDataset && desiredDataset) await writeSyncItems({ [namespace.datasetKey]: desiredDataset });

    snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
    const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets, WORK_SPACE_ID);
    const staleKeys = snapshot.expiredKeys.filter(key => !(key in syncWrites));
    if (staleKeys.length) await removeSyncItems([...new Set(staleKeys)]);

    const refreshed = await refreshQuota({
      ...markRemoteApplied(snapshot.dataset || desiredDataset ? markAppliedWorkSnapshot(meta, snapshot.dataset || desiredDataset) : meta),
      syncStatus: "ready",
      lastSyncAt: Date.now(),
      lastSyncError: "",
      ...syncWarningState(assetResult.skipped),
      syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    if (mergedStateChanged) await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return { ok: true, meta: refreshed, sourceKind: core.sourceKind };
  }


  async function reconcile(strategy = "merge") {
    devMark("background:reconcile-start");
    try {
      if (strategy === "merge") {
        await repairDeliveredCoreEvidence(PERSONAL_SPACE_ID);
        await repairDeliveredCoreEvidence(WORK_SPACE_ID);
        const meta = await readLocalMeta();
        if (meta.syncEnabled && meta.syncInitialized) await retryPendingCrossSpaceSync(meta);
      }
      const personal = await reconcilePersonal(strategy);
      if (!personal?.ok || personal?.pending) return personal;
      let work = await reconcileWork(strategy);

      // Keep the local immutable safety generation current after a successful
      // live reconciliation, but never feed that publication back into the same
      // automatic merge. A torn/missing Work ledger waits for Firefox delivery;
      // only explicit Restore/bootstrap may consume the atomic profile as data.
      let currentMeta = work?.meta || personal.meta || await readLocalMeta();
      if (currentMeta.syncEnabled && currentMeta.syncInitialized) {
        const { state } = await ensureLocalStorage();
        const profilePublish = await publishProfileDeviceSnapshot(state, currentMeta);
        currentMeta = await writeLocalMeta({
          ...currentMeta,
          lastAppliedDeviceSnapshotRevision: profilePublish.setRevision || currentMeta.lastAppliedDeviceSnapshotRevision || "",
          lastAppliedProfileSnapshotRevision: profilePublish.setRevision || currentMeta.lastAppliedProfileSnapshotRevision || "",
          lastProfileSnapshotPublishedAt: profilePublish.publishedAt || currentMeta.lastProfileSnapshotPublishedAt || 0,
          ...profileProtectionState(profilePublish, currentMeta)
        });
      }

      if (work?.pending) {
        const waiting = await writeLocalMeta({
          ...(work.meta || currentMeta),
          syncStatus: "waiting",
          lastSyncError: "",
          syncWaitStartedAt: (work.meta || currentMeta).syncWaitStartedAt || Date.now()
        });
        return { ...personal, meta: waiting, work: { ...work, meta: waiting } };
      }
      return work?.ok ? { ...personal, meta: work.meta || currentMeta || personal.meta, work } : personal;
    } finally {
      devMark("background:reconcile-end");
      devMeasure("background:reconcile", "background:reconcile-start", "background:reconcile-end");
    }
  }


  function chooseSettings(localSettings, remoteSettings, localState) {
    if (!remoteSettings) return localSettings;
    if (!localState.shortcuts.length && !localState.settingsModifiedAt) return remoteSettings;
    return mergeSettingsRecords(localSettings, remoteSettings);
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
    const continuity = await readSyncContinuity(meta);
    const epoch = nextMutationTime(continuity.lastResetEpoch, Date.now());
    const resetIntent = {
      schemaVersion: SYNC_RESET_INTENT_SCHEMA_VERSION,
      kind: "reset-intent",
      epoch,
      initiatedByDevice: meta.deviceId || "",
      initiatedAt: Date.now()
    };

    // Commit the reset marker first. MosaicSync-controlled deletion therefore
    // never creates the same 0-byte namespace that Firefox uninstall cleanup can
    // create. Surviving 1.30.13+ devices can distinguish explicit deletion from
    // catastrophic external loss, including devices that were briefly offline.
    await writeSyncItems({ [SYNC_RESET_INTENT_KEY]: resetIntent });
    const all = await browser.storage.sync.get(null);
    const keys = Object.keys(all).filter(key => key.startsWith(SYNC_PREFIX) && key !== SYNC_RESET_INTENT_KEY);
    if (keys.length) await removeSyncItems(keys);
    await clearAssetGcLedger();
    await clearAllPendingSyncRecoveryState();
    await markIntentionalSyncReset(meta, epoch);

    const [usedBytes, remaining] = await Promise.all([
      browser.storage.sync.getBytesInUse(null),
      browser.storage.sync.get(null)
    ]);
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
      lastAppliedProfileSnapshotRevision: "",
      lastProfileSnapshotPublishedAt: 0,
      lastRemoteReceiptAt: 0,
      lastRemoteReceiptRevision: "",
      lastRemoteReceiptUpdatedAt: 0,
      lastRemoteReceiptOriginDeviceId: "",
      lastRemoteReceiptProvenanceExact: false,
      syncBytesInUse: Math.max(0, Number(usedBytes) || 0),
      syncItemCount: Object.keys(remaining || {}).filter(key => key.startsWith(SYNC_PREFIX)).length
    });
    await ensureSyncWatchAlarm(next);
    return { ok: true, meta: next, removed: keys.length, resetEpoch: epoch };
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

  function profileProtectionState(profilePublish, previousMeta = {}) {
    const previousState = ["unknown", "protected", "limited"].includes(previousMeta?.syncProfileProtection)
      ? previousMeta.syncProfileProtection
      : "unknown";
    const previousReason = typeof previousMeta?.syncProfileProtectionReason === "string"
      ? previousMeta.syncProfileProtectionReason
      : "";

    if (profilePublish?.written === true || profilePublish?.unchanged === true) {
      return {
        syncProfileProtection: "protected",
        syncProfileProtectionReason: "",
        syncFastSnapshotFallback: false
      };
    }

    const reason = String(profilePublish?.reason || "");
    if (["too-large", "quota", "missing-device", "verification"].includes(reason)) {
      return {
        syncProfileProtection: "limited",
        syncProfileProtectionReason: reason,
        syncFastSnapshotFallback: true
      };
    }

    // "untrusted-local-profile" is expected while a fresh device is waiting for
    // a complete remote baseline. It must not turn a temporary bootstrap state
    // into a permanent degraded-protection warning. Preserve the last proven state.
    return {
      syncProfileProtection: previousState,
      syncProfileProtectionReason: previousReason,
      syncFastSnapshotFallback: previousMeta?.syncFastSnapshotFallback === true
    };
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
  async function writeSyncItems(items, { reserveBytes = 0, skipPreflight = false, trackExpected = true } = {}) {
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
      const expectedEntries = trackExpected ? chunkEntries.map(([key, value]) => [key, stableStringify(value)]) : [];
      for (const [key, signature] of expectedEntries) rememberSyncChange(key, signature);
      if (expectedEntries.length) await rememberDurableSyncChanges(expectedEntries);
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
  return true;
}
