/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Shared constants and schema versions for MosaicSync.
 * Keep persisted/synchronized key names stable: changing them is a data migration.
 */
export const PRODUCT_NAME = "MosaicSync";
export const VERSION = "1.30.9";
export const DONATE_URL = "https://ko-fi.com/mosaicsync";
export const SUPPORT_EMAIL = "mosaicsync@xipinformatica.cat";
export const SUPPORT_URL = `mailto:${SUPPORT_EMAIL}`;
export const TIPS_URL = `mailto:${SUPPORT_EMAIL}?subject=MosaicSync%20tip`;

export const LOCAL_STATE_KEY = "mosaicsync.state";
export const LOCAL_META_KEY = "mosaicsync.meta";
export const LOCAL_PRE_SPACES_BACKUP_KEY = "mosaicsync.pre-spaces-backup.v1";
export const LOCAL_ACTIVE_SPACE_KEY = "mosaicsync.active-space.v1";
export const LOCAL_ASSET_GC_KEY = "mosaicsync.asset-gc";
export const LOCAL_ASSET_PREFIX = "mosaicsync.local-asset.v1.";
export const LOCAL_ASSET_INDEX_KEY = "mosaicsync.local-assets.v1";
export const LOCAL_ASSET_STORE_SCHEMA_VERSION = 1;
export const LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX = "mosaicsync.pending-cross-space-sync.v1.";
export const LOCAL_PENDING_SYNC_MUTATION_KEY = "mosaicsync.pending-sync-mutation.v1";
export const SESSION_RENDER_STATE_KEY = "mosaicsync.session.render-state.v2";
export const RENDER_SNAPSHOT_SCHEMA_VERSION = 2;
export const SESSION_RENDER_INLINE_IMAGE_MAX_CHARS = 24000;
export const SESSION_RENDER_META_KEY = "mosaicsync.session.render-meta.v1";
export const APPEARANCE_HINT_KEY = "mosaicsync.appearance.v1";
export const RENDER_MANIFEST_KEY = "mosaicsync.render-manifest.v1";

// Other persistent/session keys used outside the core state schema. Keep these
// centralized so maintenance code and both browser builds cannot silently drift.
export const FREQUENTLY_VISITED_PREF_KEY = "mosaicsync.frequently-visited.v1";
export const FREQUENTLY_VISITED_COUNT_PREF_KEY = "mosaicsync.frequently-visited-count.v1";
export const FREQUENTLY_VISITED_HIDDEN_DOMAINS_KEY = "mosaicsync.frequently-visited-hidden-domains.v1";
export const DEFAULT_SPACE_PREF_KEY = "mosaicsync.default-space.v1";
export const BOOKMARK_FOLDER_COLORS_PREF_KEY = "mosaicsync.bookmark-folder-colors.v1";
export const SHORTCUT_ORDER_PREF_KEY = "mosaicsync.shortcut-order.v1";
export const SHORTCUT_USAGE_PREF_KEY = "mosaicsync.shortcut-usage.v1";
export const UI_LOCALE_STORAGE_KEY = "mosaicsync.ui-locale.v1";
export const SESSION_LOCAL_IGNORE_KEY = "mosaicsync.session.local-ignore";
export const SESSION_SYNC_EXPECTATIONS_KEY = "mosaicsync.session.sync-expectations";
export const SESSION_PENDING_NAVIGATIONS_KEY = "mosaicsync.session.pending-shortcut-navigation";
export const LEGACY_SESSION_ICON_HYDRATION_FAILURES_KEY = "mosaicsync.session.icon-hydration-failures.v1";
export const LOCAL_ICON_RECOVERY_QUEUE_KEY = "mosaicsync.icon-recovery-queue.v2";
export const LOCAL_ICON_RECOVERY_STATUS_KEY = "mosaicsync.icon-recovery-status.v2";
export const LOCAL_FAVICON_QUALITY_AUDIT_KEY = "mosaicsync.favicon-quality-audit.v1";
export const LOCAL_MAINTENANCE_MIGRATIONS_KEY = "mosaicsync.maintenance-migrations.v1";
export const LOCAL_SYNC_DIAGNOSTICS_KEY = "mosaicsync.sync-diagnostics.v1";
export const LOCAL_ASSET_WRITE_LOCK_NAME = "mosaicsync.local-assets.write.v1";

// Alarm names are part of persisted browser state too; changing one is a
// migration because an older alarm may otherwise remain registered.
export const LEGACY_ICON_HYDRATION_ALARM = "mosaicsync-icon-hydration-v1";
export const ICON_RECOVERY_ALARM = "mosaicsync-icon-recovery-v2";
export const SYNC_WATCH_ALARM = "mosaicsync-sync-watch-v1";

export const STATE_SCHEMA_VERSION = 18;
export const META_SCHEMA_VERSION = 12;
export const SYNC_SCHEMA_VERSION = 10;

export const SYNC_PREFIX = "mosaicsync.sync.";
export const SYNC_SETTINGS_KEY = `${SYNC_PREFIX}settings`;
export const SYNC_DATASET_KEY = `${SYNC_PREFIX}dataset`;
export const SYNC_SPACE_PREFIX = `${SYNC_PREFIX}space.`;
export const SYNC_ITEM_PREFIX = `${SYNC_PREFIX}item.`;
export const SYNC_ASSET_PREFIX = `${SYNC_PREFIX}asset.`;
export const SYNC_DEVICE_SNAPSHOT_PREFIX = `${SYNC_PREFIX}device.`;
export const DEVICE_SNAPSHOT_SCHEMA_VERSION = 2;
export const PROFILE_SNAPSHOT_SCHEMA_VERSION = 1;
export const DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION = 1;

export const SYNC_QUOTA_BYTES = 102400;
export const SYNC_QUOTA_BYTES_PER_ITEM = 8192;
export const SYNC_QUOTA_MAX_ITEMS = 512;
export const DEVICE_SNAPSHOT_CHUNK_DATA_CHARS = 5600;
export const DEVICE_SNAPSHOT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const DEVICE_SNAPSHOT_CAP_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_SNAPSHOT_MAX_RECENT_DEVICES = 8;
export const SYNC_ASSET_CHUNK_CHARS = 4800;
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const ASSET_ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const SYNC_CORE_RESERVE_BYTES = 40960;

// Runtime tuning. These limits are deliberately centralized and bounded. They
// are implementation details, not profile/schema values.
export const EXPECTATION_TTL_MS = 30_000;
export const MAX_EXPECTATIONS = 256;
export const PENDING_NAVIGATION_TTL_MS = 2 * 60 * 1000;
export const PENDING_NAVIGATION_MAX_ENTRIES = 256;
export const ICON_RECOVERY_QUEUE_VERSION = 2;
export const ICON_RECOVERY_CONCURRENCY = 3;
export const ICON_RECOVERY_FETCH_TIMEOUT_MS = 8_000;
export const ICON_RECOVERY_WATCHDOG_MS = 12_000;
export const ICON_RECOVERY_CONTINUE_DELAY_MS = 120;
export const ICON_RECOVERY_RETRY_DELAYS_MS = Object.freeze([15_000, 60_000, 5 * 60_000, 30 * 60_000]);
export const ICON_RECOVERY_MAX_ATTEMPTS = ICON_RECOVERY_RETRY_DELAYS_MS.length + 1;
export const ICON_RECOVERY_EXHAUSTED_RETRY_MS = 24 * 60 * 60 * 1000;
export const FAVICON_QUALITY_AUDIT_POLICY_VERSION = 1;
export const FAVICON_QUALITY_AUDIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const FAVICON_QUALITY_AUDIT_MAX_ENTRIES = 256;
export const SYNC_WATCH_PERIOD_MINUTES = 5;
export const SYNC_FOREGROUND_CHECK_MIN_INTERVAL_MS = 60_000;
export const WEB_ACCESS_CACHE_MS = 5_000;
export const DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES = 512 * 1024;
export const DEVICE_SNAPSHOT_GC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FREQUENT_CANDIDATE_CACHE_MS = 30_000;
export const FREQUENT_TOP_SITES_LIMIT = 100;
export const FREQUENT_HIDDEN_DOMAINS_MAX = 128;
export const BACKGROUND_PRELOAD_CACHE_MAX = 8;
export const LOADED_LOCALE_CATALOG_MAX = 4;
export const RENDER_MANIFEST_MAX_CHARS = 220_000;
export const RENDER_PREVIEW_MAX_CHARS = 6000;
export const RENDER_PREVIEW_TARGET_BYTES = 1400;
export const RENDER_PREVIEW_DIMENSION = 48;
export const RENDER_PREVIEW_CONCURRENCY = 2;

// Display artwork and Firefox Sync artwork have intentionally separate quality
// budgets. Device-local images stay visually rich; only the small derivative
// explicitly opted into Firefox Sync is quota-compressed. Values are binary
// bytes before base64 expansion.
export const SHORTCUT_LOCAL_IMAGE_TARGET_BYTES = 64000;
export const SHORTCUT_SYNC_IMAGE_TARGET_BYTES = 1800;
export const WALLPAPER_LOCAL_IMAGE_TARGET_BYTES = 900000;

export const DEFAULT_LIGHT_BACKGROUND_COLOR = "#e9e2f1";

export const SPACE_IDS = Object.freeze(["personal", "work"]);
export const DEFAULT_SPACE_ID = "personal";

export const SHORTCUT_COLOR_TAG_KEYS = Object.freeze(["red", "orange", "amber", "green", "teal", "blue", "violet", "pink"]);
export const BUILTIN_SHORTCUT_ICON_KEYS = Object.freeze(["home", "mail", "work", "star", "heart", "shopping", "finance", "video", "music", "news", "code", "cloud", "game"]);

export const DEFAULT_SETTINGS = Object.freeze({
  columns: 8,
  rows: 8,
  tileSize: 76,
  backgroundColor: "#2b0050",
  backgroundColorCustomized: false,
  backgroundImage: "",
  backgroundImageKind: "none",
  backgroundAssetId: "",
  backgroundLocalAssetId: "",
  backgroundSourceKind: "none",
  backgroundSourceUrl: "",
  backgroundPreset: "",
  backgroundFit: "cover",
  backgroundPosition: "center center",
  backgroundDim: 0,
  theme: "system",
  // Optional synchronized built-in wallpaper overrides for light/dark appearance.
  // Custom wallpaper pixels remain in the existing device-local background slot.
  themeWallpapersEnabled: false,
  lightBackgroundPreset: "",
  darkBackgroundPreset: "",
  // When separate Light/Dark wallpapers are enabled each appearance keeps its
  // own darkness. null means a pre-1.26.17.3 setting that has not yet been
  // migrated from the legacy shared backgroundDim value.
  lightBackgroundDim: null,
  darkBackgroundDim: null,
  brandVisible: true,
  autoSiteIcons: true,
  webAccessPrompted: false,
  // Frequently Visited content is always browser-local, but the user's display
  // intent/count is part of the synchronized MosaicSync configuration.
  frequentlyVisitedEnabled: false,
  frequentlyVisitedCount: 5,
  // Two-space controls. Empty spaceName means use the localized built-in label.
  spaceName: "",
  multipleSpacesEnabled: true
});

export const DEFAULT_WORKSPACE = Object.freeze({
  shortcuts: Object.freeze([]),
  settings: DEFAULT_SETTINGS,
  settingsModifiedAt: 0,
  updatedAt: 0
});

// Top-level shortcut/settings fields remain as a compatibility view for the
// active space. normalizeState() replaces them with live aliases at runtime.
export const DEFAULT_STATE = Object.freeze({
  schemaVersion: STATE_SCHEMA_VERSION,
  activeSpaceId: DEFAULT_SPACE_ID,
  spaces: Object.freeze({
    personal: DEFAULT_WORKSPACE,
    work: DEFAULT_WORKSPACE
  }),
  shortcuts: Object.freeze([]),
  settings: DEFAULT_SETTINGS,
  settingsModifiedAt: 0,
  updatedAt: 0
});

export const DEFAULT_META = Object.freeze({
  schemaVersion: META_SCHEMA_VERSION,
  deviceId: "",
  syncEnabled: false,
  syncInitialized: false,
  syncBootstrapMode: "none",
  syncStatus: "off",
  lastSyncAt: 0,
  lastSyncError: "",
  syncBytesInUse: 0,
  syncItemCount: 0,
  syncSkippedAssets: 0,
  syncFastSnapshotFallback: false,
  syncProfileProtection: "unknown",
  syncProfileProtectionReason: "",
  lastSyncWarning: "",
  syncUsageCoreBytes: 0,
  syncUsageShortcutBytes: 0,
  syncUsageWallpaperBytes: 0,
  syncUsageOverheadBytes: 0,
  onboardingCompleted: false,
  onboardingVersion: "",
  syncWaitStartedAt: 0,
  // Local-only Sync delivery bookkeeping. These fields never enter storage.sync;
  // they let the UI distinguish a remote copy actually observed on this Firefox
  // from the timestamp embedded in the synchronized dataset itself.
  lastAppliedSyncRevision: "",
  lastAppliedWorkSyncRevision: "",
  lastAppliedDeviceSnapshotRevision: "",
  lastAppliedProfileSnapshotRevision: "",
  lastProfileSnapshotPublishedAt: 0,
  lastRemoteReceiptAt: 0,
  lastRemoteReceiptRevision: "",
  lastRemoteReceiptUpdatedAt: 0,
  lastRemoteReceiptOriginDeviceId: "",
  lastDeviceSnapshotGcAt: 0
});

export const BACKGROUND_PRESETS = Object.freeze({
  // The original compact set stays in the main Settings panel. Additional
  // presets live in the More wallpapers gallery so Background does not become
  // an oversized wall of thumbnails.
  aurora: { name: "Aurora", file: "assets/backgrounds/aurora.svg", canvasText: "light", featured: true },
  blueglow: { name: "Blueglow", file: "assets/backgrounds/blueglow.svg", canvasText: "light", featured: true },
  violetOrbit: { name: "Violet Orbit", file: "assets/backgrounds/violet-orbit.svg", canvasText: "light", featured: false },
  plasma: { name: "Plasma", file: "assets/backgrounds/plasma.svg", canvasText: "light", featured: true },
  midnight: { name: "Midnight", file: "assets/backgrounds/midnight.svg", canvasText: "light", featured: true },
  foxglow: { name: "Foxglow", file: "assets/backgrounds/foxglow.svg", canvasText: "light", featured: true },
  graphite: { name: "Graphite", file: "assets/backgrounds/graphite.svg", canvasText: "light", featured: true },
  softLight: { name: "Soft Light", file: "assets/backgrounds/soft-light.svg", canvasText: "dark", featured: true },

  solarDrift: { name: "Solar Drift", file: "assets/backgrounds/solar-drift.svg", canvasText: "dark", featured: false },
  morningFolds: { name: "Morning Folds", file: "assets/backgrounds/morning-folds.svg", canvasText: "dark", featured: false },
  citrusTiles: { name: "Citrus Tiles", file: "assets/backgrounds/citrus-tiles.svg", canvasText: "dark", featured: false },
  peachHorizon: { name: "Peach Horizon", file: "assets/backgrounds/peach-horizon.svg", canvasText: "dark", featured: false },
  glacierFlow: { name: "Glacier Flow", file: "assets/backgrounds/glacier-flow.svg", canvasText: "dark", featured: false },
  nocturneCurrent: { name: "Nocturne Current", file: "assets/backgrounds/nocturne-current.svg", canvasText: "light", featured: false },
  neonRift: { name: "Neon Rift", file: "assets/backgrounds/neon-rift.svg", canvasText: "light", featured: false },
  obsidianFacets: { name: "Obsidian Facets", file: "assets/backgrounds/obsidian-facets.svg", canvasText: "light", featured: false },
  deepLagoon: { name: "Deep Lagoon", file: "assets/backgrounds/deep-lagoon.svg", canvasText: "light", featured: false },
  eclipseBloom: { name: "Eclipse Bloom", file: "assets/backgrounds/eclipse-bloom.svg", canvasText: "light", featured: false },
  bauhausMorning: { name: "Bauhaus Morning", file: "assets/backgrounds/bauhaus-morning.svg", canvasText: "dark", featured: false },
  porcelainDunes: { name: "Porcelain Dunes", file: "assets/backgrounds/porcelain-dunes.svg", canvasText: "dark", featured: false },
  prismAtelier: { name: "Prism Atelier", file: "assets/backgrounds/prism-atelier.svg", canvasText: "dark", featured: false },
  nordicOrbit: { name: "Nordic Orbit", file: "assets/backgrounds/nordic-orbit.svg", canvasText: "dark", featured: false },
  paperTerrace: { name: "Paper Terrace", file: "assets/backgrounds/paper-terrace.svg", canvasText: "dark", featured: false },
  midnightMetro: { name: "Midnight Metro", file: "assets/backgrounds/midnight-metro.svg", canvasText: "light", featured: false },
  velvetArches: { name: "Velvet Arches", file: "assets/backgrounds/velvet-arches.svg", canvasText: "light", featured: false },
  topographicNight: { name: "Topographic Night", file: "assets/backgrounds/topographic-night.svg", canvasText: "light", featured: false },
  cosmicLedger: { name: "Cosmic Ledger", file: "assets/backgrounds/cosmic-ledger.svg", canvasText: "light", featured: false },
  blackGlass: { name: "Black Glass", file: "assets/backgrounds/black-glass.svg", canvasText: "light", featured: false },
  aetherFlow: { name: "Aether Flow", file: "assets/backgrounds/aether-flow.webp", canvasText: "light", featured: false },
});


export const SYNC_DATA_COLLECTION_TYPES = Object.freeze([
  "browsingActivity",
  "technicalAndInteraction"
]);
