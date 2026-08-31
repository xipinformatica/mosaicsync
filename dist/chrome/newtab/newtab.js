/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { getNativeTopSites } from "../core/platform.js";
import {
  APPEARANCE_HINT_KEY,
  BACKGROUND_PRESETS,
  BUILTIN_SHORTCUT_ICON_KEYS,
  DEFAULT_LIGHT_BACKGROUND_COLOR,
  DEFAULT_STATE,
  FREQUENTLY_VISITED_PREF_KEY,
  FREQUENTLY_VISITED_COUNT_PREF_KEY,
  FREQUENTLY_VISITED_HIDDEN_DOMAINS_KEY,
  DEFAULT_SPACE_PREF_KEY,
  BOOKMARK_FOLDER_COLORS_PREF_KEY,
  SHORTCUT_COLOR_TAG_KEYS,
  SHORTCUT_ORDER_PREF_KEY,
  SHORTCUT_USAGE_PREF_KEY,
  FREQUENT_TOP_SITES_LIMIT,
  FREQUENT_HIDDEN_DOMAINS_MAX,
  FREQUENT_CANDIDATE_CACHE_MS,
  BACKGROUND_PRELOAD_CACHE_MAX,
  SPACE_IDS,
  SETTINGS_SYNC_CLOCK_KEYS,
  DONATE_URL,
  LOCAL_META_KEY,
  LOCAL_STATE_KEY,
  LOCAL_SYNC_RECOVERY_STATUS_KEY,
  PRODUCT_NAME,
  RENDER_MANIFEST_KEY,
  RENDER_MANIFEST_SCHEMA_VERSION,
  RENDER_PREVIEW_MAX_CHARS,
  SESSION_RENDER_STATE_KEY,
  SHORTCUT_LOCAL_IMAGE_TARGET_BYTES,
  SHORTCUT_SYNC_IMAGE_TARGET_BYTES,
  SUPPORT_URL,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_WARNING_FREE_BYTES,
  SYNC_QUOTA_CRITICAL_FREE_BYTES,
  SYNC_FOREGROUND_CHECK_MIN_INTERVAL_MS,
  TIPS_URL,
  VERSION,
  WALLPAPER_LOCAL_IMAGE_TARGET_BYTES
} from "../core/constants.js";
import {
  classifyImage,
  clampInt,
  createCrossSpaceSyncIntentNormalized,
  effectiveBackgroundDimForTheme,
  faviconPreferenceForCandidate,
  initializeThemeWallpaperDims,
  hexLuminance,
  hostLabel,
  localStateSyncClockSignature,
  localStateSyncRawSignature,
  normalizeMeta,
  normalizeState,
  moveShortcutBetweenSpacesNormalized,
  moveShortcutOutOfFolder,
  nextMutationTime,
  replaceWorkspace,
  replaceWorkspaceTrustedNormalized,
  now,
  selectActiveSpaceNormalized,
  repairTopLevelPositions,
  stableStringify,
  uid,
  validHex
} from "../core/model.js";
import { imageDataUrlByteLength as dataUrlByteLength } from "../core/image-data.js";
import { clearSessionFrequentlyVisitedSuppression, createRenderSnapshot, ensureLocalStorage, createWriteBaseline, getSessionRenderCacheStatus, hydrateBackgroundLocalAssetNormalized, hydrateDeferredFolderLocalAssetsNormalized, hydrateFolderLocalAssetsNormalized, hydrateLocalAssetsForSpaceNormalized, hydratePersistedState, materializeLocalStorage, rawStateMultipleSpacesEnabled, releaseLocalAssetsForSpaceNormalized, readLocalStorageRaw, readSessionRenderCache, updateSessionFrequentlyVisitedSnapshot, warmSessionRenderCache, writeActiveSpace, writeLocalMeta, writeLocalState, writeLocalStateWithBaseline } from "../core/storage.js";
import {
  cleanupLegacyWebOriginPermissions,
  hasTopSitesPermission,
  hasWebAccess,
  permissionChangeAffectsTopSites,
  permissionChangeAffectsWebAccess,
  removeSyncConsent,
  requestSyncConsentFromGesture,
  requestTopSitesPermissionFromGesture,
  requestWebAccessFromGesture
} from "../core/permissions.js";
import {
  getEffectiveLocale,
  getLocalePreference,
  localizeDocument,
  populateLanguageSelect,
  setLocalePreference,
  t,
  translateText
} from "../core/i18n.js";
import { canonicalSiteHost, createShortcutHostsAcrossSpacesMemo, formatBytes, manualGridRenderEquivalent, normalizeShortcutUrl, safeShortcutNavigationUrl, sortTopLevelByRecent, visibleTextBottom } from "./ui-utils.js";
import "./builtin-icons.js";
import { devMark, devMeasure, devMetricsEnabled } from "../core/perf.js";
import { installViewportTooltips } from "../core/viewport-tooltip.js";

(() => {
  "use strict";

  const startupTiming = globalThis.__mosaicsyncStartupTiming ||= { version: 1, phases: Object.create(null) };
  startupTiming.version = 1;
  startupTiming.phases ||= Object.create(null);
  const startupPhase = (name, extra = null) => {
    const at = performance.now();
    startupTiming.phases[name] = at;
    if (extra && typeof extra === "object") Object.assign(startupTiming, extra);
    return at;
  };
  const schedulePaintPhase = name => {
    const stamp = () => startupPhase(name);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(stamp));
    else setTimeout(stamp, 0);
  };

  function canReuseBootGridForSession({ sessionAwaitingRemote, bootGridPainted, bootManifest, sessionState } = {}) {
    return !sessionAwaitingRemote && bootGridPainted === true &&
      bootManifest?.version === RENDER_MANIFEST_SCHEMA_VERSION &&
      bootManifest.activeSpaceId === sessionState?.activeSpaceId &&
      Number(bootManifest.updatedAt) === Number(sessionState?.updatedAt) &&
      Number(bootManifest.settingsModifiedAt) === Number(sessionState?.settingsModifiedAt);
  }
  try {
    const supported = globalThis.PerformanceObserver?.supportedEntryTypes || [];
    if (devMetricsEnabled() && supported.includes("longtask")) {
      startupTiming.longTasks ||= { count: 0, totalMs: 0, maxMs: 0 };
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration) || 0;
          startupTiming.longTasks.count += 1;
          startupTiming.longTasks.totalMs += duration;
          startupTiming.longTasks.maxMs = Math.max(startupTiming.longTasks.maxMs, duration);
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      startupTiming.longTaskObserver = observer;
      // Startup diagnostics are intentionally short-lived. Keep the collected
      // summary for local inspection, but stop observing once post-startup jank
      // has had a fair window to appear.
      setTimeout(() => {
        try { observer.disconnect(); } catch {}
        if (startupTiming.longTaskObserver === observer) delete startupTiming.longTaskObserver;
        startupPhase("longTaskWindowEnd");
      }, 3000);
    }
  } catch {}
  startupPhase("moduleStart");
  devMark("newtab:module-start");

  // Prefer the tiny <head> bootstrap, which starts storage.local before this
  // ~480 KB static module graph is parsed. If the disposable early read failed or
  // is unavailable, fall back to the same authoritative core reader as before.
  const earlyLocalBootstrap = globalThis.__mosaicsyncEarlyLocalRead || null;
  try { delete globalThis.__mosaicsyncEarlyLocalRead; } catch {}
  const earlyLocalRawStartedAt = Number.isFinite(earlyLocalBootstrap?.startedAt)
    ? earlyLocalBootstrap.startedAt
    : performance.now();
  const earlyLocalRawPromise = (async () => {
    if (earlyLocalBootstrap?.promise && typeof earlyLocalBootstrap.promise.then === "function") {
      const result = await earlyLocalBootstrap.promise;
      if (result && typeof result === "object") {
        const elapsedMs = performance.now() - earlyLocalRawStartedAt;
        return { raw: { result, timings: { storageMs: elapsedMs } }, elapsedMs };
      }
    }
    const fallbackStartedAt = performance.now();
    const raw = await readLocalStorageRaw();
    return { raw, elapsedMs: performance.now() - fallbackStartedAt };
  })();

  const REMOTE_IMAGE_INPUT_MAX_BYTES = 1_000_000;
  const APPEARANCE_PREVIEW_TARGET_BYTES = 10_000;
  const FAVICON_LOCAL_TARGET_BYTES = 16_000;
  const FAVICON_LOCAL_MAX_SIDE = 192;

  let importerModulePromise = null;
  let profileModulePromise = null;
  let bookmarksModulePromise = null;
  let imageOptimizerModulePromise = null;
  let renderManifestModulePromise = null;
  let registrableDomainModulePromise = null;
  const bootRenderManifest = globalThis.__mosaicsyncBootGrid?.manifest || null;
  const bootArtworkPreviews = new Map();
  const indexBootArtwork = item => {
    if (!item || typeof item !== "object") return;
    if (typeof item.id === "string" && item.id && typeof item.preview === "string" && item.preview) {
      bootArtworkPreviews.set(item.id, { imageKey: String(item.imageKey || ""), preview: item.preview });
    }
    if (item.type === "folder") for (const child of item.items || []) indexBootArtwork(child);
  };
  for (const item of bootRenderManifest?.shortcuts || []) indexBootArtwork(item);
  let bookmarksApi = null;
  const loadImporterModule = () => importerModulePromise ||= import("../core/importer.js");
  const loadProfileModule = () => profileModulePromise ||= import("../core/profile.js");
  const loadImageOptimizerModule = () => imageOptimizerModulePromise ||= import("../core/image-optimizer.js");
  const loadRenderManifestModule = async () => {
    renderManifestModulePromise ||= import("./render-manifest.js");
    const module = await renderManifestModulePromise;
    module.seedRenderManifest(bootRenderManifest);
    return module;
  };
  const loadRegistrableDomainModule = () => registrableDomainModulePromise ||= import("../core/registrable-domain.js");
  const optimizeImageDataUrl = async (...args) => (await loadImageOptimizerModule()).optimizeImageDataUrl(...args);
  const optimizeImageFile = async (...args) => (await loadImageOptimizerModule()).optimizeImageFile(...args);
  const imageBlobToDataUrl = async (...args) => (await loadImageOptimizerModule()).imageBlobToDataUrl(...args);
  async function loadBookmarksModule() {
    if (bookmarksApi) return bookmarksApi;
    bookmarksModulePromise ||= import("../core/bookmarks.js");
    bookmarksApi = await bookmarksModulePromise;
    return bookmarksApi;
  }

  // Translate only the always-visible New Tab shell on startup. Hidden dialogs
  // are localized when opened, avoiding a full hidden-UI tree walk on every tab.
  localizeDocument(document.getElementById("page") || document);
  document.querySelector(".frequent-sites-heading-first-paint-pending")?.classList.remove("frequent-sites-heading-first-paint-pending");
  installViewportTooltips(document, { wrapperSelector: ".sync-help-wrap", tooltipSelector: ".sync-help-tooltip" });

  /*
   * New Tab performance rule:
   * render persisted state first, then defer maintenance work. Firefox's native
   * New Tab is privileged browser UI; a WebExtension cannot beat that privilege,
   * but it can avoid putting Sync/status/image maintenance on the critical path.
   */
  function scheduleIdleWork(task, timeout = 2000) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => { void task(); }, { timeout });
      return;
    }
    setTimeout(() => { void task(); }, Math.min(timeout, 250));
  }

  function ensureSecondaryStyles() {
    const ensure = globalThis.__mosaicsyncEnsureSecondaryStyles;
    if (typeof ensure !== "function") {
      console.error(`${PRODUCT_NAME}: secondary stylesheet loader unavailable`);
      return Promise.resolve(false);
    }
    return ensure();
  }

  const systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  let resolvedSystemTheme = systemThemeMedia.matches ? "dark" : "light";
  const graphemeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const page = document.getElementById("page");
  const appearancePreviewLayer = document.getElementById("appearancePreviewLayer");
  const appearancePreviewImage = document.getElementById("appearancePreviewImage");
  const grid = document.getElementById("shortcutGrid");
  const emptyState = document.getElementById("emptyState");
  const syncPendingState = document.getElementById("syncPendingState");
  const syncPendingChooseSource = document.getElementById("syncPendingChooseSource");
  const syncPendingMessage = document.getElementById("syncPendingMessage");
  const brand = document.querySelector(".brand");
  const spaceSwitcher = document.getElementById("spaceSwitcher");
  const spaceButtons = [...(spaceSwitcher?.querySelectorAll("[data-space-id]") || [])];
  const settingsButton = document.getElementById("settingsButton");
  const bookmarksButton = document.getElementById("bookmarksButton");
  const brandHelloButton = document.getElementById("brandHelloButton");
  const importNativeButton = document.getElementById("importNativeButton");
  const addFirstButton = document.getElementById("addFirstButton");
  const frequentSitesSection = document.getElementById("frequentSitesSection");
  const frequentSitesList = document.getElementById("frequentSitesList");
  const frequentPermissionRecovery = document.getElementById("frequentPermissionRecovery");
  const frequentPermissionRecoveryText = document.getElementById("frequentPermissionRecoveryText");
  const frequentPermissionRecoveryButton = document.getElementById("frequentPermissionRecoveryButton");
  let launcherAuthorityVerified = false;

  function keepLauncherCacheVisualOnly() {
    if (grid) grid.inert = true;
    if (emptyState) emptyState.inert = true;
  }

  function unlockLauncherInteractionIfVerified() {
    if (!launcherAuthorityVerified) return;
    if (grid) grid.inert = false;
    if (emptyState) emptyState.inert = false;
  }

  function discardUnverifiedStartupCaches() {
    // A startup failure must never turn an unverified cache into the fallback UI.
    // If cached launcher/Frequently-Visited content is still inert, discard it and
    // leave the existing error toast to explain that authoritative data did not load.
    if (grid?.inert || emptyState?.inert) {
      grid?.replaceChildren();
      if (grid) grid.hidden = true;
      if (emptyState) emptyState.hidden = true;
    }
    if (frequentSitesSection?.inert) {
      frequentSitesList?.replaceChildren();
      frequentSitesSection.hidden = true;
    }
  }

  const webAccessPrompt = document.getElementById("webAccessPrompt");
  const webAccessPromptAllow = document.getElementById("webAccessPromptAllow");
  const webAccessPromptDismiss = document.getElementById("webAccessPromptDismiss");

  const bookmarksDialog = document.getElementById("bookmarksDialog");
  const bookmarksPermissionState = document.getElementById("bookmarksPermissionState");
  const bookmarksPermissionButton = document.getElementById("bookmarksPermissionButton");
  const bookmarksBrowser = document.getElementById("bookmarksBrowser");
  const bookmarksSearch = document.getElementById("bookmarksSearch");
  const bookmarksCount = document.getElementById("bookmarksCount");
  const bookmarkFolderTree = document.getElementById("bookmarkFolderTree");
  const bookmarkBreadcrumbs = document.getElementById("bookmarkBreadcrumbs");
  const bookmarkFolderCards = document.getElementById("bookmarkFolderCards");
  const bookmarkItems = document.getElementById("bookmarkItems");
  const bookmarksEmpty = document.getElementById("bookmarksEmpty");
  const bookmarksStatus = document.getElementById("bookmarksStatus");

  const shortcutDialog = document.getElementById("shortcutDialog");
  const shortcutForm = document.getElementById("shortcutForm");
  const shortcutDialogTitle = document.getElementById("shortcutDialogTitle");
  const shortcutId = document.getElementById("shortcutId");
  const shortcutTitle = document.getElementById("shortcutTitle");
  const shortcutUrl = document.getElementById("shortcutUrl");
  const shortcutImageFile = document.getElementById("shortcutImageFile");
  const chooseDetectedFavicon = document.getElementById("chooseDetectedFavicon");
  const detectedFaviconPicker = document.getElementById("detectedFaviconPicker");
  const detectedFaviconChoices = document.getElementById("detectedFaviconChoices");
  const detectedFaviconStatus = document.getElementById("detectedFaviconStatus");
  const chooseBuiltinShortcutIcon = document.getElementById("chooseBuiltinShortcutIcon");
  const shortcutBuiltinIconPicker = document.getElementById("shortcutBuiltinIconPicker");
  const shortcutColorPicker = document.getElementById("shortcutColorPicker");
  const shortcutImageUrl = document.getElementById("shortcutImageUrl");
  const useShortcutImageUrl = document.getElementById("useShortcutImageUrl");
  const shortcutSyncImage = document.getElementById("shortcutSyncImage");
  const shortcutSyncImageRow = document.getElementById("shortcutSyncImageRow");
  const shortcutSyncImageHint = document.getElementById("shortcutSyncImageHint");
  const shortcutImageHint = document.getElementById("shortcutImageHint");
  const shortcutImageStyle = document.getElementById("shortcutImageStyle");
  const shortcutSpaceField = document.getElementById("shortcutSpaceField");
  const shortcutSpaceChoice = document.getElementById("shortcutSpaceChoice");
  const shortcutSpaceButtons = [...(shortcutSpaceChoice?.querySelectorAll("[data-shortcut-space]") || [])];
  const clearShortcutImage = document.getElementById("clearShortcutImage");
  const imagePreview = document.getElementById("imagePreview");
  const deleteShortcutButton = document.getElementById("deleteShortcutButton");

  const settingsDialog = document.getElementById("settingsDialog");
  const settingsForm = document.getElementById("settingsForm");
  const settingsColumns = document.getElementById("settingsColumns");
  const settingsRows = document.getElementById("settingsRows");
  const themeToggle = document.getElementById("themeToggle");
  const settingsTileSize = document.getElementById("settingsTileSize");
  const settingsTileSizeValue = document.getElementById("settingsTileSizeValue");
  const settingsLanguage = document.getElementById("settingsLanguage");
  const settingsShortcutOrder = document.getElementById("settingsShortcutOrder");
  const settingsShortcutOrderHint = document.getElementById("settingsShortcutOrderHint");
  const settingsMultipleSpaces = document.getElementById("settingsMultipleSpaces");
  const settingsSpaceNames = document.getElementById("settingsSpaceNames");
  const settingsPersonalSpaceName = document.getElementById("settingsPersonalSpaceName");
  const settingsWorkSpaceName = document.getElementById("settingsWorkSpaceName");
  const settingsWorkSpaceNameRow = document.getElementById("settingsWorkSpaceNameRow");
  const settingsDefaultSpace = document.getElementById("settingsDefaultSpace");
  const settingsDefaultSpaceLabel = document.getElementById("settingsDefaultSpaceLabel");
  const settingsSpaceKeyboardHint = document.getElementById("settingsSpaceKeyboardHint");
  const settingsFrequentlyVisited = document.getElementById("settingsFrequentlyVisited");
  const settingsFrequentlyVisitedDescription = document.getElementById("settingsFrequentlyVisitedDescription");
  const settingsFrequentlyVisitedCount = document.getElementById("settingsFrequentlyVisitedCount");
  const settingsFrequentlyVisitedCountLabel = document.getElementById("settingsFrequentlyVisitedCountLabel");
  const frequentOptions = document.getElementById("frequentOptions");
  const frequentCountRow = document.getElementById("frequentCountRow");
  const frequentlyVisitedStatus = document.getElementById("frequentlyVisitedStatus");
  const frequentlyVisitedPermissionButton = document.getElementById("frequentlyVisitedPermissionButton");
  const exportProfileButton = document.getElementById("exportProfileButton");
  const importProfileButton = document.getElementById("importProfileButton");
  const importProfileFile = document.getElementById("importProfileFile");
  const settingsAutoSiteIcons = document.getElementById("settingsAutoSiteIcons");
  const settingsWebAccessStatus = document.getElementById("settingsWebAccessStatus");
  const settingsWebAccessButton = document.getElementById("settingsWebAccessButton");
  const settingsBackgroundColorButton = document.getElementById("settingsBackgroundColorButton");
  const settingsBackgroundColorSwatch = document.getElementById("settingsBackgroundColorSwatch");
  const backgroundColorPopover = document.getElementById("backgroundColorPopover");
  const backgroundColorControl = settingsBackgroundColorButton?.closest(".background-color-control") || null;
  const backgroundColorPlane = document.getElementById("backgroundColorPlane");
  const backgroundColorThumb = document.getElementById("backgroundColorThumb");
  const backgroundColorHue = document.getElementById("backgroundColorHue");
  const backgroundColorHex = document.getElementById("backgroundColorHex");
  const backgroundColorApply = document.getElementById("backgroundColorApply");
  const settingsBackgroundFile = document.getElementById("settingsBackgroundFile");
  const clearBackgroundImage = document.getElementById("clearBackgroundImage");
  const settingsBackgroundDim = document.getElementById("settingsBackgroundDim");
  const settingsBackgroundDimValue = document.getElementById("settingsBackgroundDimValue");
  const backgroundDimControls = document.getElementById("backgroundDimControls");
  const settingsThemeWallpapers = document.getElementById("settingsThemeWallpapers");
  const settingsThemeWallpapersLabel = document.getElementById("settingsThemeWallpapersLabel");
  const settingsThemeWallpapersDescription = document.getElementById("settingsThemeWallpapersDescription");
  const themeWallpaperChoices = document.getElementById("themeWallpaperChoices");
  const settingsLightWallpaper = document.getElementById("settingsLightWallpaper");
  const settingsDarkWallpaper = document.getElementById("settingsDarkWallpaper");
  const settingsLightWallpaperLabel = document.getElementById("settingsLightWallpaperLabel");
  const settingsDarkWallpaperLabel = document.getElementById("settingsDarkWallpaperLabel");
  const settingsLightWallpaperValue = document.getElementById("settingsLightWallpaperValue");
  const settingsDarkWallpaperValue = document.getElementById("settingsDarkWallpaperValue");
  const settingsLightWallpaperPreview = document.getElementById("settingsLightWallpaperPreview");
  const settingsDarkWallpaperPreview = document.getElementById("settingsDarkWallpaperPreview");
  const settingsLightWallpaperDim = document.getElementById("settingsLightWallpaperDim");
  const settingsDarkWallpaperDim = document.getElementById("settingsDarkWallpaperDim");
  const settingsLightWallpaperDimValue = document.getElementById("settingsLightWallpaperDimValue");
  const settingsDarkWallpaperDimValue = document.getElementById("settingsDarkWallpaperDimValue");
  const settingsLightWallpaperDimLabel = document.getElementById("settingsLightWallpaperDimLabel");
  const settingsDarkWallpaperDimLabel = document.getElementById("settingsDarkWallpaperDimLabel");
  const backgroundPresetGrid = document.getElementById("backgroundPresetGrid");
  const moreWallpapersButton = document.getElementById("moreWallpapersButton");
  const wallpaperGalleryDialog = document.getElementById("wallpaperGalleryDialog");
  const wallpaperGalleryGrid = document.getElementById("wallpaperGalleryGrid");
  const resetBackground = document.getElementById("resetBackground");
  const settingsImportNative = document.getElementById("settingsImportNative");
  const settingsRunSetup = document.getElementById("settingsRunSetup");
  const settingsDonateButton = document.getElementById("settingsDonateButton");
  const settingsTipsLink = document.getElementById("settingsTipsLink");
  const settingsSupportLink = document.getElementById("settingsSupportLink");

  const settingsSyncEnabled = document.getElementById("settingsSyncEnabled");
  const syncStatusDot = document.getElementById("syncStatusDot");
  const syncStatusText = document.getElementById("syncStatusText");
  const syncStatusDetail = document.getElementById("syncStatusDetail");
  const syncQuotaText = document.getElementById("syncQuotaText");
  const syncRevisionLabel = document.getElementById("syncRevisionLabel");
  const syncRevisionText = document.getElementById("syncRevisionText");
  const syncStorageBreakdown = document.querySelector(".sync-storage-breakdown");
  const syncUsageCore = document.getElementById("syncUsageCore");
  const syncUsageRecovery = document.getElementById("syncUsageRecovery");
  const syncUsageShortcuts = document.getElementById("syncUsageShortcuts");
  const syncUsageOverhead = document.getElementById("syncUsageOverhead");
  const syncUsageFree = document.getElementById("syncUsageFree");
  const sendToSyncButton = document.getElementById("sendToSyncButton");
  const restoreSyncButton = document.getElementById("restoreSyncButton");
  const syncActionStatus = document.getElementById("syncActionStatus");
  const clearSyncButton = document.getElementById("clearSyncButton");
  const syncSetupCard = document.getElementById("syncSetupCard");
  const syncSetupDetail = document.getElementById("syncSetupDetail");
  const useThisDeviceButton = document.getElementById("useThisDeviceButton");
  const useSyncedCopyButton = document.getElementById("useSyncedCopyButton");

  const dropChoice = document.getElementById("dropChoice");
  const dropMoveButton = document.getElementById("dropMoveButton");
  const dropFolderButton = document.getElementById("dropFolderButton");

  const folderPopover = document.getElementById("folderPopover");
  const folderTitleInput = document.getElementById("folderTitleInput");
  const closeFolderButton = document.getElementById("closeFolderButton");
  const folderItems = document.getElementById("folderItems");
  const folderCount = document.getElementById("folderCount");
  const openAllFolderButton = document.getElementById("openAllFolderButton");
  const ungroupFolderButton = document.getElementById("ungroupFolderButton");
  const toast = document.getElementById("toast");

  let state = normalizeState(DEFAULT_STATE);
  let writeBaseline = null;
  let meta = null;
  let pendingShortcutImage = "";
  let pendingShortcutSyncData = "";
  let pendingShortcutImageKind = "none";
  let pendingShortcutImageSourceKind = "none";
  let pendingShortcutImageSourceUrl = "";
  let pendingShortcutFaviconPreference = "";
  let pendingShortcutImageIsFallback = false;
  let pendingShortcutBuiltinIcon = "";
  let pendingShortcutColorTag = "";
  let shortcutArtworkEdited = false;
  let shortcutSyncPrepareGeneration = 0;
  let backgroundUploadGeneration = 0;
  let systemThemeResolutionGeneration = 0;
  let detectedFaviconGeneration = 0;
  let detectedFaviconPickerUrl = "";
  let detectedFaviconRequestId = "";
  let pendingBackgroundImage = "";
  let pendingBackgroundSourceKind = "none";
  let pendingBackgroundSourceUrl = "";
  let pendingBackgroundPreset = "";
  let pendingBackgroundColorCustomized = false;
  let dragId = null;
  let crossSpaceDrag = null;
  let crossSpaceHoverTimer = null;
  let crossSpaceDragPreserverEl = null;
  let editingSourceSpaceId = "personal";
  let editingDestinationSpaceId = "personal";
  let folderDragId = null;
  let folderDragMoved = false;
  let suppressFolderClickUntil = 0;
  let backgroundPersistTimer = null;
  let deferredAppearanceVisual = false;
  let deferredLauncherSettings = false;
  let deferredLauncherRender = false;
  let deferredSettingsControlRefresh = false;
  const pendingSettingsDraft = new Map();
  let wallpaperGalleryTarget = "main";
  let pendingDrop = null;
  let activeFolderId = null;
  let activeFolderAnchorId = null;
  let bookmarkTree = [];
  let bookmarkFolders = [];
  let bookmarkAllItems = [];
  let activeBookmarkFolderId = "all";
  let editingParentFolderId = null;
  let editingPreferredPosition = null;
  let toastTimer = null;
  let syncFeedbackTimer = null;
  let lastSyncStatus = null;
  let settingsSyncReconcilePromise = null;
  let syncWaitNoticeTimer = null;
  let colorPickerHue = 275;
  let colorPickerSaturation = 1;
  let colorPickerValue = 0.31;
  let colorPlaneDragging = false;
  let colorPlaneRect = null;
  let stateMutationGeneration = 0;
  let metaMutationGeneration = 0;
  let persistedStateChangeGeneration = 0;
  let webAccessGranted = false;
  let lastAppearanceHintSerialized = null;
  let renderManifestGeneration = 0;
  let bootGridNeedsAuthoritativeRender = false;
  let frequentlyVisitedEnabled = false;
  let frequentlyVisitedCount = 5;
  let frequentlyVisitedStatusKey = "frequentHidden";
  let frequentRefreshTimer = null;
  let frequentRefreshGeneration = 0;
  let frequentCandidateCacheAt = 0;
  let frequentCandidateCache = [];
  let hiddenFrequentDomains = new Set();
  let frequentDragSite = null;
  let frequentRenderSnapshot = bootRenderManifest?.firstPaint?.frequent || null;
  const frequentExplicitHostsForState = createShortcutHostsAcrossSpacesMemo();
  let spaceSwitchGeneration = 0;
  let activeSpacePersistQueue = Promise.resolve();
  let deviceDefaultSpace = "last";
  let bookmarkFolderColors = {};
  let shortcutOrderMode = "manual";
  let shortcutUsage = Object.create(null);
  let recentOrderRenderTimer = null;
  let frequentContextMenu = null;
  let bookmarkColorMenu = null;
  const backgroundPreloadCache = new Map();
  const BOOKMARK_FOLDER_COLOR_PALETTE = Object.freeze({
    violet: "#8b5cf6", blue: "#3b82f6", teal: "#14b8a6", green: "#10b981",
    amber: "#f59e0b", red: "#ef4444", pink: "#ec4899"
  });

  // ---------------------------------------------------------------------------
  // Startup and persisted state
  // ---------------------------------------------------------------------------
  const startupStartedAt = performance.now();
  let pageshowPersisted = false;
  let renderReadyScheduled = false;
  let lastForegroundSyncRequestAt = 0;
  let foregroundSyncRequestInFlight = false;

  function maybeForegroundSyncReconcile() {
    if (document.visibilityState !== "visible" || !meta?.syncEnabled || !meta?.syncInitialized) return false;
    const requestedAt = performance.now();
    if (foregroundSyncRequestInFlight || requestedAt - lastForegroundSyncRequestAt < SYNC_FOREGROUND_CHECK_MIN_INTERVAL_MS) return false;
    lastForegroundSyncRequestAt = requestedAt;
    foregroundSyncRequestInFlight = true;
    void sendSyncMessage("mosaicsync:reconcile-if-needed", { reason: "foreground" })
      .catch(() => {})
      .finally(() => { foregroundSyncRequestInFlight = false; });
    return true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeForegroundSyncReconcile();
  });
  window.addEventListener("focus", () => {
    maybeForegroundSyncReconcile();
  });
  window.addEventListener("pageshow", event => {
    pageshowPersisted = event.persisted === true;
    if (pageshowPersisted) maybeForegroundSyncReconcile();
    if (pageshowPersisted && devMetricsEnabled()) {
      console.debug(`${PRODUCT_NAME} ${VERSION} performance`, {
        event: "bfcache-restore",
        persisted: true,
        elapsedMs: Number((performance.now() - startupStartedAt).toFixed(2))
      });
    }
  });

  function scheduleRenderReady() {
    if (renderReadyScheduled || document.documentElement.dataset.renderReady === "true") return;
    renderReadyScheduled = true;
    requestAnimationFrame(() => {
      document.documentElement.dataset.renderReady = "true";
    });
  }

  function quickBackgroundIdentity(settings = state?.settings) {
    if (!settings) return "none";
    const effectivePresetId = effectiveBackgroundPresetId(settings);
    if (effectivePresetId && BACKGROUND_PRESETS[effectivePresetId]) {
      return `preset:${effectivePresetId}`;
    }
    const image = effectiveBackgroundImageValue(settings);
    if (!image) return "none";
    // This identity only decides whether a tiny disposable preview can be reused;
    // it is not a content/security hash. Sample a handful of characters instead
    // of synchronously hashing a potentially megabyte-sized wallpaper.
    let hash = 0x811c9dc5;
    const samples = 12;
    for (let index = 0; index < samples; index += 1) {
      const offset = Math.min(image.length - 1, Math.floor(index * Math.max(1, image.length - 1) / Math.max(1, samples - 1)));
      hash ^= image.charCodeAt(offset) || 0;
      hash = Math.imul(hash, 0x01000193);
    }
    return `custom:${image.length}:${(hash >>> 0).toString(36)}`;
  }

  function readAppearanceHint() {
    try {
      const raw = localStorage.getItem(APPEARANCE_HINT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function persistAppearanceHint(settings = state?.settings, { backgroundPreview = null } = {}) {
    if (!settings) return;
    const identity = quickBackgroundIdentity(settings);
    const preset = BACKGROUND_PRESETS[effectiveBackgroundPresetId(settings)];
    const existing = readAppearanceHint();
    const canReusePreview = !preset && existing?.backgroundIdentity === identity &&
      typeof existing?.backgroundPreview === "string";
    const preview = preset ? "" : (backgroundPreview ?? (canReusePreview ? existing.backgroundPreview : ""));
    const serialized = JSON.stringify({
      // Persist the darkness that belongs to the wallpaper actually being
      // shown. Older hints still contain the legacy shared value and remain a
      // safe first-paint fallback during the one-time 1.26.17.2 migration.
      backgroundDim: effectiveBackgroundDimForTheme(settings, effectiveThemeFor(settings)),
      backgroundColor: validHex(settings.backgroundColor) ? settings.backgroundColor : DEFAULT_STATE.settings.backgroundColor,
      backgroundColorCustomized: settings.backgroundColorCustomized === true,
      theme: ["system", "dark", "light"].includes(settings.theme) ? settings.theme : "system",
      effectiveTheme: effectiveThemeFor(settings),
      defaultLightBackgroundColor: DEFAULT_LIGHT_BACKGROUND_COLOR,
      backgroundIdentity: identity,
      backgroundPresetFile: preset?.file || "",
      backgroundPreview: typeof preview === "string" && preview.length <= 48_000 ? preview : ""
    });
    if (serialized === lastAppearanceHintSerialized) return;
    try {
      localStorage.setItem(APPEARANCE_HINT_KEY, serialized);
      lastAppearanceHintSerialized = serialized;
    } catch {
      // Web Storage is only a synchronous first-paint hint. storage.local remains
      // authoritative and MosaicSync must work normally if this cache is blocked.
    }
  }

  async function refreshAppearancePreview(settingsSnapshot) {
    const image = effectiveBackgroundImageValue(settingsSnapshot);
    if (!image || effectiveBackgroundPresetId(settingsSnapshot)) return;
    const identity = quickBackgroundIdentity(settingsSnapshot);
    const existing = readAppearanceHint();
    if (existing?.backgroundIdentity === identity && existing?.backgroundPreview) return;

    try {
      const preview = await optimizeImageDataUrl(image, {
        maxWidth: 480,
        maxHeight: 270,
        minWidth: 160,
        minHeight: 90,
        targetBytes: APPEARANCE_PREVIEW_TARGET_BYTES,
        initialQuality: 0.72
      });
      if (quickBackgroundIdentity(state.settings) !== identity) return;
      persistAppearanceHint(state.settings, { backgroundPreview: preview });
    } catch {
      // A preview is a performance nicety only. Never let it affect the real
      // wallpaper or the authoritative persistent state.
    }
  }

  function scheduleAppearanceHintRefresh(settings = state?.settings) {
    // A lightweight session render snapshot deliberately omits the real custom
    // wallpaper. Never let that projection overwrite a valid synchronous preview.
    if (settings?.backgroundImageDeferred === true) return;
    const snapshot = settings ? { ...settings } : null;
    if (!snapshot) return;
    setTimeout(() => {
      persistAppearanceHint(snapshot);
      if (effectiveBackgroundImageValue(snapshot) && !effectiveBackgroundPresetId(snapshot)) {
        scheduleIdleWork(() => refreshAppearancePreview(snapshot), 1800);
      }
    }, 0);
  }

  function sessionRenderCoreMatchesState(sessionSnapshot, currentState) {
    if (!sessionSnapshot || typeof sessionSnapshot !== "object" || !currentState) return false;
    try {
      // Reuse the session-owned device-local FV projection only to remove that
      // field from this comparison. Every structural/Space/artwork field must
      // match the shared session truth before this page may rewrite localStorage.
      const candidate = createRenderSnapshot(currentState, {
        frequentSnapshot: sessionSnapshot.firstPaint?.frequent ?? null
      });
      return stableStringify(candidate) === stableStringify(sessionSnapshot);
    } catch {
      return false;
    }
  }

  async function sharedSessionCoreMatchesState(currentState, { retryOnce = false } = {}) {
    const readShared = async () => {
      const result = await browser.storage.session?.get?.(SESSION_RENDER_STATE_KEY);
      return result?.[SESSION_RENDER_STATE_KEY] || null;
    };
    let shared = await readShared();
    if (!sessionRenderCoreMatchesState(shared, currentState) && retryOnce) {
      // A storage.local commit and its session projection are separate IPC
      // operations. Give the persistence boundary one short chance to publish
      // before withholding this disposable page-owned cache.
      await new Promise(resolve => setTimeout(resolve, 24));
      shared = await readShared();
    }
    return sessionRenderCoreMatchesState(shared, currentState);
  }

  function pageManifestStateStillCurrent(stateSnapshot, generation = null) {
    return (generation === null || generation === renderManifestGeneration) &&
      state.activeSpaceId === stateSnapshot.activeSpaceId &&
      Number(state.updatedAt) === Number(stateSnapshot.updatedAt) &&
      Number(state.settingsModifiedAt) === Number(stateSnapshot.settingsModifiedAt);
  }

  function scheduleRenderManifestRefresh(currentState = state, currentMeta = meta) {
    const stateSnapshot = currentState;
    const metaSnapshot = currentMeta;
    setTimeout(() => {
      void (async () => {
        try {
          // Step 2 ownership rule: storage.session is the cross-context fast
          // structural truth. Every runtime localStorage manifest publication,
          // including preview refreshes below, is gated by that same truth.
          if (!(await sharedSessionCoreMatchesState(stateSnapshot, { retryOnce: true }))) return;
          const module = await loadRenderManifestModule();
          if (!pageManifestStateStillCurrent(stateSnapshot)) return;
          if (!(await sharedSessionCoreMatchesState(stateSnapshot))) return;
          module.persistRenderManifest(stateSnapshot, metaSnapshot, null, null);
        } catch {}
      })();
    }, 0);
  }

  function warmFirstPaintSessionCache(currentState = state, currentMeta = meta) {
    // Full session snapshots are published only from authoritative startup or
    // persistence boundaries. Routine page presentation refreshes patch their
    // own fields and never republish a stale Space/grid snapshot.
    return warmSessionRenderCache(currentState, currentMeta, { frequentSnapshot: frequentRenderSnapshot });
  }

  function refreshFirstPaintCaches(currentState = state, currentMeta = meta) {
    scheduleRenderManifestRefresh(currentState, currentMeta);
  }

  function scheduleRenderPreviewRefresh(currentState = state, currentMeta = meta) {
    const generation = ++renderManifestGeneration;
    const stateSnapshot = currentState;
    const metaSnapshot = currentMeta;
    scheduleIdleWork(async () => {
      try {
        const module = await loadRenderManifestModule();
        await module.refreshRenderManifestPreviews(stateSnapshot, metaSnapshot, {
          shouldCommit: async () => pageManifestStateStillCurrent(stateSnapshot, generation) &&
            await sharedSessionCoreMatchesState(stateSnapshot)
        });
      } catch {}
    }, 900);
  }

  function refreshRenderManifestAfterArtworkChange(currentState = state, currentMeta = meta) {
    const generation = ++renderManifestGeneration;
    const stateSnapshot = currentState;
    const metaSnapshot = currentMeta;
    void loadRenderManifestModule().then(async module => {
      try {
        // Do not first publish a manifest that knows about new artwork but lacks
        // its tiny preview. Generate/reuse the preview first. The manifest module
        // asks this shared-session ownership guard immediately before committing,
        // so an older open tab cannot overwrite a newer structural projection.
        const refreshed = await module.refreshRenderManifestPreviews(stateSnapshot, metaSnapshot, {
          shouldCommit: async () => pageManifestStateStillCurrent(stateSnapshot, generation) &&
            await sharedSessionCoreMatchesState(stateSnapshot)
        });
        if (refreshed || !pageManifestStateStillCurrent(stateSnapshot, generation)) return;
        if (!(await sharedSessionCoreMatchesState(stateSnapshot))) return;
        module.persistRenderManifest(stateSnapshot, metaSnapshot, null, null);
      } catch {}
    }).catch(() => {});
  }

  let deferredBackgroundHydrationGeneration = 0;
  function scheduleDeferredBackgroundHydration() {
    if (state?.settings?.backgroundImageDeferred !== true || !state.settings.backgroundLocalAssetId) return;
    const generation = ++deferredBackgroundHydrationGeneration;
    const spaceId = state.activeSpaceId;
    const assetId = state.settings.backgroundLocalAssetId;
    const updatedAt = Number(state.updatedAt) || 0;
    const settingsModifiedAt = Number(state.settingsModifiedAt) || 0;

    requestAnimationFrame(() => {
      void hydrateBackgroundLocalAssetNormalized(state, spaceId).then(hydrated => {
        if (generation !== deferredBackgroundHydrationGeneration || state.activeSpaceId !== spaceId) return;
        if (Number(state.updatedAt) !== updatedAt || Number(state.settingsModifiedAt) !== settingsModifiedAt) return;
        if (state.settings?.backgroundLocalAssetId !== assetId || state.settings?.backgroundImageDeferred !== true) return;
        if (!hydrated?.settings?.backgroundImage) return;
        state = hydrated;
        applyPageBackgroundVisual();
        scheduleAppearanceHintRefresh(state.settings);
      }).catch(() => {});
    });
  }

  function bootGridMatchesState(currentState) {
    const manifest = bootRenderManifest;
    if (!manifest || manifest.version !== RENDER_MANIFEST_SCHEMA_VERSION || document.documentElement.dataset.bootGrid !== "true") return false;
    if (isAwaitingRemote(meta)) return false;
    if (manifest.activeSpaceId !== currentState.activeSpaceId ||
        Number(manifest.updatedAt) !== Number(currentState.updatedAt) ||
        Number(manifest.settingsModifiedAt) !== Number(currentState.settingsModifiedAt)) return false;
    if (Number(manifest.columns) !== Number(currentState.settings.columns) ||
        Number(manifest.rows) !== Number(currentState.settings.rows) ||
        Number(manifest.tileSize) !== Number(currentState.settings.tileSize) ||
        Boolean(manifest.brandVisible !== false) !== Boolean(currentState.settings.brandVisible !== false)) return false;
    const capacity = currentState.settings.columns * currentState.settings.rows;
    const slots = [...grid.children];
    if (slots.length !== capacity) return false;
    const byPosition = shortcutOrderMode === "recent"
      ? new Map(recentGridItems(capacity).map((item, index) => [index, item]))
      : new Map(currentState.shortcuts.map(item => [item.position, item]));
    const manifestById = new Map((manifest.shortcuts || []).map(item => [item?.id, item]));
    for (let position = 0; position < capacity; position += 1) {
      const slot = slots[position];
      const item = byPosition.get(position);
      if (!slot) return false;
      if (!item) {
        if (!slot.classList.contains("empty-slot")) return false;
        continue;
      }
      if (slot.dataset.id !== item.id) return false;
      const card = slot.querySelector(":scope > .shortcut-card");
      const label = card?.querySelector?.(":scope > .shortcut-label");
      if (!card || !label) return false;
      if (item.type === "folder") {
        if (!slot.classList.contains("folder-slot") || !card.classList.contains("folder-card")) return false;
        if (label.textContent !== (item.title || "Folder")) return false;
        const cells = [...card.querySelectorAll(".folder-mosaic-cell")];
        const expectedChildren = (item.items || []).slice(0, 4);
        const cachedChildren = Array.isArray(manifestById.get(item.id)?.items) ? manifestById.get(item.id).items : [];
        if (cells.length !== expectedChildren.length || cachedChildren.length !== expectedChildren.length) return false;
        for (let index = 0; index < expectedChildren.length; index += 1) {
          const expectedChild = expectedChildren[index];
          const cachedChild = cachedChildren[index];
          if (cells[index]?.dataset?.id !== expectedChild?.id || cachedChild?.id !== expectedChild?.id) return false;
          if (String(cachedChild?.title || "") !== String(expectedChild?.title || "")) return false;
          const expectedUrl = shortcutNavigationUrl(expectedChild);
          const cachedUrl = safeShortcutNavigationUrl(cachedChild?.url);
          if (!expectedUrl || cachedUrl !== expectedUrl) return false;
        }
      } else {
        if (slot.classList.contains("folder-slot") || card.classList.contains("folder-card")) return false;
        if (label.textContent !== item.title) return false;
        const expectedUrl = shortcutNavigationUrl(item);
        if (!expectedUrl || card.getAttribute("href") !== expectedUrl) return false;
      }
    }
    return true;
  }

  function adoptBootGridInPlace() {
    if (!bootGridMatchesState(state)) return false;
    const capacity = state.settings.columns * state.settings.rows;
    const byPosition = shortcutOrderMode === "recent"
      ? new Map(recentGridItems(capacity).map((item, index) => [index, item]))
      : new Map(state.shortcuts.map(item => [item.position, item]));
    const slots = [...grid.children];
    const changedShortcutIds = new Set();
    const changedFolderIds = new Set();
    for (let position = 0; position < capacity; position += 1) {
      const slot = slots[position];
      const item = byPosition.get(position);
      if (!item) {
        // Empty bootstrap slots intentionally omit editing/drag affordances. They
        // have no decoded artwork worth preserving, so upgrade only these nodes.
        slot.replaceWith(createEmptySlot(position));
        continue;
      }
      if (item.type === "folder") {
        if (!configureFolderSlotInteractions(slot, item)) return false;
        changedFolderIds.add(item.id);
      } else {
        if (!configureShortcutSlotInteractions(slot, item)) return false;
        changedShortcutIds.add(item.id);
      }
    }
    grid.hidden = state.shortcuts.length === 0;
    emptyState.hidden = state.shortcuts.length !== 0;
    patchVisibleShortcutArtwork(changedShortcutIds, changedFolderIds);
    document.documentElement.dataset.bootGridAdopted = "true";
    bootGridNeedsAuthoritativeRender = false;
    unlockLauncherInteractionIfVerified();
    startupPhase("bootGridAdopted");
    return true;
  }

  let deferredFolderHydrationGeneration = 0;
  function scheduleDeferredFolderHydration() {
    const generation = ++deferredFolderHydrationGeneration;
    const spaceId = state.activeSpaceId;
    const updatedAt = Number(state.updatedAt) || 0;
    scheduleIdleWork(async () => {
      try {
        const yieldBetween = () => new Promise(resolve => {
          const resume = () => resolve();
          if (typeof requestIdleCallback === "function") requestIdleCallback(resume, { timeout: 180 });
          else setTimeout(resume, 16);
        });
        const hydrated = await hydrateDeferredFolderLocalAssetsNormalized(state, spaceId, 4, {
          batchSize: 12,
          yieldBetween,
          onBatch: async partial => {
            if (generation !== deferredFolderHydrationGeneration || state.activeSpaceId !== spaceId || Number(state.updatedAt) !== updatedAt) {
              throw new Error("DEFERRED_FOLDER_HYDRATION_CANCELLED");
            }
            // Make already-fetched pixels available incrementally without forcing
            // the closed main grid to rerender. If the user opens a folder while
            // idle hydration is progressing, its current batch is immediately usable.
            state = partial;
            if (activeFolderId && !folderPopover.hidden) {
              const folder = getTopLevelItem(activeFolderId);
              if (folder?.type === "folder") renderFolderContents(folder);
            }
          }
        });
        if (generation !== deferredFolderHydrationGeneration || state.activeSpaceId !== spaceId || Number(state.updatedAt) !== updatedAt) return;
        state = hydrated;
        startupPhase("deferredFolderArtworkReady");
      } catch (error) {
        if (error?.message !== "DEFERRED_FOLDER_HYDRATION_CANCELLED") return;
      }
    }, 700);
  }

  function paintLoadedState(loaded, diagnostics, { deferHeavyAssets = false, reuseBootGrid = false, adoptBootGrid = false } = {}) {
    state = loaded.state;
    meta = loaded.meta;
    if (state?.firstPaint?.frequent) {
      frequentRenderSnapshot = state.firstPaint.frequent;
      // A fresh session snapshot may be newer than the synchronous Web Storage
      // manifest (for example after a remote preference change while no New Tab
      // was alive). Reconcile that tiny presentation field immediately rather
      // than waiting for post-paint Top Sites maintenance.
      renderFrequentlyVisited(frequentRenderSnapshot.sites || [], {
        authoritative: false,
        enabled: frequentRenderSnapshot.enabled === true,
        count: frequentRenderSnapshot.count
      });
    }

    const settingsStartedAt = performance.now();
    applySettings({ deferHeavyAssets });
    diagnostics.applySettingsMs = performance.now() - settingsStartedAt;

    const renderStartedAt = performance.now();
    if (adoptBootGrid && adoptBootGridInPlace()) {
      diagnostics.bootGridReused = true;
      diagnostics.bootGridAdopted = true;
    } else if (reuseBootGrid) {
      bootGridNeedsAuthoritativeRender = true;
      diagnostics.bootGridReused = true;
    } else {
      render();
    }
    diagnostics.renderMs = performance.now() - renderStartedAt;
    updateSyncUi(meta);
    updateSpaceSwitcher();
    diagnostics.firstUsableMs = performance.now() - startupStartedAt;
    scheduleRenderReady();
    scheduleAppearanceHintRefresh(state.settings);
    refreshFirstPaintCaches(state, meta);
    scheduleRenderPreviewRefresh(state, meta);
  }

  function stateVisualHydrationSignature(value) {
    const parts = [
      String(value?.settings?.backgroundAssetId || ""),
      String(value?.settings?.backgroundImage?.length || 0)
    ];
    for (const item of value?.shortcuts || []) {
      parts.push(
        item.id,
        String(item.builtinIcon || ""),
        String(item.colorTag || ""),
        String(item.imageAssetId || ""),
        String(item.image?.length || 0),
        String(item.imageSyncData?.length || 0)
      );
      if (item.type === "folder") {
        for (const child of item.items || []) {
          parts.push(
            child.id,
            String(child.builtinIcon || ""),
            String(child.colorTag || ""),
            String(child.imageAssetId || ""),
            String(child.image?.length || 0),
            String(child.imageSyncData?.length || 0)
          );
        }
      }
    }
    return parts.join("|");
  }

  function reconcileAuthoritativeLocal(loaded, stateGenerationAtRead, metaGenerationAtRead) {
    if (!loaded.meta.onboardingCompleted) {
      window.location.replace(browser.runtime.getURL("welcome/welcome.html"));
      return false;
    }
    launcherAuthorityVerified = true;

    // The persistent read started before a possible session-cache paint. If an
    // actual storage/UI mutation lands while that read is in flight, never let
    // the older read snapshot overwrite the newer in-page state.
    const chosenState = stateMutationGeneration === stateGenerationAtRead ? loaded.state : state;
    const chosenMeta = metaMutationGeneration === metaGenerationAtRead ? loaded.meta : meta;

    const stateChanged =
      Number(chosenState.updatedAt) !== Number(state.updatedAt) ||
      Number(chosenState.settingsModifiedAt) !== Number(state.settingsModifiedAt) ||
      chosenState.schemaVersion !== state.schemaVersion ||
      stateVisualHydrationSignature(chosenState) !== stateVisualHydrationSignature(state) ||
      !manualGridRenderEquivalent(chosenState, state);
    const metaChanged = stableStringify(chosenMeta) !== stableStringify(meta);
    const wasAwaitingRemote = isAwaitingRemote(meta);

    const previousFrequentEnabled = frequentlyVisitedEnabled;
    const previousFrequentCount = frequentlyVisitedCount;
    state = chosenState;
    meta = chosenMeta;
    applyPendingSettingsDraft();
    syncFrequentlyVisitedLocalsFromState(state);
    refreshSettingsControlsAfterExternalState();
    if (previousFrequentEnabled !== frequentlyVisitedEnabled || previousFrequentCount !== frequentlyVisitedCount) {
      if (settingsFrequentlyVisited) settingsFrequentlyVisited.checked = frequentlyVisitedEnabled;
      if (settingsFrequentlyVisitedCount) settingsFrequentlyVisitedCount.value = String(frequentlyVisitedCount);
      setFrequentlyVisitedOptionsVisibility(frequentlyVisitedEnabled);
      scheduleFrequentlyVisitedRefresh(0);
    }
    updateSpaceSwitcher();

    if (stateChanged) {
      applySettings({ deferHeavyAssets: state.settings?.backgroundImageDeferred === true });
      scheduleAppearanceHintRefresh(state.settings);
      refreshFirstPaintCaches(state, meta);
    }
    const awaitingChanged = wasAwaitingRemote !== isAwaitingRemote(meta);
    if (stateChanged || awaitingChanged || bootGridNeedsAuthoritativeRender) {
      const adopted = bootGridNeedsAuthoritativeRender && !awaitingChanged && adoptBootGridInPlace();
      if (!adopted) render();
      bootGridNeedsAuthoritativeRender = false;
    }
    if (stateChanged) scheduleRenderPreviewRefresh(state, meta);
    if (metaChanged) updateSyncUi(meta);
    unlockLauncherInteractionIfVerified();
    return true;
  }

  function requestMissingSiteIcons(shortcutIds = [], { force = false, upgradeRecoveredFavicons = false } = {}) {
    if (!state.settings.autoSiteIcons) return;
    // The background service performs the actual optional-permission check. Do
    // not let a stale UI-side permission cache suppress an otherwise valid
    // automatic hydration request.
    void sendSyncMessage("mosaicsync:hydrate-missing-icons", { shortcutIds, force, upgradeRecoveredFavicons }).catch(() => {});
  }

  function legacyFrequentlyVisitedPreference() {
    try { return localStorage.getItem(FREQUENTLY_VISITED_PREF_KEY) === "1"; }
    catch { return false; }
  }

  function legacyFrequentlyVisitedCountPreference() {
    try {
      const value = Number.parseInt(localStorage.getItem(FREQUENTLY_VISITED_COUNT_PREF_KEY) || "5", 10);
      return [3, 5, 8, 10].includes(value) ? value : 5;
    } catch {
      return 5;
    }
  }

  function synchronizedFrequentlyVisitedSettings(currentState = state) {
    // Frequently Visited is a global MosaicSync presentation preference rather
    // than a Space-specific browser-history dataset. Personal is the canonical
    // synchronized home for the preference; both workspaces are kept mirrored
    // when a current client changes it so rolling-version devices converge.
    const settings = currentState?.spaces?.personal?.settings || currentState?.settings || DEFAULT_STATE.settings;
    const count = Number(settings?.frequentlyVisitedCount);
    return {
      enabled: settings?.frequentlyVisitedEnabled === true,
      count: [3, 5, 8, 10].includes(count) ? count : 5
    };
  }

  function syncFrequentlyVisitedLocalsFromState(currentState = state) {
    const pref = synchronizedFrequentlyVisitedSettings(currentState);
    frequentlyVisitedEnabled = pref.enabled;
    frequentlyVisitedCount = pref.count;
    // Keep the pre-1.27.8.4 localStorage values as a compatibility/migration
    // cache only. They no longer own the preference once the synchronized fields
    // exist, but older profile exports/welcome builds can still read them safely.
    try { localStorage.setItem(FREQUENTLY_VISITED_PREF_KEY, pref.enabled ? "1" : "0"); } catch {}
    try { localStorage.setItem(FREQUENTLY_VISITED_COUNT_PREF_KEY, String(pref.count)); } catch {}
    return pref;
  }

  function compactStateHasSyncedFrequentlyVisitedPreference(compactState) {
    const settings = compactState?.spaces?.personal?.settings;
    return Boolean(settings && Object.hasOwn(settings, "frequentlyVisitedEnabled") && Object.hasOwn(settings, "frequentlyVisitedCount"));
  }

  async function persistFrequentlyVisitedPreference({ enabled = frequentlyVisitedEnabled, count = frequentlyVisitedCount } = {}) {
    const normalizedEnabled = enabled === true;
    const normalizedCount = [3, 5, 8, 10].includes(Number(count)) ? Number(count) : 5;
    const baseState = writeBaseline;
    // `state` is the already-normalized live model. These two controlled setting
    // writes only introduce normalized booleans/counts and monotonic timestamps;
    // avoid re-normalizing/image-hashing both Spaces before the real persistence
    // boundary validates the final state.
    const normalized = state;
    const observedClocks = [];
    for (const spaceId of SPACE_IDS) {
      const workspace = normalized.spaces[spaceId];
      observedClocks.push(workspace.settingsModifiedAt, workspace.updatedAt);
    }
    const timestamp = nextMutationTime(observedClocks);
    let next = normalized;
    for (const spaceId of SPACE_IDS) {
      const workspace = next.spaces[spaceId];
      const updatedWorkspace = {
        ...workspace,
        settings: {
          ...workspace.settings,
          frequentlyVisitedEnabled: normalizedEnabled,
          frequentlyVisitedCount: normalizedCount
        },
        settingsModifiedAt: timestamp,
        updatedAt: Math.max(Number(workspace.updatedAt) || 0, timestamp)
      };
      next = replaceWorkspaceTrustedNormalized(next, spaceId, updatedWorkspace);
    }
    state = next;
    stateMutationGeneration += 1;
    const persisted = await writeLocalStateWithBaseline(state, {
      baseState,
      baseStateIsCompact: Boolean(baseState),
      recordSyncMutation: meta?.syncEnabled && meta?.syncInitialized
    });
    state = persisted.state;
    writeBaseline = persisted.compactBaseline;
    syncFrequentlyVisitedLocalsFromState(state);
    refreshFirstPaintCaches(state, meta);
    return { enabled: frequentlyVisitedEnabled, count: frequentlyVisitedCount };
  }

  async function migrateLegacyFrequentlyVisitedPreferenceIfNeeded(loaded) {
    if (compactStateHasSyncedFrequentlyVisitedPreference(loaded?.compactBaseline)) {
      syncFrequentlyVisitedLocalsFromState(loaded.state);
      return loaded;
    }

    const enabled = legacyFrequentlyVisitedPreference();
    const count = legacyFrequentlyVisitedCountPreference();
    const normalized = normalizeState(loaded.state);
    // Rolling migration rule: a legacy positive/non-default preference is useful
    // user intent and should enter Sync. A legacy OFF + default-count value is
    // merely the old per-device default, so persist the new fields locally without
    // advancing settings clocks or publishing it. This prevents a newly upgraded
    // Work computer that happened to be OFF from racing/overwriting another
    // computer's legacy ON preference before that ON value reaches Sync.
    const publishLegacyIntent = enabled || count !== DEFAULT_STATE.settings.frequentlyVisitedCount;
    const observedClocks = [];
    for (const spaceId of SPACE_IDS) {
      const workspace = normalized.spaces[spaceId];
      observedClocks.push(workspace.settingsModifiedAt, workspace.updatedAt);
    }
    const timestamp = publishLegacyIntent ? nextMutationTime(observedClocks) : 0;
    let migrated = normalized;
    for (const spaceId of SPACE_IDS) {
      const workspace = migrated.spaces[spaceId];
      migrated = replaceWorkspace(migrated, spaceId, {
        ...workspace,
        settings: { ...workspace.settings, frequentlyVisitedEnabled: enabled, frequentlyVisitedCount: count },
        settingsModifiedAt: publishLegacyIntent ? timestamp : workspace.settingsModifiedAt,
        updatedAt: publishLegacyIntent ? Math.max(Number(workspace.updatedAt) || 0, timestamp) : workspace.updatedAt
      });
    }
    migrated = selectActiveSpaceNormalized(migrated, normalized.activeSpaceId);
    const persisted = await writeLocalStateWithBaseline(migrated, {
      baseState: loaded.compactBaseline,
      baseStateIsCompact: Boolean(loaded.compactBaseline),
      recordSyncMutation: publishLegacyIntent && loaded.meta?.syncEnabled && loaded.meta?.syncInitialized
    });
    const written = persisted.state;
    const compactBaseline = persisted.compactBaseline;
    syncFrequentlyVisitedLocalsFromState(written);
    return { ...loaded, state: written, compactBaseline };
  }

  function readShortcutOrderPreference() {
    try { return localStorage.getItem(SHORTCUT_ORDER_PREF_KEY) === "recent" ? "recent" : "manual"; }
    catch { return "manual"; }
  }

  function updateFrequentDragAvailability() {
    const enabled = shortcutOrderMode !== "recent";
    for (const card of frequentSitesList?.querySelectorAll?.(".frequent-site-card") || []) card.draggable = enabled;
  }

  function writeShortcutOrderPreference(value) {
    shortcutOrderMode = value === "recent" ? "recent" : "manual";
    try { localStorage.setItem(SHORTCUT_ORDER_PREF_KEY, shortcutOrderMode); } catch {}
    updateFrequentDragAvailability();
  }

  function normalizeShortcutUsageMap(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const entries = [];
    for (const [id, value] of Object.entries(raw)) {
      const timestamp = Number(value);
      if (typeof id !== "string" || !id || id.length > 256 || !Number.isFinite(timestamp) || timestamp <= 0) continue;
      entries.push([id, Math.trunc(timestamp)]);
    }
    entries.sort((a, b) => b[1] - a[1]);
    const normalized = Object.create(null);
    for (const [id, timestamp] of entries.slice(0, 512)) normalized[id] = timestamp;
    return normalized;
  }

  function readShortcutUsage() {
    try { return normalizeShortcutUsageMap(JSON.parse(localStorage.getItem(SHORTCUT_USAGE_PREF_KEY) || "{}")); }
    catch { return {}; }
  }

  function writeShortcutUsage() {
    shortcutUsage = normalizeShortcutUsageMap(shortcutUsage);
    try { localStorage.setItem(SHORTCUT_USAGE_PREF_KEY, JSON.stringify(shortcutUsage)); } catch {}
  }

  function scheduleRecentOrderRender() {
    if (shortcutOrderMode !== "recent") return;
    clearTimeout(recentOrderRenderTimer);
    recentOrderRenderTimer = setTimeout(() => {
      if (shortcutOrderMode !== "recent" || isAwaitingRemote()) return;
      requestLauncherRenderAfterExternalState();
    }, 0);
  }

  function recordShortcutsOpened(shortcutIds, { renderRecent = true } = {}) {
    const ids = [...new Set((Array.isArray(shortcutIds) ? shortcutIds : []).filter(id => typeof id === "string" && id))];
    if (!ids.length) return;
    const openedAt = Date.now();
    for (const id of ids) shortcutUsage[id] = openedAt;
    writeShortcutUsage();
    if (renderRecent) scheduleRecentOrderRender();
  }

  function recordShortcutOpened(shortcutId, options = {}) {
    recordShortcutsOpened([shortcutId], options);
  }

  function recentGridItems(capacity) {
    const visible = (state.shortcuts || []).filter(item => Number.isInteger(item?.position) && item.position >= 0 && item.position < capacity);
    return sortTopLevelByRecent(visible, shortcutUsage);
  }

  function readHiddenFrequentDomains() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FREQUENTLY_VISITED_HIDDEN_DOMAINS_KEY) || "[]");
      if (!Array.isArray(parsed)) return new Set();
      const safe = [];
      for (const value of parsed) {
        const domain = String(value || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
        if (!domain || domain.length > 253 || safe.includes(domain)) continue;
        safe.push(domain);
        if (safe.length >= FREQUENT_HIDDEN_DOMAINS_MAX) break;
      }
      return new Set(safe);
    } catch {
      return new Set();
    }
  }

  function writeHiddenFrequentDomains() {
    const bounded = [...hiddenFrequentDomains].slice(-FREQUENT_HIDDEN_DOMAINS_MAX);
    hiddenFrequentDomains = new Set(bounded);
    try { localStorage.setItem(FREQUENTLY_VISITED_HIDDEN_DOMAINS_KEY, JSON.stringify(bounded)); } catch {}
  }

  function isFrequentHostHidden(hostname) {
    const host = String(hostname || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
    if (!host) return false;
    for (const domain of hiddenFrequentDomains) {
      if (host === domain || host.endsWith(`.${domain}`)) return true;
    }
    return false;
  }

  function projectFrequentRenderSnapshot(sites = []) {
    return {
      enabled: frequentlyVisitedEnabled === true,
      count: frequentlyVisitedCount,
      sites: frequentlyVisitedEnabled
        ? (Array.isArray(sites) ? sites.slice(0, frequentlyVisitedCount).map(site => ({
            title: String(site?.title || frequentHostLabel(site?.url) || "").trim().slice(0, 120),
            host: frequentHostLabel(site?.url),
            url: String(site?.url || ""),
            favicon: typeof site?.favicon === "string" ? site.favicon : ""
          })) : [])
        : []
    };
  }

  function updateFrequentRenderSnapshot(sites = []) {
    frequentRenderSnapshot = projectFrequentRenderSnapshot(sites);
    // Top Sites candidates are session/live-owned presentation data. Updating
    // them must never republish this tab's potentially stale Space/grid state or
    // write browsing-history-derived sites into persistent localStorage.
    void updateSessionFrequentlyVisitedSnapshot(frequentRenderSnapshot);
  }

  function readDeviceDefaultSpacePreference() {
    try {
      const value = localStorage.getItem(DEFAULT_SPACE_PREF_KEY) || "last";
      return value === "last" || SPACE_IDS.includes(value) ? value : "last";
    } catch {
      return "last";
    }
  }

  function writeDeviceDefaultSpacePreference(value) {
    const normalized = value === "last" || SPACE_IDS.includes(value) ? value : "last";
    deviceDefaultSpace = normalized;
    try { localStorage.setItem(DEFAULT_SPACE_PREF_KEY, normalized); } catch {}
  }

  function readBookmarkFolderColors() {
    try {
      const raw = JSON.parse(localStorage.getItem(BOOKMARK_FOLDER_COLORS_PREF_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const safe = {};
      for (const [folderId, colorKey] of Object.entries(raw)) {
        if (typeof folderId === "string" && folderId.length <= 256 && BOOKMARK_FOLDER_COLOR_PALETTE[colorKey]) safe[folderId] = colorKey;
      }
      return safe;
    } catch {
      return {};
    }
  }

  function writeBookmarkFolderColors() {
    try { localStorage.setItem(BOOKMARK_FOLDER_COLORS_PREF_KEY, JSON.stringify(bookmarkFolderColors)); } catch {}
  }


  async function frequentCandidates() {
    const age = Date.now() - frequentCandidateCacheAt;
    if (frequentCandidateCache.length && age >= 0 && age < FREQUENT_CANDIDATE_CACHE_MS) return frequentCandidateCache;
    const sites = await getNativeTopSites({ limit: FREQUENT_TOP_SITES_LIMIT });
    frequentCandidateCache = Array.isArray(sites) ? sites.slice(0, FREQUENT_TOP_SITES_LIMIT) : [];
    frequentCandidateCacheAt = Date.now();
    return frequentCandidateCache;
  }

  function frequentHostLabel(url) {
    return canonicalSiteHost(url) || hostLabel(url);
  }

  function closeFrequentContextMenu() {
    if (frequentContextMenu?.isConnected) frequentContextMenu.remove();
    frequentContextMenu = null;
  }

  function positionFloatingMenu(menu, clientX, clientY) {
    if (!menu) return;
    const margin = 8;
    menu.style.left = `${Math.max(margin, clientX)}px`;
    menu.style.top = `${Math.max(margin, clientY)}px`;
    requestAnimationFrame(() => {
      if (!menu.isConnected) return;
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(margin, Math.min(clientX, window.innerWidth - rect.width - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(clientY, window.innerHeight - rect.height - margin))}px`;
    });
  }

  async function addFrequentSiteToMosaicSync(site, { position = null } = {}) {
    const url = normalizeShortcutUrl(site?.url);
    const title = String(site?.title || frequentHostLabel(url) || hostLabel(url)).trim().slice(0, 120);
    const exactPosition = Number.isInteger(position) && position >= 0 ? position : null;
    if (exactPosition !== null && state.shortcuts.some(item => item.position === exactPosition)) return false;
    const targetPosition = exactPosition ?? firstEmptyTopLevelPosition();
    const timestamp = nextMutationTime(state.updatedAt, state.shortcuts.map(item => item.modifiedAt));
    const shortcut = {
      type: "shortcut", id: uid(), title, url, image: "", imageSyncData: "", imageSyncKind: "none",
      imageAssetId: "", imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false,
      imageStyle: "contain", position: targetPosition, createdAt: timestamp, modifiedAt: timestamp, source: "manual"
    };
    state.shortcuts.push(shortcut);
    await saveState();
    render();
    const host = canonicalSiteHost(url);
    const remaining = (frequentRenderSnapshot?.sites || []).filter(candidate => canonicalSiteHost(candidate?.url) !== host);
    renderFrequentlyVisited(remaining);
    updateFrequentRenderSnapshot(remaining);
    scheduleFrequentlyVisitedRefresh(0);
    requestMissingSiteIcons([shortcut.id]);
    showToast(t("shortcutAdded"));
    return true;
  }

  async function hideFrequentSite(site) {
    const host = canonicalSiteHost(site?.url);
    if (!host) return;
    const module = await loadRegistrableDomainModule();
    const domain = await module.registrableDomainFromHostname(host);
    if (!domain) throw new Error(t("operationFailed"));
    hiddenFrequentDomains.delete(domain);
    hiddenFrequentDomains.add(domain);
    writeHiddenFrequentDomains();
    const remaining = (frequentRenderSnapshot?.sites || []).filter(candidate => !isFrequentHostHidden(canonicalSiteHost(candidate?.url)));
    renderFrequentlyVisited(remaining);
    updateFrequentRenderSnapshot(remaining);
    scheduleFrequentlyVisitedRefresh(0);
    showToast(t("frequentHidden"));
  }

  async function addFrequentSiteToBookmarks(site) {
    if (!bookmarksApi) throw new Error(t("operationFailed"));
    const permissionPromise = bookmarksApi.requestBookmarksPermissionFromGesture();
    const granted = await permissionPromise;
    if (!granted) {
      showToast(t("bookmarksPermissionDenied"));
      return;
    }
    const created = await bookmarksApi.createBookmark({
      title: String(site?.title || frequentHostLabel(site?.url) || site?.url || "").trim(),
      url: site?.url
    });
    if (!created) throw new Error(t("operationFailed"));
    showToast(t("bookmarkAdded"));
  }

  async function showFrequentSiteContextMenu(event, site) {
    const clientX = event.clientX;
    const clientY = event.clientY;
    closeFrequentContextMenu();
    await ensureSecondaryStyles();
    try { await loadBookmarksModule(); } catch {}
    const menu = document.createElement("div");
    menu.className = "mosaicsync-context-menu";
    menu.setAttribute("role", "menu");

    const addAction = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("role", "menuitem");
      button.addEventListener("click", event => {
        event.stopPropagation();
        closeFrequentContextMenu();
        void Promise.resolve(action()).catch(error => showToast(error?.message || t("operationFailed")));
      });
      menu.append(button);
    };
    addAction(t("openInNewTab"), () => browser.tabs.create({ url: site.url, active: false }));
    addAction(t("addShortcut"), () => addFrequentSiteToMosaicSync(site));
    addAction(t("addToBookmarks"), () => addFrequentSiteToBookmarks(site));
    addAction(t("hideFrequentSite"), () => hideFrequentSite(site));
    document.body.append(menu);
    frequentContextMenu = menu;
    positionFloatingMenu(menu, clientX, clientY);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  function renderFrequentlyVisited(sites, {
    authoritative = true,
    enabled = frequentlyVisitedEnabled,
    count = frequentlyVisitedCount
  } = {}) {
    if (!frequentSitesSection || !frequentSitesList) return;
    frequentSitesList.replaceChildren();
    const visibleCount = [3, 5, 8, 10].includes(Number(count)) ? Number(count) : 5;
    const list = Array.isArray(sites) ? sites.slice(0, visibleCount) : [];
    frequentSitesSection.hidden = enabled !== true || list.length === 0;
    if (frequentSitesSection.hidden) {
      if (authoritative) {
        frequentSitesSection.inert = false;
        delete document.documentElement.dataset.bootFrequent;
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const site of list) {
      const card = document.createElement("a");
      card.className = "frequent-site-card";
      card.href = site.url;
      card.rel = "noreferrer";
      card.draggable = shortcutOrderMode !== "recent";
      card.title = `${site.title || frequentHostLabel(site.url)}\n${site.url}`;
      card.addEventListener("dragstart", event => {
        if (shortcutOrderMode === "recent") {
          event.preventDefault();
          frequentDragSite = null;
          return;
        }
        frequentDragSite = {
          title: String(site?.title || frequentHostLabel(site?.url) || "").trim().slice(0, 120),
          url: String(site?.url || "")
        };
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/uri-list", frequentDragSite.url);
        event.dataTransfer.setData("text/plain", frequentDragSite.url);
      });
      card.addEventListener("dragend", () => {
        frequentDragSite = null;
        card.classList.remove("dragging");
        document.querySelectorAll(".shortcut-slot").forEach(el => el.classList.remove("drag-over-empty"));
      });
      card.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        void showFrequentSiteContextMenu(event, site);
      });
      if (typeof site.favicon === "string" && site.favicon.startsWith("data:image/")) {
        const icon = document.createElement("img");
        icon.className = "frequent-site-icon";
        icon.src = site.favicon;
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        card.append(icon);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "frequent-site-fallback";
        fallback.textContent = (site.title || frequentHostLabel(site.url) || "?").trim().slice(0, 1).toUpperCase();
        fallback.setAttribute("aria-hidden", "true");
        card.append(fallback);
      }
      const copy = document.createElement("span");
      copy.className = "frequent-site-copy";
      const title = document.createElement("strong");
      title.textContent = (site.title || frequentHostLabel(site.url)).trim();
      const host = document.createElement("small");
      host.textContent = frequentHostLabel(site.url);
      copy.append(title, host);
      card.append(copy);
      fragment.append(card);
    }
    frequentSitesList.append(fragment);
    if (authoritative) {
      frequentSitesSection.inert = false;
      delete document.documentElement.dataset.bootFrequent;
    }
  }

  function setFrequentlyVisitedOptionsVisibility(enabled) {
    // One element owns expansion/collapse. Mutating both the parent and a child
    // made Firefox perform redundant layout work inside the live Settings panel.
    if (frequentOptions) frequentOptions.hidden = enabled !== true;
  }

  function setFrequentlyVisitedStatus(key) {
    frequentlyVisitedStatusKey = key;
    if (frequentlyVisitedStatus) frequentlyVisitedStatus.textContent = t(key);
  }

  function setFrequentlyVisitedPermissionActionVisible(visible) {
    if (!frequentlyVisitedPermissionButton) return;
    frequentlyVisitedPermissionButton.hidden = visible !== true;
    frequentlyVisitedPermissionButton.textContent = t("grantFrequentlyVisitedPermission");
  }

  function setFrequentlyVisitedPermissionRecoveryVisible(visible) {
    const show = visible === true && frequentlyVisitedEnabled === true;
    if (frequentPermissionRecoveryText) frequentPermissionRecoveryText.textContent = t("frequentPermissionRequired");
    if (frequentPermissionRecoveryButton) frequentPermissionRecoveryButton.textContent = t("grantFrequentlyVisitedPermission");
    if (frequentPermissionRecovery) frequentPermissionRecovery.hidden = !show;
    frequentOptions?.classList?.toggle?.("permission-required", show);
    if (!show || !frequentSitesSection) return;
    // This state comes from a live browser.permissions.contains() result, so the
    // cached Frequently Visited projection is no longer authoritative. Replace it
    // with an explicit, user-actionable recovery state instead of silently hiding
    // the enabled feature or requiring an OFF -> ON toggle dance.
    frequentSitesList?.replaceChildren();
    frequentSitesSection.hidden = false;
    frequentSitesSection.inert = false;
    delete document.documentElement.dataset.bootFrequent;
  }

  async function refreshFrequentlyVisited() {
    const generation = ++frequentRefreshGeneration;
    if (!frequentlyVisitedEnabled) {
      renderFrequentlyVisited([]);
      updateFrequentRenderSnapshot([]);
      setFrequentlyVisitedStatus("frequentHidden");
      setFrequentlyVisitedPermissionActionVisible(false);
      setFrequentlyVisitedPermissionRecoveryVisible(false);
      return;
    }
    let permitted = false;
    try { permitted = await hasTopSitesPermission(); } catch {}
    if (generation !== frequentRefreshGeneration) return;
    if (!permitted) {
      renderFrequentlyVisited([]);
      updateFrequentRenderSnapshot([]);
      setFrequentlyVisitedStatus("frequentPermissionRequired");
      setFrequentlyVisitedPermissionActionVisible(true);
      setFrequentlyVisitedPermissionRecoveryVisible(true);
      return;
    }
    setFrequentlyVisitedPermissionActionVisible(false);
    setFrequentlyVisitedPermissionRecoveryVisible(false);
    try {
      // Ask Firefox for a broad candidate pool first, then filter. Requesting only
      // a handful before removing explicit shortcuts could leave fewer than five
      // suggestions even when Firefox had more valid candidates available.
      const explicitHosts = frequentExplicitHostsForState(state, stateMutationGeneration);
      const sites = await frequentCandidates();
      if (generation !== frequentRefreshGeneration) return;
      const seenHosts = new Set();
      const filtered = [];
      for (const site of sites || []) {
        if (!site?.url || !/^https?:/i.test(site.url)) continue;
        const host = canonicalSiteHost(site.url);
        if (!host || isFrequentHostHidden(host) || explicitHosts.has(host) || seenHosts.has(host)) continue;
        seenHosts.add(host);
        filtered.push(site);
        if (filtered.length >= frequentlyVisitedCount) break;
      }
      renderFrequentlyVisited(filtered);
      updateFrequentRenderSnapshot(filtered);
      setFrequentlyVisitedStatus("frequentDeviceLocalStatus");
    } catch {
      const cached = frequentRenderSnapshot?.enabled === true ? (frequentRenderSnapshot.sites || []) : [];
      renderFrequentlyVisited(cached, { authoritative: false });
      setFrequentlyVisitedStatus("frequentReadFailed");
    }
  }

  function scheduleFrequentlyVisitedRefresh(delay = 80) {
    clearTimeout(frequentRefreshTimer);
    frequentRefreshTimer = setTimeout(() => { void refreshFrequentlyVisited(); }, delay);
  }

  function scheduleFrequentlyVisitedPermissionReconciliation(delay = 1400) {
    setTimeout(() => {
      if (!frequentlyVisitedEnabled) return;
      void refreshFrequentlyVisited();
    }, delay);
  }

  function preloadResolvedBackground(presetId, imageValue = "") {
    const resolved = resolveBackgroundImage(presetId, imageValue);
    if (!resolved) return Promise.resolve();
    const key = `${presetId || "custom"}:${resolved.length}:${resolved.slice(0, 96)}`;
    if (backgroundPreloadCache.has(key)) return backgroundPreloadCache.get(key);
    const promise = new Promise(resolve => {
      const image = new Image();
      let finished = false;
      const done = () => { if (!finished) { finished = true; resolve(); } };
      image.onload = done;
      image.onerror = done;
      image.src = resolved;
      if (typeof image.decode === "function") image.decode().then(done, done);
      setTimeout(done, 2500);
    });
    backgroundPreloadCache.set(key, promise);
    if (backgroundPreloadCache.size > BACKGROUND_PRELOAD_CACHE_MAX) backgroundPreloadCache.delete(backgroundPreloadCache.keys().next().value);
    return promise;
  }

  function preloadBackgroundForSettings(settings) {
    const jobs = [preloadResolvedBackground(effectiveBackgroundPresetId(settings), effectiveBackgroundImageValue(settings))];
    if (settings?.themeWallpapersEnabled === true) {
      for (const presetId of [settings.lightBackgroundPreset, settings.darkBackgroundPreset]) {
        if (presetId && BACKGROUND_PRESETS[presetId]) jobs.push(preloadResolvedBackground(presetId));
      }
    }
    return Promise.all(jobs).then(() => undefined);
  }

  function preloadOtherSpaceBackgrounds() {
    if (!isMultipleSpacesEnabled()) return;
    for (const spaceId of SPACE_IDS) {
      if (spaceId === state.activeSpaceId) continue;
      const settings = state?.spaces?.[spaceId]?.settings;
      if (settings) void preloadBackgroundForSettings(settings);
    }
  }

  function stampImportedProfileState(importedState) {
    const normalized = normalizeState(importedState);
    const observedClocks = [];
    for (const spaceId of SPACE_IDS) {
      const workspace = normalized.spaces[spaceId];
      observedClocks.push(workspace.updatedAt, workspace.settingsModifiedAt);
      for (const item of workspace.shortcuts || []) {
        observedClocks.push(item.modifiedAt, item.spaceMoveAt);
        if (item.type === "folder") {
          for (const child of item.items || []) observedClocks.push(child.modifiedAt, child.spaceMoveAt);
        }
      }
    }
    const timestamp = nextMutationTime(observedClocks);
    const spaces = {};
    for (const spaceId of SPACE_IDS) {
      const workspace = normalized.spaces[spaceId];
      const stampItem = item => item.type === "folder"
        ? { ...item, modifiedAt: timestamp, items: (item.items || []).map(child => ({ ...child, modifiedAt: timestamp })) }
        : { ...item, modifiedAt: timestamp };
      spaces[spaceId] = {
        ...workspace,
        shortcuts: workspace.shortcuts.map(stampItem),
        settingsClock: Object.fromEntries(SETTINGS_SYNC_CLOCK_KEYS.map(key => [key, [timestamp, ""]])),
        settingsModifiedAt: timestamp,
        updatedAt: timestamp
      };
    }
    return normalizeState({
      schemaVersion: normalized.schemaVersion,
      activeSpaceId: normalized.activeSpaceId,
      spaces
    });
  }

  function schedulePostPaintMaintenance() {
    syncFrequentlyVisitedLocalsFromState(state);
    shortcutOrderMode = readShortcutOrderPreference();
    shortcutUsage = readShortcutUsage();
    hiddenFrequentDomains = readHiddenFrequentDomains();
    deviceDefaultSpace = readDeviceDefaultSpacePreference();
    bookmarkFolderColors = readBookmarkFolderColors();
    if (settingsFrequentlyVisited) settingsFrequentlyVisited.checked = frequentlyVisitedEnabled;
    if (settingsFrequentlyVisitedCount) settingsFrequentlyVisitedCount.value = String(frequentlyVisitedCount);
    if (!frequentlyVisitedEnabled) {
      renderFrequentlyVisited([]);
    } else if (frequentRenderSnapshot?.enabled === true) {
      renderFrequentlyVisited(frequentRenderSnapshot.sites || [], { authoritative: false });
    }
    scheduleFrequentlyVisitedRefresh(250);
    // The browser may briefly rehydrate optional-permission state while an updated
    // extension context is starting. Reconcile once more after startup so an
    // already-granted Top Sites permission restores suggestions automatically.
    scheduleFrequentlyVisitedPermissionReconciliation();
    scheduleIdleWork(() => maybeShowWebAccessPrompt().catch(() => {}), 900);
    void preloadBackgroundForSettings(state.settings);
    preloadOtherSpaceBackgrounds();
    if (meta.syncEnabled && !meta.syncInitialized && meta.syncBootstrapMode === "await-remote") {
      scheduleIdleWork(() => sendSyncMessage("mosaicsync:wait-for-remote").catch(() => {}), 500);
    }

    // Show browser-native cached favicons as early as possible, then let the
    // background quality resolver upgrade them. Neither path delays first paint.
    scheduleIdleWork(() => hydrateDeviceFavicons().catch(() => {}), 320);
    scheduleIdleWork(() => requestMissingSiteIcons(), 650);

    // Firefox normally delivers storage.sync change events, but MV3 event pages
    // are intentionally non-persistent. A tiny dataset-marker check after paint
    // gives us a self-healing path if a remote event was delayed or missed. The
    // full Sync snapshot is read only when the commit marker is actually new.
    if (meta.syncEnabled && meta.syncInitialized) {
      scheduleIdleWork(() => sendSyncMessage("mosaicsync:reconcile-if-needed", { reason: "newtab-startup" }).catch(() => {}), 1200);
    }

    // Remaining cache repair and legacy-asset maintenance stays well off the
    // critical path. Prefer a known site source before Firefox's often-tiny
    // topSites favicon fallback.
    scheduleIdleWork(async () => {
      try {
        webAccessGranted = await hasWebAccess();
        await hydrateRemoteImageSources();
        if (meta.syncEnabled) await optimizeExistingLocalAssetsForSync();
      } catch {
        // Maintenance is best-effort; the persisted New Tab remains usable even
        // if favicon repair or legacy artwork compression cannot run.
      }
    }, 2500);
  }

  async function loadState() {
    deviceDefaultSpace = readDeviceDefaultSpacePreference();
    shortcutOrderMode = readShortcutOrderPreference();
    shortcutUsage = readShortcutUsage();
    startupPhase("loadStateStart");
    const diagnostics = {
      navigationType: performance.getEntriesByType?.("navigation")?.[0]?.type || "unknown",
      persisted: pageshowPersisted,
      bootGrid: document.documentElement.dataset.bootGrid === "true",
      bootGridReused: false,
      bootGridAdopted: false,
      firstSource: "local",
      sessionCacheStatus: browser.storage.session ? "pending" : "unavailable",
      sessionReadMs: null,
      sessionStorageMs: null,
      sessionValidationMs: null,
      localReadMs: null,
      localStorageMs: null,
      localNormalizationMs: null,
      localAssetStorageMs: null,
      localAssetHydrationMs: null,
      applySettingsMs: 0,
      renderMs: 0,
      firstUsableMs: 0,
      authoritativeReconcileMs: 0
    };

    // The session read began in the head bootstrap and the authoritative local
    // read began at module start. Deliberately keep heavyweight local
    // normalization out of flight until the lightweight session/boot projection
    // has had a chance to paint; only storage IPC overlaps the UI setup.
    const stateGenerationAtRead = stateMutationGeneration;
    const metaGenerationAtRead = metaMutationGeneration;

    const localRawPromise = earlyLocalRawPromise.then(({ raw, elapsedMs }) => {
      diagnostics.localReadMs = elapsedMs;
      diagnostics.localStorageMs = raw.timings?.storageMs ?? null;
      startupPhase("localRawReady");
      return raw;
    });
    let rawLocal = null;

    const sessionStartedAt = performance.now();
    const earlySessionRead = globalThis.__mosaicsyncEarlySessionRead || null;
    try { delete globalThis.__mosaicsyncEarlySessionRead; } catch {}
    const sessionCache = await readSessionRenderCache(earlySessionRead);
    diagnostics.sessionReadMs = performance.now() - sessionStartedAt;
    diagnostics.sessionCacheStatus = getSessionRenderCacheStatus();
    diagnostics.sessionStorageMs = sessionCache?.timings?.storageMs ?? null;
    diagnostics.sessionValidationMs = sessionCache?.timings?.validationMs ?? null;
    if (sessionCache?.frequentSuppressed) {
      // A background permission-removal event can arrive while no New Tab exists.
      // The shared session tombstone is intentionally smaller than a full render
      // snapshot and must be able to clear an older localStorage FV strip even
      // when the normal session render state is absent.
      renderFrequentlyVisited([], { authoritative: false, enabled: false, count: frequentlyVisitedCount });
    }

    let paintedSession = false;
    let sessionBlockedByAuthoritativeSpaces = false;
    if (sessionCache?.meta?.onboardingCompleted && sessionCache.state?.activeSpaceId !== "personal") {
      rawLocal = await localRawPromise;
      sessionBlockedByAuthoritativeSpaces = !rawStateMultipleSpacesEnabled(rawLocal?.result?.[LOCAL_STATE_KEY]);
    }
    const sessionDefaultMismatch = Boolean(
      sessionCache?.meta?.onboardingCompleted &&
      deviceDefaultSpace !== "last" &&
      isMultipleSpacesEnabled(sessionCache.state) &&
      sessionCache.state.activeSpaceId !== deviceDefaultSpace
    );
    if (sessionCache?.meta?.onboardingCompleted && !sessionDefaultMismatch && !sessionBlockedByAuthoritativeSpaces) {
      // storage.session is a disposable visual cache. Keep any grid it paints
      // inert until the already-running authoritative storage.local read wins.
      keepLauncherCacheVisualOnly();
      diagnostics.firstSource = "session";
      const bootManifest = bootRenderManifest;
      const sessionAwaitingRemote = Boolean(sessionCache.meta?.syncEnabled && !sessionCache.meta?.syncInitialized && sessionCache.meta?.syncBootstrapMode === "await-remote");
      const canReuseBootGrid = canReuseBootGridForSession({
        sessionAwaitingRemote,
        bootGridPainted: diagnostics.bootGrid,
        bootManifest,
        sessionState: sessionCache.state
      });
      paintLoadedState(sessionCache, diagnostics, { deferHeavyAssets: true, reuseBootGrid: canReuseBootGrid });
      paintedSession = true;
    }
    try { delete globalThis.__mosaicsyncBootGrid; } catch {}

    rawLocal ||= await localRawPromise;

    // If a structural bootstrap/session snapshot is already on screen, yield one
    // animation frame before touching the image-heavy authoritative state. That
    // guarantees the user's first visible/usable grid is not held hostage by a
    // 4K wallpaper or high-quality custom tile validation.
    if (paintedSession || diagnostics.bootGrid) {
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    let loaded = await materializeLocalStorage(rawLocal, { withTimings: true, hydrateAssets: "active-no-background", folderChildLimit: 4 });
    loaded = await migrateLegacyFrequentlyVisitedPreferenceIfNeeded(loaded);
    if (deviceDefaultSpace !== "last" && isMultipleSpacesEnabled(loaded.state) && loaded.state.activeSpaceId !== deviceDefaultSpace) {
      loaded.state = await hydrateLocalAssetsForSpaceNormalized(loaded.state, deviceDefaultSpace);
      loaded.state = selectActiveSpaceNormalized(loaded.state, deviceDefaultSpace);
      activeSpacePersistQueue = activeSpacePersistQueue
        .catch(() => {})
        .then(() => writeActiveSpace(deviceDefaultSpace));
      void activeSpacePersistQueue.catch(error => console.warn(`${PRODUCT_NAME}: could not persist default Space`, error));
    }
    // The compact state read from storage.local is already the exact persisted
    // concurrency baseline. Reuse it instead of projecting/hashing the hydrated
    // render state during every read-only New Tab startup. writeLocalState still
    // canonicalizes this baseline on the first real mutation.
    if ((!writeBaseline || stateMutationGeneration === stateGenerationAtRead) && loaded.compactBaseline) {
      writeBaseline = loaded.compactBaseline;
    }
    diagnostics.localNormalizationMs = loaded.timings?.normalizationMs ?? null;
    diagnostics.localAssetStorageMs = loaded.timings?.assetStorageMs ?? null;
    diagnostics.localAssetHydrationMs = loaded.timings?.assetHydrationMs ?? null;

    if (!loaded.meta.onboardingCompleted) {
      window.location.replace(browser.runtime.getURL("welcome/welcome.html"));
      return;
    }

    if (!paintedSession) {
      launcherAuthorityVerified = true;
      diagnostics.firstSource = "local";
      paintLoadedState(loaded, diagnostics, {
        deferHeavyAssets: loaded.state.settings?.backgroundImageDeferred === true,
        adoptBootGrid: diagnostics.bootGrid
      });
      // Warm only the lightweight projection after the authoritative first load.
      void warmFirstPaintSessionCache(state, meta);
    } else {
      const reconcileStartedAt = performance.now();
      if (!reconcileAuthoritativeLocal(loaded, stateGenerationAtRead, metaGenerationAtRead)) return;
      diagnostics.authoritativeReconcileMs = performance.now() - reconcileStartedAt;
      void warmFirstPaintSessionCache(state, meta);
    }
    scheduleDeferredBackgroundHydration();
    scheduleDeferredFolderHydration();
    startupPhase("authoritativeStateReady", { bootGridAdopted: diagnostics.bootGridAdopted === true || document.documentElement.dataset.bootGridAdopted === "true" });
    // Approximate PCP with a double-rAF after the authoritative structure/artwork
    // patch. This records when the browser has had an opportunity to paint the
    // stable launcher, not merely when JavaScript finished mutating it.
    schedulePaintPhase("perceivedCompletePaint");
    startupPhase("interactionReady");
    try {
      for (const entry of performance.getEntriesByType?.("paint") || []) {
        if (entry?.name === "first-paint") startupTiming.phases.firstPaint = entry.startTime;
        if (entry?.name === "first-contentful-paint") startupTiming.phases.firstContentfulPaint = entry.startTime;
      }
    } catch {}

    // Reconcile Automatic appearance with the browser's actual UI theme as well
    // as prefers-color-scheme. This happens after first paint, so awaiting it here
    // does not delay the user's initial grid.
    await refreshResolvedSystemTheme();

    // 1.26.17.2 migration: older builds had one shared backgroundDim even when
    // separate Light/Dark wallpapers were enabled. Preserve the appearance that
    // is actually active after system-theme reconciliation and initialize the
    // opposite appearance at 0%. Do this only after the authoritative state wins
    // so a session-cache paint can never publish stale migration data.
    if (initializeThemeWallpaperDimsForState(state)) {
      state = normalizeState(state);
      void saveState().catch(error => {
        console.warn(`${PRODUCT_NAME}: could not persist theme wallpaper darkness migration`, error);
      });
    }

    schedulePostPaintMaintenance();

    startupPhase("startupMaintenanceScheduled", {
      diagnostics: {
        firstSource: diagnostics.firstSource,
        bootGridReused: diagnostics.bootGridReused,
        bootGridAdopted: diagnostics.bootGridAdopted || document.documentElement.dataset.bootGridAdopted === "true",
        sessionReadMs: diagnostics.sessionReadMs,
        localReadMs: diagnostics.localReadMs,
        localNormalizationMs: diagnostics.localNormalizationMs,
        localAssetStorageMs: diagnostics.localAssetStorageMs,
        localAssetHydrationMs: diagnostics.localAssetHydrationMs,
        renderMs: diagnostics.renderMs,
        firstUsableMs: diagnostics.firstUsableMs
      }
    });

    if (devMetricsEnabled()) console.debug(`${PRODUCT_NAME} ${VERSION} performance`, {
      navigationType: diagnostics.navigationType,
      persisted: diagnostics.persisted,
      bootGrid: diagnostics.bootGrid,
      bootGridReused: diagnostics.bootGridReused,
      bootGridAdopted: diagnostics.bootGridAdopted || document.documentElement.dataset.bootGridAdopted === "true",
      firstSource: diagnostics.firstSource,
      sessionCacheStatus: diagnostics.sessionCacheStatus,
      sessionReadMs: diagnostics.sessionReadMs == null ? null : Number(diagnostics.sessionReadMs.toFixed(2)),
      sessionStorageMs: diagnostics.sessionStorageMs == null ? null : Number(diagnostics.sessionStorageMs.toFixed(2)),
      sessionValidationMs: diagnostics.sessionValidationMs == null ? null : Number(diagnostics.sessionValidationMs.toFixed(2)),
      localReadMs: diagnostics.localReadMs == null ? null : Number(diagnostics.localReadMs.toFixed(2)),
      localStorageMs: diagnostics.localStorageMs == null ? null : Number(diagnostics.localStorageMs.toFixed(2)),
      localNormalizationMs: diagnostics.localNormalizationMs == null ? null : Number(diagnostics.localNormalizationMs.toFixed(2)),
      localAssetStorageMs: diagnostics.localAssetStorageMs == null ? null : Number(diagnostics.localAssetStorageMs.toFixed(2)),
      localAssetHydrationMs: diagnostics.localAssetHydrationMs == null ? null : Number(diagnostics.localAssetHydrationMs.toFixed(2)),
      applySettingsMs: Number(diagnostics.applySettingsMs.toFixed(2)),
      renderMs: Number(diagnostics.renderMs.toFixed(2)),
      firstUsableMs: Number(diagnostics.firstUsableMs.toFixed(2)),
      authoritativeReconcileMs: Number(diagnostics.authoritativeReconcileMs.toFixed(2))
    });
  }

  function isMultipleSpacesEnabled(currentState = state) {
    if (typeof currentState?.firstPaint?.multipleSpacesEnabled === "boolean") return currentState.firstPaint.multipleSpacesEnabled;
    return currentState?.spaces?.personal?.settings?.multipleSpacesEnabled !== false;
  }

  function normalizedCustomSpaceName(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
  }

  function displaySpaceName(spaceId, currentState = state) {
    const authoritativeCustom = normalizedCustomSpaceName(currentState?.spaces?.[spaceId]?.settings?.spaceName);
    const renderSnapshotCustom = normalizedCustomSpaceName(currentState?.firstPaint?.spaceNames?.[spaceId]);
    const custom = authoritativeCustom || renderSnapshotCustom;
    return custom || t(spaceId === "work" ? "work" : "personal");
  }

  function updateSpaceSwitcher() {
    const enabled = isMultipleSpacesEnabled();
    if (spaceSwitcher) {
      spaceSwitcher.hidden = !enabled;
      spaceSwitcher.classList.remove("space-switcher-first-paint-pending");
    }
    for (const button of spaceButtons) {
      const spaceId = button.dataset.spaceId;
      button.textContent = displaySpaceName(spaceId);
      const selected = enabled && spaceId === state.activeSpaceId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    }
    if (shortcutDialog?.open) updateShortcutSpaceChoice();
  }

  function refreshDeviceSpaceSettings() {
    deviceDefaultSpace = readDeviceDefaultSpacePreference();
    if (settingsDefaultSpaceLabel) settingsDefaultSpaceLabel.textContent = t("openSpaceOnThisDevice");
    if (settingsSpaceKeyboardHint) settingsSpaceKeyboardHint.textContent = t("spaceKeyboardHint");
    if (!settingsDefaultSpace) return;
    const enabled = isMultipleSpacesEnabled();
    const options = [
      ["last", t("lastUsed")],
      ["personal", displaySpaceName("personal")],
      ["work", displaySpaceName("work")]
    ];
    settingsDefaultSpace.replaceChildren();
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (value === "work" && !enabled) option.disabled = true;
      settingsDefaultSpace.append(option);
    }
    if (!enabled && deviceDefaultSpace === "work") writeDeviceDefaultSpacePreference("personal");
    settingsDefaultSpace.value = deviceDefaultSpace;
  }

  function refreshSpacesSettings({ preserveActive = false } = {}) {
    if (!settingsMultipleSpaces) return false;
    const active = preserveActive ? document.activeElement : null;
    const enabled = isMultipleSpacesEnabled();
    let deferred = false;
    if (active === settingsMultipleSpaces) deferred = true;
    else settingsMultipleSpaces.checked = enabled;
    if (settingsPersonalSpaceName) {
      if (active === settingsPersonalSpaceName) deferred = true;
      else settingsPersonalSpaceName.value = displaySpaceName("personal");
    }
    if (settingsWorkSpaceName) {
      if (active === settingsWorkSpaceName) deferred = true;
      else settingsWorkSpaceName.value = displaySpaceName("work");
    }
    if (settingsSpaceNames) settingsSpaceNames.hidden = !enabled;
    if (settingsWorkSpaceNameRow) settingsWorkSpaceNameRow.hidden = false;
    refreshDeviceSpaceSettings();
    return deferred;
  }

  function updateShortcutSpaceChoice() {
    if (!shortcutSpaceField) return;
    const enabled = isMultipleSpacesEnabled();
    shortcutSpaceField.hidden = !enabled;
    if (!enabled) editingDestinationSpaceId = editingSourceSpaceId;
    for (const button of shortcutSpaceButtons) {
      const spaceId = button.dataset.shortcutSpace;
      const name = displaySpaceName(spaceId);
      button.textContent = name;
      const selected = spaceId === editingDestinationSpaceId;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.title = t("moveToSpace", { space: name });
      button.setAttribute("aria-label", t("moveToSpace", { space: name }));
    }
  }

  function crossSpaceDragPreserver() {
    if (crossSpaceDragPreserverEl?.isConnected) return crossSpaceDragPreserverEl;
    const holder = document.createElement("div");
    holder.className = "cross-space-drag-preserver";
    holder.setAttribute("aria-hidden", "true");
    document.body.append(holder);
    crossSpaceDragPreserverEl = holder;
    return holder;
  }

  function clearCrossSpaceHover() {
    clearTimeout(crossSpaceHoverTimer);
    crossSpaceHoverTimer = null;
    for (const button of spaceButtons) button.classList.remove("drag-space-target", "drag-space-ready");
  }

  function beginCrossSpaceDrag(shortcutId, parentFolderId, sourceElement) {
    if (!isMultipleSpacesEnabled() || !shortcutId) return;
    crossSpaceDrag = {
      shortcutId,
      sourceSpaceId: state.activeSpaceId,
      sourceParentFolderId: parentFolderId || null,
      sourceElement,
      previewSpaceId: state.activeSpaceId,
      committed: false
    };
  }

  function preserveCrossSpaceDragElement() {
    const sourceElement = crossSpaceDrag?.sourceElement;
    if (sourceElement?.isConnected && !sourceElement.parentElement?.classList?.contains("cross-space-drag-preserver")) {
      crossSpaceDragPreserver().append(sourceElement);
    }
  }

  async function previewSpaceDuringDrag(targetSpaceId) {
    const drag = crossSpaceDrag;
    if (!drag || !SPACE_IDS.includes(targetSpaceId) || targetSpaceId === drag.previewSpaceId) return;
    if (!state?.spaces) {
      const loaded = await ensureLocalStorage();
      state = loaded.state;
      meta = loaded.meta;
    }
    preserveCrossSpaceDragElement();
    closeDropChoice();
    closeFolder();
    state = await hydrateLocalAssetsForSpaceNormalized(state, targetSpaceId);
    state = selectActiveSpaceNormalized(state, targetSpaceId);
    drag.previewSpaceId = targetSpaceId;
    stateMutationGeneration += 1;
    applySettings();
    render();
    updateSpaceSwitcher();
    for (const button of spaceButtons) {
      button.classList.toggle("drag-space-ready", button.dataset.spaceId === targetSpaceId);
    }
    scheduleAppearanceHintRefresh(state.settings);
  }

  function destinationContainsShortcut(spaceId, shortcutId) {
    const workspace = state?.spaces?.[spaceId];
    if (!workspace) return false;
    return workspace.shortcuts.some(item => item.id === shortcutId || (item.type === "folder" && item.items.some(child => child.id === shortcutId)));
  }

  async function commitCrossSpaceDrag({ position = null, targetFolderId = "" } = {}) {
    const drag = crossSpaceDrag;
    if (!drag) return false;
    const targetSpaceId = state.activeSpaceId;
    if (targetSpaceId === drag.sourceSpaceId) return false;

    const beforeMove = state;
    const next = moveShortcutBetweenSpacesNormalized(beforeMove, {
      shortcutId: drag.shortcutId,
      fromSpaceId: drag.sourceSpaceId,
      toSpaceId: targetSpaceId,
      position,
      targetFolderId
    });
    const crossSpaceSyncIntent = meta.syncEnabled && meta.syncInitialized
      ? createCrossSpaceSyncIntentNormalized(beforeMove, next, {
          fromSpaceId: drag.sourceSpaceId,
          toSpaceId: targetSpaceId,
          shortcutIds: [drag.shortcutId],
          deviceId: meta.deviceId
        })
      : null;
    state = next;
    if (!destinationContainsShortcut(targetSpaceId, drag.shortcutId)) throw new Error(t("moveSpaceFailed"));

    drag.committed = true;
    drag.previewSpaceId = targetSpaceId;
    // writeLocalState persists the moved layout, active Space and recovery
    // intent in one storage.local call; avoid a separate active-Space write.
    await saveState({ crossSpaceSyncIntent });
    state = releaseLocalAssetsForSpaceNormalized(state, drag.sourceSpaceId);
    applySettings();
    render();
    updateSpaceSwitcher();
    clearCrossSpaceHover();
    showToast(t("movedToSpace", { space: displaySpaceName(targetSpaceId) }));
    requestMissingSiteIcons([drag.shortcutId]);
    return true;
  }

  async function endCrossSpaceDrag() {
    const drag = crossSpaceDrag;
    if (!drag) return;
    clearCrossSpaceHover();
    if (!drag.committed && drag.previewSpaceId !== drag.sourceSpaceId) {
      state = selectActiveSpaceNormalized(state, drag.sourceSpaceId);
      state = releaseLocalAssetsForSpaceNormalized(state, drag.previewSpaceId);
      stateMutationGeneration += 1;
      applySettings();
      render();
      updateSpaceSwitcher();
      scheduleAppearanceHintRefresh(state.settings);
    }
    if (drag.sourceElement?.parentElement?.classList?.contains("cross-space-drag-preserver")) drag.sourceElement.remove();
    crossSpaceDrag = null;
  }

  async function persistWorkspaceSetting(spaceId, key, value) {
    const baseState = writeBaseline;
    // This helper is currently used only for normalized Space names. Preserve
    // the trusted live state and let writeLocalStateWithBaseline remain the final
    // defensive persistence boundary instead of traversing all artwork twice.
    const normalized = state;
    const workspace = normalized.spaces[spaceId];
    const timestamp = nextMutationTime(workspace.settingsModifiedAt, workspace.updatedAt);
    const updatedWorkspace = { ...workspace, settings: { ...workspace.settings, [key]: value }, settingsModifiedAt: timestamp, updatedAt: Math.max(Number(workspace.updatedAt) || 0, timestamp) };
    state = replaceWorkspaceTrustedNormalized(normalized, spaceId, updatedWorkspace);
    stateMutationGeneration += 1;
    const persisted = await writeLocalStateWithBaseline(state, {
      baseState,
      baseStateIsCompact: Boolean(baseState),
      recordSyncMutation: meta?.syncEnabled && meta?.syncInitialized
    });
    state = persisted.state;
    writeBaseline = persisted.compactBaseline;
    updateSpaceSwitcher();
    refreshSpacesSettings();
    refreshFirstPaintCaches(state, meta);
  }

  async function setMultipleSpacesEnabled(enabled) {
    const baseState = writeBaseline;
    const normalized = state;
    const personal = normalized.spaces.personal;
    const timestamp = nextMutationTime(personal.settingsModifiedAt, personal.updatedAt);
    const updatedPersonal = { ...personal, settings: { ...personal.settings, multipleSpacesEnabled: enabled === true }, settingsModifiedAt: timestamp, updatedAt: Math.max(Number(personal.updatedAt) || 0, timestamp) };
    state = replaceWorkspaceTrustedNormalized(normalized, "personal", updatedPersonal);
    if (!enabled) {
      state = selectActiveSpaceNormalized(state, "personal");
      await writeActiveSpace("personal");
    }
    stateMutationGeneration += 1;
    const persisted = await writeLocalStateWithBaseline(state, {
      baseState,
      baseStateIsCompact: Boolean(baseState),
      recordSyncMutation: meta?.syncEnabled && meta?.syncInitialized
    });
    state = persisted.state;
    writeBaseline = persisted.compactBaseline;
    applySettings();
    render();
    updateSpaceSwitcher();
    refreshSpacesSettings();
    scheduleAppearanceHintRefresh(state.settings);
    refreshFirstPaintCaches(state, meta);
    if (enabled) preloadOtherSpaceBackgrounds();
  }

  async function switchActiveSpace(spaceId) {
    // Settings drafts belong to the Space that was active when the panel opened.
    // Do not let mouse clicks bypass the same lifecycle guard already used by
    // keyboard Space switching; otherwise a pending draft can be overlaid onto
    // the newly selected Space and broad rendering can occur behind Settings.
    if (isSettingsOpen()) return;
    if (!isMultipleSpacesEnabled() || !SPACE_IDS.includes(spaceId) || spaceId === state.activeSpaceId) return;
    devMark("newtab:space-switch:start");
    const generation = ++spaceSwitchGeneration;
    const previousSpaceId = state.activeSpaceId;
    closeFrequentContextMenu();
    closeBookmarkColorMenu();
    closeDropChoice();
    closeFolder();
    if (!state?.spaces) {
      const loaded = await ensureLocalStorage();
      state = loaded.state;
      meta = loaded.meta;
    }
    state = await hydrateLocalAssetsForSpaceNormalized(state, spaceId);
    const targetSettings = state.spaces?.[spaceId]?.settings;
    if (targetSettings) await preloadBackgroundForSettings(targetSettings);
    if (generation !== spaceSwitchGeneration) return;

    // Commit the destination Space visually in one synchronous frame. Persisting
    // the active-Space pointer happens afterwards, so storage latency can never
    // expose an unpainted/white frame between Personal and Work.
    state = selectActiveSpaceNormalized(state, spaceId);
    state = releaseLocalAssetsForSpaceNormalized(state, previousSpaceId);
    stateMutationGeneration += 1;
    applySettings();
    render();
    updateSpaceSwitcher();
    scheduleFrequentlyVisitedRefresh();
    scheduleAppearanceHintRefresh(state.settings);
    refreshFirstPaintCaches(state, meta);
    requestMissingSiteIcons();
    preloadOtherSpaceBackgrounds();
    devMark("newtab:space-switch:end");
    devMeasure("newtab:space-switch", "newtab:space-switch:start", "newtab:space-switch:end");

    activeSpacePersistQueue = activeSpacePersistQueue
      .catch(() => {})
      .then(() => writeActiveSpace(spaceId));
    void activeSpacePersistQueue.catch(error => console.warn(`${PRODUCT_NAME}: could not persist active Space`, error));
  }

  async function saveState({ localCacheOnly = false, crossSpaceSyncIntent = null } = {}) {
    const baseState = writeBaseline;
    state.schemaVersion = DEFAULT_STATE.schemaVersion;
    // User-visible/core mutations advance the synchronized revision. Device-local
    // cache hydration (favicons and reconstructed remote pixels) deliberately does
    // not: those pixels must never outrank a layout/title/URL edit from another PC.
    if (!localCacheOnly) {
      state.updatedAt = nextMutationTime(state.updatedAt);
      state.shortcuts = repairTopLevelPositions(state.shortcuts);
    }
    stateMutationGeneration += 1;
    const persisted = await writeLocalStateWithBaseline(state, {
      baseState,
      baseStateIsCompact: Boolean(baseState),
      crossSpaceSyncIntent,
      recordSyncMutation: !localCacheOnly && !crossSpaceSyncIntent && meta?.syncEnabled && meta?.syncInitialized
    });
    state = persisted.state;
    writeBaseline = persisted.compactBaseline;
    settlePersistedSettingsDraft();
    scheduleAppearanceHintRefresh(state.settings);
    refreshFirstPaintCaches(state, meta);
  }

  function markSettingsChanged() {
    const timestamp = nextMutationTime(state.settingsModifiedAt, state.updatedAt);
    state.settingsModifiedAt = timestamp;
    state.updatedAt = Math.max(Number(state.updatedAt) || 0, timestamp);
  }

  function rememberPendingSettings(keys) {
    for (const key of keys || []) {
      if (!Object.prototype.hasOwnProperty.call(state.settings || {}, key)) continue;
      pendingSettingsDraft.set(key, state.settings[key]);
    }
  }

  function applyPendingSettingsDraft() {
    if (!pendingSettingsDraft.size || !state?.settings) return false;
    let changed = false;
    for (const [key, value] of pendingSettingsDraft) {
      if (Object.is(state.settings[key], value)) continue;
      state.settings[key] = value;
      changed = true;
    }
    if (changed) markSettingsChanged();
    return changed;
  }

  function settlePersistedSettingsDraft() {
    if (!pendingSettingsDraft.size || !state?.settings) return;
    for (const [key, value] of pendingSettingsDraft) {
      if (Object.is(state.settings[key], value)) pendingSettingsDraft.delete(key);
    }
  }

  async function saveSettingsState(options = {}) {
    try {
      await saveState(options);
    } catch (error) {
      // Keep every unsaved local intention live after a failed persistence attempt.
      applyPendingSettingsDraft();
      throw error;
    }

    // saveState() adopts the persisted/rebased result and settles every draft
    // value that actually reached storage. A newer gesture may have landed while
    // that write was in flight; re-overlay those still-dirty values now.
    applyPendingSettingsDraft();
  }

  // ---------------------------------------------------------------------------
  // Appearance and grid rendering
  // ---------------------------------------------------------------------------
  function updateThemeToggle() {
    const current = state.settings.theme || "system";
    themeToggle?.querySelectorAll("[data-theme-choice]").forEach(button => {
      const selected = button.dataset.themeChoice === current;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function cssColorLuminance(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const probe = document.createElement("span");
    probe.style.color = value;
    if (!probe.style.color) return null;
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const match = /^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i.exec(computed);
    if (!match) return null;
    const r = Math.min(255, Math.max(0, Number(match[1]))) / 255;
    const g = Math.min(255, Math.max(0, Number(match[2]))) / 255;
    const b = Math.min(255, Math.max(0, Number(match[3]))) / 255;
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  function firefoxThemeLooksDark(themeInfo) {
    const colors = themeInfo?.colors;
    if (!colors || typeof colors !== "object") return null;
    for (const candidate of [colors.toolbar, colors.frame, colors.tab_selected]) {
      const luminance = cssColorLuminance(candidate);
      if (luminance != null) return luminance < 0.5;
    }
    return null;
  }

  async function refreshResolvedSystemTheme() {
    const generation = ++systemThemeResolutionGeneration;
    const mediaDark = systemThemeMedia.matches;
    let firefoxDark = null;
    try {
      if (browser.theme?.getCurrent) firefoxDark = firefoxThemeLooksDark(await browser.theme.getCurrent());
    } catch {
      // Theme introspection is only a reliability hint. prefers-color-scheme
      // remains the standards-based fallback if Firefox exposes no theme data.
    }
    if (generation !== systemThemeResolutionGeneration) return;

    // Resolve both theme signals before painting. A speculative media-only paint
    // could briefly show the wrong wallpaper, and only the newest overlapping
    // async resolver is allowed to commit.
    const next = mediaDark || firefoxDark === true ? "dark" : "light";
    if (next === resolvedSystemTheme) return;
    resolvedSystemTheme = next;
    if ((state.settings.theme || "system") === "system") {
      applyThemeTransition();
    }
  }

  function effectiveThemeFor(settings = state.settings) {
    const configured = settings?.theme || "system";
    return configured === "system" ? resolvedSystemTheme : configured;
  }

  function effectiveTheme() {
    return effectiveThemeFor(state.settings);
  }

  function effectiveBackgroundColor(settings = state.settings) {
    if (settings?.backgroundColorCustomized === true) {
      return validHex(settings.backgroundColor) ? settings.backgroundColor : DEFAULT_STATE.settings.backgroundColor;
    }
    return effectiveThemeFor(settings) === "light"
      ? DEFAULT_LIGHT_BACKGROUND_COLOR
      : DEFAULT_STATE.settings.backgroundColor;
  }

  function effectiveBackgroundPresetId(settings = state.settings) {
    if (settings?.themeWallpapersEnabled === true) {
      const override = effectiveThemeFor(settings) === "light"
        ? settings.lightBackgroundPreset
        : settings.darkBackgroundPreset;
      if (override && BACKGROUND_PRESETS[override]) return override;
    }
    return settings?.backgroundPreset || "";
  }

  function effectiveBackgroundDim(settings = state.settings) {
    return effectiveBackgroundDimForTheme(settings, effectiveThemeFor(settings));
  }

  function initializeThemeWallpaperDimsForState(targetState) {
    if (!targetState?.spaces) return false;
    let changed = false;
    for (const spaceId of SPACE_IDS) {
      const workspace = targetState.spaces?.[spaceId];
      if (!workspace?.settings || workspace.settings.themeWallpapersEnabled !== true) continue;
      const initialized = initializeThemeWallpaperDims(workspace.settings, effectiveThemeFor(workspace.settings));
      if (!initialized.changed) continue;
      workspace.settings.lightBackgroundDim = initialized.lightBackgroundDim;
      workspace.settings.darkBackgroundDim = initialized.darkBackgroundDim;
      const timestamp = nextMutationTime(workspace.settingsModifiedAt, workspace.updatedAt, targetState.updatedAt);
      workspace.settingsModifiedAt = timestamp;
      workspace.updatedAt = timestamp;
      changed = true;
    }
    return changed;
  }

  function effectiveBackgroundImageValue(settings = state.settings) {
    return effectiveBackgroundPresetId(settings) ? "" : (settings?.backgroundImage || "");
  }

  function effectiveCanvasText() {
    const preset = BACKGROUND_PRESETS[effectiveBackgroundPresetId(state.settings)];
    if (preset?.canvasText) return preset.canvasText;
    if (effectiveBackgroundDim(state.settings) >= 18) return "light";
    if (!effectiveBackgroundImageValue(state.settings) && !state.settings.backgroundImageDeferred) {
      return hexLuminance(effectiveBackgroundColor(state.settings)) > 0.46 ? "dark" : "light";
    }
    return effectiveTheme() === "dark" ? "light" : "dark";
  }

  let lastAppliedGeometryKey = "";
  function applySettings({ deferHeavyAssets = false } = {}) {
    const settings = state.settings;
    const tileSize = clampInt(settings.tileSize, 60, 96, 76);
    const geometryKey = `${settings.columns}:${tileSize}`;
    if (geometryKey !== lastAppliedGeometryKey) {
      lastAppliedGeometryKey = geometryKey;
      const iconSize = Math.round(tileSize * 53 / 76);
      const scale = tileSize / 76;
      document.documentElement.style.setProperty("--columns", String(settings.columns));
      document.documentElement.style.setProperty("--tile-size", `${tileSize}px`);
      document.documentElement.style.setProperty("--shortcut-icon-size", `${iconSize}px`);
      document.documentElement.style.setProperty("--folder-mosaic-cell-size", `${Math.max(20, Math.round(25 * scale))}px`);
      document.documentElement.style.setProperty("--folder-mosaic-icon-size", `${Math.max(15, Math.round(19 * scale))}px`);
      document.documentElement.style.setProperty("--folder-mosaic-gap", `${Math.max(3, Math.round(4 * scale))}px`);
      document.documentElement.style.setProperty("--folder-mosaic-padding", `${Math.max(5, Math.round(7 * scale))}px`);
      document.documentElement.style.setProperty("--folder-item-tile-size", `${Math.max(44, Math.round(54 * scale))}px`);
      document.documentElement.style.setProperty("--folder-item-icon-size", `${Math.max(30, Math.round(36 * scale))}px`);
      document.documentElement.style.setProperty("--col-gap", `${Math.round(27 * scale)}px`);
      document.documentElement.style.setProperty("--row-gap", `${Math.round(26 * scale)}px`);
    }
    // applyPageBackgroundVisual establishes the dim before the authoritative
    // wallpaper when Settings is closed. While Settings is open it intentionally
    // leaves every full-viewport paint layer untouched, avoiding Firefox/Linux
    // compositor invalidation that can blank the dialog descendants.
    applyPageBackgroundVisual({ deferHeavyAssets });

    applyThemeSkinVisual();

    brand.hidden = !settings.brandVisible;
  }

  function paintAppearancePreviewLayer(renderedBackgroundColor, resolvedBackground, { deferCustomBackground = false } = {}) {
    if (!appearancePreviewLayer || !appearancePreviewImage) return false;
    appearancePreviewLayer.style.backgroundColor = renderedBackgroundColor;
    appearancePreviewLayer.style.setProperty("--appearance-preview-dim", String(effectiveBackgroundDim(state.settings) / 100));
    if (!deferCustomBackground) {
      if (resolvedBackground) {
        appearancePreviewImage.src = resolvedBackground;
        appearancePreviewImage.hidden = false;
      } else {
        appearancePreviewImage.hidden = true;
        appearancePreviewImage.removeAttribute("src");
      }
    }
    appearancePreviewLayer.hidden = false;
    return true;
  }

  function clearAppearancePreviewLayer() {
    if (!appearancePreviewLayer) return;
    appearancePreviewLayer.hidden = true;
    appearancePreviewLayer.style.backgroundColor = "";
    appearancePreviewLayer.style.removeProperty("--appearance-preview-dim");
    if (appearancePreviewImage) {
      appearancePreviewImage.hidden = true;
      appearancePreviewImage.removeAttribute("src");
    }
  }

  function applyPageBackgroundVisual({ deferHeavyAssets = false } = {}) {
    const settings = state.settings;
    const renderedBackgroundColor = effectiveBackgroundColor(settings);
    const effectivePresetId = effectiveBackgroundPresetId(settings);
    const effectiveImage = effectiveBackgroundImageValue(settings);
    const resolvedBackground = resolveBackgroundImage(effectivePresetId, effectiveImage);
    const deferCustomBackground = deferHeavyAssets && settings.backgroundImageDeferred === true && !effectivePresetId;

    // Firefox/Linux can lose the painted descendants of the open Settings surface
    // when the real full-viewport page/root background churns underneath it. While
    // Settings is open, mirror only the requested appearance onto the isolated,
    // paint-contained preview surface and defer one authoritative page commit.
    if (isSettingsOpen()) {
      paintAppearancePreviewLayer(renderedBackgroundColor, resolvedBackground, { deferCustomBackground });
      deferredAppearanceVisual = true;
      return;
    }

    document.documentElement.style.setProperty("--background-dim", String(effectiveBackgroundDim(settings) / 100));
    document.documentElement.style.setProperty("--page-bg", renderedBackgroundColor);
    page.style.backgroundColor = renderedBackgroundColor;
    page.style.backgroundSize = "cover";
    page.style.backgroundPosition = "center center";
    if (!deferCustomBackground) {
      page.style.backgroundImage = resolvedBackground ? `url(${cssUrl(resolvedBackground)})` : "none";
      // The authoritative/preset background now owns the page; release the tiny
      // first-paint preview string from the root style as soon as it is obsolete.
      document.documentElement.style.removeProperty("--boot-background-image");
    }
    document.documentElement.dataset.canvasText = effectiveCanvasText();
    clearAppearancePreviewLayer();
  }

  function applyThemeSkinVisual() {
    const configuredTheme = state.settings.theme || "system";
    const theme = effectiveTheme();
    document.documentElement.dataset.theme = configuredTheme;
    document.documentElement.dataset.effectiveTheme = theme;
    document.documentElement.style.colorScheme = theme;
    updateThemeToggle();
  }

  function resolveBackgroundImage(presetId, image) {
    const preset = BACKGROUND_PRESETS[presetId];
    if (preset) return browser.runtime.getURL(preset.file);
    return image || "";
  }

  function cssUrl(value) {
    return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }


  function clampUnit(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  function hexToRgb(hex) {
    if (!validHex(hex)) return null;
    const value = String(hex).slice(1);
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHsv({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
      else hue = 60 * (((red - green) / delta) + 4);
    }
    if (hue < 0) hue += 360;
    return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
  }

  function hsvToHex(hue, saturation, value) {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = clampUnit(saturation);
    const v = clampUnit(value);
    const chroma = v * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const match = v - chroma;
    let rgb = [0, 0, 0];
    if (h < 60) rgb = [chroma, x, 0];
    else if (h < 120) rgb = [x, chroma, 0];
    else if (h < 180) rgb = [0, chroma, x];
    else if (h < 240) rgb = [0, x, chroma];
    else if (h < 300) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    return `#${rgb.map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function normalizeHexColor(value) {
    let text = String(value || "").trim();
    if (/^[0-9a-f]{6}$/i.test(text)) text = `#${text}`;
    return validHex(text) ? text.toLowerCase() : "";
  }

  function updateColorPickerVisuals() {
    if (!backgroundColorHex) return;
    const hex = hsvToHex(colorPickerHue, colorPickerSaturation, colorPickerValue);
    backgroundColorHex.value = hex;
    if (backgroundColorHue) backgroundColorHue.value = String(Math.round(colorPickerHue));
    if (backgroundColorPlane) backgroundColorPlane.style.setProperty("--picker-hue", hsvToHex(colorPickerHue, 1, 1));
    if (backgroundColorThumb) {
      backgroundColorThumb.style.left = `${colorPickerSaturation * 100}%`;
      backgroundColorThumb.style.top = `${(1 - colorPickerValue) * 100}%`;
    }
    if (settingsBackgroundColorSwatch) settingsBackgroundColorSwatch.style.backgroundColor = hex;
  }

  function setColorPickerFromHex(hex) {
    const normalized = normalizeHexColor(hex) || DEFAULT_STATE.settings.backgroundColor;
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb);
    colorPickerHue = hsv.h;
    colorPickerSaturation = hsv.s;
    colorPickerValue = hsv.v;
    updateColorPickerVisuals();
  }

  function applyColorPickerLive({ persistDelay = 140 } = {}) {
    pendingBackgroundColorCustomized = true;
    updateColorPickerVisuals();
    applyBackgroundControlsLive({ persistDelay });
  }

  function closeBackgroundColorPicker() {
    if (!backgroundColorPopover || backgroundColorPopover.hidden) return;
    backgroundColorPopover.hidden = true;
    settingsBackgroundColorButton?.setAttribute("aria-expanded", "false");
  }

  function toggleBackgroundColorPicker() {
    if (!backgroundColorPopover) return;
    const opening = backgroundColorPopover.hidden;
    backgroundColorPopover.hidden = !opening;
    settingsBackgroundColorButton?.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) {
      setColorPickerFromHex(effectiveBackgroundColor(state.settings));
      queueMicrotask(() => backgroundColorPlane?.focus({ preventScroll: true }));
    }
  }

  function updateColorPlaneFromPointer(event) {
    if (!backgroundColorPlane) return;
    const rect = colorPlaneRect || backgroundColorPlane.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    colorPickerSaturation = clampUnit((event.clientX - rect.left) / rect.width);
    colorPickerValue = clampUnit(1 - ((event.clientY - rect.top) / rect.height));
    applyColorPickerLive();
  }

  function isAwaitingRemote(currentMeta = meta) {
    return Boolean(
      currentMeta?.syncEnabled &&
      !currentMeta?.syncInitialized &&
      currentMeta?.syncBootstrapMode === "await-remote"
    );
  }

  function render() {
    devMark("newtab:render:start");
    const openFolderWas = activeFolderId;
    grid.replaceChildren();

    const awaitingRemote = isAwaitingRemote();
    syncPendingState.hidden = !awaitingRemote;

    if (awaitingRemote) {
      emptyState.hidden = true;
      grid.hidden = false;
      if (!folderPopover.hidden) closeFolder();
      const capacity = state.settings.columns * state.settings.rows;
      const fragment = document.createDocumentFragment();
      for (let position = 0; position < capacity; position += 1) {
        fragment.append(createWaitingSlot(position));
      }
      grid.append(fragment);
      updateSyncWaitNotice();
      devMark("newtab:render:end");
      devMeasure("newtab:render", "newtab:render:start", "newtab:render:end");
      startupPhase("authoritativeGridRendered");
      unlockLauncherInteractionIfVerified();
      return;
    }
    clearTimeout(syncWaitNoticeTimer);
    syncWaitNoticeTimer = null;

    const capacity = state.settings.columns * state.settings.rows;
    const byPosition = shortcutOrderMode === "recent"
      ? new Map(recentGridItems(capacity).map((item, index) => [index, item]))
      : new Map(state.shortcuts.map(item => [item.position, item]));

    emptyState.hidden = state.shortcuts.length !== 0;
    grid.hidden = state.shortcuts.length === 0;

    const fragment = document.createDocumentFragment();
    for (let position = 0; position < capacity; position += 1) {
      const item = byPosition.get(position);
      fragment.append(item ? createTopLevelSlot(item) : createEmptySlot(position));
    }
    grid.append(fragment);

    if (openFolderWas) {
      const folder = getTopLevelItem(openFolderWas);
      const anchor = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(openFolderWas)}"]`);
      if (folder?.type === "folder" && anchor && !folderPopover.hidden) {
        renderFolderContents(folder);
        positionFolderPopover(anchor);
      } else if (!folder || folder.type !== "folder") {
        closeFolder();
      }
    }
    devMark("newtab:render:end");
    devMeasure("newtab:render", "newtab:render:start", "newtab:render:end");
    startupPhase("authoritativeGridRendered");
    unlockLauncherInteractionIfVerified();
  }

  function createWaitingSlot(position) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot sync-waiting-slot";
    slot.dataset.position = String(position);

    const tile = document.createElement("div");
    tile.className = "tile";
    const icon = document.createElement("span");
    icon.className = "sync-waiting-icon";
    tile.append(icon);

    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.setAttribute("aria-hidden", "true");
    slot.append(tile, label);
    return slot;
  }

  function updateSyncWaitNotice() {
    if (!syncPendingMessage) return;
    clearTimeout(syncWaitNoticeTimer);
    syncWaitNoticeTimer = null;

    const startedAt = Number(meta?.syncWaitStartedAt) || Date.now();
    const elapsed = Math.max(0, Date.now() - startedAt);
    const tenMinutes = 10 * 60 * 1000;
    if (elapsed >= tenMinutes) {
      syncPendingMessage.textContent = t("syncTakingLong");
      return;
    }

    syncPendingMessage.textContent = t("syncDeliveryEveryMinute");
    syncWaitNoticeTimer = setTimeout(() => {
      if (meta?.syncEnabled && !meta?.syncInitialized && meta?.syncBootstrapMode === "await-remote") {
        updateSyncWaitNotice();
      }
    }, Math.max(1000, tenMinutes - elapsed));
  }

  function createTopLevelSlot(item) {
    return item.type === "folder" ? createFolderSlot(item) : createShortcutSlot(item);
  }

  function shortcutNavigationUrl(item) {
    return safeShortcutNavigationUrl(item?.url);
  }

  function navigateToShortcut(item) {
    const url = shortcutNavigationUrl(item);
    if (!url) return false;
    window.location.assign(url);
    return true;
  }

  function openShortcutInNewTab(item, { recordUsage = true } = {}) {
    const url = shortcutNavigationUrl(item);
    if (!url) return false;
    if (recordUsage) recordShortcutOpened(item.id);
    void browser.runtime.sendMessage({ type: "mosaicsync:expect-shortcut-navigation", shortcutId: item.id }).catch(() => {});
    void browser.tabs.create({ url, active: false }).catch(error => console.warn(`${PRODUCT_NAME}: could not open shortcut in new tab`, error));
    return true;
  }

  function configureShortcutSlotInteractions(slot, item) {
    if (!slot || slot.dataset.interactive === "true") return Boolean(slot);
    const card = slot.querySelector(":scope > .shortcut-card");
    if (!card || String(card.localName || card.tagName || "").toLowerCase() !== "a") return false;
    slot.className = "shortcut-slot";
    slot.dataset.id = item.id;
    slot.draggable = shortcutOrderMode !== "recent";
    const navigationUrl = shortcutNavigationUrl(item);
    if (navigationUrl) card.href = navigationUrl;
    else card.removeAttribute("href");
    card.draggable = false;
    card.rel = "noreferrer";
    card.title = `${item.title}\n${item.url}`;
    card.setAttribute("aria-label", `${item.title}, ${item.url}`);

    card.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0) return;
      const opensElsewhere = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      recordShortcutOpened(item.id, { renderRecent: opensElsewhere });
      if (opensElsewhere) return;
      void browser.runtime.sendMessage({ type: "mosaicsync:expect-shortcut-navigation", shortcutId: item.id }).catch(() => {});
    });

    const automaticNeedsWebAccess = !item.image && !item.builtinIcon && state.settings.autoSiteIcons;
    const remoteImageNeedsWebAccess = !item.image && item.imageSourceKind === "remote" &&
      item.imageSourceUrl && !state.settings.webAccessPrompted;
    if ((automaticNeedsWebAccess || remoteImageNeedsWebAccess) && !webAccessGranted) {
      card.addEventListener("click", event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (webAccessGranted) return;
        event.preventDefault();
        const permissionPromise = requestWebAccessFromGesture();
        void permissionPromise.then(async granted => {
          webAccessGranted = granted === true;
          state.settings.webAccessPrompted = true;
          if (!webAccessGranted && state.settings.autoSiteIcons) {
            state.settings.autoSiteIcons = false;
            if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
          }
          try { await saveState({ localCacheOnly: true }); } catch {}
          if (webAccessGranted && state.settings.autoSiteIcons) requestMissingSiteIcons([item.id], { force: true });
          navigateToShortcut(item);
        }).catch(async () => {
          state.settings.webAccessPrompted = true;
          if (state.settings.autoSiteIcons) {
            state.settings.autoSiteIcons = false;
            if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
          }
          try { await saveState({ localCacheOnly: true }); } catch {}
          navigateToShortcut(item);
        });
      });
    }

    let edit = slot.querySelector(":scope > .edit-chip");
    if (!edit) {
      edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-chip";
      edit.textContent = "⋯";
      slot.append(edit);
    }
    edit.title = `${t("editShortcut")}: ${item.title}`;
    edit.setAttribute("aria-label", `${t("editShortcut")}: ${item.title}`);
    edit.addEventListener("click", event => {
      event.stopPropagation();
      openShortcutEditor(item, null);
    });

    card.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      openShortcutInNewTab(item);
    });
    card.addEventListener("auxclick", event => {
      if (event.button !== 1) return;
      recordShortcutOpened(item.id);
      void browser.runtime.sendMessage({ type: "mosaicsync:expect-shortcut-navigation", shortcutId: item.id }).catch(() => {});
    });
    if (shortcutOrderMode !== "recent") attachDragHandlers(slot, item);
    slot.dataset.interactive = "true";
    return true;
  }

  function createShortcutSlot(item) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot";
    slot.dataset.id = item.id;

    const card = document.createElement("a");
    card.className = "shortcut-card";
    const tile = document.createElement("span");
    tile.className = `tile ${item.imageStyle === "cover" ? "cover" : ""}`.trim();
    applyShortcutColorTag(tile, item);
    appendImageOrFallback(tile, item.image, item.title, item.builtinIcon, item);
    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = item.title;
    card.append(tile, label);
    slot.append(card);
    configureShortcutSlotInteractions(slot, item);
    return slot;
  }

  function configureFolderSlotInteractions(slot, folder) {
    if (!slot || slot.dataset.interactive === "true") return Boolean(slot);
    const card = slot.querySelector(":scope > .shortcut-card.folder-card");
    if (!card) return false;
    slot.className = "shortcut-slot folder-slot";
    slot.dataset.id = folder.id;
    slot.draggable = shortcutOrderMode !== "recent";
    card.type = "button";
    const folderName = folder.title || "Folder";
    card.title = `${folderName}\n${t("folderContains", { count: folder.items.length })}`;
    card.setAttribute("aria-label", `${folderName} · ${t("folderContains", { count: folder.items.length })}`);
    card.addEventListener("click", event => {
      event.stopPropagation();
      if (activeFolderId === folder.id && !folderPopover.hidden) {
        commitFolderTitle().catch(console.error);
        closeFolder();
        return;
      }
      openFolder(folder, slot, false);
    });

    let edit = slot.querySelector(":scope > .edit-chip");
    if (!edit) {
      edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-chip";
      edit.textContent = "⋯";
      slot.append(edit);
    }
    edit.title = `${t("folder")}: ${folderName}`;
    edit.setAttribute("aria-label", `${t("folder")}: ${folderName}`);
    edit.addEventListener("click", event => {
      event.stopPropagation();
      openFolder(folder, slot, true);
    });
    slot.addEventListener("contextmenu", event => {
      event.preventDefault();
      openFolder(folder, slot, true);
    });
    if (shortcutOrderMode !== "recent") attachDragHandlers(slot, folder);
    slot.dataset.interactive = "true";
    return true;
  }

  function createFolderSlot(folder) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot folder-slot";
    slot.dataset.id = folder.id;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shortcut-card folder-card";
    const tile = document.createElement("span");
    tile.className = "tile folder-tile";
    const mosaic = document.createElement("span");
    mosaic.className = "folder-mosaic";
    for (const child of folder.items.slice(0, 4)) {
      const cell = document.createElement("span");
      cell.className = `folder-mosaic-cell ${child.imageStyle === "cover" ? "cover" : ""}`.trim();
      applyShortcutColorTag(cell, child);
      appendImageOrFallback(cell, child.image, child.title, child.builtinIcon, child);
      mosaic.append(cell);
    }
    tile.append(mosaic);
    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = folder.title || "Folder";
    card.append(tile, label);
    slot.append(card);
    configureFolderSlotInteractions(slot, folder);
    return slot;
  }

  function attachDragHandlers(slot, item) {
    slot.addEventListener("dragstart", event => {
      closeDropChoice();
      closeFolder();
      dragId = item.id;
      if (item.type === "shortcut") beginCrossSpaceDrag(item.id, null, slot);
      slot.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
    });

    slot.addEventListener("dragend", () => {
      dragId = null;
      document.querySelectorAll(".shortcut-slot").forEach(el => el.classList.remove("dragging", "drag-over", "drag-over-empty"));
      void endCrossSpaceDrag();
    });

    slot.addEventListener("dragover", event => {
      if (!dragId || dragId === item.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      slot.classList.add("drag-over");
    });

    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));

    slot.addEventListener("drop", event => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const sourceId = dragId || event.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === item.id) return;
      if (crossSpaceDrag?.shortcutId === sourceId && crossSpaceDrag.sourceSpaceId !== state.activeSpaceId) {
        const targetFolderId = item.type === "folder" ? item.id : "";
        void commitCrossSpaceDrag({ position: item.position, targetFolderId }).catch(error => showToast(error.message || t("moveSpaceFailed")));
        return;
      }
      showDropChoice(sourceId, item.id, slot).catch(console.error);
    });
  }

  function createEmptySlot(position) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot empty-slot";
    slot.dataset.slotPosition = String(position);

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-slot";
    add.title = t("addShortcut");
    add.setAttribute("aria-label", t("addShortcut"));
    const plus = document.createElement("span");
    plus.textContent = "+";
    add.append(plus);
    add.addEventListener("click", () => openShortcutEditor(null, null, shortcutOrderMode === "recent" ? null : position));

    slot.addEventListener("dragover", event => {
      // Recent is a presentation view, never a canonical-layout editor. A visual
      // Recent slot has no stable meaning in Manual order, so top-level grid
      // drops are deliberately unavailable until the user returns to Manual.
      if (shortcutOrderMode === "recent") {
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      if (!dragId && !frequentDragSite) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = frequentDragSite ? "copy" : "move";
      slot.classList.add("drag-over-empty");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over-empty"));
    slot.addEventListener("drop", async event => {
      event.preventDefault();
      event.stopPropagation();
      slot.classList.remove("drag-over-empty");
      if (shortcutOrderMode === "recent") {
        frequentDragSite = null;
        return;
      }
      if (frequentDragSite) {
        const site = frequentDragSite;
        frequentDragSite = null;
        try { await addFrequentSiteToMosaicSync(site, { position }); }
        catch (error) { showToast(error?.message || t("operationFailed")); }
        return;
      }
      const sourceId = dragId || event.dataTransfer.getData("text/plain");
      if (!sourceId) return;
      if (crossSpaceDrag?.shortcutId === sourceId && crossSpaceDrag.sourceSpaceId !== state.activeSpaceId) {
        try { await commitCrossSpaceDrag({ position }); }
        catch (error) { showToast(error.message || t("moveSpaceFailed")); }
        return;
      }
      let moved = moveTopLevelItemToPosition(sourceId, position);
      if (!moved) {
        const nested = findShortcutRecord(sourceId);
        if (nested?.parentFolder) {
          const next = moveShortcutOutOfFolder(state, {
            shortcutId: sourceId,
            spaceId: state.activeSpaceId,
            position
          });
          const extracted = next.shortcuts.find(item => item?.type === "shortcut" && item.id === sourceId);
          if (extracted?.position === position) {
            state = next;
            moved = true;
            closeFolder();
          }
        }
      }
      if (moved) {
        await saveState();
        render();
        showToast(t("movedEmpty"));
      }
    });

    slot.append(add);
    return slot;
  }

  function applyShortcutColorTag(container, item) {
    if (!container) return;
    const colorTag = SHORTCUT_COLOR_TAG_KEYS.includes(item?.colorTag) ? item.colorTag : "";
    if (colorTag) container.dataset.colorTag = colorTag;
    else delete container.dataset.colorTag;
  }

  function validBootArtworkPreview(value) {
    return typeof value === "string" && value.length <= RENDER_PREVIEW_MAX_CHARS &&
      /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/i.test(value);
  }

  function bootArtworkPreviewFor(item) {
    if (!item?.id) return "";
    const currentKey = String(item.localImageAssetId || item.imageAssetId || "");
    if (!currentKey) return "";
    const cached = bootArtworkPreviews.get(item.id);
    if (!cached || cached.imageKey !== currentKey || !validBootArtworkPreview(cached.preview)) return "";
    return cached.preview;
  }

  function createArtworkImage(source, { layer = false } = {}) {
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.decoding = "async";
    if (layer) img.classList.add("artwork-layer");
    img.src = source;
    return img;
  }

  function appendImageOrFallback(container, image, title, builtinIcon = "", item = null) {
    const preview = builtinIcon ? "" : bootArtworkPreviewFor(item);
    if (image) {
      // Keep the already-decoded tiny first-frame derivative visible until the
      // authoritative image is actually decodable. Older CPUs therefore never
      // regress from recognizable artwork to an empty/fallback tile while the
      // browser works through the full data URL.
      const previewImg = preview ? createArtworkImage(preview, { layer: true }) : null;
      const img = createArtworkImage(image, { layer: Boolean(previewImg) });
      if (previewImg) img.style.visibility = "hidden";

      let failed = false;
      const reveal = () => {
        if (failed) return;
        img.style.visibility = "";
        previewImg?.remove();
      };
      img.addEventListener("load", () => {
        if (!previewImg) return;
        if (typeof img.decode === "function") {
          void img.decode().then(reveal).catch(() => requestAnimationFrame(reveal));
        } else {
          requestAnimationFrame(reveal);
        }
      }, { once: true });
      img.addEventListener("error", () => {
        failed = true;
        img.remove();
        if (previewImg) return;
        if (!globalThis.__mosaicsyncBuiltinIcons?.append?.(container, builtinIcon)) container.append(createFallback(title));
      }, { once: true });
      if (previewImg) container.append(previewImg);
      container.append(img);
    } else if (preview) {
      container.append(createArtworkImage(preview));
    } else if (!globalThis.__mosaicsyncBuiltinIcons?.append?.(container, builtinIcon)) {
      container.append(createFallback(title));
    }
  }

  function createFallback(title) {
    const fallback = document.createElement("span");
    fallback.className = "fallback-icon";
    fallback.textContent = firstGrapheme(title || "?");
    return fallback;
  }

  function firstGrapheme(value) {
    const text = String(value || "?").trim();
    if (!text) return "?";
    if (!graphemeSegmenter) return text.slice(0, 1).toUpperCase();
    try {
      return graphemeSegmenter.segment(text)[Symbol.iterator]().next().value.segment.toUpperCase();
    } catch {
      return text.slice(0, 1).toUpperCase();
    }
  }

  // ---------------------------------------------------------------------------
  // Layout mutation and drag/drop
  // ---------------------------------------------------------------------------
  function getTopLevelItem(id) {
    return state.shortcuts.find(item => item.id === id) || null;
  }

  function findShortcutRecord(id) {
    const topIndex = state.shortcuts.findIndex(item => item.id === id && item.type !== "folder");
    if (topIndex >= 0) {
      return { item: state.shortcuts[topIndex], array: state.shortcuts, index: topIndex, parentFolder: null };
    }

    for (const folder of state.shortcuts) {
      if (folder.type !== "folder") continue;
      const childIndex = folder.items.findIndex(item => item.id === id);
      if (childIndex >= 0) {
        return { item: folder.items[childIndex], array: folder.items, index: childIndex, parentFolder: folder };
      }
    }
    return null;
  }

  function swapTopLevelItems(sourceId, targetId) {
    const source = getTopLevelItem(sourceId);
    const target = getTopLevelItem(targetId);
    if (!source || !target) return false;
    const sourcePosition = source.position;
    const timestamp = nextMutationTime(state.updatedAt, source.modifiedAt, target.modifiedAt);
    source.position = target.position;
    target.position = sourcePosition;
    source.modifiedAt = timestamp;
    target.modifiedAt = timestamp;
    return true;
  }

  function moveTopLevelItemToPosition(sourceId, position) {
    const source = getTopLevelItem(sourceId);
    if (!source || !Number.isInteger(position) || position < 0) return false;
    if (state.shortcuts.some(item => item.id !== sourceId && item.position === position)) return false;
    source.position = position;
    source.modifiedAt = nextMutationTime(state.updatedAt, source.modifiedAt);
    return true;
  }

  function firstEmptyTopLevelPosition(preferred = null) {
    const capacity = state.settings.columns * state.settings.rows;
    const occupied = new Set(state.shortcuts.map(item => item.position));
    if (Number.isInteger(preferred) && preferred >= 0 && !occupied.has(preferred)) return preferred;
    for (let position = 0; position < capacity; position += 1) {
      if (!occupied.has(position)) return position;
    }
    let position = capacity;
    while (occupied.has(position)) position += 1;
    return position;
  }

  async function showDropChoice(sourceId, targetId, targetSlot) {
    const source = getTopLevelItem(sourceId);
    const target = getTopLevelItem(targetId);
    if (!source || !target) return;

    // Folders never nest, so dropping a folder onto another occupied slot is unambiguous.
    if (source.type === "folder") {
      if (!swapTopLevelItems(sourceId, targetId)) return;
      await saveState();
      render();
      showToast(t("folderMoved"));
      return;
    }

    // Dropping a shortcut on a folder has one natural meaning: put it inside.
    // Do it immediately instead of interrupting the drag with a choice popover.
    if (target.type === "folder" && source.type === "shortcut") {
      await addTopLevelShortcutToFolder(sourceId, targetId);
      return;
    }

    await ensureSecondaryStyles();
    pendingDrop = { sourceId, targetId };
    dropMoveButton.querySelector("strong").textContent = t("moveHere");
    dropMoveButton.querySelector("small").textContent = t("switchPositions");
    dropFolderButton.hidden = false;
    dropFolderButton.querySelector("strong").textContent = t("createFolder");
    dropFolderButton.querySelector("small").textContent = t("putTogether");

    const rect = targetSlot.getBoundingClientRect();
    dropChoice.hidden = false;
    dropChoice.classList.remove("visible");

    const width = 250;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(window.innerWidth - width - 12, left));
    let top = rect.bottom + 8;
    if (top + 130 > window.innerHeight) top = Math.max(12, rect.top - 130);
    dropChoice.style.left = `${left}px`;
    dropChoice.style.top = `${top}px`;
    requestAnimationFrame(() => dropChoice.classList.add("visible"));
  }

  function closeDropChoice() {
    pendingDrop = null;
    dropChoice.classList.remove("visible");
    dropChoice.hidden = true;
  }

  dropMoveButton.addEventListener("click", async () => {
    if (!pendingDrop) return;
    const { sourceId, targetId } = pendingDrop;
    closeDropChoice();
    if (!swapTopLevelItems(sourceId, targetId)) return;
    await saveState();
    render();
    showToast(t("shortcutsMoved"));
  });

  dropFolderButton.addEventListener("click", async () => {
    if (!pendingDrop) return;
    const { sourceId, targetId } = pendingDrop;
    closeDropChoice();

    const source = getTopLevelItem(sourceId);
    const target = getTopLevelItem(targetId);
    if (!source || !target || source.type === "folder") return;

    if (target.type === "folder") {
      await addTopLevelShortcutToFolder(sourceId, targetId);
    } else {
      await createFolderFromShortcuts(sourceId, targetId);
    }
  });

  // ---------------------------------------------------------------------------
  // Folder creation, positioning and contents
  // ---------------------------------------------------------------------------
  async function createFolderFromShortcuts(sourceId, targetId) {
    const source = getTopLevelItem(sourceId);
    const target = getTopLevelItem(targetId);
    if (source?.type !== "shortcut" || target?.type !== "shortcut") return;

    const folderPosition = target.position;
    state.shortcuts = state.shortcuts.filter(item => item.id !== sourceId && item.id !== targetId);
    const timestamp = nextMutationTime(state.updatedAt, source.modifiedAt, target.modifiedAt);
    const folder = {
      type: "folder",
      id: uid(),
      title: "",
      items: [
        { ...target, position: 0, modifiedAt: timestamp },
        { ...source, position: 1, modifiedAt: timestamp }
      ],
      position: folderPosition,
      createdAt: now(),
      modifiedAt: timestamp
    };
    state.shortcuts.push(folder);
    await saveState();
    render();

    const slot = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(folder.id)}"]`);
    if (slot) {
      slot.classList.add("folder-created");
      setTimeout(() => slot.classList.remove("folder-created"), 520);
      setTimeout(() => openFolder(folder, slot, true), 120);
    }
  }

  async function addTopLevelShortcutToFolder(sourceId, folderId) {
    const source = getTopLevelItem(sourceId);
    const folder = getTopLevelItem(folderId);
    if (source?.type !== "shortcut" || folder?.type !== "folder") return;

    state.shortcuts = state.shortcuts.filter(item => item.id !== sourceId);
    const timestamp = nextMutationTime(state.updatedAt, source.modifiedAt, folder.modifiedAt);
    folder.items.push({ ...source, position: folder.items.length, modifiedAt: timestamp });
    folder.modifiedAt = timestamp;
    await saveState();
    render();

    const slot = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(folder.id)}"]`);
    if (slot) {
      slot.classList.add("folder-created");
      setTimeout(() => slot.classList.remove("folder-created"), 520);
      setTimeout(() => openFolder(folder, slot, false), 90);
    }
    showToast(t("shortcutAddedFolder"));
  }

  function resolveLiveFolderAnchor(folderId, fallback = null) {
    const current = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(folderId)}"]`);
    if (current?.isConnected) return current;
    return fallback?.isConnected ? fallback : null;
  }

  async function openFolder(folder, anchorEl, focusTitle = false) {
    closeDropChoice();
    await ensureSecondaryStyles();
    activeFolderId = folder.id;
    activeFolderAnchorId = folder.id;
    renderFolderContents(folder);
    if ((folder.items || []).some((child, index) => index >= 4 && child.localImageAssetId && !child.image)) {
      const spaceId = state.activeSpaceId;
      const folderId = folder.id;
      const mutationGeneration = stateMutationGeneration;
      const updatedAt = Number(state.updatedAt) || 0;
      void hydrateFolderLocalAssetsNormalized(state, spaceId, folderId).then(hydrated => {
        // Artwork hydration is a device-local enhancement and must never replace a
        // structural edit that happened while storage.local was being read.
        if (state.activeSpaceId !== spaceId || stateMutationGeneration !== mutationGeneration || Number(state.updatedAt) !== updatedAt) return;
        // Cancel any older idle chunk stream before adopting this complete folder;
        // otherwise a partial batch based on an older snapshot could momentarily
        // replace the just-hydrated pixels. Resume idle hydration for other folders.
        deferredFolderHydrationGeneration += 1;
        state = hydrated;
        const liveFolder = getTopLevelItem(folderId);
        if (activeFolderId === folderId && !folderPopover.hidden && liveFolder?.type === "folder") renderFolderContents(liveFolder);
        scheduleDeferredFolderHydration();
      }).catch(() => {});
    }
    folderPopover.hidden = false;
    folderPopover.classList.remove("open");

    // Saving a newly-created folder can cause storage.onChanged to render the
    // grid again before this animation fires. Never position against the stale
    // detached slot captured before that render: a detached element reports a
    // zero rectangle and used to send the folder editor to the top-left corner.
    const positionAgainstLiveAnchor = () => {
      const liveAnchor = resolveLiveFolderAnchor(folder.id, anchorEl);
      if (!liveAnchor) return false;
      positionFolderPopover(liveAnchor);
      return true;
    };

    positionAgainstLiveAnchor();
    requestAnimationFrame(() => {
      positionAgainstLiveAnchor();
      folderPopover.classList.add("open");
      if (focusTitle) {
        folderTitleInput.focus();
        folderTitleInput.select();
      }
    });
  }

  function positionFolderPopover(anchorEl) {
    if (!anchorEl || folderPopover.hidden) return;
    const tileRect = (anchorEl.querySelector?.(".folder-tile") || anchorEl).getBoundingClientRect();
    const labelEl = anchorEl.querySelector?.(".shortcut-label") || null;
    const panel = folderPopover.querySelector(".folder-panel");
    const panelWidth = Math.min(390, window.innerWidth - 24);
    panel.style.width = `${panelWidth}px`;

    let left = tileRect.left + tileRect.width / 2 - panelWidth / 2;
    left = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, left));

    // The label reserves a 34px two-line slot even when its title uses only one
    // line. Measure the visible text line boxes so that empty reserved label
    // height does not become part of the perceived folder-to-popover gap.
    const gap = 3;
    const anchorBottom = (labelEl && visibleTextBottom(labelEl)) || tileRect.bottom;
    const estimatedHeight = Math.min(430, 140 + Math.ceil((getTopLevelItem(activeFolderId)?.items.length || 1) / 3) * 96);
    let top = anchorBottom + gap;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, tileRect.top - estimatedHeight - gap);
    }

    folderPopover.style.left = `${left}px`;
    folderPopover.style.top = `${top}px`;
  }

  function renderFolderContents(folder) {
    folderTitleInput.value = folder.title || "";
    folderItems.replaceChildren();
    folderCount.textContent = t("folderContains", { count: folder.items.length });
    if (openAllFolderButton) {
      openAllFolderButton.textContent = t("openAllInBackground");
      openAllFolderButton.disabled = folder.items.length === 0;
    }
    const fragment = document.createDocumentFragment();

    for (const item of folder.items) {
      const cell = document.createElement("div");
      cell.className = "folder-item";
      cell.draggable = true;
      cell.dataset.childId = item.id;

      const button = document.createElement("a");
      button.className = "folder-item-card";
      const navigationUrl = shortcutNavigationUrl(item);
      if (navigationUrl) button.href = navigationUrl;
      button.rel = "noreferrer";
      button.draggable = false;
      button.title = `${item.title}\n${item.url}`;

      const tile = document.createElement("span");
      tile.className = `folder-item-tile ${item.imageStyle === "cover" ? "cover" : ""}`.trim();
      applyShortcutColorTag(tile, item);
      appendImageOrFallback(tile, item.image, item.title, item.builtinIcon, item);

      const label = document.createElement("span");
      label.className = "folder-item-label";
      label.textContent = item.title;
      button.append(tile, label);
      button.addEventListener("click", event => {
        if (Date.now() < suppressFolderClickUntil) {
          event.preventDefault();
          return;
        }
        if (!event.defaultPrevented && event.button === 0) {
          const opensElsewhere = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
          recordShortcutOpened(item.id, { renderRecent: opensElsewhere });
        }
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "folder-item-edit";
      edit.textContent = "⋯";
      edit.title = `${t("editShortcut")}: ${item.title}`;
      edit.setAttribute("aria-label", `${t("editShortcut")}: ${item.title}`);
      edit.draggable = false;
      edit.addEventListener("click", event => {
        event.stopPropagation();
        closeFolder();
        openShortcutEditor(item, folder.id);
      });

      cell.addEventListener("dragstart", event => {
        folderDragId = item.id;
        dragId = item.id;
        folderDragMoved = false;
        beginCrossSpaceDrag(item.id, folder.id, cell);
        cell.classList.add("folder-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
      });

      cell.addEventListener("dragover", event => {
        if (!folderDragId || folderDragId === item.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        cell.classList.add("folder-drag-over");
      });

      cell.addEventListener("dragleave", () => cell.classList.remove("folder-drag-over"));

      cell.addEventListener("drop", async event => {
        event.preventDefault();
        event.stopPropagation();
        cell.classList.remove("folder-drag-over");
        const from = folder.items.findIndex(child => child.id === folderDragId);
        const to = folder.items.findIndex(child => child.id === item.id);
        if (from < 0 || to < 0 || from === to) return;
        const previousPositions = new Map(folder.items.map(child => [child.id, child.position]));
        const [moved] = folder.items.splice(from, 1);
        folder.items.splice(to, 0, moved);
        const timestamp = nextMutationTime(state.updatedAt, folder.modifiedAt, folder.items.map(child => child.modifiedAt));
        folder.items.forEach((child, index) => {
          if (previousPositions.get(child.id) !== index) child.modifiedAt = timestamp;
          child.position = index;
        });
        folder.modifiedAt = timestamp;
        folderDragMoved = true;
        suppressFolderClickUntil = Date.now() + 300;
        await saveState();
        renderFolderContents(folder);
      });

      cell.addEventListener("dragend", () => {
        if (folderDragMoved) suppressFolderClickUntil = Date.now() + 300;
        folderDragId = null;
        dragId = null;
        folderDragMoved = false;
        folderItems.querySelectorAll(".folder-item").forEach(el => el.classList.remove("folder-dragging", "folder-drag-over"));
        void endCrossSpaceDrag();
      });

      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        openShortcutInNewTab(item);
      });
      button.addEventListener("auxclick", event => {
        if (event.button !== 1) return;
        recordShortcutOpened(item.id);
        void browser.runtime.sendMessage({ type: "mosaicsync:expect-shortcut-navigation", shortcutId: item.id }).catch(() => {});
      });

      cell.append(button, edit);
      fragment.append(cell);
    }
    folderItems.append(fragment);
  }

  async function commitFolderTitle() {
    if (!activeFolderId) return;
    const folder = getTopLevelItem(activeFolderId);
    if (folder?.type !== "folder") return;
    const title = folderTitleInput.value.trim();
    if (folder.title === title) return;
    folder.title = title;
    folder.modifiedAt = nextMutationTime(state.updatedAt, folder.modifiedAt);
    await saveState();
    const label = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(folder.id)}"] .shortcut-label`);
    if (label) label.textContent = title || t("folder");
  }

  function closeFolder() {
    if (folderPopover.hidden) {
      activeFolderId = null;
      activeFolderAnchorId = null;
      return;
    }
    folderPopover.classList.remove("open");
    folderPopover.hidden = true;
    activeFolderId = null;
    activeFolderAnchorId = null;
  }

  folderTitleInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      folderTitleInput.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      folderTitleInput.blur();
      closeFolder();
    }
  });
  folderTitleInput.addEventListener("blur", () => commitFolderTitle().catch(console.error));
  closeFolderButton.addEventListener("click", () => {
    commitFolderTitle().catch(console.error);
    closeFolder();
  });

  openAllFolderButton?.addEventListener("click", () => {
    if (!activeFolderId) return;
    const folder = getTopLevelItem(activeFolderId);
    if (folder?.type !== "folder" || !folder.items.length) return;
    const eligible = folder.items.filter(item => Boolean(shortcutNavigationUrl(item)));
    if (!eligible.length) return;
    // One localStorage write for the whole batch keeps large folders cheap while
    // treating all children opened by the same action as equally recent.
    recordShortcutsOpened(eligible.map(item => item.id));
    let opened = 0;
    for (const item of eligible) {
      if (openShortcutInNewTab(item, { recordUsage: false })) opened += 1;
    }
    if (opened) showToast(t("openedTabsInBackground", { count: opened }));
  });

  ungroupFolderButton.addEventListener("click", async () => {
    if (!activeFolderId) return;
    const folder = getTopLevelItem(activeFolderId);
    if (folder?.type !== "folder") return;

    const folderPosition = folder.position;
    state.shortcuts = state.shortcuts.filter(item => item.id !== folder.id);
    const occupied = new Set(state.shortcuts.map(item => item.position));
    const ungroupTimestamp = nextMutationTime(state.updatedAt, folder.modifiedAt, folder.items.map(item => item.modifiedAt));

    folder.items.forEach((item, index) => {
      let position;
      if (index === 0 && !occupied.has(folderPosition)) {
        position = folderPosition;
      } else {
        position = 0;
        while (occupied.has(position)) position += 1;
      }
      occupied.add(position);
      state.shortcuts.push({ ...item, position, modifiedAt: ungroupTimestamp });
    });

    closeFolder();
    await saveState();
    render();
    showToast(t("folderRemoved"));
  });

  // ---------------------------------------------------------------------------
  // Shortcut editor and local artwork
  // ---------------------------------------------------------------------------

  const BUILTIN_ICON_LABEL_KEYS = Object.freeze({
    home: "builtinIconHome", mail: "builtinIconMail", work: "builtinIconWork", star: "builtinIconStar",
    heart: "builtinIconHeart", shopping: "builtinIconShopping", finance: "builtinIconFinance", video: "builtinIconVideo",
    music: "builtinIconMusic", news: "builtinIconNews", code: "builtinIconCode", cloud: "builtinIconCloud", game: "builtinIconGame"
  });

  const SHORTCUT_COLOR_LABEL_KEYS = Object.freeze({
    red: "shortcutColorRed", orange: "shortcutColorOrange", amber: "shortcutColorAmber", green: "shortcutColorGreen",
    teal: "shortcutColorTeal", blue: "shortcutColorBlue", violet: "shortcutColorViolet", pink: "shortcutColorPink"
  });

  function updateShortcutColorSelection() {
    for (const button of shortcutColorPicker?.querySelectorAll?.("[data-shortcut-color]") || []) {
      const selected = String(button.dataset.shortcutColor || "") === pendingShortcutColorTag;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      const value = String(button.dataset.shortcutColor || "");
      const colorLabel = value ? t(SHORTCUT_COLOR_LABEL_KEYS[value] || "shortcutColor") : t("noColor");
      button.title = colorLabel;
      button.setAttribute("aria-label", colorLabel);
    }
  }

  function ensureBuiltinShortcutIconPicker() {
    if (!shortcutBuiltinIconPicker || shortcutBuiltinIconPicker.childElementCount) return;
    for (const key of BUILTIN_SHORTCUT_ICON_KEYS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "builtin-icon-choice";
      button.dataset.builtinIcon = key;
      globalThis.__mosaicsyncBuiltinIcons?.append?.(button, key);
      button.addEventListener("click", () => {
        shortcutSyncPrepareGeneration += 1;
        pendingShortcutBuiltinIcon = key;
        pendingShortcutImage = "";
        pendingShortcutSyncData = "";
        pendingShortcutImageKind = "none";
        pendingShortcutImageSourceKind = "builtin";
        pendingShortcutImageSourceUrl = "";
        pendingShortcutFaviconPreference = "";
        pendingShortcutImageIsFallback = false;
        shortcutImageStyle.value = "contain";
        shortcutImageUrl.value = "";
        shortcutSyncImage.checked = false;
        shortcutArtworkEdited = true;
        updateBuiltinShortcutIconSelection();
        updateImagePreview();
      });
      shortcutBuiltinIconPicker.append(button);
    }
  }

  function updateBuiltinShortcutIconSelection() {
    ensureBuiltinShortcutIconPicker();
    for (const button of shortcutBuiltinIconPicker?.querySelectorAll?.("[data-builtin-icon]") || []) {
      const key = String(button.dataset.builtinIcon || "");
      const selected = key === pendingShortcutBuiltinIcon;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      const label = t(BUILTIN_ICON_LABEL_KEYS[key] || "builtInIcons");
      button.title = label;
      button.setAttribute("aria-label", label);
    }
    if (shortcutBuiltinIconPicker) shortcutBuiltinIconPicker.setAttribute("aria-label", t("builtInIcons"));
    if (chooseBuiltinShortcutIcon) chooseBuiltinShortcutIcon.textContent = t("builtInIcons");
    if (chooseDetectedFavicon) chooseDetectedFavicon.textContent = t("chooseDetectedFavicon");
    if (detectedFaviconPicker) detectedFaviconPicker.setAttribute("aria-label", t("detectedFavicons"));
  }

  function cancelDetectedFaviconRequest() {
    const requestId = detectedFaviconRequestId;
    detectedFaviconRequestId = "";
    if (!requestId) return;
    void browser.runtime.sendMessage({ type: "mosaicsync:cancel-favicon-choices", requestId }).catch(() => {});
  }

  function resetDetectedFaviconPicker() {
    cancelDetectedFaviconRequest();
    detectedFaviconGeneration += 1;
    detectedFaviconPickerUrl = "";
    detectedFaviconChoices?.replaceChildren();
    if (detectedFaviconStatus) detectedFaviconStatus.textContent = "";
    if (detectedFaviconPicker) detectedFaviconPicker.hidden = true;
    if (chooseDetectedFavicon) {
      chooseDetectedFavicon.disabled = false;
      chooseDetectedFavicon.setAttribute("aria-expanded", "false");
      chooseDetectedFavicon.textContent = t("chooseDetectedFavicon");
    }
  }

  function renderDetectedFaviconChoices(candidates, sourceUrl, { statusText = "" } = {}) {
    if (!detectedFaviconChoices || !detectedFaviconPicker) return;
    detectedFaviconChoices.replaceChildren();
    const merged = [];
    const seenImages = new Set();
    const current = typeof pendingShortcutImage === "string" && pendingShortcutImage.startsWith("data:image/") &&
      ["favicon", "firefox"].includes(pendingShortcutImageSourceKind)
      ? {
          image: pendingShortcutImage,
          sourceUrl: pendingShortcutImageSourceUrl || "",
          width: 0,
          height: 0,
          source: pendingShortcutImageSourceKind === "firefox" ? "browser" : "site"
        }
      : null;
    if (current?.image) { merged.push(current); seenImages.add(current.image); }
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      if (!candidate || typeof candidate.image !== "string" || !candidate.image.startsWith("data:image/") || seenImages.has(candidate.image)) continue;
      seenImages.add(candidate.image);
      merged.push(candidate);
      if (merged.length >= 8) break;
    }
    const safeCandidates = merged.slice(0, 8);
    for (let index = 0; index < safeCandidates.length; index += 1) {
      const candidate = safeCandidates[index];
      if (!candidate || typeof candidate.image !== "string" || !candidate.image.startsWith("data:image/")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "detected-favicon-choice";
      button.setAttribute("aria-pressed", "false");
      const width = Math.max(0, Math.trunc(Number(candidate.width) || 0));
      const height = Math.max(0, Math.trunc(Number(candidate.height) || 0));
      const sourceLabel = candidate.source === "browser" ? t("firefox") : t("website");
      const choiceLabel = width && height
        ? `${t("detectedFavicons")} ${index + 1} — ${width} × ${height} — ${sourceLabel}`
        : `${t("detectedFavicons")} ${index + 1} — ${sourceLabel}`;
      button.setAttribute("aria-label", choiceLabel);
      button.title = choiceLabel;
      const image = document.createElement("img");
      image.src = candidate.image;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      button.append(image);
      button.addEventListener("click", () => {
        let currentUrl = "";
        try { currentUrl = normalizeShortcutUrl(shortcutUrl.value); } catch {}
        if (!currentUrl || currentUrl !== sourceUrl || sourceUrl !== detectedFaviconPickerUrl) {
          resetDetectedFaviconPicker();
          showToast(t("faviconChoicesExpired"));
          return;
        }
        shortcutSyncPrepareGeneration += 1;
        pendingShortcutBuiltinIcon = "";
        pendingShortcutImage = candidate.image;
        pendingShortcutSyncData = "";
        pendingShortcutImageKind = "device";
        // A manually selected detected favicon becomes explicit user artwork,
        // not an automatic recovery result. Preserve the exact chosen pixels and
        // let the existing optional “Sync this image” control decide whether a
        // compact derivative should travel to other devices.
        pendingShortcutImageSourceKind = "upload";
        pendingShortcutImageSourceUrl = "";
        // Sync only a compact locator for the user's explicit detected-favicon
        // choice. The image pixels remain device-local unless the existing
        // “Sync this image” option is explicitly enabled.
        pendingShortcutFaviconPreference = faviconPreferenceForCandidate(candidate);
        pendingShortcutImageIsFallback = false;
        shortcutImageStyle.value = "contain";
        shortcutImageUrl.value = "";
        shortcutSyncImage.checked = false;
        shortcutArtworkEdited = true;
        for (const choice of detectedFaviconChoices.querySelectorAll?.(".detected-favicon-choice") || []) {
          const selected = choice === button;
          choice.classList.toggle("selected", selected);
          choice.setAttribute("aria-pressed", selected ? "true" : "false");
        }
        updateBuiltinShortcutIconSelection();
        updateImagePreview();
      });
      detectedFaviconChoices.append(button);
    }
    if (detectedFaviconStatus) detectedFaviconStatus.textContent = statusText || (detectedFaviconChoices.childElementCount ? "" : t("noDetectedFavicons"));
    detectedFaviconPicker.hidden = false;
    chooseDetectedFavicon?.setAttribute("aria-expanded", "true");
  }

  async function openShortcutEditor(item = null, parentFolderId = null, preferredPosition = null) {
    await ensureSecondaryStyles();
    localizeDocument(shortcutDialog);
    closeDropChoice();
    shortcutSyncPrepareGeneration += 1;
    resetDetectedFaviconPicker();
    shortcutForm.reset();
    shortcutId.value = item?.id || "";
    editingParentFolderId = parentFolderId;
    editingPreferredPosition = preferredPosition;
    editingSourceSpaceId = state.activeSpaceId;
    editingDestinationSpaceId = state.activeSpaceId;
    shortcutDialogTitle.textContent = item ? t("editShortcut") : t("addShortcut");
    shortcutTitle.value = item?.title || "";
    shortcutUrl.value = item?.url || "";
    shortcutImageStyle.value = item?.imageStyle || "contain";
    pendingShortcutImage = item?.image || "";
    pendingShortcutSyncData = item?.imageSyncData ||
      (item?.imageSyncKind === "sync" && dataUrlByteLength(item?.image || "") <= 12000 ? item?.image || "" : "");
    pendingShortcutImageKind = item?.imageSyncKind || classifyImage(item?.image || "");
    pendingShortcutImageSourceKind = item?.imageSourceKind || (item?.source === "firefox-import" ? "firefox" : "none");
    pendingShortcutImageSourceUrl = item?.imageSourceUrl || "";
    pendingShortcutFaviconPreference = item?.faviconPreference || "";
    pendingShortcutImageIsFallback = item?.imageIsFallback === true;
    pendingShortcutBuiltinIcon = BUILTIN_SHORTCUT_ICON_KEYS.includes(item?.builtinIcon) ? item.builtinIcon : "";
    pendingShortcutColorTag = SHORTCUT_COLOR_TAG_KEYS.includes(item?.colorTag) ? item.colorTag : "";
    shortcutImageUrl.value = pendingShortcutImageSourceKind === "remote" ? pendingShortcutImageSourceUrl : "";
    shortcutSyncImage.checked = pendingShortcutImageKind === "sync" || pendingShortcutImageKind === "local";
    if (useShortcutImageUrl) useShortcutImageUrl.disabled = false;
    shortcutArtworkEdited = false;
    deleteShortcutButton.hidden = !item;
    if (shortcutBuiltinIconPicker) shortcutBuiltinIconPicker.hidden = true;
    if (chooseBuiltinShortcutIcon) chooseBuiltinShortcutIcon.setAttribute("aria-expanded", "false");
    updateBuiltinShortcutIconSelection();
    updateShortcutColorSelection();
    updateImagePreview();
    updateShortcutSpaceChoice();
    shortcutDialog.showModal();
    queueMicrotask(() => shortcutTitle.focus());
  }

  function isSettingsOpen() {
    return Boolean(settingsDialog && settingsDialog.hidden !== true);
  }

  function closeSettingsPanel() {
    closeBackgroundColorPicker();
    if (!isSettingsOpen()) return;
    settingsDialog.hidden = true;
    backgroundUploadGeneration += 1;
    settingsDialog.setAttribute("aria-hidden", "true");
    settingsButton?.setAttribute("aria-expanded", "false");
    deferredSettingsControlRefresh = false;
    if (!deferredAppearanceVisual && !deferredLauncherSettings && !deferredLauncherRender) return;
    // Settings is a normal fixed panel rather than a modeless native <dialog>.
    // Firefox repeatedly froze the native dialog surface when large sections
    // changed visibility. Commit deferred launcher work only after the panel is
    // outside the render tree.
    requestAnimationFrame(() => {
      if (!isSettingsOpen()) commitDeferredLauncherVisual();
    });
  }

  function closeDialog(dialog) {
    if (dialog === settingsDialog) {
      closeSettingsPanel();
      return;
    }
    if (dialog?.open) dialog.close();
  }

  shortcutDialog?.addEventListener("close", () => {
    shortcutSyncPrepareGeneration += 1;
    resetDetectedFaviconPicker();
  });

  function updateImagePreview() {
    imagePreview.replaceChildren();
    imagePreview.classList.toggle("cover", shortcutImageStyle.value === "cover");
    const image = pendingShortcutImage;
    appendImageOrFallback(imagePreview, image, shortcutTitle.value || "A", pendingShortcutBuiltinIcon);

    const isUserArtwork = pendingShortcutImageSourceKind === "upload" ||
      (pendingShortcutImageKind === "sync" && !["remote", "favicon", "firefox"].includes(pendingShortcutImageSourceKind));
    if (shortcutSyncImageRow) shortcutSyncImageRow.hidden = !isUserArtwork || pendingShortcutImageIsFallback;
    shortcutSyncImage.disabled = !image || pendingShortcutImageIsFallback || !isUserArtwork;
    if (!isUserArtwork) shortcutSyncImage.checked = false;
    if (shortcutSyncImageHint) {
      const syncBytes = dataUrlByteLength(pendingShortcutSyncData);
      if (shortcutSyncImage.checked && syncBytes) {
        shortcutSyncImageHint.textContent = t("compactSyncCopySize", { size: formatBytes(Math.ceil(syncBytes * 1.38)) });
      } else {
        shortcutSyncImageHint.textContent = t("imageSyncHint");
      }
    }
    if (shortcutImageHint) {
      shortcutImageHint.textContent = pendingShortcutBuiltinIcon
        ? t("builtInIconSyncHint")
        : (pendingShortcutImageSourceKind === "favicon" || pendingShortcutImageSourceKind === "firefox"
            ? t("autoIconsDescription")
            : t("imageLocalHint"));
    }
  }

  shortcutTitle.addEventListener("input", updateImagePreview);
  shortcutImageStyle.addEventListener("change", updateImagePreview);

  chooseDetectedFavicon?.addEventListener("click", () => {
    let sourceUrl = "";
    try { sourceUrl = normalizeShortcutUrl(shortcutUrl.value); }
    catch (error) { showToast(error.message || t("operationFailed")); return; }

    // Permission request remains directly in the user's click. Candidate discovery
    // then runs in the background using the exact same bounded image/SVG fetch
    // primitives as automatic favicon recovery, without changing that resolver.
    const permissionPromise = webAccessGranted ? Promise.resolve(true) : requestWebAccessFromGesture();
    const generation = ++detectedFaviconGeneration;
    detectedFaviconPickerUrl = sourceUrl;
    detectedFaviconChoices?.replaceChildren();
    if (detectedFaviconPicker) detectedFaviconPicker.hidden = false;
    if (detectedFaviconStatus) detectedFaviconStatus.textContent = t("detectingFavicons");
    chooseDetectedFavicon.disabled = true;
    chooseDetectedFavicon.setAttribute("aria-expanded", "true");

    void (async () => {
      let requestId = "";
      try {
        const granted = await permissionPromise;
        if (generation !== detectedFaviconGeneration) return;
        webAccessGranted = granted === true;
        if (!state.settings.webAccessPrompted) {
          state.settings.webAccessPrompted = true;
          await saveState({ localCacheOnly: true });
        }
        // The editor may have closed or its URL may have changed while the
        // one-time prompt marker was being persisted. Do not launch obsolete
        // favicon discovery work after that await boundary.
        if (generation !== detectedFaviconGeneration || sourceUrl !== detectedFaviconPickerUrl) return;
        if (!webAccessGranted) throw new Error(t("websiteAccessDenied"));
        requestId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${generation}-${Math.random().toString(36).slice(2)}`;
        detectedFaviconRequestId = requestId;
        const result = await browser.runtime.sendMessage({ type: "mosaicsync:discover-favicon-choices", pageUrl: sourceUrl, requestId });
        if (detectedFaviconRequestId === requestId) detectedFaviconRequestId = "";
        if (generation !== detectedFaviconGeneration) return;
        let currentUrl = "";
        try { currentUrl = normalizeShortcutUrl(shortcutUrl.value); } catch {}
        if (currentUrl !== sourceUrl) { resetDetectedFaviconPicker(); return; }
        if (!result?.ok) {
          if (result?.error === "permission") throw new Error(t("websiteAccessDenied"));
          if (result?.error === "discovery-failed") {
            renderDetectedFaviconChoices([], sourceUrl, { statusText: t("faviconDiscoveryFailed") });
            return;
          }
          throw new Error(t("operationFailed"));
        }
        renderDetectedFaviconChoices(result.candidates, sourceUrl);
      } catch (error) {
        if (generation !== detectedFaviconGeneration) return;
        detectedFaviconChoices?.replaceChildren();
        if (detectedFaviconStatus) detectedFaviconStatus.textContent = error.message || t("operationFailed");
      } finally {
        if (requestId && detectedFaviconRequestId === requestId) detectedFaviconRequestId = "";
        if (generation === detectedFaviconGeneration) chooseDetectedFavicon.disabled = false;
      }
    })();
  });

  shortcutUrl.addEventListener("input", () => {
    if (detectedFaviconPickerUrl) resetDetectedFaviconPicker();
    // The compact preference identifies a candidate discovered for the previous
    // shortcut URL. Keep the already selected pixels as local custom artwork,
    // but never send a stale favicon locator for a different site.
    if (pendingShortcutFaviconPreference) pendingShortcutFaviconPreference = "";
  });

  chooseBuiltinShortcutIcon?.addEventListener("click", () => {
    ensureBuiltinShortcutIconPicker();
    const opening = shortcutBuiltinIconPicker?.hidden !== false;
    if (shortcutBuiltinIconPicker) shortcutBuiltinIconPicker.hidden = !opening;
    chooseBuiltinShortcutIcon.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) updateBuiltinShortcutIconSelection();
  });

  shortcutColorPicker?.addEventListener("click", event => {
    const button = event.target?.closest?.("[data-shortcut-color]");
    if (!button || !shortcutColorPicker.contains(button)) return;
    const value = String(button.dataset.shortcutColor || "");
    pendingShortcutColorTag = SHORTCUT_COLOR_TAG_KEYS.includes(value) ? value : "";
    updateShortcutColorSelection();
  });

  shortcutImageFile.addEventListener("change", async () => {
    const file = shortcutImageFile.files?.[0];
    if (!file) return;
    const generation = ++shortcutSyncPrepareGeneration;
    const editorShortcutId = shortcutId.value;
    try {
      const optimized = await optimizeImageFile(file, {
        maxWidth: 384,
        maxHeight: 384,
        minWidth: 96,
        minHeight: 96,
        targetBytes: SHORTCUT_LOCAL_IMAGE_TARGET_BYTES,
        initialQuality: 0.95,
        maxInputBytes: 20_000_000
      });
      if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
      pendingShortcutBuiltinIcon = "";
      pendingShortcutImage = optimized;
      pendingShortcutSyncData = "";
      pendingShortcutImageKind = "device";
      pendingShortcutImageSourceKind = "upload";
      pendingShortcutImageSourceUrl = "";
      pendingShortcutFaviconPreference = "";
      pendingShortcutImageIsFallback = false;
      shortcutSyncImage.checked = false;
      shortcutArtworkEdited = true;
      updateBuiltinShortcutIconSelection();
      updateImagePreview();
    } catch (error) {
      if (generation === shortcutSyncPrepareGeneration && shortcutDialog?.open && shortcutId.value === editorShortcutId) {
        showToast(error.message || t("operationFailed"));
      }
    } finally {
      shortcutImageFile.value = "";
    }
  });

  clearShortcutImage.addEventListener("click", () => {
    shortcutSyncPrepareGeneration += 1;
    shortcutArtworkEdited = true;
    pendingShortcutImage = "";
    pendingShortcutSyncData = "";
    pendingShortcutImageKind = "none";
    pendingShortcutImageSourceKind = "none";
    pendingShortcutImageSourceUrl = "";
    pendingShortcutFaviconPreference = "";
    pendingShortcutImageIsFallback = false;
    pendingShortcutBuiltinIcon = "";
    shortcutImageUrl.value = "";
    shortcutSyncImage.checked = false;
    updateBuiltinShortcutIconSelection();
    updateImagePreview();
  });

  useShortcutImageUrl?.addEventListener("click", () => {
    const generation = ++shortcutSyncPrepareGeneration;
    const editorShortcutId = shortcutId.value;
    const source = String(shortcutImageUrl.value || "").trim();
    let parsed;
    try {
      parsed = new URL(source);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      showToast(t("validWebImageAddress"));
      return;
    }

    // Permission request must remain directly inside this user click.
    const permissionPromise = webAccessGranted ? Promise.resolve(true) : requestWebAccessFromGesture();
    void (async () => {
      useShortcutImageUrl.disabled = true;
      try {
        const granted = await permissionPromise;
        if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
        // Remember the decision either way. A denied web-image request must not
        // cause the next ordinary shortcut click to show the same all-sites
        // permission prompt again. The user can explicitly retry in Advanced.
        webAccessGranted = granted === true;
        if (!state.settings.webAccessPrompted) {
          state.settings.webAccessPrompted = true;
          await saveState({ localCacheOnly: true });
          if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
        }
        if (!webAccessGranted) throw new Error(t("websiteAccessDenied"));
        const response = await fetch(parsed.href, { credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer" });
        if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
        if (!response.ok) throw new Error(t("operationFailed"));
        const declaredLength = Number(response.headers.get("content-length")) || 0;
        if (declaredLength > REMOTE_IMAGE_INPUT_MAX_BYTES) throw new Error(t("operationFailed"));
        const blob = await response.blob();
        if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
        if (blob.size > REMOTE_IMAGE_INPUT_MAX_BYTES) throw new Error(t("operationFailed"));
        const image = await imageBlobToDataUrl(blob, { maxInputBytes: REMOTE_IMAGE_INPUT_MAX_BYTES });
        if (generation !== shortcutSyncPrepareGeneration || !shortcutDialog?.open || shortcutId.value !== editorShortcutId) return;
        pendingShortcutBuiltinIcon = "";
        pendingShortcutImage = image;
        pendingShortcutSyncData = "";
        pendingShortcutImageKind = "device";
        pendingShortcutImageSourceKind = "remote";
        pendingShortcutImageSourceUrl = parsed.href;
        pendingShortcutFaviconPreference = "";
        pendingShortcutImageIsFallback = false;
        shortcutSyncImage.checked = false;
        shortcutArtworkEdited = true;
        updateBuiltinShortcutIconSelection();
        updateImagePreview();
        showToast(t("webImageCached"));
      } catch (error) {
        if (generation === shortcutSyncPrepareGeneration && shortcutDialog?.open && shortcutId.value === editorShortcutId) {
          showToast(error.message || t("operationFailed"));
        }
      } finally {
        if (generation === shortcutSyncPrepareGeneration && shortcutDialog?.open && shortcutId.value === editorShortcutId) {
          useShortcutImageUrl.disabled = false;
        }
      }
    })();
  });

  shortcutSyncImage?.addEventListener("change", () => {
    const generation = ++shortcutSyncPrepareGeneration;
    const wantsSync = shortcutSyncImage.checked;
    if (!pendingShortcutImage || pendingShortcutImageIsFallback) {
      shortcutSyncImage.checked = false;
      pendingShortcutSyncData = "";
      updateImagePreview();
      return;
    }

    if (!wantsSync) {
      pendingShortcutImageKind = "device";
      pendingShortcutSyncData = "";
      shortcutArtworkEdited = true;
      updateImagePreview();
      return;
    }

    // Keep the rich device-local display copy untouched. Only the derivative below
    // is optimized for Firefox Sync's tiny 100 KB shared allowance. Generation
    // guards prevent a late result from re-enabling Sync after the user unchecks it,
    // chooses another image, saves, or opens a different editor.
    const sourceImage = pendingShortcutImage;
    shortcutSyncImage.disabled = true;
    void (async () => {
      try {
        const derivative = await optimizeImageDataUrl(sourceImage, {
          maxWidth: 128, maxHeight: 128, minWidth: 48, minHeight: 48,
          targetBytes: SHORTCUT_SYNC_IMAGE_TARGET_BYTES
        });
        if (generation !== shortcutSyncPrepareGeneration || !shortcutSyncImage.checked || pendingShortcutImage !== sourceImage) return;
        pendingShortcutSyncData = derivative;
        pendingShortcutImageKind = "sync";
        shortcutArtworkEdited = true;
      } catch (error) {
        if (generation !== shortcutSyncPrepareGeneration) return;
        shortcutSyncImage.checked = false;
        pendingShortcutImageKind = "device";
        pendingShortcutSyncData = "";
        showToast(error.message || t("operationFailed"));
      } finally {
        if (generation === shortcutSyncPrepareGeneration) {
          shortcutSyncImage.disabled = false;
          updateImagePreview();
        }
      }
    })();
  });

  shortcutForm.addEventListener("submit", async event => {
    event.preventDefault();

    // Saving a new iconless shortcut is a user gesture, so it is the one safe
    // moment to request MosaicSync's single optional all-websites permission if
    // onboarding did not already decide it. The shortcut itself is saved even
    // if the user declines; only automatic icon hydration is skipped.
    const shouldRequestWebAccess = state.settings.autoSiteIcons &&
      !pendingShortcutImage && !pendingShortcutBuiltinIcon && !webAccessGranted;
    const webAccessPermissionPromise = shouldRequestWebAccess
      ? requestWebAccessFromGesture()
      : null;

    try {
      const url = normalizeShortcutUrl(shortcutUrl.value);
      const title = shortcutTitle.value.trim() || hostLabel(url);
      const image = pendingShortcutImage;
      let imageSyncData = pendingShortcutSyncData;
      const imageSyncKind = image
        ? (shortcutSyncImage.checked ? "sync" : "device")
        : (!shortcutArtworkEdited && ["sync", "local"].includes(pendingShortcutImageKind) ? "sync" : "none");
      if (imageSyncKind === "sync" && image && !imageSyncData) {
        imageSyncData = await optimizeImageDataUrl(image, {
          maxWidth: 128, maxHeight: 128, minWidth: 48, minHeight: 48,
          targetBytes: SHORTCUT_SYNC_IMAGE_TARGET_BYTES
        });
      }
      if (imageSyncKind !== "sync") imageSyncData = "";
      const id = shortcutId.value;
      const record = id ? findShortcutRecord(id) : null;
      let savedShortcutId = id;

      if (record) {
        const mutationTimestamp = nextMutationTime(state.updatedAt, record.item.modifiedAt, record.parentFolder?.modifiedAt);
        record.array[record.index] = {
          ...record.item,
          type: "shortcut",
          title,
          url,
          builtinIcon: pendingShortcutBuiltinIcon,
          colorTag: pendingShortcutColorTag,
          faviconPreference: pendingShortcutFaviconPreference,
          image,
          imageSyncData,
          imageSyncKind,
          imageAssetId: imageSyncKind === "sync" && !shortcutArtworkEdited ? record.item.imageAssetId : "",
          imageSourceKind: pendingShortcutImageSourceKind,
          imageSourceUrl: pendingShortcutImageSourceUrl,
          imageIsFallback: pendingShortcutImageIsFallback,
          imageStyle: shortcutImageStyle.value === "cover" ? "cover" : "contain",
          source: pendingShortcutImageSourceKind === "firefox" ? "firefox-import" : "manual",
          modifiedAt: mutationTimestamp
        };
        if (record.parentFolder) record.parentFolder.modifiedAt = mutationTimestamp;
      } else {
        const newShortcut = {
          type: "shortcut",
          id: uid(),
          title,
          url,
          builtinIcon: pendingShortcutBuiltinIcon,
          colorTag: pendingShortcutColorTag,
          faviconPreference: pendingShortcutFaviconPreference,
          image,
          imageSyncData,
          imageSyncKind,
          imageAssetId: "",
          imageSourceKind: pendingShortcutImageSourceKind,
          imageSourceUrl: pendingShortcutImageSourceUrl,
          imageIsFallback: pendingShortcutImageIsFallback,
          imageStyle: shortcutImageStyle.value === "cover" ? "cover" : "contain",
          position: firstEmptyTopLevelPosition(editingPreferredPosition),
          createdAt: now(),
          modifiedAt: now(),
          source: "manual"
        };
        savedShortcutId = newShortcut.id;

        if (editingParentFolderId) {
          const folder = getTopLevelItem(editingParentFolderId);
          if (folder?.type === "folder") {
            newShortcut.position = folder.items.length;
            folder.items.push(newShortcut);
            folder.modifiedAt = nextMutationTime(state.updatedAt, folder.modifiedAt, newShortcut.modifiedAt);
          } else {
            state.shortcuts.push(newShortcut);
          }
        } else {
          state.shortcuts.push(newShortcut);
        }
      }

      const destinationSpaceId = isMultipleSpacesEnabled() && SPACE_IDS.includes(editingDestinationSpaceId)
        ? editingDestinationSpaceId
        : editingSourceSpaceId;
      const movedAcrossSpaces = destinationSpaceId !== editingSourceSpaceId;
      let crossSpaceSyncIntent = null;
      if (movedAcrossSpaces) {
        const beforeMove = state;
        const movedState = moveShortcutBetweenSpacesNormalized(beforeMove, {
          shortcutId: savedShortcutId,
          fromSpaceId: editingSourceSpaceId,
          toSpaceId: destinationSpaceId
        });
        crossSpaceSyncIntent = meta.syncEnabled && meta.syncInitialized
          ? createCrossSpaceSyncIntentNormalized(beforeMove, movedState, {
              fromSpaceId: editingSourceSpaceId,
              toSpaceId: destinationSpaceId,
              shortcutIds: [savedShortcutId],
              deviceId: meta.deviceId
            })
          : null;
        state = movedState;
        if (!destinationContainsShortcut(destinationSpaceId, savedShortcutId)) throw new Error(t("moveSpaceFailed"));
      }

      await saveState({ crossSpaceSyncIntent });

      if (webAccessPermissionPromise) {
        try {
          webAccessGranted = (await webAccessPermissionPromise) === true;
        } catch {
          webAccessGranted = false;
        }
        state.settings.webAccessPrompted = true;
        if (!webAccessGranted) {
          // Automatic recovery cannot honestly remain enabled without the host
          // capability it requires for a never-before-visited site. The shortcut
          // is still saved; only automatic fetching is turned off after denial.
          state.settings.autoSiteIcons = false;
          if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
        }
        await saveState({ localCacheOnly: true });
      }

      if (movedAcrossSpaces) {
        applySettings();
        updateSpaceSwitcher();
        scheduleAppearanceHintRefresh(state.settings);
      }
      render();
      shortcutSyncPrepareGeneration += 1;
      closeDialog(shortcutDialog);
      editingParentFolderId = null;
      editingPreferredPosition = null;
      showToast(movedAcrossSpaces
        ? t("movedToSpace", { space: displaySpaceName(destinationSpaceId) })
        : (record ? t("shortcutUpdated") : t("shortcutAdded")));

      // A newly saved iconless shortcut should fill itself without requiring a
      // first visit. Target just this record for low latency; the normal idle
      // maintenance pass continues to repair any other missing icons.
      if (!image && !pendingShortcutBuiltinIcon && savedShortcutId) requestMissingSiteIcons([savedShortcutId], { force: true });
    } catch (error) {
      showToast(error.message || t("operationFailed"));
    }
  });

  deleteShortcutButton.addEventListener("click", async () => {
    const id = shortcutId.value;
    if (!id) return;
    const record = findShortcutRecord(id);
    if (!record) return;
    if (!confirm(`${t("delete")} “${record.item.title}”?`)) return;

    record.array.splice(record.index, 1);

    if (record.parentFolder) {
      const folderIndex = state.shortcuts.findIndex(item => item.id === record.parentFolder.id);
      if (record.parentFolder.items.length === 1 && folderIndex >= 0) {
        const [remaining] = record.parentFolder.items;
        const folderPosition = record.parentFolder.position;
        const timestamp = nextMutationTime(state.updatedAt, record.parentFolder.modifiedAt, remaining.modifiedAt);
        state.shortcuts.splice(folderIndex, 1, { ...remaining, position: folderPosition, modifiedAt: timestamp });
      } else if (record.parentFolder.items.length === 0 && folderIndex >= 0) {
        state.shortcuts.splice(folderIndex, 1);
      } else {
        const timestamp = nextMutationTime(state.updatedAt, record.parentFolder.modifiedAt, record.parentFolder.items.map(child => child.modifiedAt));
        record.parentFolder.items.forEach((child, index) => {
          if (child.position !== index) child.modifiedAt = timestamp;
          child.position = index;
        });
        record.parentFolder.modifiedAt = timestamp;
      }
    }

    await saveState();
    render();
    closeDialog(shortcutDialog);
    editingParentFolderId = null;
    editingPreferredPosition = null;
    showToast(t("shortcutDeleted"));
  });

  // ---------------------------------------------------------------------------
  // Firefox-native import and favicon maintenance
  // ---------------------------------------------------------------------------
  function importFirefoxShortcutsFromGesture(options = {}) {
    // Permission request must be made before any await, directly from the click.
    const permissionPromise = requestTopSitesPermissionFromGesture();
    void (async () => {
      try {
        const granted = await permissionPromise;
        if (!granted) {
          showToast(t("shortcutAccessNotGranted"));
          return;
        }
        await importFirefoxShortcuts(options);
      } catch (error) {
        console.error(error);
        showToast(error.message || t("operationFailed"));
      }
    })();
  }

  async function importFirefoxShortcuts({ confirmReplace = false } = {}) {
    try {
      if (confirmReplace && state.shortcuts.length) {
        const syncNote = meta?.syncEnabled && meta?.syncInitialized ? `\n\n${t("changesPublishAuto")}` : "";
        const confirmed = window.confirm(`${t("importFirefoxShortcuts")}?\n\n${t("importReplaceDescription")}${syncNote}`);
        if (!confirmed) return;
      }

      const { fetchFirefoxShortcuts, prepareFirefoxShortcutFavicons, replaceWithFirefoxShortcuts } = await loadImporterModule();
      const imported = await prepareFirefoxShortcutFavicons(await fetchFirefoxShortcuts());
      if (!imported.length) {
        showToast(t("noFirefoxShortcuts"));
        return;
      }

      const previousColumns = state.settings.columns;
      const previousRows = state.settings.rows;
      const count = replaceWithFirefoxShortcuts(state, imported);
      if (state.settings.columns !== previousColumns || state.settings.rows !== previousRows) markSettingsChanged();
      state.updatedAt = nextMutationTime(state.updatedAt);
      await saveState();
      applySettings();
      render();
      showToast(t("loadedFirefoxShortcuts", { count }));
      requestMissingSiteIcons();
    } catch (error) {
      console.error(error);
      showToast(t("importFirefoxFailed"));
    }
  }

  async function normalizeDeviceFavicon(image) {
    if (typeof image !== "string" || !image.startsWith("data:image/") || image.length <= 22_000) return image || "";
    try {
      return await optimizeImageDataUrl(image, {
        maxWidth: FAVICON_LOCAL_MAX_SIDE, maxHeight: FAVICON_LOCAL_MAX_SIDE,
        minWidth: 64, minHeight: 64, targetBytes: FAVICON_LOCAL_TARGET_BYTES,
        maxInputBytes: REMOTE_IMAGE_INPUT_MAX_BYTES, initialQuality: 0.90
      });
    } catch {
      return image;
    }
  }

  async function hydrateDeviceFavicons() {
    const deviceShortcuts = [];
    const needsFirefoxFaviconFallback = shortcut => {
      if (!shortcut) return false;
      const sourceKind = shortcut.imageSourceKind || "none";
      if (sourceKind === "favicon" && shortcut.image) return false; // never downgrade a site-discovered icon
      if (sourceKind === "firefox") return !shortcut.image;
      if (sourceKind === "none") return !shortcut.image;
      return !shortcut.image && sourceKind === "upload" && shortcut.imageSyncKind === "device";
    };

    for (const item of state.shortcuts) {
      if (item.type === "folder") {
        for (const child of item.items) {
          if (needsFirefoxFaviconFallback(child)) deviceShortcuts.push(child);
        }
      } else if (needsFirefoxFaviconFallback(item)) {
        deviceShortcuts.push(item);
      }
    }
    if (!deviceShortcuts.length) return;
    if (!(await hasTopSitesPermission())) return;

    const sites = await browser.topSites.get({
      newtab: true,
      includeFavicon: true,
      limit: 100
    });
    if (!Array.isArray(sites) || !sites.length) return;

    const faviconSites = sites.filter(site => site?.url && site?.favicon?.startsWith("data:image/"));
    const faviconsByUrl = new Map(faviconSites.map(site => [site.url, site.favicon]));
    const faviconsByHost = new Map();
    for (const site of faviconSites) {
      try {
        const hostname = new URL(site.url).hostname.toLowerCase().replace(/^www\./, "");
        if (hostname && !faviconsByHost.has(hostname)) faviconsByHost.set(hostname, site.favicon);
      } catch {}
    }

    let changed = false;
    const changedShortcutIds = new Set();
    const changedFolderIds = new Set();
    for (const shortcut of deviceShortcuts) {
      let favicon = faviconsByUrl.get(shortcut.url);
      if (!favicon) {
        try { favicon = faviconsByHost.get(new URL(shortcut.url).hostname.toLowerCase().replace(/^www\./, "")); } catch {}
      }
      if (!favicon) continue;
      // Network discovery may have completed while native-cache reads were in
      // flight. Never let a late browser fallback downgrade a site-discovered icon.
      if (shortcut.imageSourceKind === "favicon" && shortcut.image) continue;
      favicon = await normalizeDeviceFavicon(favicon);
      const customUploadFallback = shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
      const nextSourceKind = customUploadFallback ? shortcut.imageSourceKind : "firefox";
      const nextFallback = customUploadFallback;
      if (shortcut.image === favicon &&
          shortcut.imageSyncKind === "device" &&
          !shortcut.imageAssetId &&
          shortcut.imageIsFallback === nextFallback &&
          shortcut.imageSourceKind === nextSourceKind) continue;
      shortcut.image = favicon;
      shortcut.imageSyncData = "";
      shortcut.imageAssetId = "";
      shortcut.imageSyncKind = "device";
      shortcut.imageIsFallback = nextFallback;
      shortcut.imageSourceKind = nextSourceKind;
      if (!customUploadFallback) shortcut.imageSourceUrl = "";
      const record = findShortcutRecord(shortcut.id);
      if (record?.parentFolder) changedFolderIds.add(record.parentFolder.id);
      else changedShortcutIds.add(shortcut.id);
      changed = true;
    }

    if (changed) {
      await saveState({ localCacheOnly: true });
      patchVisibleShortcutArtwork(changedShortcutIds, changedFolderIds);
      // The browser cache may only be 16/32px. Keep it visible as a fallback but
      // immediately ask the background resolver for a higher-resolution upgrade.
      requestMissingSiteIcons(deviceShortcuts.map(shortcut => shortcut.id));
    }
  }

  // ---------------------------------------------------------------------------
  // Settings: background, appearance and live layout controls
  // ---------------------------------------------------------------------------
  function plainColorSelected() {
    return !pendingBackgroundPreset && !pendingBackgroundImage;
  }

  function selectPlainColorBackground({ closeGallery = false } = {}) {
    backgroundUploadGeneration += 1;
    pendingBackgroundImage = "";
    pendingBackgroundSourceKind = "none";
    pendingBackgroundSourceUrl = "";
    pendingBackgroundPreset = "";
    if (!pendingBackgroundColorCustomized) {
      setColorPickerFromHex(effectiveBackgroundColor(state.settings));
      pendingBackgroundColorCustomized = true;
    }
    renderBackgroundPresets();
    if (wallpaperGalleryDialog?.open) renderWallpaperGallery();
    applyBackgroundControlsLive({ persistDelay: 0 });
    if (closeGallery) closeDialog(wallpaperGalleryDialog);
  }

  function createBackgroundChoice(id, preset, { plain = false, closeGallery = false } = {}) {
    const selected = plain ? plainColorSelected() : pendingBackgroundPreset === id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `background-preset${selected ? " selected" : ""}${plain ? " plain-color-choice" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.title = plain ? t("plainColor") : preset.name;

    const thumb = document.createElement("span");
    thumb.className = "background-preset-thumb";
    if (plain) {
      thumb.style.backgroundColor = normalizeHexColor(backgroundColorHex?.value) || effectiveBackgroundColor(state.settings);
    } else {
      button.dataset.presetId = id;
      thumb.style.backgroundImage = `url(${cssUrl(browser.runtime.getURL(preset.file))})`;
    }

    const label = document.createElement("span");
    label.className = "background-preset-name";
    label.textContent = plain ? t("plainColor") : preset.name;
    button.append(thumb, label);
    button.addEventListener("click", () => {
      if (plain) {
        selectPlainColorBackground({ closeGallery });
        return;
      }
      backgroundUploadGeneration += 1;
      pendingBackgroundPreset = id;
      pendingBackgroundImage = "";
      pendingBackgroundSourceKind = "none";
      pendingBackgroundSourceUrl = "";
      renderBackgroundPresets();
      if (wallpaperGalleryDialog?.open) renderWallpaperGallery();
      applyBackgroundControlsLive({ persistDelay: 0 });
      if (closeGallery) closeDialog(wallpaperGalleryDialog);
    });
    return button;
  }

  function renderBackgroundPresets() {
    if (!backgroundPresetGrid) return;
    backgroundPresetGrid.replaceChildren();
    backgroundPresetGrid.append(createBackgroundChoice("", null, { plain: true }));
    for (const [id, preset] of Object.entries(BACKGROUND_PRESETS)) {
      if (preset.featured === false) continue;
      backgroundPresetGrid.append(createBackgroundChoice(id, preset));
    }
    if (moreWallpapersButton) {
      const selectedPreset = BACKGROUND_PRESETS[pendingBackgroundPreset];
      const selectedFromGallery = Boolean(selectedPreset && selectedPreset.featured === false);
      moreWallpapersButton.classList.toggle("selected", selectedFromGallery);
      moreWallpapersButton.title = selectedFromGallery ? t("selectedWallpaper", { name: selectedPreset.name }) : t("browseBuiltInWallpapers");
    }
  }

  function createThemeWallpaperGalleryChoice(target, id, preset = null) {
    const key = target === "light" ? "lightBackgroundPreset" : "darkBackgroundPreset";
    const selected = (state.settings[key] || "") === id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `background-preset${selected ? " selected" : ""}`;
    button.setAttribute("aria-pressed", selected ? "true" : "false");

    const thumb = document.createElement("span");
    thumb.className = "background-preset-thumb";
    if (preset) {
      button.dataset.presetId = id;
      button.title = preset.name;
      thumb.style.backgroundImage = `url(${cssUrl(browser.runtime.getURL(preset.file))})`;
    } else {
      const fallback = baseWallpaperPreview(target);
      button.title = t("useCurrentBackground");
      thumb.style.backgroundImage = fallback.image ? `url(${cssUrl(fallback.image)})` : "none";
      thumb.style.backgroundColor = fallback.color;
    }

    const label = document.createElement("span");
    label.className = "background-preset-name";
    label.textContent = preset ? preset.name : t("useCurrentBackground");
    button.append(thumb, label);
    button.addEventListener("click", () => {
      setThemeWallpaperPreset(target, id);
      closeDialog(wallpaperGalleryDialog);
    });
    return button;
  }

  function renderWallpaperGallery() {
    if (!wallpaperGalleryGrid) return;
    wallpaperGalleryGrid.replaceChildren();
    if (wallpaperGalleryTarget === "light" || wallpaperGalleryTarget === "dark") {
      wallpaperGalleryGrid.append(createThemeWallpaperGalleryChoice(wallpaperGalleryTarget, ""));
      for (const [id, preset] of Object.entries(BACKGROUND_PRESETS)) {
        wallpaperGalleryGrid.append(createThemeWallpaperGalleryChoice(wallpaperGalleryTarget, id, preset));
      }
      return;
    }
    wallpaperGalleryGrid.append(createBackgroundChoice("", null, { plain: true, closeGallery: true }));
    for (const [id, preset] of Object.entries(BACKGROUND_PRESETS)) {
      wallpaperGalleryGrid.append(createBackgroundChoice(id, preset, { closeGallery: true }));
    }
  }

  function openThemeWallpaperGallery(target) {
    if (target !== "light" && target !== "dark") return;
    wallpaperGalleryTarget = target;
    localizeDocument(wallpaperGalleryDialog);
    renderWallpaperGallery();
    wallpaperGalleryDialog?.showModal();
  }

  async function refreshWebAccessUi() {
    webAccessGranted = await hasWebAccess();
    if (settingsWebAccessStatus) {
      settingsWebAccessStatus.textContent = webAccessGranted
        ? t("webAccessAllowedDetail")
        : t("webAccessNotAllowedDetail");
    }
    if (settingsWebAccessButton) {
      settingsWebAccessButton.textContent = webAccessGranted ? t("websiteAccessAllowed") : t("allowAllWebsites");
      settingsWebAccessButton.disabled = webAccessGranted;
    }
    return webAccessGranted;
  }

  function hasShortcutNeedingWebAccess() {
    const visit = item => {
      if (item?.type === "folder") return (item.items || []).some(visit);
      if (item?.type !== "shortcut") return false;
      return !item.image && !item.localImageAssetId && !item.imageAssetId;
    };
    return (state.shortcuts || []).some(visit);
  }

  function hideWebAccessPrompt() {
    if (webAccessPrompt) webAccessPrompt.hidden = true;
  }

  async function maybeShowWebAccessPrompt() {
    if (!webAccessPrompt || state.settings.autoSiteIcons === false || !hasShortcutNeedingWebAccess()) {
      hideWebAccessPrompt();
      return;
    }
    try { webAccessGranted = await hasWebAccess(); } catch { return; }
    if (webAccessGranted) {
      hideWebAccessPrompt();
      return;
    }
    // The real browser permission is authoritative. An old remembered
    // `webAccessPrompted` bit must never leave Automatic site icons looking
    // enabled while the capability required to fetch a brand-new site's icon
    // has been revoked or was never granted on this installation.
    webAccessPrompt.hidden = false;
  }

  async function persistWebAccessPromptDecision(granted) {
    state.settings.webAccessPrompted = true;
    webAccessGranted = granted === true;
    if (!webAccessGranted) {
      state.settings.autoSiteIcons = false;
      if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
    }
    await saveState({ localCacheOnly: true });
    hideWebAccessPrompt();
    await refreshWebAccessUi().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Read-only Firefox bookmarks browser
  // ---------------------------------------------------------------------------
  function bookmarkFolderRecord(id) {
    return bookmarkFolders.find(folder => folder.id === id) || null;
  }

  function bookmarkNodeRecord(id) {
    const wanted = String(id ?? "");
    const stack = [...(bookmarkTree || [])];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (String(node.id ?? "") === wanted) return node;
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return null;
  }

  function bookmarkFolderPath(id) {
    const path = [];
    let current = bookmarkFolderRecord(id);
    const seen = new Set();
    while (current && current.id && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.title) path.unshift(current.title);
      current = current.parentId ? bookmarkFolderRecord(current.parentId) : null;
    }
    return path;
  }

  function bookmarkDisplayHost(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, "") || parsed.protocol.replace(":", "");
    } catch {
      return url;
    }
  }

  function bookmarkInitial(item) {
    const source = String(item?.title || bookmarkDisplayHost(item?.url || "") || "★").trim();
    return graphemeSegmenter ? [...graphemeSegmenter.segment(source)][0]?.segment || "★" : Array.from(source)[0] || "★";
  }

  function createBookmarkLink(item, { showPath = false } = {}) {
    const link = document.createElement("a");
    link.className = "bookmark-item";
    link.href = item.url;
    link.title = `${item.title}\n${item.url}`;
    link.setAttribute("aria-label", `${t("openBookmark")}: ${item.title}`);

    const icon = document.createElement("span");
    icon.className = "bookmark-item-icon";
    icon.textContent = bookmarkInitial(item);
    icon.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "bookmark-item-copy";
    const title = document.createElement("strong");
    title.className = "bookmark-item-title";
    title.textContent = item.title || item.url;
    const url = document.createElement("small");
    url.className = "bookmark-item-url";
    url.textContent = bookmarkDisplayHost(item.url);
    copy.append(title, url);
    if (showPath && item.path?.length) {
      const path = document.createElement("small");
      path.className = "bookmark-item-path";
      path.textContent = item.path.join(" › ");
      copy.append(path);
    }
    link.append(icon, copy);
    return link;
  }

  function closeBookmarkColorMenu() {
    if (bookmarkColorMenu?.isConnected) {
      try { bookmarkColorMenu.hidePopover?.(); } catch {}
      bookmarkColorMenu.remove();
    }
    bookmarkColorMenu = null;
  }

  function applyBookmarkFolderColor(button, folderId) {
    const colorKey = bookmarkFolderColors[String(folderId || "")];
    const color = BOOKMARK_FOLDER_COLOR_PALETTE[colorKey] || "";
    button.classList.toggle("has-folder-color", Boolean(color));
    if (color) {
      button.style.setProperty("--bookmark-folder-color", color);
      button.style.setProperty("--bookmark-folder-contrast", hexLuminance(color) > 0.46 ? "#201a26" : "#ffffff");
    } else {
      button.style.removeProperty("--bookmark-folder-color");
      button.style.removeProperty("--bookmark-folder-contrast");
    }
  }

  function showBookmarkFolderColorMenu(event, folder) {
    closeBookmarkColorMenu();
    const folderId = String(folder?.id || "");
    if (!folderId) return;
    const menu = document.createElement("div");
    menu.className = "bookmark-color-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t("folderColor"));

    const addSwatch = (colorKey, color, reset = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.reset = reset ? "true" : "false";
      if (color) button.style.backgroundColor = color;
      const label = reset ? t("reset") : `${t("folderColor")} ${Object.keys(BOOKMARK_FOLDER_COLOR_PALETTE).indexOf(colorKey) + 1}`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (reset) delete bookmarkFolderColors[folderId];
        else bookmarkFolderColors[folderId] = colorKey;
        writeBookmarkFolderColors();
        closeBookmarkColorMenu();
        renderBookmarkBrowser();
      });
      menu.append(button);
    };
    addSwatch("", "", true);
    for (const [colorKey, color] of Object.entries(BOOKMARK_FOLDER_COLOR_PALETTE)) addSwatch(colorKey, color, false);
    // A modal <dialog> makes DOM outside the dialog inert. The palette must be
    // a *descendant* of the Bookmarks dialog before it enters the popover top
    // layer; appending it to <body> makes it visible but unclickable. Keeping
    // dialog ancestry also gives the non-Popover fallback normal interaction.
    menu.setAttribute("popover", "manual");
    bookmarksDialog?.append(menu);
    bookmarkColorMenu = menu;
    try { menu.showPopover(); } catch {
      // Firefox 140+ and current Chromium support Popover. In unusual runtimes
      // it remains an ordinary positioned child of the active modal dialog.
      menu.removeAttribute("popover");
    }
    positionFloatingMenu(menu, event.clientX, event.clientY);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  function createBookmarkFolderButton(folder, { card = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = card ? "bookmark-folder-card" : "bookmark-folder-button";
    if (!card) {
      button.style.paddingInlineStart = `${8 + Math.max(0, folder.depth - 1) * 13}px`;
      button.classList.toggle("selected", activeBookmarkFolderId === folder.id);
    }
    const label = document.createElement("span");
    label.textContent = folder.title || t("folder");
    button.append(label);
    button.title = `${folder.title || t("folder")} · ${t("folderColor")}`;
    applyBookmarkFolderColor(button, folder.id);
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      showBookmarkFolderColorMenu(event, folder);
    });
    button.addEventListener("click", () => {
      activeBookmarkFolderId = folder.id;
      if (bookmarksSearch) bookmarksSearch.value = "";
      renderBookmarkBrowser();
    });
    return button;
  }

  function renderBookmarkSidebar() {
    if (!bookmarkFolderTree) return;
    bookmarkFolderTree.replaceChildren();
    const all = document.createElement("button");
    all.type = "button";
    all.className = "bookmark-folder-button";
    all.classList.toggle("selected", activeBookmarkFolderId === "all");
    const allLabel = document.createElement("span");
    allLabel.textContent = t("allBookmarks");
    all.append(allLabel);
    all.addEventListener("click", () => {
      activeBookmarkFolderId = "all";
      if (bookmarksSearch) bookmarksSearch.value = "";
      renderBookmarkBrowser();
    });
    bookmarkFolderTree.append(all);

    for (const folder of bookmarkFolders) {
      if (!folder.title || folder.depth === 0) continue;
      bookmarkFolderTree.append(createBookmarkFolderButton(folder));
    }
  }

  function renderBookmarkBrowser() {
    if (!bookmarksBrowser || !bookmarkItems || !bookmarkFolderCards || !bookmarksEmpty) return;
    renderBookmarkSidebar();
    bookmarkItems.replaceChildren();
    bookmarkFolderCards.replaceChildren();

    const query = String(bookmarksSearch?.value || "").trim().toLocaleLowerCase();
    let items = [];
    let childFolders = [];
    let breadcrumb = "";
    let showPath = false;

    if (query) {
      items = bookmarkAllItems.filter(item =>
        `${item.title} ${item.url} ${(item.path || []).join(" ")}`.toLocaleLowerCase().includes(query)
      );
      breadcrumb = t("searchBookmarks");
      showPath = true;
    } else if (activeBookmarkFolderId === "all") {
      items = bookmarkAllItems;
      const rootNode = bookmarkTree[0] || null;
      childFolders = bookmarksApi.directChildFolders(rootNode).map(folder => ({ ...folder, depth: 1, parentId: String(rootNode?.id || "") }));
      breadcrumb = t("allBookmarks");
      showPath = true;
    } else {
      const folder = bookmarkFolderRecord(activeBookmarkFolderId);
      if (folder) {
        const folderNode = bookmarkNodeRecord(folder.id);
        items = bookmarksApi.directFolderBookmarks(folderNode);
        childFolders = bookmarksApi.directChildFolders(folderNode).map(child => ({ ...child, depth: folder.depth + 1, parentId: folder.id }));
        breadcrumb = bookmarkFolderPath(folder.id).join(" › ") || folder.title;
      }
    }

    if (bookmarkBreadcrumbs) bookmarkBreadcrumbs.textContent = breadcrumb;
    if (bookmarksCount) bookmarksCount.textContent = t("bookmarksCount", { count: items.length });

    const folderFragment = document.createDocumentFragment();
    for (const folder of childFolders) folderFragment.append(createBookmarkFolderButton(folder, { card: true }));
    bookmarkFolderCards.append(folderFragment);

    const itemFragment = document.createDocumentFragment();
    for (const item of items) itemFragment.append(createBookmarkLink(item, { showPath }));
    bookmarkItems.append(itemFragment);

    const empty = items.length === 0 && childFolders.length === 0;
    bookmarksEmpty.hidden = !empty;
    if (empty) {
      const strong = bookmarksEmpty.querySelector("strong");
      const detail = bookmarksEmpty.querySelector("span");
      if (strong) strong.textContent = query ? t("noSearchResults") : t("noBookmarksHere");
      if (detail) detail.textContent = query ? t("searchResultHint") : t("chooseFolderOrSearch");
    }
  }

  async function loadBookmarksIntoDialog() {
    if (!bookmarksPermissionState || !bookmarksBrowser) return;
    bookmarksStatus.textContent = "";
    const api = await loadBookmarksModule();
    const allowed = await api.hasBookmarksPermission();
    bookmarksPermissionState.hidden = allowed;
    bookmarksBrowser.hidden = !allowed;
    if (!allowed) {
      queueMicrotask(() => bookmarksPermissionButton?.focus());
      return;
    }

    try {
      bookmarkTree = await api.readBookmarkTree();
      bookmarkFolders = api.flattenBookmarkFolders(bookmarkTree);
      bookmarkAllItems = api.flattenBookmarks(bookmarkTree);
      bookmarkFolderColors = readBookmarkFolderColors();
      const validFolderIds = new Set(bookmarkFolders.map(folder => String(folder.id || "")).filter(Boolean));
      let prunedFolderColors = false;
      for (const folderId of Object.keys(bookmarkFolderColors)) {
        if (validFolderIds.has(folderId)) continue;
        delete bookmarkFolderColors[folderId];
        prunedFolderColors = true;
      }
      if (prunedFolderColors) writeBookmarkFolderColors();
      activeBookmarkFolderId = "all";
      renderBookmarkBrowser();
      queueMicrotask(() => bookmarksSearch?.focus());
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: bookmark read failed`, error);
      bookmarksBrowser.hidden = true;
      bookmarksPermissionState.hidden = false;
      bookmarksStatus.textContent = t("bookmarksLoadError");
    }
  }

  async function openBookmarks() {
    if (!bookmarksDialog) return;
    if (bookmarksDialog.open) {
      closeDialog(bookmarksDialog);
      return;
    }
    await ensureSecondaryStyles();
    await loadBookmarksModule();
    localizeDocument(bookmarksDialog);
    bookmarksDialog.showModal();
    await loadBookmarksIntoDialog();
  }

  function baseWallpaperPreview(targetTheme = effectiveTheme()) {
    const forcedTheme = targetTheme === "light" ? "light" : "dark";
    const baseSettings = {
      ...state.settings,
      theme: forcedTheme,
      themeWallpapersEnabled: false
    };
    const presetId = state.settings.backgroundPreset || "";
    const preset = BACKGROUND_PRESETS[presetId];
    const image = preset
      ? browser.runtime.getURL(preset.file)
      : (state.settings.backgroundImage || "");
    return {
      image,
      color: effectiveBackgroundColor(baseSettings)
    };
  }

  function paintThemeWallpaperPreview(preview, target, presetId) {
    if (!preview) return;
    const preset = presetId && BACKGROUND_PRESETS[presetId] ? BACKGROUND_PRESETS[presetId] : null;
    const dim = effectiveBackgroundDimForTheme(state.settings, target);
    preview.style.setProperty("--theme-preview-dim", String(dim / 100));
    if (preset) {
      preview.style.backgroundImage = `url(${cssUrl(browser.runtime.getURL(preset.file))})`;
      preview.style.backgroundColor = "";
      return;
    }
    const fallback = baseWallpaperPreview(target);
    preview.style.backgroundImage = fallback.image ? `url(${cssUrl(fallback.image)})` : "none";
    preview.style.backgroundColor = fallback.color;
  }

  function refreshThemeWallpaperChoice(button, label, valueNode, preview, target, presetId) {
    if (!button || !label || !valueNode) return;
    const safePresetId = presetId && BACKGROUND_PRESETS[presetId] ? presetId : "";
    const name = safePresetId ? BACKGROUND_PRESETS[safePresetId].name : t("useCurrentBackground");
    const targetLabel = t(target === "light" ? "light" : "dark");
    label.textContent = targetLabel;
    valueNode.textContent = name;
    button.title = `${targetLabel}: ${name}`;
    button.setAttribute("aria-label", `${targetLabel}: ${name}`);
    paintThemeWallpaperPreview(preview, target, safePresetId);
  }

  function refreshThemeWallpaperDimControl(target) {
    const isLight = target === "light";
    const input = isLight ? settingsLightWallpaperDim : settingsDarkWallpaperDim;
    const output = isLight ? settingsLightWallpaperDimValue : settingsDarkWallpaperDimValue;
    const label = isLight ? settingsLightWallpaperDimLabel : settingsDarkWallpaperDimLabel;
    const preview = isLight ? settingsLightWallpaperPreview : settingsDarkWallpaperPreview;
    if (!input || !output) return;
    const dim = effectiveBackgroundDimForTheme(state.settings, target);
    const targetLabel = t(isLight ? "light" : "dark");
    const darknessLabel = t("backgroundDarkness");
    input.value = String(dim);
    input.setAttribute("aria-label", `${targetLabel} — ${darknessLabel}`);
    output.value = `${dim}%`;
    output.textContent = `${dim}%`;
    if (label) label.textContent = darknessLabel;
    if (preview) preview.style.setProperty("--theme-preview-dim", String(dim / 100));
  }

  function refreshThemeWallpaperControls({ refreshChoices = true } = {}) {
    if (settingsThemeWallpapersLabel) settingsThemeWallpapersLabel.textContent = t("lightDarkWallpapers");
    if (settingsThemeWallpapersDescription) settingsThemeWallpapersDescription.textContent = t("themeWallpapersDescription");
    const enabled = state.settings.themeWallpapersEnabled === true;
    if (settingsThemeWallpapers) settingsThemeWallpapers.checked = enabled;
    if (themeWallpaperChoices) themeWallpaperChoices.hidden = !enabled;
    if (backgroundDimControls) backgroundDimControls.hidden = enabled;
    // Settings open already prepares both cards while hidden. The checkbox itself
    // only needs to expand/collapse the prepared section, not repaint two image
    // previews in the same event that changes panel height.
    if (!refreshChoices) return;
    refreshThemeWallpaperChoice(
      settingsLightWallpaper,
      settingsLightWallpaperLabel,
      settingsLightWallpaperValue,
      settingsLightWallpaperPreview,
      "light",
      state.settings.lightBackgroundPreset || ""
    );
    refreshThemeWallpaperChoice(
      settingsDarkWallpaper,
      settingsDarkWallpaperLabel,
      settingsDarkWallpaperValue,
      settingsDarkWallpaperPreview,
      "dark",
      state.settings.darkBackgroundPreset || ""
    );
    refreshThemeWallpaperDimControl("light");
    refreshThemeWallpaperDimControl("dark");
  }

  function themeWallpaperVisualChanged(previousPresetId, previousImageValue, previousDim) {
    return previousPresetId !== effectiveBackgroundPresetId(state.settings) ||
      previousImageValue !== effectiveBackgroundImageValue(state.settings) ||
      Number(previousDim) !== Number(effectiveBackgroundDim(state.settings));
  }

  function applyThemeWallpaperVisualSafely(previousPresetId, previousImageValue, previousDim) {
    if (!themeWallpaperVisualChanged(previousPresetId, previousImageValue, previousDim)) return;

    if (isSettingsOpen()) {
      applyPageBackgroundVisual();
      return;
    }

    applySettings();
    scheduleAppearanceHintRefresh(state.settings);
  }

  function stampThemeWallpaperMutation() {
    markSettingsChanged();
    const activeWorkspace = state.spaces?.[state.activeSpaceId];
    if (activeWorkspace) {
      activeWorkspace.settingsModifiedAt = state.settingsModifiedAt;
      activeWorkspace.updatedAt = state.updatedAt;
    }
    stateMutationGeneration += 1;
  }

  function queueThemeWallpaperPersistence() {
    scheduleBackgroundPersist(180);
  }

  function persistThemeWallpaperControls() {
    const enabled = settingsThemeWallpapers?.checked === true;
    if (state.settings.themeWallpapersEnabled === enabled) {
      if (themeWallpaperChoices) themeWallpaperChoices.hidden = !enabled;
      if (backgroundDimControls) backgroundDimControls.hidden = enabled;
      if (enabled) {
        const initialized = initializeThemeWallpaperDims(state.settings, effectiveThemeFor(state.settings));
        if (initialized.changed) {
          state.settings.lightBackgroundDim = initialized.lightBackgroundDim;
          state.settings.darkBackgroundDim = initialized.darkBackgroundDim;
          stampThemeWallpaperMutation();
          rememberPendingSettings(["lightBackgroundDim", "darkBackgroundDim"]);
          refreshThemeWallpaperControls({ refreshChoices: false });
          if (isSettingsOpen()) applyPageBackgroundVisual();
          else applySettings();
          scheduleBackgroundPersist(0);
        }
      }
      return;
    }

    const previousPresetId = effectiveBackgroundPresetId(state.settings);
    const previousImageValue = effectiveBackgroundImageValue(state.settings);
    const previousDim = effectiveBackgroundDim(state.settings);
    state.settings.themeWallpapersEnabled = enabled;
    if (enabled) {
      const initialized = initializeThemeWallpaperDims(state.settings, effectiveThemeFor(state.settings));
      state.settings.lightBackgroundDim = initialized.lightBackgroundDim;
      state.settings.darkBackgroundDim = initialized.darkBackgroundDim;
    }
    stampThemeWallpaperMutation();
    rememberPendingSettings(["themeWallpapersEnabled", ...(enabled ? ["lightBackgroundDim", "darkBackgroundDim"] : [])]);
    // The cards were prepared when Settings opened. During the checkbox gesture
    // only change visibility; do not combine section expansion with preview paints.
    refreshThemeWallpaperControls({ refreshChoices: false });

    applyThemeWallpaperVisualSafely(previousPresetId, previousImageValue, previousDim);
    scheduleBackgroundPersist(0);
  }

  function applyThemeWallpaperDimLive(target) {
    if (target !== "light" && target !== "dark" || state.settings.themeWallpapersEnabled !== true) return;
    const input = target === "light" ? settingsLightWallpaperDim : settingsDarkWallpaperDim;
    if (!input) return;
    const key = target === "light" ? "lightBackgroundDim" : "darkBackgroundDim";
    const dim = Math.min(100, Math.max(0, Number(input.value) || 0));
    if (state.settings[key] === dim) {
      refreshThemeWallpaperDimControl(target);
      return;
    }
    state.settings[key] = dim;
    stampThemeWallpaperMutation();
    rememberPendingSettings([key]);
    refreshThemeWallpaperDimControl(target);
    if (effectiveThemeFor(state.settings) === target) {
      if (isSettingsOpen()) applyPageBackgroundVisual();
      else applySettings();
    }
    queueThemeWallpaperPersistence();
  }

  function setThemeWallpaperPreset(target, presetId) {
    if (target !== "light" && target !== "dark") return;
    const safePresetId = presetId && BACKGROUND_PRESETS[presetId] ? presetId : "";
    const key = target === "light" ? "lightBackgroundPreset" : "darkBackgroundPreset";
    if ((state.settings[key] || "") === safePresetId) return;

    const previousPresetId = effectiveBackgroundPresetId(state.settings);
    const previousImageValue = effectiveBackgroundImageValue(state.settings);
    const previousDim = effectiveBackgroundDim(state.settings);
    state.settings[key] = safePresetId;
    stampThemeWallpaperMutation();
    rememberPendingSettings([key]);
    refreshThemeWallpaperControls();

    applyThemeWallpaperVisualSafely(previousPresetId, previousImageValue, previousDim);
    scheduleBackgroundPersist(0);
  }

  function applyThemeTransition() {
    if (isSettingsOpen()) {
      // The selector's lightweight theme chrome updates immediately, while the
      // matching wallpaper/dim is shown through the isolated preview surface. The
      // authoritative page/root background remains frozen until Settings closes.
      applyThemeSkinVisual();
      applyPageBackgroundVisual();
      return;
    }
    applySettings();
    scheduleAppearanceHintRefresh(state.settings);
  }

  function reconcileLauncherAfterExternalState({ deferHeavyAssets = false, renderGrid = true } = {}) {
    // Storage/Sync/background callbacks may adopt newer state while Settings is
    // open. Keep the model current, but do not reconstruct the launcher or change
    // its root paint/layout behind the open Settings surface. Direct Settings
    // gestures still use the ordinary live applySettings()/render() paths.
    if (isSettingsOpen()) {
      deferredLauncherSettings = true;
      if (renderGrid) deferredLauncherRender = true;
      return false;
    }
    applySettings({ deferHeavyAssets });
    if (renderGrid) render();
    return true;
  }

  function requestLauncherRenderAfterExternalState() {
    if (isSettingsOpen()) {
      deferredLauncherRender = true;
      return false;
    }
    render();
    return true;
  }

  function commitDeferredLauncherVisual() {
    if (isSettingsOpen()) return;
    const needsSettings = deferredAppearanceVisual || deferredLauncherSettings;
    const needsRender = deferredLauncherRender;
    if (!needsSettings && !needsRender) return;
    deferredAppearanceVisual = false;
    deferredLauncherSettings = false;
    deferredLauncherRender = false;
    if (needsSettings) {
      applySettings();
      scheduleAppearanceHintRefresh(state.settings);
    }
    if (needsRender) render();
  }

  function controlContainsActiveElement(control) {
    const active = document.activeElement;
    return Boolean(control && active && (active === control || control.contains?.(active)));
  }

  function refreshGridSettingsControls({ preserveActive = false } = {}) {
    let deferred = false;
    const pairs = [
      [settingsColumns, "columns"],
      [settingsRows, "rows"],
      [settingsTileSize, "tileSize"]
    ];
    for (const [control, key] of pairs) {
      if (!control) continue;
      if (preserveActive && controlContainsActiveElement(control)) { deferred = true; continue; }
      control.value = String(state.settings[key]);
    }
    const displayedTileSize = settingsTileSize?.value || String(state.settings.tileSize);
    if (settingsTileSizeValue) {
      settingsTileSizeValue.value = `${displayedTileSize}px`;
      settingsTileSizeValue.textContent = `${displayedTileSize}px`;
    }
    return deferred;
  }

  function refreshFrequentlyVisitedSettingsControls({ preserveActive = false } = {}) {
    let deferred = false;
    if (settingsFrequentlyVisited) {
      if (preserveActive && controlContainsActiveElement(settingsFrequentlyVisited)) deferred = true;
      else settingsFrequentlyVisited.checked = frequentlyVisitedEnabled;
    }
    if (settingsFrequentlyVisitedCount) {
      if (preserveActive && controlContainsActiveElement(settingsFrequentlyVisitedCount)) deferred = true;
      else settingsFrequentlyVisitedCount.value = String(frequentlyVisitedCount);
    }
    setFrequentlyVisitedOptionsVisibility(frequentlyVisitedEnabled);
    return deferred;
  }

  function refreshBackgroundSettingsControls({ preserveActive = false, closePicker = false } = {}) {
    const s = state.settings;
    let deferred = false;
    const colorActive = preserveActive && controlContainsActiveElement(backgroundColorControl);
    if (colorActive) {
      deferred = true;
    } else {
      pendingBackgroundColorCustomized = s.backgroundColorCustomized === true;
      setColorPickerFromHex(effectiveBackgroundColor(s));
      if (closePicker) closeBackgroundColorPicker();
    }
    pendingBackgroundPreset = s.backgroundPreset || "";
    pendingBackgroundSourceKind = s.backgroundSourceKind || "none";
    pendingBackgroundSourceUrl = s.backgroundSourceUrl || "";
    pendingBackgroundImage = !s.backgroundPreset && s.backgroundImage?.startsWith("data:") ? s.backgroundImage : "";
    if (settingsBackgroundDim) {
      if (preserveActive && controlContainsActiveElement(settingsBackgroundDim)) deferred = true;
      else settingsBackgroundDim.value = String(s.backgroundDim);
    }
    renderBackgroundPresets();
    refreshThemeWallpaperControls();
    updateBackgroundControlLabels();
    return deferred;
  }

  const SETTINGS_REFRESH_KEYS = Object.freeze({
    grid: Object.freeze(["columns", "rows", "tileSize"]),
    theme: Object.freeze(["theme"]),
    background: Object.freeze([
      "backgroundColor", "backgroundColorCustomized", "backgroundPreset", "backgroundSourceKind",
      "backgroundSourceUrl", "backgroundImage", "backgroundDim", "themeWallpapersEnabled",
      "lightBackgroundPreset", "darkBackgroundPreset", "lightBackgroundDim", "darkBackgroundDim"
    ]),
    autoIcons: Object.freeze(["autoSiteIcons"])
  });

  function settingsKeysChanged(previousSettings, nextSettings, keys) {
    for (const key of keys) {
      if (!Object.is(previousSettings?.[key], nextSettings?.[key])) return true;
    }
    return false;
  }

  function spacesSettingsChanged(previousState, nextState) {
    for (const spaceId of SPACE_IDS) {
      const before = previousState?.spaces?.[spaceId]?.settings || {};
      const after = nextState?.spaces?.[spaceId]?.settings || {};
      if (!Object.is(before.multipleSpacesEnabled, after.multipleSpacesEnabled) ||
          !Object.is(before.spaceName, after.spaceName)) return true;
    }
    return false;
  }

  function settingsRefreshDomains(previousState, nextState = state) {
    if (!previousState || !nextState) return new Set(["grid", "theme", "spaces", "frequent", "background", "autoIcons"]);
    if (previousState.activeSpaceId !== nextState.activeSpaceId) {
      return new Set(["grid", "theme", "spaces", "frequent", "background", "autoIcons"]);
    }
    const previousSettings = previousState.settings || {};
    const nextSettings = nextState.settings || {};
    const domains = new Set();
    if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.grid)) domains.add("grid");
    if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.theme)) domains.add("theme");
    if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.background)) domains.add("background");
    if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.autoIcons)) domains.add("autoIcons");
    if (spacesSettingsChanged(previousState, nextState)) domains.add("spaces");
    const beforeFrequent = synchronizedFrequentlyVisitedSettings(previousState);
    const afterFrequent = synchronizedFrequentlyVisitedSettings(nextState);
    if (beforeFrequent.enabled !== afterFrequent.enabled || beforeFrequent.count !== afterFrequent.count) domains.add("frequent");
    return domains;
  }

  function refreshSettingsControlsAfterExternalState(previousState = null) {
    if (!isSettingsOpen()) return new Set();
    const domains = settingsRefreshDomains(previousState, state);
    // Exact own-write echoes already match the live model + pending draft. They
    // advance the persistence baseline but must perform zero Settings DOM work.
    if (!domains.size) return domains;

    let deferred = false;
    if (domains.has("grid")) deferred = refreshGridSettingsControls({ preserveActive: true }) || deferred;
    if (domains.has("theme")) {
      if (controlContainsActiveElement(themeToggle)) deferred = true;
      else updateThemeToggle();
    }
    if (domains.has("spaces")) deferred = refreshSpacesSettings({ preserveActive: true }) || deferred;
    if (domains.has("frequent")) deferred = refreshFrequentlyVisitedSettingsControls({ preserveActive: true }) || deferred;
    if (domains.has("background")) deferred = refreshBackgroundSettingsControls({ preserveActive: true }) || deferred;
    if (domains.has("autoIcons") && settingsAutoSiteIcons) {
      if (controlContainsActiveElement(settingsAutoSiteIcons)) deferred = true;
      else settingsAutoSiteIcons.checked = state.settings.autoSiteIcons !== false;
    }
    deferredSettingsControlRefresh = deferredSettingsControlRefresh || deferred;
    return domains;
  }

  async function openSettings() {
    closeDropChoice();
    closeFolder();
    if (isSettingsOpen()) {
      closeDialog(settingsDialog);
      return;
    }
    await ensureSecondaryStyles();
    localizeDocument(settingsDialog);
    deferredSettingsControlRefresh = false;
    refreshGridSettingsControls();
    populateLanguageSelect(settingsLanguage);
    shortcutOrderMode = readShortcutOrderPreference();
    shortcutUsage = readShortcutUsage();
    if (settingsShortcutOrder) settingsShortcutOrder.value = shortcutOrderMode;
    if (settingsShortcutOrderHint) settingsShortcutOrderHint.textContent = t("shortcutOrderDeviceOnly");
    refreshSpacesSettings();
    syncFrequentlyVisitedLocalsFromState(state);
    if (settingsFrequentlyVisitedDescription) settingsFrequentlyVisitedDescription.textContent = t("frequentlyVisitedDescription");
    if (settingsFrequentlyVisitedCountLabel) settingsFrequentlyVisitedCountLabel.textContent = t("frequentCount");
    refreshFrequentlyVisitedSettingsControls();
    void refreshFrequentlyVisited();
    settingsAutoSiteIcons.checked = state.settings.autoSiteIcons !== false;
    refreshBackgroundSettingsControls({ closePicker: true });
    settingsDialog.hidden = false;
    settingsDialog.setAttribute("aria-hidden", "false");
    settingsButton?.setAttribute("aria-expanded", "true");
    reconcileAndRefreshSyncStatus().catch(error => console.warn(`${PRODUCT_NAME}: sync status unavailable`, error));
    refreshWebAccessUi().catch(error => console.warn(`${PRODUCT_NAME}: website permission status unavailable`, error));
  }

  function updateBackgroundControlLabels() {
    const dim = Math.min(100, Math.max(0, Number(settingsBackgroundDim.value) || 0));
    settingsBackgroundDimValue.value = `${dim}%`;
    settingsBackgroundDimValue.textContent = `${dim}%`;
  }

  function refreshLocalizedUi() {
    const settingsScrollTop = settingsDialog?.scrollTop || 0;

    // Static labels/attributes retain their semantic translation keys inside
    // core/i18n.js, so the same DOM can be translated repeatedly without reload.
    localizeDocument(document);
    populateLanguageSelect(settingsLanguage);
    if (settingsShortcutOrderHint) settingsShortcutOrderHint.textContent = t("shortcutOrderDeviceOnly");
    updateBuiltinShortcutIconSelection();
    updateShortcutColorSelection();

    // Re-render only presentation surfaces whose labels are generated at runtime.
    // Pending Settings values are intentionally untouched.
    renderBackgroundPresets();
    refreshSpacesSettings();
    refreshThemeWallpaperControls();
    if (settingsFrequentlyVisitedDescription) settingsFrequentlyVisitedDescription.textContent = t("frequentlyVisitedDescription");
    if (settingsFrequentlyVisitedCountLabel) settingsFrequentlyVisitedCountLabel.textContent = t("frequentCount");
    if (frequentlyVisitedPermissionButton) frequentlyVisitedPermissionButton.textContent = t("grantFrequentlyVisitedPermission");
    if (frequentPermissionRecoveryText) frequentPermissionRecoveryText.textContent = t("frequentPermissionRequired");
    if (frequentPermissionRecoveryButton) frequentPermissionRecoveryButton.textContent = t("grantFrequentlyVisitedPermission");
    if (wallpaperGalleryDialog?.open) renderWallpaperGallery();
    render();
    updateSyncUi(meta, lastSyncStatus);
    setFrequentlyVisitedStatus(frequentlyVisitedStatusKey);
    if (bookmarkTree.length) {
      renderBookmarkSidebar();
      renderBookmarkBrowser();
    }
    if (isSettingsOpen()) {
      void refreshWebAccessUi().catch(error => console.warn(`${PRODUCT_NAME}: website permission status unavailable`, error));
    }

    // Translating longer/shorter labels may change layout height, but the user's
    // current place in the open Settings panel should remain stable.
    requestAnimationFrame(() => {
      if (isSettingsOpen() && settingsDialog) settingsDialog.scrollTop = settingsScrollTop;
    });
  }

  function collectBackgroundControlsIntoState() {
    const next = {
      // Keep the historical dark default canonical while automatic mode is active.
      // The light default is a render-time choice, so Sync never churns merely
      // because two devices use different themes.
      backgroundColor: pendingBackgroundColorCustomized
        ? (normalizeHexColor(backgroundColorHex?.value) || DEFAULT_STATE.settings.backgroundColor)
        : DEFAULT_STATE.settings.backgroundColor,
      backgroundColorCustomized: pendingBackgroundColorCustomized,
      backgroundPreset: pendingBackgroundPreset,
      backgroundImage: pendingBackgroundPreset ? "" : pendingBackgroundImage,
      backgroundLocalAssetId: pendingBackgroundPreset
        ? ""
        : (pendingBackgroundImage === state.settings.backgroundImage ? (state.settings.backgroundLocalAssetId || "") : ""),
      // Custom wallpapers are always device-local. Built-in preset identifiers
      // still sync as settings without consuming binary asset quota.
      backgroundImageKind: pendingBackgroundPreset ? "none" : (pendingBackgroundImage ? "device" : "none"),
      backgroundAssetId: "",
      backgroundSourceKind: pendingBackgroundPreset ? "none" : pendingBackgroundSourceKind,
      backgroundSourceUrl: pendingBackgroundPreset ? "" : pendingBackgroundSourceUrl,
      backgroundFit: "cover",
      backgroundPosition: "center center",
      backgroundDim: Math.min(100, Math.max(0, Number(settingsBackgroundDim.value) || 0))
    };
    const changedKeys = Object.entries(next)
      .filter(([key, value]) => !Object.is(state.settings[key], value))
      .map(([key]) => key);
    Object.assign(state.settings, next);
    if (changedKeys.length) {
      markSettingsChanged();
      rememberPendingSettings(changedKeys);
    }
  }

  function scheduleBackgroundPersist(delay = 140) {
    clearTimeout(backgroundPersistTimer);
    backgroundPersistTimer = null;
    if (delay <= 0) {
      void saveSettingsState().catch(console.error);
      return;
    }
    backgroundPersistTimer = setTimeout(() => {
      backgroundPersistTimer = null;
      saveSettingsState().catch(console.error);
    }, delay);
  }

  function applyBackgroundControlsLive({ persistDelay = 140 } = {}) {
    collectBackgroundControlsIntoState();
    updateBackgroundControlLabels();
    applySettings();
    scheduleBackgroundPersist(persistDelay);
  }

  settingsForm.addEventListener("submit", event => {
    // Settings save live. Prevent implicit form submission (for example when
    // pressing Enter in a text field) without closing the panel.
    event.preventDefault();
  });

  settingsForm.addEventListener("focusout", () => {
    if (!deferredSettingsControlRefresh) return;
    requestAnimationFrame(() => {
      if (!isSettingsOpen() || !deferredSettingsControlRefresh) return;
      deferredSettingsControlRefresh = false;
      refreshSettingsControlsAfterExternalState();
    });
  });

  async function applyGridLayoutControlLive(field) {
    const isColumns = field === "columns";
    const isRows = field === "rows";
    if (!isColumns && !isRows) return;
    const control = isColumns ? settingsColumns : settingsRows;
    const next = isColumns
      ? clampInt(control.value, 6, 12, state.settings.columns)
      : clampInt(control.value, 2, 8, state.settings.rows);
    if (next === state.settings[field]) return;

    state.settings[field] = next;
    markSettingsChanged();
    rememberPendingSettings([field]);
    applySettings();
    render();
    try {
      await saveSettingsState();
    } catch (error) {
      showToast(error.message || t("operationFailed"));
    }
  }

  settingsColumns?.addEventListener("change", () => { void applyGridLayoutControlLive("columns"); });
  settingsRows?.addEventListener("change", () => { void applyGridLayoutControlLive("rows"); });
  settingsDefaultSpace?.addEventListener("change", () => {
    writeDeviceDefaultSpacePreference(settingsDefaultSpace.value);
    refreshDeviceSpaceSettings();
  });
  settingsFrequentlyVisitedCount?.addEventListener("change", () => {
    const previous = frequentlyVisitedCount;
    const requested = Number(settingsFrequentlyVisitedCount.value);
    void persistFrequentlyVisitedPreference({ count: requested }).then(() => {
      scheduleFrequentlyVisitedRefresh(0);
    }).catch(error => {
      frequentlyVisitedCount = previous;
      settingsFrequentlyVisitedCount.value = String(previous);
      showToast(error.message || t("operationFailed"));
    });
  });
  settingsThemeWallpapers?.addEventListener("change", persistThemeWallpaperControls);
  settingsLightWallpaper?.addEventListener("click", () => openThemeWallpaperGallery("light"));
  settingsDarkWallpaper?.addEventListener("click", () => openThemeWallpaperGallery("dark"));
  settingsLightWallpaperDim?.addEventListener("input", () => applyThemeWallpaperDimLive("light"));
  settingsDarkWallpaperDim?.addEventListener("input", () => applyThemeWallpaperDimLive("dark"));
  settingsLightWallpaperDim?.addEventListener("change", () => { clearTimeout(backgroundPersistTimer); void saveSettingsState().catch(error => showToast(error.message || t("operationFailed"))); });
  settingsDarkWallpaperDim?.addEventListener("change", () => { clearTimeout(backgroundPersistTimer); void saveSettingsState().catch(error => showToast(error.message || t("operationFailed"))); });

  settingsBackgroundFile.addEventListener("change", async () => {
    const file = settingsBackgroundFile.files?.[0];
    if (!file) return;
    const generation = ++backgroundUploadGeneration;
    const spaceId = state.activeSpaceId;
    try {
      const optimized = await optimizeImageFile(file, {
        maxWidth: 3840,
        maxHeight: 2160,
        minWidth: 1280,
        minHeight: 720,
        targetBytes: WALLPAPER_LOCAL_IMAGE_TARGET_BYTES,
        initialQuality: 0.95,
        maxInputBytes: 30_000_000
      });
      if (generation !== backgroundUploadGeneration || state.activeSpaceId !== spaceId || !isSettingsOpen()) return;
      pendingBackgroundImage = optimized;
      pendingBackgroundSourceKind = "upload";
      pendingBackgroundSourceUrl = "";
      pendingBackgroundPreset = "";
      renderBackgroundPresets();
      applyBackgroundControlsLive({ persistDelay: 0 });
      // Prepare the tiny next-tab preview immediately in the worker; this does
      // not block the current Settings interaction or alter the real wallpaper.
      void refreshAppearancePreview({ ...state.settings });
      showToast(t("backgroundApplied"));
    } catch (error) {
      if (generation === backgroundUploadGeneration && state.activeSpaceId === spaceId && isSettingsOpen()) {
        showToast(error.message || t("operationFailed"));
      }
    } finally {
      settingsBackgroundFile.value = "";
    }
  });

  settingsBackgroundColorButton?.addEventListener("click", toggleBackgroundColorPicker);
  backgroundColorHue?.addEventListener("input", () => {
    colorPickerHue = Number(backgroundColorHue.value) || 0;
    applyColorPickerLive();
  });
  backgroundColorHue?.addEventListener("change", () => {
    clearTimeout(backgroundPersistTimer);
    void saveSettingsState().catch(error => showToast(error.message || t("operationFailed")));
  });
  backgroundColorPlane?.addEventListener("pointerdown", event => {
    colorPlaneDragging = true;
    colorPlaneRect = backgroundColorPlane.getBoundingClientRect();
    backgroundColorPlane.setPointerCapture?.(event.pointerId);
    updateColorPlaneFromPointer(event);
  });
  backgroundColorPlane?.addEventListener("pointermove", event => {
    if (colorPlaneDragging) updateColorPlaneFromPointer(event);
  });
  backgroundColorPlane?.addEventListener("pointerup", event => {
    colorPlaneDragging = false;
    colorPlaneRect = null;
    backgroundColorPlane.releasePointerCapture?.(event.pointerId);
    clearTimeout(backgroundPersistTimer);
    void saveSettingsState().catch(error => showToast(error.message || t("operationFailed")));
  });
  backgroundColorPlane?.addEventListener("pointercancel", () => { colorPlaneDragging = false; colorPlaneRect = null; });
  backgroundColorPlane?.addEventListener("lostpointercapture", () => { colorPlaneDragging = false; colorPlaneRect = null; });
  window.addEventListener("resize", () => { colorPlaneRect = null; });
  backgroundColorPlane?.addEventListener("keydown", event => {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (event.key === "ArrowLeft") colorPickerSaturation = clampUnit(colorPickerSaturation - step);
    else if (event.key === "ArrowRight") colorPickerSaturation = clampUnit(colorPickerSaturation + step);
    else if (event.key === "ArrowUp") colorPickerValue = clampUnit(colorPickerValue + step);
    else if (event.key === "ArrowDown") colorPickerValue = clampUnit(colorPickerValue - step);
    else return;
    event.preventDefault();
    applyColorPickerLive();
  });
  backgroundColorApply?.addEventListener("click", () => {
    const normalized = normalizeHexColor(backgroundColorHex?.value);
    if (!normalized) {
      showToast(t("invalidHexColor"));
      return;
    }
    setColorPickerFromHex(normalized);
    pendingBackgroundColorCustomized = true;
    applyBackgroundControlsLive({ persistDelay: 0 });
  });
  backgroundColorHex?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    backgroundColorApply?.click();
  });
  document.querySelectorAll("[data-color-swatch]").forEach(button => {
    const color = normalizeHexColor(button.dataset.colorSwatch);
    if (color) button.style.backgroundColor = color;
    button.addEventListener("click", () => {
      if (!color) return;
      setColorPickerFromHex(color);
      pendingBackgroundColorCustomized = true;
      applyBackgroundControlsLive({ persistDelay: 0 });
    });
  });
  moreWallpapersButton?.addEventListener("click", () => {
    wallpaperGalleryTarget = "main";
    localizeDocument(wallpaperGalleryDialog);
    renderWallpaperGallery();
    wallpaperGalleryDialog?.showModal();
  });
  wallpaperGalleryDialog?.addEventListener("click", event => {
    if (event.target === wallpaperGalleryDialog) closeDialog(wallpaperGalleryDialog);
  });

  settingsBackgroundDim.addEventListener("input", () => applyBackgroundControlsLive());
  settingsBackgroundDim.addEventListener("change", () => {
    clearTimeout(backgroundPersistTimer);
    void saveSettingsState().catch(error => showToast(error.message || t("operationFailed")));
  });

  clearBackgroundImage.addEventListener("click", () => {
    backgroundUploadGeneration += 1;
    pendingBackgroundImage = "";
    pendingBackgroundSourceKind = "none";
    pendingBackgroundSourceUrl = "";
    pendingBackgroundPreset = "";
    renderBackgroundPresets();
    applyBackgroundControlsLive({ persistDelay: 0 });
    showToast(t("backgroundCleared"));
  });

  resetBackground.addEventListener("click", () => {
    backgroundUploadGeneration += 1;
    pendingBackgroundImage = "";
    pendingBackgroundSourceKind = "none";
    pendingBackgroundSourceUrl = "";
    pendingBackgroundPreset = "";
    pendingBackgroundColorCustomized = false;
    setColorPickerFromHex(effectiveTheme() === "light" ? DEFAULT_LIGHT_BACKGROUND_COLOR : DEFAULT_STATE.settings.backgroundColor);
    settingsBackgroundDim.value = String(DEFAULT_STATE.settings.backgroundDim);
    renderBackgroundPresets();
    applyBackgroundControlsLive({ persistDelay: 0 });
  });

  settingsAutoSiteIcons?.addEventListener("change", event => {
    const wantsEnabled = event.currentTarget.checked;
    // Enabling Automatic site icons is itself a user gesture. Request the one
    // optional Website Access grant here so the setting cannot claim to be ON
    // while the browser capability needed for proactive recovery is absent.
    const permissionPromise = wantsEnabled && !webAccessGranted
      ? requestWebAccessFromGesture()
      : null;
    void (async () => {
      let enabled = wantsEnabled;
      if (permissionPromise) {
        try {
          webAccessGranted = (await permissionPromise) === true;
        } catch {
          webAccessGranted = false;
        }
        state.settings.webAccessPrompted = true;
        enabled = webAccessGranted;
        event.currentTarget.checked = enabled;
      }
      state.settings.autoSiteIcons = enabled;
      // The preference is device-local. Do not advance core Sync clocks or create
      // an outbound Sync journal for a preference that never leaves this browser.
      await saveState({ localCacheOnly: true });
      if (!enabled) {
        hideWebAccessPrompt();
        showToast(permissionPromise ? t("websiteAccessDenied") : t("autoSiteIconsDisabled"));
        return;
      }
      if (permissionPromise) await cleanupLegacyWebOriginPermissions();
      hideWebAccessPrompt();
      showToast(t("autoSiteIconsEnabled"));
      scheduleIdleWork(async () => {
        await hydrateRemoteImageSources();
        await hydrateDeviceFavicons();
        requestMissingSiteIcons([], { force: true });
      }, 100);
    })().catch(error => {
      event.currentTarget.checked = state.settings.autoSiteIcons !== false;
      showToast(error.message || t("operationFailed"));
    });
  });

  webAccessPromptAllow?.addEventListener("click", () => {
    const permissionPromise = requestWebAccessFromGesture();
    void (async () => {
      try {
        const granted = await permissionPromise;
        await persistWebAccessPromptDecision(granted);
        if (granted) {
          await cleanupLegacyWebOriginPermissions();
          showToast(t("websiteAccessEnabled"));
          scheduleIdleWork(async () => {
            await hydrateRemoteImageSources();
            await hydrateDeviceFavicons();
            requestMissingSiteIcons([], { force: true });
          }, 100);
        } else {
          showToast(t("websiteAccessDenied"));
        }
      } catch (error) {
        try { await persistWebAccessPromptDecision(false); } catch {}
        showToast(error?.message || t("operationFailed"));
      }
    })();
  });

  webAccessPromptDismiss?.addEventListener("click", () => {
    state.settings.webAccessPrompted = true;
    state.settings.autoSiteIcons = false;
    if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
    hideWebAccessPrompt();
    void saveState({ localCacheOnly: true }).catch(() => {});
    showToast(t("autoSiteIconsDisabled"));
  });

  settingsWebAccessButton?.addEventListener("click", () => {
    // Keep permissions.request() directly inside the user gesture. Firefox will
    // show one all-websites prompt rather than one prompt for every new domain.
    const permissionPromise = requestWebAccessFromGesture();
    void (async () => {
      try {
        const granted = await permissionPromise;
        state.settings.webAccessPrompted = true;
        webAccessGranted = granted === true;
        if (!webAccessGranted && state.settings.autoSiteIcons) {
          state.settings.autoSiteIcons = false;
          if (settingsAutoSiteIcons) settingsAutoSiteIcons.checked = false;
        }
        await saveState({ localCacheOnly: true });
        hideWebAccessPrompt();
        await refreshWebAccessUi();
        if (webAccessGranted) {
          await cleanupLegacyWebOriginPermissions();
          showToast(t("websiteAccessEnabled"));
          scheduleIdleWork(async () => {
            await hydrateRemoteImageSources();
            await hydrateDeviceFavicons();
            if (state.settings.autoSiteIcons) requestMissingSiteIcons([], { force: true });
          }, 100);
        } else {
          showToast(t("websiteAccessDenied"));
        }
      } catch (error) {
        state.settings.webAccessPrompted = true;
        try { await saveState({ localCacheOnly: true }); } catch {}
        await refreshWebAccessUi().catch(() => {});
        showToast(error.message || t("operationFailed"));
      }
    })();
  });

  browser.permissions?.onRemoved?.addListener?.(change => {
    if (permissionChangeAffectsWebAccess(change)) {
      void refreshWebAccessUi().then(granted => {
        if (!granted && state.settings.autoSiteIcons) {
          scheduleIdleWork(() => maybeShowWebAccessPrompt().catch(() => {}), 50);
        }
      }).catch(() => {});
    }
    // Top Sites is independent from Website Access. Do not wake favicon/Web
    // Access machinery for a history permission change.
    if (permissionChangeAffectsTopSites(change) && frequentlyVisitedEnabled) {
      scheduleFrequentlyVisitedRefresh(0);
    }
  });

  browser.permissions?.onAdded?.addListener?.(change => {
    if (permissionChangeAffectsWebAccess(change)) {
      void refreshWebAccessUi().then(granted => {
        if (granted && state.settings.autoSiteIcons) {
          hideWebAccessPrompt();
          requestMissingSiteIcons([], { force: true });
        }
      }).catch(() => {});
    }
    // If the browser restores/grants Top Sites permission, suggestions should
    // return automatically without rebuilding or waking unrelated Settings work.
    if (permissionChangeAffectsTopSites(change) && frequentlyVisitedEnabled) {
      void clearSessionFrequentlyVisitedSuppression().finally(() => {
        frequentCandidateCacheAt = 0;
        frequentCandidateCache = [];
        scheduleFrequentlyVisitedRefresh(0);
      });
    }
  });

  systemThemeMedia.addEventListener?.("change", () => {
    void refreshResolvedSystemTheme();
  });
  browser.theme?.onUpdated?.addListener?.(() => { void refreshResolvedSystemTheme(); });

  themeToggle?.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.addEventListener("click", async () => {
      const theme = button.dataset.themeChoice;
      if (!["system", "dark", "light"].includes(theme)) return;
      if (state.settings.theme === theme) return;
      state.settings.theme = theme;
      markSettingsChanged();
      rememberPendingSettings(["theme"]);
      applyThemeTransition();
      await saveSettingsState();
    });
  });

  let tileSizePersistTimer = null;
  settingsTileSize?.addEventListener("input", () => {
    const next = clampInt(settingsTileSize.value, 60, 96, state.settings.tileSize);
    settingsTileSizeValue.value = `${next}px`;
    settingsTileSizeValue.textContent = `${next}px`;
    if (next === state.settings.tileSize) return;

    state.settings.tileSize = next;
    markSettingsChanged();
    rememberPendingSettings(["tileSize"]);
    // Rendering is immediate; persistence is debounced so dragging the slider
    // does not generate dozens of storage/sync writes.
    applySettings();
    clearTimeout(tileSizePersistTimer);
    tileSizePersistTimer = setTimeout(() => {
      void saveSettingsState().catch(error => showToast(error.message || t("operationFailed")));
    }, 180);
  });



  settingsTileSize?.addEventListener("change", () => {
    clearTimeout(tileSizePersistTimer);
    void saveSettingsState().catch(error => showToast(error.message || t("operationFailed")));
  });

  // ---------------------------------------------------------------------------
  // Settings: Firefox Sync status and explicit sync actions
  // ---------------------------------------------------------------------------

  function formatSyncTime(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return t("notSynchronizedYet");
    try {
      return new Intl.DateTimeFormat(getEffectiveLocale(), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString(getEffectiveLocale());
    }
  }

  async function sendSyncMessage(type, payload = {}) {
    const response = await browser.runtime.sendMessage({ type, ...payload });
    if (!response) throw new Error(t("backgroundServiceNoResponse"));
    if (response.ok === false) throw new Error(response.error ? translateText(response.error) : t("firefoxSyncError"));
    return response;
  }

  function shortSyncId(value) {
    const clean = String(value || "").replace(/[^a-z0-9]/gi, "");
    return clean ? clean.slice(-6).toUpperCase() : "";
  }

  function syncCopyDescription(status) {
    const remoteState = status?.remoteState || "none";
    if (remoteState === "partial") {
      const expected = Number(status?.remoteExpectedItems) || 0;
      const present = Number(status?.remoteItems) || 0;
      return expected > 0
        ? t("syncPartialRecords", { present, expected })
        : t("syncPartialCopy");
    }

    const receiptTime = Number(status?.remoteReceiptAt) || 0;
    const datasetTime = Number(status?.remoteUpdatedAt) || 0;
    if (!status?.hasRemoteData && !receiptTime) return t("noCompleteSyncCopyArrived");

    const pieces = [];
    if (receiptTime) pieces.push(t("syncRemoteObservedHere", { time: formatSyncTime(receiptTime) }));
    if (datasetTime) pieces.push(t("syncCurrentCopyUpdated", { time: formatSyncTime(datasetTime) }));
    const source = shortSyncId(status?.remoteOriginDeviceId || status?.lastRemoteReceiptOriginDeviceId);
    const revision = shortSyncId(status?.remoteCommitId);
    if (source) pieces.push(t("syncSourceId", { id: source }));
    if (revision) pieces.push(t("syncCopyId", { id: revision }));
    return pieces.length ? pieces.join(" · ") : t("completeCopyAvailable");
  }

  function syncLimitationKinds(rawMeta = meta) {
    return {
      artwork: Math.max(0, Number(rawMeta?.syncSkippedAssets) || 0) > 0,
      recovery: rawMeta?.syncProfileProtection === "limited" || rawMeta?.syncFastSnapshotFallback === true
    };
  }

  function syncWarningDescription(rawMeta = meta) {
    const parts = [];
    const skipped = Math.max(0, Number(rawMeta?.syncSkippedAssets) || 0);
    if (skipped === 1) parts.push(t("syncAssetQuotaWarningOne"));
    else if (skipped > 1) parts.push(t("syncAssetQuotaWarningMany", { count: skipped }));
    if (rawMeta?.syncProfileProtection === "limited") parts.push(t("syncRecoveryLimitedWarning"));
    else if (rawMeta?.syncFastSnapshotFallback === true) parts.push(t("syncFastSnapshotFallbackWarning"));
    // Compatibility only: old builds persisted English warning prose. Translate
    // it when it exactly matches a known catalog source; new code persists
    // structured warning state instead.
    if (!parts.length && rawMeta?.lastSyncWarning) parts.push(translateText(rawMeta.lastSyncWarning));
    return parts.join(" ");
  }

  function syncStoragePressure(freeBytes) {
    const free = Math.max(0, Number(freeBytes) || 0);
    if (free < SYNC_QUOTA_CRITICAL_FREE_BYTES) return "critical";
    if (free <= SYNC_QUOTA_WARNING_FREE_BYTES) return "warning";
    return "normal";
  }

  function syncReadyHeadlineKey(rawMeta, pressure) {
    const limitations = syncLimitationKinds(rawMeta);
    if (pressure === "critical") return "syncStorageAlmostFull";
    if (pressure === "warning") return "syncStorageGettingFull";
    if (limitations.artwork && limitations.recovery) return "syncReadyStorageLimited";
    if (limitations.recovery) return "syncReadyRecoveryLimited";
    if (limitations.artwork) return "syncReadyLimited";
    return "syncReady";
  }

  function isSyncQuotaErrorText(value) {
    return /quota|storage\.sync.*full|storage.*full|exceeded/i.test(String(value || ""));
  }

  function updateSyncUi(rawMeta = meta, status = null) {
    meta = normalizeMeta(rawMeta || meta || {});
    if (status) lastSyncStatus = status;
    status = status || lastSyncStatus;
    const enabled = meta.syncEnabled;
    const initialized = meta.syncInitialized;
    const syncing = meta.syncStatus === "syncing";
    const waiting = meta.syncStatus === "waiting" || meta.syncBootstrapMode === "await-remote";
    const errored = meta.syncStatus === "error";
    const hasRemoteData = Boolean(status?.hasRemoteData);
    const hasRemoteSignal = Boolean(status?.hasRemoteSignal);
    const remoteState = status?.remoteState || (hasRemoteData ? "complete" : (hasRemoteSignal ? "partial" : "none"));
    const remoteTime = Number(status?.remoteUpdatedAt) || 0;
    const remoteReceiptAt = Number(status?.remoteReceiptAt) || 0;

    const usage = status?.usage || {
      core: meta.syncUsageCoreBytes,
      recovery: 0,
      shortcutArtwork: meta.syncUsageShortcutBytes,
      overhead: meta.syncUsageOverheadBytes,
      free: Math.max(0, SYNC_QUOTA_BYTES - meta.syncBytesInUse)
    };
    const pressure = syncStoragePressure(usage.free);
    const limitations = syncLimitationKinds(meta);
    const quotaError = errored && isSyncQuotaErrorText(meta.lastSyncError);

    if (settingsSyncEnabled) settingsSyncEnabled.checked = enabled;
    syncStatusDot?.classList.remove("off", "ready", "syncing", "waiting", "error", "storage-warning", "storage-critical");
    syncStatusDot?.classList.add(
      !enabled ? "off" :
      errored ? "error" :
      syncing ? "syncing" :
      waiting ? "waiting" :
      pressure === "critical" ? "storage-critical" :
      pressure === "warning" || limitations.artwork || limitations.recovery ? "storage-warning" :
      "ready"
    );

    if (!enabled) {
      syncStatusText.textContent = t("syncOff");
      syncStatusDetail.textContent = t("storedDeviceOnly");
    } else if (!initialized) {
      syncStatusText.textContent = waiting ? t("waitingForLayout") : t("chooseLayout");
      syncStatusDetail.textContent = hasRemoteData
        ? `${t("completeCopyAvailable")}${remoteTime ? ` · ${formatSyncTime(remoteTime)}` : ""}`
        : hasRemoteSignal
          ? t("syncStillDelivering")
          : t("noSyncCopyYet");
    } else if (errored) {
      syncStatusText.textContent = quotaError ? t("syncStorageFull") : t("syncNeedsAttention");
      syncStatusDetail.textContent = quotaError
        ? t("syncStorageFullLocalSafe")
        : (meta.lastSyncError ? translateText(meta.lastSyncError) : t("firefoxSyncError"));
    } else if (syncing) {
      syncStatusText.textContent = t("updatingSync");
      syncStatusDetail.textContent = t("preparingSyncCopy");
    } else {
      const warning = syncWarningDescription(meta);
      if (warning || pressure !== "normal") {
        // Storage pressure is the most actionable headline. Recovery/artwork
        // degradation remains visible in the detail instead of masking an
        // almost-full quota warning (or being masked by it).
        syncStatusText.textContent = t(syncReadyHeadlineKey(meta, pressure));
        const details = [];
        if (pressure !== "normal") details.push(t("syncStorageFreeRemaining", { free: formatBytes(usage.free) }));
        if (warning) details.push(warning);
        syncStatusDetail.textContent = details.join(" ");
      } else {
        syncStatusText.textContent = t("syncReady");
        syncStatusDetail.textContent = remoteState === "partial" ? t("newerCopyDelivering") : t("changesPublishAuto");
      }
    }

    if (syncSetupCard) syncSetupCard.hidden = !(enabled && !initialized);
    if (syncSetupDetail && enabled && !initialized) {
      syncSetupDetail.textContent = hasRemoteData
        ? `${t("completeCopyAvailable")}${remoteTime ? ` · ${formatSyncTime(remoteTime)}` : ""} ${t("chooseLayout")}`
        : hasRemoteSignal
          ? t("syncStillDelivering")
          : t("noSyncCopyYet");
    }
    if (useSyncedCopyButton) {
      useSyncedCopyButton.textContent = hasRemoteData ? t("useReceivedSyncCopy") : t("waitForSync");
      useSyncedCopyButton.disabled = !enabled || syncing;
    }
    if (useThisDeviceButton) {
      useThisDeviceButton.textContent = t("useThisDevice");
      useThisDeviceButton.disabled = !enabled || syncing;
    }

    syncQuotaText.textContent = `${formatBytes(meta.syncBytesInUse)} / ${formatBytes(SYNC_QUOTA_BYTES)}`;
    syncQuotaText.title = t("syncItemsUsed", { count: meta.syncItemCount || 0 });
    if (syncUsageCore) syncUsageCore.textContent = formatBytes(usage.core);
    if (syncUsageRecovery) syncUsageRecovery.textContent = formatBytes(usage.recovery);
    if (syncUsageShortcuts) syncUsageShortcuts.textContent = formatBytes(usage.shortcutArtwork);
    if (syncUsageOverhead) syncUsageOverhead.textContent = formatBytes(usage.overhead);
    if (syncUsageFree) syncUsageFree.textContent = formatBytes(usage.free);
    if (syncStorageBreakdown) syncStorageBreakdown.dataset.pressure = quotaError ? "full" : pressure;
    if (syncRevisionText) {
      syncRevisionText.hidden = false;
      if (syncRevisionLabel) syncRevisionLabel.textContent = !enabled
        ? t("remoteCopy")
        : remoteState === "partial"
          ? t("remoteCopy")
          : remoteReceiptAt
            ? t("received")
            : t("firefoxSync");
      syncRevisionText.textContent = !enabled
        ? t("syncOff")
        : remoteState === "partial"
          ? t("partial")
          : remoteReceiptAt
            ? new Date(remoteReceiptAt).toLocaleString(getEffectiveLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : hasRemoteData
              ? t("complete")
              : t("notReceived");
      const thisDevice = shortSyncId(meta.deviceId);
      syncRevisionText.title = `${thisDevice ? `${t("thisDeviceId", { id: thisDevice })} ` : ""}${syncCopyDescription(status)}`;
    }
    sendToSyncButton.disabled = !enabled || !initialized || syncing;
    restoreSyncButton.disabled = !enabled || !initialized || syncing || !hasRemoteData;
    clearSyncButton.disabled = syncing || (!hasRemoteSignal && meta.syncBytesInUse <= 0);
  }

  async function refreshSyncStatus() {
    // Status refreshes must stay read-only. In particular, storage.local meta
    // changes emitted by an in-flight reconciliation arrive here while Settings
    // is open; starting another reconciliation from this path would turn status
    // rendering into a feedback loop.
    const response = await sendSyncMessage("mosaicsync:get-sync-status");
    updateSyncUi(response.meta, response);
    return response;
  }

  async function reconcileAndRefreshSyncStatus() {
    // Opening Settings may perform one freshness reconciliation, but never more
    // than one at a time. Meta-change listeners call refreshSyncStatus() only, so
    // syncStatus transitions (syncing -> ready/error) cannot recursively enqueue
    // new reconciliations.
    if (meta?.syncEnabled && meta?.syncInitialized) {
      if (!settingsSyncReconcilePromise) {
        settingsSyncReconcilePromise = sendSyncMessage("mosaicsync:reconcile-if-needed", { reason: "settings" })
          .catch(() => {})
          .finally(() => { settingsSyncReconcilePromise = null; });
      }
      await settingsSyncReconcilePromise;
    }
    return refreshSyncStatus();
  }

  function requestSyncDataPermissionsFromGesture() {
    return requestSyncConsentFromGesture();
  }

  async function confirmAuthoritativeLocalPublish() {
    const status = await refreshSyncStatus();
    if (!status.hasRemoteSignal) return { confirmed: true, status };
    const warning = status.hasRemoteData ? t("completeCopyAvailable") : t("partialCopyWarning");
    const confirmed = window.confirm(`${warning}\n\n${t("publishAutomaticallyTitle")}`);
    return { confirmed, status };
  }

  async function cacheRemoteImageSource(shortcut) {
    if (shortcut.image || !["remote", "favicon"].includes(shortcut.imageSourceKind) || !shortcut.imageSourceUrl) return false;
    if (!webAccessGranted && !(await hasWebAccess())) return false;
    try {
      const response = await fetch(shortcut.imageSourceUrl, { credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer" });
      if (!response.ok) return false;
      const declaredLength = Number(response.headers.get("content-length")) || 0;
      if (declaredLength > REMOTE_IMAGE_INPUT_MAX_BYTES) return false;
      const blob = await response.blob();
      if (blob.size > REMOTE_IMAGE_INPUT_MAX_BYTES) return false;
      shortcut.image = await imageBlobToDataUrl(blob, { maxInputBytes: REMOTE_IMAGE_INPUT_MAX_BYTES });
      if (shortcut.imageSourceKind === "favicon") shortcut.image = await normalizeDeviceFavicon(shortcut.image);
      shortcut.imageSyncData = "";
      shortcut.imageSyncKind = "device";
      shortcut.imageAssetId = "";
      shortcut.imageIsFallback = false;
      return true;
    } catch {
      return false;
    }
  }

  async function hydrateRemoteImageSources() {
    let changed = false;
    const changedShortcutIds = new Set();
    const changedFolderIds = new Set();
    for (const item of state.shortcuts) {
      const list = item.type === "folder" ? item.items : [item];
      for (const shortcut of list) {
        if (!(await cacheRemoteImageSource(shortcut))) continue;
        if (item.type === "folder") changedFolderIds.add(item.id);
        else changedShortcutIds.add(shortcut.id);
        changed = true;
      }
    }
    if (changed) {
      // This is a local cache hydration only. Source metadata and record clocks do
      // not change, so the Sync controller sees no new core-record mutation.
      await saveState({ localCacheOnly: true });
      patchVisibleShortcutArtwork(changedShortcutIds, changedFolderIds);
    }
  }

  async function optimizeExistingLocalAssetsForSync() {
    let changed = false;
    let syncRelevantChanged = false;

    const optimizeShortcut = async shortcut => {
      if (!shortcut?.image?.startsWith("data:image/")) return;

      // Firefox-imported, learned and web-linked artwork is reconstructable.
      // Its pixels must never enter Firefox Sync and must never be recompressed
      // merely to save local space; preserve the quality Firefox/the site supplied.
      const reconstructable = shortcut.source === "firefox-import" ||
        ["remote", "favicon", "firefox"].includes(shortcut.imageSourceKind);
      if (reconstructable) {
        if (["sync", "local"].includes(shortcut.imageSyncKind) || shortcut.imageAssetId) {
          shortcut.imageSyncKind = "device";
          shortcut.imageAssetId = "";
          shortcut.imageIsFallback = false;
          if (shortcut.source === "firefox-import" && shortcut.imageSourceKind === "none") shortcut.imageSourceKind = "firefox";
          changed = true;
        }
        return;
      }

      // Only user-provided artwork explicitly opted into binary Sync gets a tiny
      // quota-sized derivative. Never recompress/replace the richer local display
      // copy just because Sync is enabled.
      if (shortcut.imageSyncKind !== "sync" && shortcut.imageSyncKind !== "local") return;
      const derivativeBytes = dataUrlByteLength(shortcut.imageSyncData);
      if (shortcut.imageSyncData && derivativeBytes <= SHORTCUT_SYNC_IMAGE_TARGET_BYTES) return;
      shortcut.imageSyncData = await optimizeImageDataUrl(shortcut.image, {
        maxWidth: 128, maxHeight: 128, minWidth: 48, minHeight: 48,
        targetBytes: SHORTCUT_SYNC_IMAGE_TARGET_BYTES
      });
      shortcut.imageAssetId = "";
      shortcut.imageSyncKind = "sync";
      shortcut.modifiedAt = nextMutationTime(state.updatedAt, shortcut.modifiedAt);
      changed = true;
      syncRelevantChanged = true;
    };

    for (const item of state.shortcuts) {
      if (item.type === "folder") {
        for (const child of item.items) await optimizeShortcut(child);
      } else {
        await optimizeShortcut(item);
      }
    }


    if (changed) await saveState({ localCacheOnly: !syncRelevantChanged });
  }

  settingsMultipleSpaces?.addEventListener("change", () => {
    const enabled = settingsMultipleSpaces.checked;
    void setMultipleSpacesEnabled(enabled).catch(error => {
      settingsMultipleSpaces.checked = !enabled;
      showToast(error.message || t("spacesUpdateFailed"));
    });
  });

  settingsPersonalSpaceName?.addEventListener("change", () => {
    const fallback = t("personal");
    const next = normalizedCustomSpaceName(settingsPersonalSpaceName.value);
    const stored = next && next !== fallback ? next : "";
    void persistWorkspaceSetting("personal", "spaceName", stored).catch(error => { refreshSpacesSettings(); showToast(error.message || t("spacesUpdateFailed")); });
  });

  settingsWorkSpaceName?.addEventListener("change", () => {
    const fallback = t("work");
    const next = normalizedCustomSpaceName(settingsWorkSpaceName.value);
    const stored = next && next !== fallback ? next : "";
    void persistWorkspaceSetting("work", "spaceName", stored).catch(error => { refreshSpacesSettings(); showToast(error.message || t("spacesUpdateFailed")); });
  });

  settingsSyncEnabled?.addEventListener("click", event => {
    const wantsSync = event.currentTarget.checked;
    const permissionPromise = wantsSync
      ? requestSyncDataPermissionsFromGesture()
      : Promise.resolve(true);

    void (async () => {
      settingsSyncEnabled.disabled = true;
      try {
        const granted = await permissionPromise;
        if (wantsSync && !granted) {
          settingsSyncEnabled.checked = false;
          showSyncFeedback(t("syncPermissionNotGranted"));
          return;
        }

        const response = await sendSyncMessage("mosaicsync:set-sync-enabled", { enabled: wantsSync });
        if (!wantsSync) await removeSyncConsent();
        const status = await sendSyncMessage("mosaicsync:get-sync-status");
        updateSyncUi(response.meta, status);

        if (!wantsSync) {
          showSyncFeedback(t("syncTurnedOffDevice"));
        } else if (response.meta?.syncInitialized) {
          showSyncFeedback(t("syncRemainsEnabled"));
        } else {
          showSyncFeedback(t("syncPermissionChooseLayout"));
        }
      } catch (error) {
        settingsSyncEnabled.checked = Boolean(meta?.syncEnabled);
        showSyncFeedback(error.message || t("firefoxSyncError"));
        await refreshSyncStatus().catch(() => {});
      } finally {
        settingsSyncEnabled.disabled = false;
      }
    })();
  });

  useThisDeviceButton?.addEventListener("click", async () => {
    try {
      const { confirmed, status } = await confirmAuthoritativeLocalPublish();
      if (!confirmed) return;
      updateSyncUi({ ...meta, syncStatus: "syncing" }, status);
      await optimizeExistingLocalAssetsForSync();
      const response = await sendSyncMessage("mosaicsync:bootstrap-local");
      updateSyncUi(response.meta, await sendSyncMessage("mosaicsync:get-sync-status"));
      showSyncFeedback(syncWarningDescription(response.meta) || t("computerSource"));
    } catch (error) {
      showSyncFeedback(error.message || t("couldNotPublish"));
      await refreshSyncStatus().catch(() => {});
    }
  });

  useSyncedCopyButton?.addEventListener("click", async () => {
    try {
      updateSyncUi({ ...meta, syncStatus: "syncing" });
      const response = await sendSyncMessage("mosaicsync:wait-for-remote");
      const status = await sendSyncMessage("mosaicsync:get-sync-status");
      updateSyncUi(response.meta, status);
      if (response.pending) {
        showSyncFeedback(t("waitingFirefoxSyncClose"));
      } else {
        showSyncFeedback(t("syncRestored"));
      }
    } catch (error) {
      showSyncFeedback(error.message || t("couldNotRestore"));
      await refreshSyncStatus().catch(() => {});
    }
  });

  sendToSyncButton?.addEventListener("click", async () => {
    sendToSyncButton.disabled = true;
    try {
      const { confirmed, status: statusBefore } = await confirmAuthoritativeLocalPublish();
      if (!confirmed) return;
      showSyncFeedback(t("sendingLayoutToSync"));
      await optimizeExistingLocalAssetsForSync();
      updateSyncUi({ ...meta, syncStatus: "syncing" }, statusBefore);
      const response = await sendSyncMessage("mosaicsync:bootstrap-local");
      const status = await sendSyncMessage("mosaicsync:get-sync-status");
      updateSyncUi(response.meta, status);
      showSyncFeedback(syncWarningDescription(response.meta) || t("changesPublishAuto"));
    } catch (error) {
      showSyncFeedback(error.message || t("couldNotPublish"));
      await refreshSyncStatus().catch(() => {});
    } finally {
      sendToSyncButton.disabled = false;
    }
  });

  restoreSyncButton?.addEventListener("click", async () => {
    try {
      const statusBefore = await refreshSyncStatus();
      if (!statusBefore.hasRemoteData) {
        showSyncFeedback(t("noCompleteSyncCopyArrived"));
        return;
      }

      const seenAt = statusBefore.remoteUpdatedAt ? formatSyncTime(statusBefore.remoteUpdatedAt) : t("unknownTime");
      const confirmed = window.confirm(`${t("restoreSyncTitle")}\n\n${t("latestSyncTitle")}: ${seenAt}`);
      if (!confirmed) return;

      updateSyncUi({ ...meta, syncStatus: "syncing" }, statusBefore);
      const response = await sendSyncMessage("mosaicsync:restore-from-sync");
      const status = await sendSyncMessage("mosaicsync:get-sync-status");
      updateSyncUi(response.meta, status);
      showSyncFeedback(status.remoteUpdatedAt ? t("syncedLayoutFromRestored", { time: formatSyncTime(status.remoteUpdatedAt) }) : t("syncRestored"));
    } catch (error) {
      showSyncFeedback(error.message || t("couldNotRestore"));
      await refreshSyncStatus().catch(() => {});
    }
  });

  clearSyncButton?.addEventListener("click", async () => {
    const confirmed = window.confirm(t("deleteSyncTitle"));
    if (!confirmed) return;

    try {
      const response = await sendSyncMessage("mosaicsync:clear-sync-data");
      updateSyncUi(response.meta, { hasRemoteData: false, remoteUpdatedAt: 0 });
      showSyncFeedback(t("syncDataCleared"));
    } catch (error) {
      showSyncFeedback(error.message || t("firefoxSyncError"));
      await refreshSyncStatus().catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // Page-level event wiring and lightweight feedback
  // ---------------------------------------------------------------------------
  async function openDonationPage() {
    await browser.tabs.create({ url: DONATE_URL, active: true });
  }

  function showSyncFeedback(message) {
    const localized = translateText(message);
    if (!syncActionStatus || !isSettingsOpen()) {
      showToast(localized);
      return;
    }
    syncActionStatus.textContent = localized;
    syncActionStatus.hidden = false;
    clearTimeout(syncFeedbackTimer);
    syncFeedbackTimer = setTimeout(() => {
      syncActionStatus.hidden = true;
      syncActionStatus.textContent = "";
    }, 4200);
  }

  function showToast(message) {
    void ensureSecondaryStyles().then(() => {
      toast.textContent = translateText(message);
      toast.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
    });
  }

  syncPendingChooseSource?.addEventListener("click", async () => {
    try {
      const loaded = await ensureLocalStorage();
      meta = normalizeMeta({
        ...loaded.meta,
        onboardingCompleted: false,
        onboardingVersion: "",
        syncBootstrapMode: "none",
        syncStatus: loaded.meta.syncEnabled ? "waiting" : "off"
      });
      meta = await writeLocalMeta(meta);
      window.location.replace(browser.runtime.getURL("welcome/welcome.html"));
    } catch (error) {
      showToast(error.message || t("couldNotResume"));
    }
  });

  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      closeDialog(dialog);
    });
  });

  if (settingsTipsLink) settingsTipsLink.href = TIPS_URL;
  if (settingsSupportLink) settingsSupportLink.href = SUPPORT_URL;
  for (const button of spaceButtons) {
    button.addEventListener("click", () => { void switchActiveSpace(button.dataset.spaceId); });
    button.addEventListener("dragenter", event => {
      if (!crossSpaceDrag) return;
      event.preventDefault();
      clearTimeout(crossSpaceHoverTimer);
      for (const candidate of spaceButtons) candidate.classList.remove("drag-space-target");
      button.classList.add("drag-space-target");
      const targetSpaceId = button.dataset.spaceId;
      crossSpaceHoverTimer = setTimeout(() => {
        void previewSpaceDuringDrag(targetSpaceId).catch(error => showToast(error.message || t("moveSpaceFailed")));
      }, 450);
    });
    button.addEventListener("dragover", event => {
      if (!crossSpaceDrag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("dragleave", () => {
      clearTimeout(crossSpaceHoverTimer);
      crossSpaceHoverTimer = null;
      button.classList.remove("drag-space-target");
    });
    button.addEventListener("drop", event => {
      if (!crossSpaceDrag) return;
      // Hovering switches the preview; the move is committed only when the user
      // drops onto an actual destination slot/folder. Releasing on the tab itself
      // cancels safely and dragend returns to the source Space.
      event.preventDefault();
    });
  }
  for (const button of shortcutSpaceButtons) {
    button.addEventListener("click", () => {
      const spaceId = button.dataset.shortcutSpace;
      if (!SPACE_IDS.includes(spaceId)) return;
      editingDestinationSpaceId = spaceId;
      updateShortcutSpaceChoice();
    });
  }
  settingsButton.addEventListener("click", () => { void openSettings(); });
  bookmarksButton?.addEventListener("click", () => { void openBookmarks(); });
  bookmarksPermissionButton?.addEventListener("click", async () => {
    bookmarksStatus.textContent = "";
    try {
      const permissionPromise = bookmarksApi?.requestBookmarksPermissionFromGesture?.();
      if (!permissionPromise) throw new Error("BOOKMARK_MODULE_NOT_READY");
      const granted = await permissionPromise;
      if (!granted) {
        bookmarksStatus.textContent = t("bookmarksPermissionDenied");
        return;
      }
      bookmarksStatus.textContent = t("permissionGranted");
      await loadBookmarksIntoDialog();
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: bookmark permission request failed`, error);
      bookmarksStatus.textContent = t("permissionRequestFailed");
    }
  });
  bookmarksSearch?.addEventListener("input", renderBookmarkBrowser);
  bookmarksDialog?.addEventListener("close", () => {
    closeBookmarkColorMenu();
    bookmarkTree = [];
    bookmarkFolders = [];
    bookmarkAllItems = [];
    activeBookmarkFolderId = "all";
    if (bookmarksSearch) bookmarksSearch.value = "";
    bookmarkFolderTree?.replaceChildren();
    bookmarkFolderCards?.replaceChildren();
    bookmarkItems?.replaceChildren();
    if (bookmarksStatus) bookmarksStatus.textContent = "";
  });
  settingsLanguage?.addEventListener("change", async () => {
    await setLocalePreference(settingsLanguage.value);
    refreshLocalizedUi();
    updateSpaceSwitcher();
    refreshSpacesSettings();
  });
  settingsShortcutOrder?.addEventListener("change", () => {
    writeShortcutOrderPreference(settingsShortcutOrder.value);
    render();
    scheduleRenderManifestRefresh(state, meta);
  });
  window.addEventListener("storage", event => {
    if (event.storageArea !== localStorage) return;
    if (event.key === SHORTCUT_ORDER_PREF_KEY) {
      shortcutOrderMode = readShortcutOrderPreference();
      if (settingsShortcutOrder) settingsShortcutOrder.value = shortcutOrderMode;
      updateFrequentDragAvailability();
      if (!isAwaitingRemote()) requestLauncherRenderAfterExternalState();
      scheduleRenderManifestRefresh(state, meta);
      return;
    }
    if (event.key === SHORTCUT_USAGE_PREF_KEY) {
      shortcutUsage = readShortcutUsage();
      if (shortcutOrderMode === "recent" && !isAwaitingRemote()) requestLauncherRenderAfterExternalState();
    }
  });
  let brandHelloTimer = 0;
  function triggerBrandHello() {
    if (!brandHelloButton) return;
    if (brandHelloTimer) window.clearTimeout(brandHelloTimer);
    brandHelloButton.classList.remove("brand-hello-active");
    void brandHelloButton.offsetWidth;
    brandHelloButton.classList.add("brand-hello-active");
    brandHelloTimer = window.setTimeout(() => {
      brandHelloButton.classList.remove("brand-hello-active");
      brandHelloTimer = 0;
    }, 3600);
  }
  brandHelloButton?.addEventListener("mouseenter", triggerBrandHello);
  settingsDonateButton?.addEventListener("click", () => { void openDonationPage(); });
  importNativeButton.addEventListener("click", () => importFirefoxShortcutsFromGesture());
  settingsImportNative.addEventListener("click", () => importFirefoxShortcutsFromGesture({ confirmReplace: true }));
  addFirstButton.addEventListener("click", () => openShortcutEditor());
  addFirstButton.addEventListener("dragover", event => {
    if (!crossSpaceDrag || crossSpaceDrag.sourceSpaceId === state.activeSpaceId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    addFirstButton.classList.add("drag-cross-space-target");
  });
  addFirstButton.addEventListener("dragleave", () => {
    addFirstButton.classList.remove("drag-cross-space-target");
  });
  addFirstButton.addEventListener("drop", async event => {
    if (!crossSpaceDrag || crossSpaceDrag.sourceSpaceId === state.activeSpaceId) return;
    event.preventDefault();
    event.stopPropagation();
    addFirstButton.classList.remove("drag-cross-space-target");
    try { await commitCrossSpaceDrag({ position: 0 }); }
    catch (error) { showToast(error.message || t("moveSpaceFailed")); }
  });

  settingsFrequentlyVisited?.addEventListener("change", () => {
    const wantsEnabled = settingsFrequentlyVisited.checked;
    // Firefox requires permissions.request() to be invoked synchronously from
    // the user's gesture. Start it before any awaited synchronized state write.
    const permissionPromise = wantsEnabled ? requestTopSitesPermissionFromGesture() : null;
    void (async () => {
      try {
        await persistFrequentlyVisitedPreference({ enabled: wantsEnabled });
        setFrequentlyVisitedOptionsVisibility(wantsEnabled);
        if (!wantsEnabled) {
          setFrequentlyVisitedPermissionActionVisible(false);
          setFrequentlyVisitedPermissionRecoveryVisible(false);
          frequentCandidateCacheAt = 0;
          frequentCandidateCache = [];
          frequentRefreshGeneration += 1;
          renderFrequentlyVisited([]);
          updateFrequentRenderSnapshot([]);
          setFrequentlyVisitedStatus("frequentHidden");
          return;
        }

        // The synchronized preference expresses intent only. Browser history and
        // Top Sites permission remain installation-local; a receiving computer
        // keeps the toggle ON and exposes the Grant permission recovery action.
        const granted = await permissionPromise;
        if (!granted) {
          setFrequentlyVisitedPermissionActionVisible(true);
          setFrequentlyVisitedPermissionRecoveryVisible(true);
          updateFrequentRenderSnapshot([]);
          setFrequentlyVisitedStatus("frequentPermissionDenied");
          return;
        }
        setFrequentlyVisitedPermissionActionVisible(false);
        setFrequentlyVisitedPermissionRecoveryVisible(false);
        frequentCandidateCacheAt = 0;
        frequentCandidateCache = [];
        await refreshFrequentlyVisited();
      } catch (error) {
        syncFrequentlyVisitedLocalsFromState(state);
        settingsFrequentlyVisited.checked = frequentlyVisitedEnabled;
        setFrequentlyVisitedOptionsVisibility(frequentlyVisitedEnabled);
        setFrequentlyVisitedPermissionActionVisible(frequentlyVisitedEnabled);
        updateFrequentRenderSnapshot([]);
        setFrequentlyVisitedStatus("frequentEnableFailed");
        showToast(error.message || t("operationFailed"));
      }
    })();
  });

  function requestFrequentlyVisitedPermissionRecoveryFromGesture(sourceButton) {
    // permissions.request() must begin synchronously inside the user's click.
    // Both the Settings action and the launcher recovery action share this exact
    // path so an already-remembered ON preference never requires toggling OFF/ON.
    const permissionPromise = requestTopSitesPermissionFromGesture();
    if (sourceButton) sourceButton.disabled = true;
    void (async () => {
      try {
        const granted = await permissionPromise;
        if (!frequentlyVisitedEnabled) await persistFrequentlyVisitedPreference({ enabled: true });
        if (settingsFrequentlyVisited) settingsFrequentlyVisited.checked = true;
        setFrequentlyVisitedOptionsVisibility(true);
        if (!granted) {
          setFrequentlyVisitedPermissionActionVisible(true);
          setFrequentlyVisitedPermissionRecoveryVisible(true);
          setFrequentlyVisitedStatus("frequentPermissionDenied");
          return;
        }
        setFrequentlyVisitedPermissionActionVisible(false);
        setFrequentlyVisitedPermissionRecoveryVisible(false);
        frequentCandidateCacheAt = 0;
        frequentCandidateCache = [];
        await refreshFrequentlyVisited();
      } catch {
        setFrequentlyVisitedPermissionActionVisible(true);
        setFrequentlyVisitedPermissionRecoveryVisible(true);
        setFrequentlyVisitedStatus("frequentEnableFailed");
      } finally {
        if (sourceButton) sourceButton.disabled = false;
      }
    })();
  }

  frequentlyVisitedPermissionButton?.addEventListener("click", () => {
    requestFrequentlyVisitedPermissionRecoveryFromGesture(frequentlyVisitedPermissionButton);
  });
  frequentPermissionRecoveryButton?.addEventListener("click", () => {
    requestFrequentlyVisitedPermissionRecoveryFromGesture(frequentPermissionRecoveryButton);
  });

  exportProfileButton?.addEventListener("click", async () => {
    try {
      exportProfileButton.disabled = true;
      const { createProfilePackage, profileFileName, serializeProfilePackage } = await loadProfileModule();
      const exportLoaded = await ensureLocalStorage({ hydrateAssets: "all" });
      const profilePackage = await createProfilePackage(exportLoaded.state, {
        uiLocale: getLocalePreference(),
        frequentlyVisitedEnabled,
        frequentlyVisitedCount
      });
      const blob = new Blob([serializeProfilePackage(profilePackage)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = profileFileName();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast(t("profileExported"));
    } catch (error) {
      console.error(error);
      showToast(t("profileExportFailed"));
    } finally {
      exportProfileButton.disabled = false;
    }
  });

  importProfileButton?.addEventListener("click", () => importProfileFile?.click());
  importProfileFile?.addEventListener("change", async () => {
    const file = importProfileFile.files?.[0];
    importProfileFile.value = "";
    if (!file) return;
    try {
      const { parseProfilePackage, readProfileImportText } = await loadProfileModule();
      const parsed = await parseProfilePackage(await readProfileImportText(file));
      const confirmed = window.confirm(
        `${t("profileImportConfirm")}\n\n${meta?.syncEnabled && meta?.syncInitialized ? t("profileImportConfirmSync") : t("profileImportConfirmLocal")}`
      );
      if (!confirmed) return;
      let importedState = stampImportedProfileState(parsed.state);
      initializeThemeWallpaperDimsForState(importedState);
      importedState = normalizeState(importedState);
      const importedFrequentEnabled = parsed.preferences.frequentlyVisitedEnabled === true;
      const importedFrequentCount = [3, 5, 8, 10].includes(Number(parsed.preferences.frequentlyVisitedCount))
        ? Number(parsed.preferences.frequentlyVisitedCount)
        : 5;
      for (const spaceId of SPACE_IDS) {
        const workspace = importedState.spaces[spaceId];
        importedState = replaceWorkspace(importedState, spaceId, {
          ...workspace,
          settings: {
            ...workspace.settings,
            frequentlyVisitedEnabled: importedFrequentEnabled,
            frequentlyVisitedCount: importedFrequentCount
          }
        });
      }
      importedState = selectActiveSpaceNormalized(importedState, importedState.activeSpaceId);
      stateMutationGeneration += 1;
      pendingSettingsDraft.clear();
      state = importedState;
      const persisted = await writeLocalStateWithBaseline(state, {
        recordSyncMutation: meta?.syncEnabled && meta?.syncInitialized
      });
      state = persisted.state;
      writeBaseline = persisted.compactBaseline;
      await setLocalePreference(parsed.preferences.uiLocale || "auto");
      // Profile preferences express user intent; optional browser permission and
      // the actual browser-derived sites remain installation-local.
      syncFrequentlyVisitedLocalsFromState(state);
      localizeDocument(document);
      refreshSettingsControlsAfterExternalState();
      reconcileLauncherAfterExternalState();
      updateSpaceSwitcher();
      scheduleFrequentlyVisitedRefresh();
      preloadOtherSpaceBackgrounds();
      scheduleAppearanceHintRefresh(state.settings);
      refreshFirstPaintCaches(state, meta);
      if (meta?.syncEnabled && meta?.syncInitialized) {
        const published = await sendSyncMessage("mosaicsync:bootstrap-local");
        if (!published?.ok) throw new Error("PROFILE_SYNC_PUBLISH_FAILED");
        meta = published.meta || meta;
        updateSyncUi(meta);
      }
      requestMissingSiteIcons([], { force: true, upgradeRecoveredFavicons: true });
      showToast(t("profileImported"));
    } catch (error) {
      console.error(error);
      showToast(
        error?.message === "PROFILE_SYNC_PUBLISH_FAILED"
          ? t("profilePublishFailed")
          : error?.code === "PROFILE_TOO_LARGE"
            ? t("profileImportTooLarge")
            : t("profileImportFailed")
      );
    }
  });

  settingsRunSetup?.addEventListener("click", async () => {
    const confirmed = window.confirm(`${t("setupWizard")}?\n\n${t("setupWizardDescription")}`);
    if (!confirmed) return;
    const loaded = await ensureLocalStorage();
    meta = normalizeMeta({
      ...loaded.meta,
      onboardingCompleted: false,
      onboardingVersion: "",
      syncBootstrapMode: loaded.meta.syncInitialized ? loaded.meta.syncBootstrapMode : "none",
      syncStatus: loaded.meta.syncEnabled && !loaded.meta.syncInitialized ? "waiting" : loaded.meta.syncStatus
    });
    meta = await writeLocalMeta(meta);
    try { localStorage.removeItem(RENDER_MANIFEST_KEY); } catch {}
    window.location.replace(browser.runtime.getURL("welcome/welcome.html"));
  });

  shortcutDialog.addEventListener("click", event => {
    if (event.target === shortcutDialog) closeDialog(shortcutDialog);
  });
  bookmarksDialog?.addEventListener("click", event => {
    if (event.target === bookmarksDialog) closeDialog(bookmarksDialog);
  });

  document.addEventListener("pointerdown", event => {
    if (frequentContextMenu?.isConnected && !frequentContextMenu.contains(event.target)) closeFrequentContextMenu();
    if (bookmarkColorMenu?.isConnected && !bookmarkColorMenu.contains(event.target)) closeBookmarkColorMenu();
    if (!backgroundColorPopover?.hidden && backgroundColorControl && !backgroundColorControl.contains(event.target)) {
      closeBackgroundColorPicker();
    }
    if (!dropChoice.hidden && !dropChoice.contains(event.target)) closeDropChoice();

    if (!folderPopover.hidden && !folderPopover.contains(event.target)) {
      const anchor = activeFolderAnchorId ? document.querySelector(`.shortcut-slot[data-id="${CSS.escape(activeFolderAnchorId)}"]`) : null;
      if (!anchor?.contains(event.target)) {
        commitFolderTitle().catch(console.error);
        closeFolder();
      }
    }

    if (isSettingsOpen() && !wallpaperGalleryDialog?.open && !settingsDialog.contains(event.target) && !settingsButton.contains(event.target)) {
      closeDialog(settingsDialog);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeFrequentContextMenu();
      closeBookmarkColorMenu();
      // Settings is deliberately not a native <dialog> anymore, so preserve the
      // browser-native Escape affordance explicitly. Keep the panel behind the
      // native wallpaper picker until that child dialog closes itself.
      if (isSettingsOpen() && !wallpaperGalleryDialog?.open) closeSettingsPanel();
      return;
    }
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || !isMultipleSpacesEnabled()) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName))) return;
    if (isSettingsOpen() || shortcutDialog?.open || bookmarksDialog?.open || wallpaperGalleryDialog?.open) return;
    const spaceId = event.code === "Digit1" ? "personal" : event.code === "Digit2" ? "work" : "";
    if (!spaceId) return;
    event.preventDefault();
    void switchActiveSpace(spaceId);
  });

  let folderRepositionFrame = 0;
  function scheduleFolderPopoverReposition() {
    if (!activeFolderId || folderPopover.hidden || folderRepositionFrame) return;
    folderRepositionFrame = requestAnimationFrame(() => {
      folderRepositionFrame = 0;
      if (!activeFolderId || folderPopover.hidden) return;
      const anchor = resolveLiveFolderAnchor(activeFolderId);
      if (anchor) positionFolderPopover(anchor);
    });
  }

  page?.addEventListener("scroll", scheduleFolderPopoverReposition, { passive: true });
  window.addEventListener("resize", () => {
    scheduleFolderPopoverReposition();
    if (!dropChoice.hidden) closeDropChoice();
  });

  function workspaceBackgroundVisualSignature(workspace) {
    const settings = workspace?.settings || {};
    return [
      settings.backgroundImage || "",
      settings.backgroundAssetId || "",
      settings.backgroundImageKind || "none",
      settings.backgroundSourceKind || "none",
      settings.backgroundSourceUrl || "",
      settings.backgroundPreset || "",
      settings.themeWallpapersEnabled === true,
      settings.lightBackgroundPreset || "",
      settings.darkBackgroundPreset || ""
    ];
  }

  function sameBackgroundVisuals(left, right) {
    const a = workspaceBackgroundVisualSignature(left);
    const b = workspaceBackgroundVisualSignature(right);
    return a.every((value, index) => value === b[index]);
  }

  function collectWorkspaceShortcutRecords(workspace) {
    const records = new Map();
    for (const item of workspace?.shortcuts || []) {
      if (item?.type === "folder") {
        records.set(item.id, { item, parentFolderId: "", type: "folder" });
        for (const child of item.items || []) records.set(child.id, { item: child, parentFolderId: item.id, type: "shortcut" });
      } else if (item?.type === "shortcut") {
        records.set(item.id, { item, parentFolderId: "", type: "shortcut" });
      }
    }
    return records;
  }

  function sameShortcutCoreShape(current, incoming, currentParent, incomingParent) {
    if (!current || !incoming || current.type !== incoming.type || currentParent !== incomingParent) return false;
    if (current.id !== incoming.id || current.title !== incoming.title || Number(current.position) !== Number(incoming.position)) return false;
    if (Number(current.createdAt) !== Number(incoming.createdAt) || Number(current.modifiedAt) !== Number(incoming.modifiedAt)) return false;
    if (current.type === "folder") return (current.items?.length || 0) === (incoming.items?.length || 0);
    return current.url === incoming.url &&
      (current.builtinIcon || "") === (incoming.builtinIcon || "") &&
      (current.colorTag || "") === (incoming.colorTag || "") &&
      Number(current.spaceMoveAt || 0) === Number(incoming.spaceMoveAt || 0) &&
      (current.imageStyle || "contain") === (incoming.imageStyle || "contain") &&
      (current.source || "manual") === (incoming.source || "manual");
  }

  function copyDeviceArtwork(current, incoming) {
    const keys = ["image", "localImageAssetId", "imageSyncData", "imageAssetId", "imageSyncKind", "imageSourceKind", "imageSourceUrl", "imageIsFallback"];
    let changed = false;
    for (const key of keys) {
      if (current[key] === incoming[key]) continue;
      current[key] = incoming[key];
      changed = true;
    }
    return changed;
  }

  function refreshFolderMosaicArtwork(folder) {
    const slot = document.querySelector(`.shortcut-slot.folder-slot[data-id="${CSS.escape(folder.id)}"]`);
    const mosaic = slot?.querySelector(".folder-mosaic");
    if (mosaic) {
      const fragment = document.createDocumentFragment();
      for (const child of (folder.items || []).slice(0, 4)) {
        const cell = document.createElement("span");
        cell.className = `folder-mosaic-cell ${child.imageStyle === "cover" ? "cover" : ""}`.trim();
        applyShortcutColorTag(cell, child);
        appendImageOrFallback(cell, child.image, child.title, child.builtinIcon, child);
        fragment.append(cell);
      }
      mosaic.replaceChildren(fragment);
    }
    if (activeFolderId === folder.id && !folderPopover.hidden) renderFolderContents(folder);
  }

  function patchVisibleShortcutArtwork(changedShortcutIds, changedFolderIds) {
    for (const id of changedShortcutIds) {
      const record = findShortcutRecord(id);
      if (!record?.item || record.parentFolder) continue;
      const tile = document.querySelector(`.shortcut-slot[data-id="${CSS.escape(id)}"] .shortcut-card .tile`);
      if (!tile) continue;
      tile.classList.toggle("cover", record.item.imageStyle === "cover");
      applyShortcutColorTag(tile, record.item);
      tile.replaceChildren();
      appendImageOrFallback(tile, record.item.image, record.item.title, record.item.builtinIcon, record.item);
    }
    for (const folderId of changedFolderIds) {
      const folder = getTopLevelItem(folderId);
      if (folder?.type === "folder") refreshFolderMosaicArtwork(folder);
    }
  }

  function tryApplyDeviceArtworkOnlyChange(rawIncoming, rawPrevious) {
    const incomingClock = localStateSyncClockSignature(rawIncoming);
    const previousClock = localStateSyncClockSignature(rawPrevious);
    if (!incomingClock || !previousClock || incomingClock !== previousClock) return false;
    const incomingRawSignature = localStateSyncRawSignature(rawIncoming);
    const previousRawSignature = localStateSyncRawSignature(rawPrevious);
    if (!incomingRawSignature || incomingRawSignature !== previousRawSignature) return false;
    if (rawIncoming?.activeSpaceId !== rawPrevious?.activeSpaceId || rawIncoming?.activeSpaceId !== state.activeSpaceId) return false;
    if (localStateSyncClockSignature(state) !== incomingClock || localStateSyncRawSignature(state) !== incomingRawSignature) return false;

    // Current-schema storage values were canonicalized by writeLocalState. The
    // raw Sync projection above proves the change is display-cache-only, so use
    // the incoming object directly and avoid a second full image-heavy normalize.
    const incoming = rawIncoming;
    const changedActiveShortcuts = new Set();
    const changedActiveFolders = new Set();

    for (const spaceId of SPACE_IDS) {
      const currentWorkspace = state.spaces?.[spaceId];
      const incomingWorkspace = incoming.spaces?.[spaceId];
      if (!currentWorkspace || !incomingWorkspace || !sameBackgroundVisuals(currentWorkspace, incomingWorkspace)) return false;
      const currentRecords = collectWorkspaceShortcutRecords(currentWorkspace);
      const incomingRecords = collectWorkspaceShortcutRecords(incomingWorkspace);
      if (currentRecords.size !== incomingRecords.size) return false;
      for (const [id, incomingRecord] of incomingRecords) {
        const currentRecord = currentRecords.get(id);
        if (!currentRecord || !sameShortcutCoreShape(currentRecord.item, incomingRecord.item, currentRecord.parentFolderId, incomingRecord.parentFolderId)) return false;
      }
      for (const [id, incomingRecord] of incomingRecords) {
        if (incomingRecord.type !== "shortcut") continue;
        const currentRecord = currentRecords.get(id);
        if (!copyDeviceArtwork(currentRecord.item, incomingRecord.item)) continue;
        if (spaceId === state.activeSpaceId) {
          if (currentRecord.parentFolderId) changedActiveFolders.add(currentRecord.parentFolderId);
          else changedActiveShortcuts.add(id);
        }
      }
    }

    if (changedActiveShortcuts.size || changedActiveFolders.size) {
      patchVisibleShortcutArtwork(changedActiveShortcuts, changedActiveFolders);
      refreshRenderManifestAfterArtworkChange(state, meta);
    }
    return true;
  }

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    const stateChange = changes[LOCAL_STATE_KEY];
    if (stateChange?.newValue) {
      // Device-local artwork writes deliberately preserve the synchronized
      // workspace clock. Never suppress a storage event merely because its
      // updatedAt matches one of this page's own recent writes: a background
      // favicon update can legitimately carry the same clock but different
      // local artwork. The device-artwork fast path below is already cheap and
      // safely absorbs exact own-write echoes without a full render.
      const changeGeneration = ++persistedStateChangeGeneration;
      void (async () => {
          try {
            // Only hydrate the currently visible Space. Inactive refs remain in
            // state and are resolved when that Space is actually selected.
            const hydratedRaw = await hydratePersistedState(stateChange.newValue, { spaceIds: [state.activeSpaceId] });
            if (changeGeneration !== persistedStateChangeGeneration) return;
            let incoming = normalizeState(hydratedRaw);
            incoming = selectActiveSpaceNormalized(incoming, state.activeSpaceId);
            if (tryApplyDeviceArtworkOnlyChange(incoming, state)) {
              // Advance the optimistic-write baseline only after the in-memory
              // state has actually adopted this storage event. Keeping baseline
              // and state causally paired is what makes a later rebase correct.
              writeBaseline = createWriteBaseline(stateChange.newValue);
              stateMutationGeneration += 1;
              return;
            }
            if (!isMultipleSpacesEnabled(incoming) && incoming.activeSpaceId !== "personal") {
              incoming = selectActiveSpaceNormalized(incoming, "personal");
              void writeActiveSpace("personal");
            }
            const previousStateForSettingsRefresh = state;
            stateMutationGeneration += 1;
            state = incoming;
            // The persisted incoming value becomes the concurrency baseline. Any
            // still-unpersisted Settings draft is then overlaid as explicit local
            // intent, so a storage echo cannot erase a debounced edit or make a
            // stale control manufacture a false local mutation later.
            writeBaseline = createWriteBaseline(stateChange.newValue);
            applyPendingSettingsDraft();
            const previousFrequentEnabled = frequentlyVisitedEnabled;
            const previousFrequentCount = frequentlyVisitedCount;
            syncFrequentlyVisitedLocalsFromState(state);
            refreshSettingsControlsAfterExternalState(previousStateForSettingsRefresh);
            if (previousFrequentEnabled !== frequentlyVisitedEnabled || previousFrequentCount !== frequentlyVisitedCount) {
              frequentCandidateCacheAt = 0;
              frequentCandidateCache = [];
            }
            const canSkipExternalGridRender =
              !isSettingsOpen() &&
              !activeFolderId &&
              folderPopover.hidden &&
              shortcutOrderMode !== "recent" &&
              !isAwaitingRemote(meta) &&
              manualGridRenderEquivalent(previousStateForSettingsRefresh, state);
            reconcileLauncherAfterExternalState({ renderGrid: !canSkipExternalGridRender });
            updateSpaceSwitcher();
            scheduleAppearanceHintRefresh(state.settings);
            refreshFirstPaintCaches(state, meta);
            scheduleRenderPreviewRefresh(state, meta);
            scheduleFrequentlyVisitedRefresh();
            if (state.settings.autoSiteIcons) scheduleIdleWork(() => requestMissingSiteIcons(), 700);
        } catch (error) {
          console.warn(`${PRODUCT_NAME}: could not materialize local state change`, error);
        }
      })();
    }

    const recoveryStatusChange = changes[LOCAL_SYNC_RECOVERY_STATUS_KEY];
    const recoveryStatus = recoveryStatusChange?.newValue;
    if (recoveryStatus?.state === "recovering") showToast(t("syncRecoveryRestoring"));
    else if (recoveryStatus?.state === "restored") showToast(t("syncRecoveryRestored"));
    else if (recoveryStatus?.state === "failed") showToast(t("syncRecoveryFailed"));

    const metaChange = changes[LOCAL_META_KEY];
    if (metaChange?.newValue) {
      const wasAwaitingRemote = isAwaitingRemote(meta);
      metaMutationGeneration += 1;
      meta = normalizeMeta(metaChange.newValue);
      updateSyncUi(meta);
      if (meta.onboardingCompleted) scheduleRenderManifestRefresh(state, meta);
      else { try { localStorage.removeItem(RENDER_MANIFEST_KEY); } catch {} }
      // Sync status/quota updates are frequent and do not normally affect the
      // shortcut grid. Re-render only when entering/leaving the remote-wait UI.
      if (wasAwaitingRemote !== isAwaitingRemote(meta)) requestLauncherRenderAfterExternalState();
      if (meta.syncEnabled && isSettingsOpen()) refreshSyncStatus().catch(() => {});
    }
  });

  devMark("newtab:load-state:start");
  loadState().then(() => {
    devMark("newtab:load-state:end");
    devMeasure("newtab:load-state", "newtab:load-state:start", "newtab:load-state:end");
  }).catch(error => {
    console.error(error);
    discardUnverifiedStartupCaches();
    showToast(t("localDataLoadFailed"));
  });
})();
