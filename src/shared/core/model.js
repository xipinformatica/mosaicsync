/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure state/synchronization model.
 * This module has no DOM or Firefox API side effects, which keeps merge logic testable.
 */
import {
  BACKGROUND_PRESETS,
  BUILTIN_SHORTCUT_ICON_KEYS,
  DEFAULT_META,
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  DEFAULT_SPACE_ID,
  SPACE_IDS,
  SHORTCUT_COLOR_TAG_KEYS,
  META_SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION
} from "./constants.js";
import { canonicalizeImageDataUrl, imageDataUrlByteLength, MAX_IMAGE_DATA_URL_CHARS, parseImageDataUrl } from "./image-data.js";
import "./http-url-safety.js";

// Generic validation / identifiers ------------------------------------------------
export function uid(prefix = "ms") {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function now() {
  return Date.now();
}

// Advance a logical mutation clock beyond both wall time and every observed
// record/workspace clock involved in the edit. This keeps a device with a
// temporarily skewed clock (or a profile containing a future timestamp) from
// making a legitimate later user edit look older forever.
export function nextMutationTime(...values) {
  let next = now();
  for (const value of values.flat(Infinity)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) next = Math.max(next, Math.trunc(numeric) + 1);
  }
  return next;
}

export function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function validHex(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function hostLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Shortcut";
  } catch {
    return "Shortcut";
  }
}


function normalizeHttpUrl(value) {
  return globalThis.__mosaicsyncSafeShortcutNavigationUrl?.(value) || "";
}

function cleanTitle(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}


function isSafeImageDataUrl(value) {
  return typeof value === "string" &&
    value.length <= MAX_IMAGE_DATA_URL_CHARS &&
    Boolean(parseImageDataUrl(value));
}

export function classifyImage(value) {
  if (typeof value !== "string" || !value) return "none";
  return isSafeImageDataUrl(value) ? "device" : "none";
}

function normalizeImageSyncKind(value, hasImage = false, hasAssetId = false) {
  // Release 1.5 and earlier used "local" to mean a binary artwork asset that was
  // uploaded to storage.sync. Preserve that behavior for existing profiles so
  // an upgrade never makes already-synchronized artwork disappear.
  if (value === "local") return (hasImage || hasAssetId) ? "sync" : "none";
  if (["sync", "device", "none"].includes(value)) return value;
  if (hasAssetId) return "sync";
  return hasImage ? "device" : "none";
}

function normalizeImageSourceKind(value) {
  return ["none", "upload", "remote", "favicon", "firefox"].includes(value) ? value : "none";
}

function normalizeShortcutImageSourceKind(value) {
  return value === "builtin" ? "builtin" : normalizeImageSourceKind(value);
}

function normalizeShortcutColorTag(value) {
  return SHORTCUT_COLOR_TAG_KEYS.includes(value) ? value : "";
}

function normalizeBuiltinShortcutIcon(value) {
  return BUILTIN_SHORTCUT_ICON_KEYS.includes(value) ? value : "";
}

function normalizeImageSourceUrl(value) {
  return normalizeHttpUrl(value);
}

export function assetIdForDataUrl(value, memo = null) {
  const cache = memo instanceof Map ? memo : null;
  if (cache?.has(value)) return cache.get(value);
  if (!isSafeImageDataUrl(value)) {
    cache?.set(value, "");
    return "";
  }
  // Canonicalize legal base64 formatting whitespace before hashing so asset
  // identity represents image content rather than textual wrapping differences.
  const canonical = canonicalizeImageDataUrl(value);
  if (!canonical) return "";
  // Deterministic 64-bit FNV-1a. This is an identifier/deduplication hash,
  // not a security primitive. Present synchronized artwork bytes always derive
  // their own identity; reconstructable/device-only artwork carries no binary
  // Sync asset ID, and opted-in user artwork is quota-bounded/compressed.
  // Keep the exact historical 64-bit FNV-1a result without a BigInt multiply
  // for every character. Four 16-bit limbs make the modulo-2^64 multiply by
  // FNV's prime (2^40 + 435) exact with ordinary Number arithmetic. BigInt is
  // used only once at the end to format the existing asset ID.
  let limb0 = 0x2325;
  let limb1 = 0x8422;
  let limb2 = 0x9ce4;
  let limb3 = 0xcbf2;
  for (let index = 0; index < canonical.length; index += 1) {
    limb0 = (limb0 ^ canonical.charCodeAt(index)) & 0xffff;
    const a0 = limb0;
    const a1 = limb1;
    const a2 = limb2;
    const a3 = limb3;

    let product = a0 * 435;
    limb0 = product & 0xffff;
    let carry = product >>> 16;

    product = a1 * 435 + carry;
    limb1 = product & 0xffff;
    carry = product >>> 16;

    product = a2 * 435 + a0 * 256 + carry;
    limb2 = product & 0xffff;
    carry = product >>> 16;

    product = a3 * 435 + a1 * 256 + carry;
    limb3 = product & 0xffff;
  }
  const hash = (BigInt(limb3) << 48n) | (BigInt(limb2) << 32n) |
    (BigInt(limb1) << 16n) | BigInt(limb0);
  const assetId = `a${hash.toString(36)}-${canonical.length.toString(36)}`;
  cache?.set(value, assetId);
  return assetId;
}

const ASSET_ID_RE = /^a[0-9a-z]+-([0-9a-z]+)$/;

function reusableAssetId(candidate) {
  if (typeof candidate !== "string") return "";
  return ASSET_ID_RE.test(candidate) ? candidate : "";
}

function assetIdForNormalizedImage(value, candidate, memo = null) {
  // When bytes are present, content identity must come from those exact bytes.
  // This closes the same-length replacement edge case where a stale candidate ID
  // could otherwise survive simply because two different data URLs were equally
  // long. A candidate is preserved only when this Firefox legitimately has the
  // Sync record but not the binary asset yet.
  return value ? assetIdForDataUrl(value, memo) : reusableAssetId(candidate);
}

function normalizeShortcut(item, index = 0, memo = null) {
  if (!item || typeof item.url !== "string") return null;
  const url = normalizeHttpUrl(item.url);
  if (!url) return null;
  const builtinIcon = normalizeBuiltinShortcutIcon(item.builtinIcon);
  const colorTag = normalizeShortcutColorTag(item.colorTag);
  const timestamp = now();
  // Persisted display pixels are always local image data. MosaicSync may preserve
  // a separate HTTP(S) source URL for explicit, permission-gated reconstruction,
  // but a remote URL is never accepted directly as an <img> source.
  const image = builtinIcon ? "" : (isSafeImageDataUrl(item.image) ? item.image : "");
  let imageSourceKind = builtinIcon ? "builtin" : normalizeShortcutImageSourceKind(item.imageSourceKind);
  // A malformed/legacy record must not be able to claim the protected built-in
  // artwork source without naming a valid built-in icon. Fail back to ordinary
  // icon recovery instead of leaving the shortcut permanently icon-less.
  if (!builtinIcon && imageSourceKind === "builtin") imageSourceKind = "none";
  if (!builtinIcon && imageSourceKind === "none" && item.source === "firefox-import") imageSourceKind = "firefox";
  let imageSyncKind = builtinIcon ? "none" : normalizeImageSyncKind(
    item.imageSyncKind,
    Boolean(image) || Boolean(item.imageSyncData),
    Boolean(item.imageAssetId)
  );
  // Firefox/imported favicons and web-derived artwork are reconstructable caches,
  // never binary Sync payloads. Only user-provided local artwork may opt into
  // storage.sync image bytes. This also migrates grandfathered pre-1.7 favicons
  // out of the 100 KB asset budget without deleting their local pixels.
  if (["remote", "favicon", "firefox"].includes(imageSourceKind)) imageSyncKind = "device";

  // Release 1.10 separates the rich local display copy from the tiny binary that may
  // be sent through Firefox Sync. For pre-1.10 profiles, old synchronized artwork
  // was already quota-compressed in `image`; adopt that small value as the initial
  // derivative without changing what the user sees. Large/corrupt legacy values
  // are not silently published until the UI/background maintenance creates a safe
  // derivative.
  let imageSyncData = imageSyncKind === "sync" && isSafeImageDataUrl(item.imageSyncData)
    ? canonicalizeImageDataUrl(item.imageSyncData)
    : "";
  if (!imageSyncData && imageSyncKind === "sync" &&
      !["remote", "favicon", "firefox"].includes(imageSourceKind) &&
      isSafeImageDataUrl(image) && imageDataUrlByteLength(image) <= 12000) {
    imageSyncData = canonicalizeImageDataUrl(image);
  }
  if (imageSyncKind !== "sync") imageSyncData = "";

  // Keep the artwork policy even when this Firefox does not have the derivative. A
  // receiving profile can therefore distinguish an opted-in image from ordinary
  // device-only artwork while the binary asset is still arriving.
  const imageAssetId = imageSyncKind === "sync"
    ? assetIdForNormalizedImage(imageSyncData, item.imageAssetId, memo)
    : "";
  const imageSourceUrl = ["remote", "favicon"].includes(imageSourceKind)
    ? normalizeImageSourceUrl(item.imageSourceUrl)
    : "";
  const localImageAssetId = builtinIcon
    ? ""
    : (image
        ? assetIdForDataUrl(image, memo)
        : ((imageSourceKind !== "none" || imageSyncKind !== "none" || item.imageIsFallback === true)
            ? reusableAssetId(item.localImageAssetId)
            : ""));
  const imageIsFallback = item.imageIsFallback === true && imageSyncKind === "device" && Boolean(image || localImageAssetId);
  return {
    type: "shortcut",
    id: typeof item.id === "string" && item.id ? item.id : uid("shortcut"),
    title: cleanTitle(item.title, 80) || hostLabel(url),
    url,
    builtinIcon,
    colorTag,
    image,
    localImageAssetId,
    imageSyncData,
    imageAssetId,
    imageSyncKind,
    imageSourceKind,
    imageSourceUrl,
    // Local-only marker: a receiving Firefox may display a learned favicon in
    // place of custom artwork that intentionally was not put in storage.sync.
    // It is never serialized into a Sync record.
    imageIsFallback,
    imageStyle: item.imageStyle === "cover" ? "cover" : "contain",
    position: Number.isInteger(item.position) && item.position >= 0 ? item.position : index,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : timestamp,
    modifiedAt: Number.isFinite(item.modifiedAt) ? item.modifiedAt : timestamp,
    // Monotonic marker written only by an intentional cross-Space move. It lets
    // a later deliberate move back into a Space override that Space's older
    // tombstone, while ordinary edits from a stale offline device cannot revive
    // a shortcut that another device deleted.
    spaceMoveAt: Number.isFinite(item.spaceMoveAt) ? item.spaceMoveAt : 0,
    source: item.source === "firefox-import" ? "firefox-import" : "manual"
  };
}

function normalizeFolder(item, index = 0, memo = null) {
  if (!item || item.type !== "folder" || !Array.isArray(item.items)) return null;
  const timestamp = now();
  const children = item.items
    .map((child, childIndex) => normalizeShortcut(child, childIndex, memo))
    .filter(Boolean)
    .sort(comparePositionThenModified)
    .map((child, childIndex) => ({ ...child, position: childIndex }));

  if (children.length < 2) return null;

  return {
    type: "folder",
    id: typeof item.id === "string" && item.id ? item.id : uid("folder"),
    title: cleanTitle(item.title, 60),
    items: children,
    position: Number.isInteger(item.position) && item.position >= 0 ? item.position : index,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : timestamp,
    modifiedAt: Number.isFinite(item.modifiedAt) ? item.modifiedAt : timestamp
  };
}

function compareStableText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function comparePositionThenModified(a, b) {
  const positionDelta = (a.position ?? 0) - (b.position ?? 0);
  if (positionDelta) return positionDelta;
  const modifiedDelta = (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
  if (modifiedDelta) return modifiedDelta;
  return compareStableText(a.id, b.id);
}

// Local normalized state ---------------------------------------------------------
export function repairTopLevelPositions(items) {
  const used = new Set();
  const sorted = [...items].sort(comparePositionThenModified);
  return sorted.map((item, fallbackIndex) => {
    let position = Number.isInteger(item.position) && item.position >= 0 ? item.position : fallbackIndex;
    while (used.has(position)) position += 1;
    used.add(position);

    if (item.type === "folder") {
      return {
        ...item,
        position,
        items: item.items
          .slice()
          .sort(comparePositionThenModified)
          .map((child, childIndex) => ({ ...child, position: childIndex }))
      };
    }
    return { ...item, position };
  });
}

function normalizeOptionalBackgroundDim(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function projectThemeBackgroundDims(settings) {
  const projected = {};
  const light = normalizeOptionalBackgroundDim(settings?.lightBackgroundDim);
  const dark = normalizeOptionalBackgroundDim(settings?.darkBackgroundDim);
  if (light !== null) projected.lightBackgroundDim = light;
  if (dark !== null) projected.darkBackgroundDim = dark;
  return projected;
}

export function effectiveBackgroundDimForTheme(settings, effectiveTheme = "dark") {
  const base = Math.min(100, Math.max(0, Number.isFinite(Number(settings?.backgroundDim))
    ? Number(settings.backgroundDim)
    : DEFAULT_SETTINGS.backgroundDim));
  if (settings?.themeWallpapersEnabled !== true) return base;
  const value = effectiveTheme === "light" ? settings.lightBackgroundDim : settings.darkBackgroundDim;
  const specific = normalizeOptionalBackgroundDim(value);
  return specific === null ? base : specific;
}

export function initializeThemeWallpaperDims(settings, effectiveTheme = "dark") {
  const base = Math.min(100, Math.max(0, Number.isFinite(Number(settings?.backgroundDim))
    ? Number(settings.backgroundDim)
    : DEFAULT_SETTINGS.backgroundDim));
  let lightBackgroundDim = normalizeOptionalBackgroundDim(settings?.lightBackgroundDim);
  let darkBackgroundDim = normalizeOptionalBackgroundDim(settings?.darkBackgroundDim);
  if (lightBackgroundDim !== null && darkBackgroundDim !== null) {
    return { changed: false, lightBackgroundDim, darkBackgroundDim };
  }
  if (lightBackgroundDim === null) lightBackgroundDim = effectiveTheme === "light" ? base : 0;
  if (darkBackgroundDim === null) darkBackgroundDim = effectiveTheme === "dark" ? base : 0;
  return { changed: true, lightBackgroundDim, darkBackgroundDim };
}

function normalizeSettings(rawSettings, memo = null) {
  const safe = { ...DEFAULT_SETTINGS };
  if (!rawSettings || typeof rawSettings !== "object") return safe;
  const settings = rawSettings;
  safe.columns = clampInt(settings.columns, 6, 12, DEFAULT_SETTINGS.columns);
  safe.rows = clampInt(settings.rows, 2, 8, DEFAULT_SETTINGS.rows);
  const migratedTileSize = settings.tileSize ??
    (Number.isFinite(Number(settings.iconSize)) ? Math.round(76 * Number(settings.iconSize) / 48) : undefined) ??
    settings.iconScale;
  safe.tileSize = clampInt(migratedTileSize, 60, 96, DEFAULT_SETTINGS.tileSize);
  safe.backgroundColor = validHex(settings.backgroundColor) ? settings.backgroundColor : DEFAULT_SETTINGS.backgroundColor;
  safe.backgroundColorCustomized = typeof settings.backgroundColorCustomized === "boolean"
    ? settings.backgroundColorCustomized
    : safe.backgroundColor.toLowerCase() !== DEFAULT_SETTINGS.backgroundColor.toLowerCase();
  safe.backgroundImage = isSafeImageDataUrl(settings.backgroundImage) ? settings.backgroundImage : "";
  safe.backgroundSourceKind = normalizeImageSourceKind(settings.backgroundSourceKind);
  safe.backgroundLocalAssetId = safe.backgroundImage
    ? (reusableAssetId(settings.backgroundLocalAssetId) || assetIdForDataUrl(safe.backgroundImage, memo))
    : (safe.backgroundSourceKind !== "none" ? reusableAssetId(settings.backgroundLocalAssetId) : "");
  safe.backgroundImageKind = (safe.backgroundImage || safe.backgroundLocalAssetId) ? "device" : "none";
  safe.backgroundAssetId = "";
  safe.backgroundSourceUrl = ["remote", "favicon"].includes(safe.backgroundSourceKind)
    ? normalizeImageSourceUrl(settings.backgroundSourceUrl)
    : "";
  safe.backgroundPreset = typeof settings.backgroundPreset === "string" && BACKGROUND_PRESETS[settings.backgroundPreset]
    ? settings.backgroundPreset
    : "";
  safe.backgroundFit = "cover";
  safe.backgroundPosition = "center center";
  safe.backgroundDim = Math.min(100, Math.max(0, Number.isFinite(Number(settings.backgroundDim)) ? Number(settings.backgroundDim) : DEFAULT_SETTINGS.backgroundDim));
  safe.theme = ["system", "dark", "light"].includes(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme;
  safe.themeWallpapersEnabled = settings.themeWallpapersEnabled === true;
  safe.lightBackgroundPreset = typeof settings.lightBackgroundPreset === "string" && BACKGROUND_PRESETS[settings.lightBackgroundPreset]
    ? settings.lightBackgroundPreset
    : "";
  safe.darkBackgroundPreset = typeof settings.darkBackgroundPreset === "string" && BACKGROUND_PRESETS[settings.darkBackgroundPreset]
    ? settings.darkBackgroundPreset
    : "";
  safe.lightBackgroundDim = normalizeOptionalBackgroundDim(settings.lightBackgroundDim);
  safe.darkBackgroundDim = normalizeOptionalBackgroundDim(settings.darkBackgroundDim);
  safe.brandVisible = settings.brandVisible !== false;
  safe.autoSiteIcons = settings.autoSiteIcons !== false;
  safe.webAccessPrompted = settings.webAccessPrompted === true;
  safe.frequentlyVisitedEnabled = settings.frequentlyVisitedEnabled === true;
  safe.frequentlyVisitedCount = [3, 5, 8, 10].includes(Number(settings.frequentlyVisitedCount))
    ? Number(settings.frequentlyVisitedCount)
    : DEFAULT_SETTINGS.frequentlyVisitedCount;
  safe.spaceName = typeof settings.spaceName === "string"
    ? settings.spaceName.trim().replace(/\s+/g, " ").slice(0, 32)
    : "";
  safe.multipleSpacesEnabled = settings.multipleSpacesEnabled !== false;
  return safe;
}

export function repairWorkspaceRecordIdsNormalized(workspace, reservedIds = null) {
  const source = workspace && typeof workspace === "object" ? workspace : { shortcuts: [] };
  const used = reservedIds instanceof Set ? reservedIds : new Set();
  const allocate = (candidate, prefix) => {
    if (typeof candidate === "string" && candidate && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    let next = uid(prefix);
    while (used.has(next)) next = uid(prefix);
    used.add(next);
    return next;
  };

  const shortcuts = Array.isArray(source.shortcuts)
    ? source.shortcuts.map(item => {
        if (item?.type === "folder") {
          const folderId = allocate(item.id, "folder");
          const children = Array.isArray(item.items)
            ? item.items.map(child => ({ ...child, id: allocate(child?.id, "shortcut") }))
            : [];
          return { ...item, id: folderId, items: children };
        }
        return { ...item, id: allocate(item?.id, "shortcut") };
      })
    : [];
  return { ...source, shortcuts };
}

export function normalizeWorkspace(raw, memo = null) {
  const safe = {
    shortcuts: [],
    settings: { ...DEFAULT_SETTINGS },
    settingsModifiedAt: 0,
    updatedAt: 0
  };
  if (!raw || typeof raw !== "object") return safe;

  if (Array.isArray(raw.shortcuts)) {
    const normalized = [];
    for (let index = 0; index < raw.shortcuts.length; index += 1) {
      const item = raw.shortcuts[index];
      if (item?.type === "folder") {
        const folder = normalizeFolder(item, index, memo);
        if (folder) normalized.push(folder);
        else if (Array.isArray(item?.items) && item.items.length === 1) {
          const single = normalizeShortcut(item.items[0], index, memo);
          if (single) normalized.push(single);
        }
      } else {
        const shortcut = normalizeShortcut(item, index, memo);
        if (shortcut) normalized.push(shortcut);
      }
    }
    safe.shortcuts = repairWorkspaceRecordIdsNormalized({ shortcuts: repairTopLevelPositions(normalized) }).shortcuts;
  }

  safe.settings = normalizeSettings(raw.settings, memo);
  safe.settingsModifiedAt = Number.isFinite(raw.settingsModifiedAt)
    ? raw.settingsModifiedAt
    : (Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0);
  safe.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
  return safe;
}

export function workspaceStateNormalized(normalized, spaceId = DEFAULT_SPACE_ID) {
  const source = normalized && typeof normalized === "object" && normalized.spaces && typeof normalized.spaces === "object"
    ? normalized
    : normalizeState(normalized);
  const id = SPACE_IDS.includes(spaceId) ? spaceId : DEFAULT_SPACE_ID;
  const workspace = source.spaces?.[id] || normalizeWorkspace(null);
  return {
    schemaVersion: source.schemaVersion,
    activeSpaceId: id,
    spaces: source.spaces,
    shortcuts: workspace.shortcuts,
    settings: workspace.settings,
    settingsModifiedAt: workspace.settingsModifiedAt,
    updatedAt: workspace.updatedAt
  };
}

export function workspaceState(state, spaceId = DEFAULT_SPACE_ID) {
  return workspaceStateNormalized(normalizeState(state), spaceId);
}

export function selectActiveSpaceNormalized(normalized, spaceId = DEFAULT_SPACE_ID) {
  const source = normalized && typeof normalized === "object" && normalized.spaces && typeof normalized.spaces === "object"
    ? normalized
    : normalizeState(normalized);
  const id = SPACE_IDS.includes(spaceId) ? spaceId : DEFAULT_SPACE_ID;
  const active = source.spaces?.[id] || normalizeWorkspace(null);
  return {
    ...source,
    activeSpaceId: id,
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}

export function selectActiveSpace(state, spaceId = DEFAULT_SPACE_ID) {
  return selectActiveSpaceNormalized(normalizeState(state), spaceId);
}

export function replaceWorkspaceNormalized(normalized, spaceId, workspace) {
  const source = normalized && typeof normalized === "object" && normalized.spaces && typeof normalized.spaces === "object"
    ? normalized
    : normalizeState(normalized);
  const id = SPACE_IDS.includes(spaceId) ? spaceId : DEFAULT_SPACE_ID;
  const nextWorkspace = normalizeWorkspace(workspace);
  const spaces = { ...source.spaces, [id]: nextWorkspace };
  const active = spaces[source.activeSpaceId] || spaces[DEFAULT_SPACE_ID];
  return {
    ...source,
    spaces,
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}

export function replaceWorkspace(state, spaceId, workspace) {
  return replaceWorkspaceNormalized(normalizeState(state), spaceId, workspace);
}

export function normalizeState(raw, memo = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const activeSpaceId = SPACE_IDS.includes(source.activeSpaceId) ? source.activeSpaceId : DEFAULT_SPACE_ID;
  const hasSpaces = source.spaces && typeof source.spaces === "object";

  // Schema 13 and older stored one workspace at the top level. It migrates
  // losslessly into Personal while Work starts independently empty.
  const personalSource = hasSpaces && source.spaces.personal && typeof source.spaces.personal === "object"
    ? source.spaces.personal
    : source;
  const workSource = hasSpaces && source.spaces.work && typeof source.spaces.work === "object"
    ? source.spaces.work
    : null;

  const spaces = {
    personal: normalizeWorkspace(personalSource, memo),
    work: normalizeWorkspace(workSource, memo)
  };

  // During a live editing session the legacy compatibility view is what the
  // proven 1.20 UI mutates. Fold it back into the selected workspace at the
  // normalization/persistence boundary so assignments such as state.shortcuts
  // remain safe without rewriting the entire UI around Spaces.
  if (hasSpaces) {
    const activeRaw = source.spaces?.[activeSpaceId];
    const topLevelLooksLive = Array.isArray(source.shortcuts) && source.settings && typeof source.settings === "object";
    if (topLevelLooksLive && (
      source.shortcuts !== activeRaw?.shortcuts ||
      source.settings !== activeRaw?.settings ||
      Number(source.settingsModifiedAt) !== Number(activeRaw?.settingsModifiedAt) ||
      Number(source.updatedAt) !== Number(activeRaw?.updatedAt)
    )) {
      spaces[activeSpaceId] = normalizeWorkspace({
        shortcuts: source.shortcuts,
        settings: source.settings,
        settingsModifiedAt: source.settingsModifiedAt,
        updatedAt: source.updatedAt
      }, memo);
    }
  }

  // Frequently Visited is a profile-level presentation preference even though
  // actual browser-history suggestions remain device-local. Keep the two
  // workspace copies normalized to Personal so an unrelated Work settings write
  // cannot accidentally re-introduce a stale per-Space value during rolling
  // upgrades. This mirrors values only; it does not advance either settings clock.
  const frequentEnabled = spaces.personal.settings.frequentlyVisitedEnabled === true;
  const frequentCount = [3, 5, 8, 10].includes(Number(spaces.personal.settings.frequentlyVisitedCount))
    ? Number(spaces.personal.settings.frequentlyVisitedCount)
    : DEFAULT_SETTINGS.frequentlyVisitedCount;
  spaces.work = {
    ...spaces.work,
    settings: {
      ...spaces.work.settings,
      frequentlyVisitedEnabled: frequentEnabled,
      frequentlyVisitedCount: frequentCount
    }
  };

  const active = spaces[activeSpaceId];
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    activeSpaceId,
    spaces,
    // Compatibility aliases used by the existing renderer/editor/sync model.
    // They intentionally reference the selected workspace in memory.
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}


export function moveShortcutOutOfFolder(state, { shortcutId, spaceId = "", position = null } = {}) {
  const normalized = normalizeState(state);
  const targetSpaceId = SPACE_IDS.includes(spaceId) ? spaceId : normalized.activeSpaceId;
  if (typeof shortcutId !== "string" || !shortcutId || !Number.isInteger(position) || position < 0) return normalized;

  const workspace = normalizeWorkspace(normalized.spaces[targetSpaceId]);
  if (workspace.shortcuts.some(item => item.position === position)) return normalized;

  let folderIndex = -1;
  let childIndex = -1;
  for (let index = 0; index < workspace.shortcuts.length; index += 1) {
    const candidate = workspace.shortcuts[index];
    if (candidate?.type !== "folder") continue;
    const nestedIndex = candidate.items.findIndex(item => item?.id === shortcutId);
    if (nestedIndex < 0) continue;
    folderIndex = index;
    childIndex = nestedIndex;
    break;
  }
  if (folderIndex < 0 || childIndex < 0) return normalized;

  const folder = workspace.shortcuts[folderIndex];
  const [child] = folder.items.splice(childIndex, 1);
  if (!child || child.type !== "shortcut") return normalized;

  const timestamp = nextMutationTime(
    workspace.updatedAt,
    folder.modifiedAt,
    child.modifiedAt,
    folder.items.map(item => item.modifiedAt)
  );
  const moved = { ...child, position, modifiedAt: timestamp };

  if (folder.items.length === 1) {
    const [remaining] = folder.items;
    workspace.shortcuts.splice(folderIndex, 1, {
      ...remaining,
      position: folder.position,
      modifiedAt: timestamp
    });
  } else if (folder.items.length === 0) {
    workspace.shortcuts.splice(folderIndex, 1);
  } else {
    folder.items = folder.items.map((item, index) => ({
      ...item,
      position: index,
      modifiedAt: item.position === index ? item.modifiedAt : timestamp
    }));
    folder.modifiedAt = timestamp;
  }

  workspace.shortcuts.push(moved);
  workspace.shortcuts = repairTopLevelPositions(workspace.shortcuts);
  workspace.updatedAt = timestamp;

  const spaces = {
    ...normalized.spaces,
    [targetSpaceId]: normalizeWorkspace(workspace)
  };
  const active = spaces[normalized.activeSpaceId];
  return {
    ...normalized,
    spaces,
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}


function cloneWorkspaceForMutationNormalized(workspace) {
  const source = workspace && typeof workspace === "object" ? workspace : normalizeWorkspace(null);
  return {
    ...source,
    shortcuts: Array.isArray(source.shortcuts)
      ? source.shortcuts.map(item => item?.type === "folder"
          ? { ...item, items: Array.isArray(item.items) ? item.items.map(child => ({ ...child })) : [] }
          : { ...item })
      : [],
    settings: { ...(source.settings || DEFAULT_SETTINGS) }
  };
}

export function moveShortcutBetweenSpacesNormalized(normalized, { shortcutId, fromSpaceId, toSpaceId, position = null, targetFolderId = "" } = {}) {
  const sourceState = normalized && typeof normalized === "object" && normalized.spaces && typeof normalized.spaces === "object"
    ? normalized
    : normalizeState(normalized);
  if (!SPACE_IDS.includes(fromSpaceId) || !SPACE_IDS.includes(toSpaceId) || fromSpaceId === toSpaceId || typeof shortcutId !== "string" || !shortcutId) {
    return sourceState;
  }

  const source = cloneWorkspaceForMutationNormalized(sourceState.spaces[fromSpaceId]);
  const destination = cloneWorkspaceForMutationNormalized(sourceState.spaces[toSpaceId]);
  const destinationAlreadyHasId = destination.shortcuts.some(item =>
    item?.id === shortcutId || (item?.type === "folder" && item.items.some(child => child?.id === shortcutId))
  );
  if (destinationAlreadyHasId) return sourceState;
  let moved = null;
  let sourceFolder = null;
  let sourceFolderIndex = -1;

  const topIndex = source.shortcuts.findIndex(item => item?.type === "shortcut" && item.id === shortcutId);
  if (topIndex >= 0) {
    [moved] = source.shortcuts.splice(topIndex, 1);
  } else {
    for (let index = 0; index < source.shortcuts.length; index += 1) {
      const folder = source.shortcuts[index];
      if (folder?.type !== "folder") continue;
      const childIndex = folder.items.findIndex(item => item?.id === shortcutId);
      if (childIndex < 0) continue;
      [moved] = folder.items.splice(childIndex, 1);
      sourceFolder = folder;
      sourceFolderIndex = index;
      break;
    }
  }

  if (!moved || moved.type !== "shortcut") return sourceState;

  const timestamp = nextMutationTime(moved.modifiedAt, source.updatedAt, destination.updatedAt);

  if (sourceFolder) {
    if (sourceFolder.items.length === 1) {
      const [remaining] = sourceFolder.items;
      source.shortcuts.splice(sourceFolderIndex, 1, { ...remaining, position: sourceFolder.position, modifiedAt: timestamp });
    } else if (sourceFolder.items.length === 0) {
      source.shortcuts.splice(sourceFolderIndex, 1);
    } else {
      sourceFolder.items = sourceFolder.items.map((child, index) => ({ ...child, position: index }));
      sourceFolder.modifiedAt = timestamp;
    }
  }

  moved = { ...moved, modifiedAt: timestamp, spaceMoveAt: timestamp };
  const destinationFolder = targetFolderId
    ? destination.shortcuts.find(item => item?.type === "folder" && item.id === targetFolderId)
    : null;

  if (destinationFolder) {
    moved.position = destinationFolder.items.length;
    destinationFolder.items.push(moved);
    destinationFolder.modifiedAt = timestamp;
  } else {
    const occupied = new Set(destination.shortcuts.map(item => item.position));
    let desiredPosition = Number.isInteger(position) && position >= 0 ? position : null;
    if (desiredPosition == null) {
      const capacity = destination.settings.columns * destination.settings.rows;
      desiredPosition = 0;
      while (desiredPosition < capacity && occupied.has(desiredPosition)) desiredPosition += 1;
      while (occupied.has(desiredPosition)) desiredPosition += 1;
    }

    const occupant = destination.shortcuts.find(item => item.position === desiredPosition);
    if (occupant) {
      const capacity = destination.settings.columns * destination.settings.rows;
      let displacedPosition = 0;
      while (displacedPosition < capacity && (occupied.has(displacedPosition) || displacedPosition === desiredPosition)) displacedPosition += 1;
      if (displacedPosition >= capacity) return sourceState;
      occupant.position = displacedPosition;
      occupant.modifiedAt = timestamp;
    }

    moved.position = desiredPosition;
    destination.shortcuts.push(moved);
    destination.shortcuts = repairTopLevelPositions(destination.shortcuts);
  }

  source.shortcuts = repairTopLevelPositions(source.shortcuts);
  source.updatedAt = timestamp;
  destination.updatedAt = timestamp;

  const spaces = {
    ...sourceState.spaces,
    [fromSpaceId]: source,
    [toSpaceId]: destination
  };
  const activeSpaceId = toSpaceId;
  const active = spaces[activeSpaceId];
  return {
    ...sourceState,
    activeSpaceId,
    spaces,
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}

export function moveShortcutBetweenSpaces(state, options = {}) {
  return moveShortcutBetweenSpacesNormalized(normalizeState(state), options);
}

export function normalizeMeta(raw) {
  return {
    schemaVersion: META_SCHEMA_VERSION,
    deviceId: typeof raw?.deviceId === "string" && raw.deviceId ? raw.deviceId : "",
    syncEnabled: raw?.syncEnabled === true,
    // Preserve initialization for legacy profiles that predate the explicit
    // syncInitialized flag but already completed a successful sync.
    syncInitialized: raw?.syncInitialized === true ||
      (raw?.syncInitialized !== false && raw?.syncEnabled === true && Number.isFinite(raw?.lastSyncAt) && raw.lastSyncAt > 0),
    syncBootstrapMode: ["none", "await-remote"].includes(raw?.syncBootstrapMode) ? raw.syncBootstrapMode : "none",
    syncStatus: ["off", "ready", "syncing", "waiting", "error"].includes(raw?.syncStatus) ? raw.syncStatus : "off",
    lastSyncAt: Number.isFinite(raw?.lastSyncAt) ? raw.lastSyncAt : 0,
    lastSyncError: typeof raw?.lastSyncError === "string" ? raw.lastSyncError : "",
    syncBytesInUse: Number.isFinite(raw?.syncBytesInUse) ? raw.syncBytesInUse : 0,
    syncItemCount: Number.isFinite(raw?.syncItemCount) ? raw.syncItemCount : 0,
    syncSkippedAssets: Number.isFinite(raw?.syncSkippedAssets) ? raw.syncSkippedAssets : 0,
    syncFastSnapshotFallback: raw?.syncFastSnapshotFallback === true,
    syncProfileProtection: ["unknown", "protected", "limited"].includes(raw?.syncProfileProtection) ? raw.syncProfileProtection : "unknown",
    syncProfileProtectionReason: ["", "too-large", "quota", "missing-device"].includes(raw?.syncProfileProtectionReason) ? raw.syncProfileProtectionReason : "",
    lastSyncWarning: typeof raw?.lastSyncWarning === "string" ? raw.lastSyncWarning : "",
    syncUsageCoreBytes: Number.isFinite(raw?.syncUsageCoreBytes) ? raw.syncUsageCoreBytes : 0,
    syncUsageShortcutBytes: Number.isFinite(raw?.syncUsageShortcutBytes) ? raw.syncUsageShortcutBytes : 0,
    syncUsageWallpaperBytes: Number.isFinite(raw?.syncUsageWallpaperBytes) ? raw.syncUsageWallpaperBytes : 0,
    syncUsageOverheadBytes: Number.isFinite(raw?.syncUsageOverheadBytes) ? raw.syncUsageOverheadBytes : 0,
    onboardingCompleted: raw?.onboardingCompleted === true,
    onboardingVersion: typeof raw?.onboardingVersion === "string" ? raw.onboardingVersion : "",
    syncWaitStartedAt: Number.isFinite(raw?.syncWaitStartedAt) ? raw.syncWaitStartedAt : 0,
    lastAppliedSyncRevision: typeof raw?.lastAppliedSyncRevision === "string" ? raw.lastAppliedSyncRevision : "",
    lastAppliedWorkSyncRevision: typeof raw?.lastAppliedWorkSyncRevision === "string" ? raw.lastAppliedWorkSyncRevision : "",
    lastAppliedDeviceSnapshotRevision: typeof raw?.lastAppliedDeviceSnapshotRevision === "string" ? raw.lastAppliedDeviceSnapshotRevision : "",
    lastAppliedProfileSnapshotRevision: typeof raw?.lastAppliedProfileSnapshotRevision === "string" ? raw.lastAppliedProfileSnapshotRevision : "",
    lastProfileSnapshotPublishedAt: Number.isFinite(raw?.lastProfileSnapshotPublishedAt) ? raw.lastProfileSnapshotPublishedAt : 0,
    lastRemoteReceiptAt: Number.isFinite(raw?.lastRemoteReceiptAt) ? raw.lastRemoteReceiptAt : 0,
    lastRemoteReceiptRevision: typeof raw?.lastRemoteReceiptRevision === "string" ? raw.lastRemoteReceiptRevision : "",
    lastRemoteReceiptUpdatedAt: Number.isFinite(raw?.lastRemoteReceiptUpdatedAt) ? raw.lastRemoteReceiptUpdatedAt : 0,
    lastRemoteReceiptOriginDeviceId: typeof raw?.lastRemoteReceiptOriginDeviceId === "string" ? raw.lastRemoteReceiptOriginDeviceId : "",
    lastDeviceSnapshotGcAt: Number.isFinite(raw?.lastDeviceSnapshotGcAt) ? raw.lastDeviceSnapshotGcAt : 0
  };
}

export function ensureDeviceId(meta) {
  const normalized = normalizeMeta(meta || DEFAULT_META);
  if (!normalized.deviceId) normalized.deviceId = uid("device");
  return normalized;
}

// Sync record conversion ---------------------------------------------------------
export function collectLocalAssetsNormalized(normalized) {
  const assets = new Map();
  const add = value => {
    // Sync the canonical textual representation as well as deriving identity
    // from it. This prevents two equivalent whitespace-wrapped base64 strings
    // from sharing an asset ID while publishing different chunk boundaries.
    const canonical = canonicalizeImageDataUrl(value);
    const id = assetIdForDataUrl(canonical);
    if (id && canonical) assets.set(id, canonical);
  };

  const addShortcut = shortcut => {
    if (shortcut?.imageSyncKind === "sync") add(shortcut.imageSyncData);
  };
  for (const item of normalized.shortcuts) {
    if (item.type === "folder") item.items.forEach(addShortcut);
    else addShortcut(item);
  }
  // Custom wallpaper pixels are intentionally device-local and never enter
  // Firefox Sync's 100 KB binary asset budget.
  return assets;
}

export function collectLocalAssets(state) {
  return collectLocalAssetsNormalized(normalizeState(state));
}

export function flattenStateNormalized(normalized, deviceId = "") {
  const records = new Map();

  for (const item of normalized.shortcuts) {
    if (item.type === "folder") {
      records.set(item.id, folderToRecord(item, deviceId));
      for (const child of item.items) records.set(child.id, shortcutToRecord(child, item.id, deviceId));
    } else {
      records.set(item.id, shortcutToRecord(item, null, deviceId));
    }
  }
  return records;
}

export function flattenState(state, deviceId = "") {
  return flattenStateNormalized(normalizeState(state), deviceId);
}

function folderToRecord(folder, deviceId) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    kind: "folder",
    id: folder.id,
    title: folder.title,
    position: folder.position,
    createdAt: folder.createdAt,
    modifiedAt: folder.modifiedAt,
    deviceId
  };
}

function shortcutToRecord(shortcut, parentId, deviceId) {
  const localSourceKind = normalizeShortcutImageSourceKind(shortcut.imageSourceKind);
  const automaticallyLearnedArtwork = localSourceKind === "favicon" || localSourceKind === "firefox";
  // Automatically learned site artwork is a device-local cache, not user data.
  // Do not let a favicon discovery mutate the synchronized shortcut record or
  // participate in layout/title/URL conflict resolution. Other Firefoxes can
  // reconstruct the icon from the shortcut URL themselves.
  const imageKind = automaticallyLearnedArtwork
    ? "none"
    : normalizeImageSyncKind(
        shortcut.imageSyncKind,
        Boolean(shortcut.image) || Boolean(shortcut.imageSyncData),
        Boolean(shortcut.imageAssetId)
      );
  const imageAssetId = imageKind === "sync"
    ? assetIdForNormalizedImage(shortcut.imageSyncData, shortcut.imageAssetId)
    : "";
  const imageSourceKind = automaticallyLearnedArtwork ? "none" : localSourceKind;
  const imageSourceUrl = imageSourceKind === "remote"
    ? normalizeImageSourceUrl(shortcut.imageSourceUrl)
    : "";
  const builtinIcon = normalizeBuiltinShortcutIcon(shortcut.builtinIcon);
  const colorTag = normalizeShortcutColorTag(shortcut.colorTag);
  const record = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    kind: "shortcut",
    id: shortcut.id,
    parentId,
    title: shortcut.title,
    url: shortcut.url,
    imageAssetId,
    imageKind,
    imageSourceKind,
    imageSourceUrl,
    imageStyle: shortcut.imageStyle,
    position: shortcut.position,
    createdAt: shortcut.createdAt,
    modifiedAt: shortcut.modifiedAt,
    source: shortcut.source,
    deviceId
  };
  // Keep the common record compact. These additive 1.27 fields are omitted when
  // unset, just like spaceMoveAt below, so existing users do not pay Sync quota
  // for empty presentation metadata on every shortcut.
  if (builtinIcon) record.builtinIcon = builtinIcon;
  if (colorTag) record.colorTag = colorTag;
  // Almost every shortcut has never crossed Spaces. Keep the common Sync record
  // compact and only pay for this conflict-resolution marker when it is needed.
  if (Number.isFinite(shortcut.spaceMoveAt) && shortcut.spaceMoveAt > 0) {
    record.spaceMoveAt = shortcut.spaceMoveAt;
  }
  return record;
}

export function makeTombstone(id, deviceId, timestamp = now()) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    kind: "deleted",
    id,
    deletedAt: timestamp,
    modifiedAt: timestamp,
    deviceId
  };
}

export function makeSettingsRecordNormalized(normalized, deviceId = "") {
  const settings = normalized.settings;
  const backgroundImageKind = (settings.backgroundImage || settings.backgroundLocalAssetId) ? "device" : "none";
  const backgroundAssetId = "";
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    kind: "settings",
    settings: {
      columns: settings.columns,
      rows: settings.rows,
      tileSize: settings.tileSize,
      backgroundColor: settings.backgroundColor,
      backgroundColorCustomized: settings.backgroundColorCustomized === true,
      backgroundAssetId,
      backgroundImageKind,
      backgroundSourceKind: normalizeImageSourceKind(settings.backgroundSourceKind),
      backgroundSourceUrl: normalizeImageSourceUrl(settings.backgroundSourceUrl),
      backgroundPreset: settings.backgroundPreset,
      backgroundFit: settings.backgroundFit,
      backgroundPosition: settings.backgroundPosition,
      backgroundDim: settings.backgroundDim,
      theme: settings.theme,
      themeWallpapersEnabled: settings.themeWallpapersEnabled === true,
      lightBackgroundPreset: settings.lightBackgroundPreset || "",
      darkBackgroundPreset: settings.darkBackgroundPreset || "",
      ...projectThemeBackgroundDims(settings),
      brandVisible: settings.brandVisible,
      frequentlyVisitedEnabled: settings.frequentlyVisitedEnabled === true,
      frequentlyVisitedCount: [3, 5, 8, 10].includes(Number(settings.frequentlyVisitedCount)) ? Number(settings.frequentlyVisitedCount) : DEFAULT_SETTINGS.frequentlyVisitedCount,
      spaceName: settings.spaceName || "",
      multipleSpacesEnabled: settings.multipleSpacesEnabled !== false
    },
    modifiedAt: normalized.settingsModifiedAt || normalized.updatedAt || 0,
    deviceId
  };
}

export function makeSettingsRecord(state, deviceId = "") {
  return makeSettingsRecordNormalized(normalizeState(state), deviceId);
}


function recordTimestamp(record) {
  if (!record || typeof record !== "object") return -1;
  if (record.kind === "deleted" && Number.isFinite(record.deletedAt)) return record.deletedAt;
  return Number.isFinite(record.modifiedAt) ? record.modifiedAt : 0;
}

function recordMoveTimestamp(record) {
  if (!record || record.kind === "deleted") return 0;
  const value = Number(record.spaceMoveAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Deterministic merge / reconstruction ------------------------------------------
export function chooseNewerRecord(a, b) {
  if (!a) return b || null;
  if (!b) return a;

  // Deletion is intentionally stronger than a later ordinary edit. Otherwise a
  // device that was offline when a shortcut was deleted could edit its stale copy
  // and resurrect it after reconnecting. An explicit later cross-Space move is
  // different: `spaceMoveAt` is a namespace-generation marker, so a move newer
  // than the tombstone intentionally revives the record in this Space.
  if (a.kind === "deleted" && b.kind !== "deleted") {
    return recordMoveTimestamp(b) > Number(a.deletedAt) ? b : a;
  }
  if (b.kind === "deleted" && a.kind !== "deleted") {
    return recordMoveTimestamp(a) > Number(b.deletedAt) ? a : b;
  }

  // For two live records, compare the namespace-generation marker *before* the
  // ordinary modification clock. This makes the merge associative across three
  // or more devices: a stale edit made before a move can no longer outrank the
  // moved record merely because its local modifiedAt advanced later. Edits made
  // after seeing the move retain the same spaceMoveAt and are then ordered by
  // modifiedAt as usual.
  const aMove = recordMoveTimestamp(a);
  const bMove = recordMoveTimestamp(b);
  if (aMove !== bMove) return aMove > bMove ? a : b;

  const aTime = recordTimestamp(a);
  const bTime = recordTimestamp(b);
  if (aTime !== bTime) return aTime > bTime ? a : b;

  const aDevice = typeof a.deviceId === "string" ? a.deviceId : "";
  const bDevice = typeof b.deviceId === "string" ? b.deviceId : "";
  if (aDevice !== bDevice) return aDevice > bDevice ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

export function mergeRecordMaps(localRecords, remoteRecords) {
  const merged = new Map();
  const ids = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  for (const id of ids) merged.set(id, chooseNewerRecord(localRecords.get(id), remoteRecords.get(id)));
  return merged;
}

export function stateFromRecords(records, settingsRecord, localState = DEFAULT_STATE, assets = new Map()) {
  const local = normalizeState(localState);
  const folders = new Map();
  const topLevel = [];
  const childrenByFolder = new Map();

  for (const record of records.values()) {
    if (!record || record.kind !== "folder") continue;
    folders.set(record.id, {
      type: "folder",
      id: record.id,
      title: cleanTitle(record.title, 60),
      items: [],
      position: Number.isInteger(record.position) && record.position >= 0 ? record.position : 0,
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now(),
      modifiedAt: Number.isFinite(record.modifiedAt) ? record.modifiedAt : now()
    });
  }

  for (const record of records.values()) {
    if (!record || record.kind !== "shortcut" || typeof record.url !== "string") continue;
    const url = normalizeHttpUrl(record.url);
    if (!url) continue;
    const builtinIcon = normalizeBuiltinShortcutIcon(record.builtinIcon);
    const colorTag = normalizeShortcutColorTag(record.colorTag);

    let image = "";
    let imageSyncData = "";
    let imageIsFallback = false;
    const localItem = findItemById(local, record.id);
    const remoteSourceKind = normalizeShortcutImageSourceKind(record.imageSourceKind);
    const localSourceKind = normalizeShortcutImageSourceKind(localItem?.imageSourceKind);
    const localAutoArtwork = Boolean(
      localItem?.image && localItem?.url === url && ["favicon", "firefox"].includes(localSourceKind)
    );
    if (record.imageKind === "sync" || record.imageKind === "local") {
      imageSyncData = assets.get(record.imageAssetId) || "";
      const localDerivativeId = isSafeImageDataUrl(localItem?.imageSyncData)
        ? assetIdForDataUrl(localItem.imageSyncData)
        : "";
      const localDisplayMatchesAsset = Boolean(
        localItem?.image && record.imageAssetId && localDerivativeId === record.imageAssetId
      );

      if (localDisplayMatchesAsset) {
        // The originating Firefox may have a much richer local display copy than
        // the tiny Sync derivative. Preserve that local copy when both represent
        // the same synchronized artwork.
        image = localItem.image;
        imageIsFallback = localItem.imageIsFallback === true;
        if (!imageSyncData) imageSyncData = localItem.imageSyncData;
      } else if (imageSyncData) {
        // A receiving Firefox has only the quota-sized derivative, which doubles
        // as its display copy until the user replaces it locally.
        image = imageSyncData;
      } else if (isSafeImageDataUrl(localItem?.image) && localItem?.imageAssetId === record.imageAssetId) {
        // Core records may arrive before their asset chunks. Keep a known matching
        // local display copy while waiting, but never pair an unrelated stale image.
        image = localItem.image;
        imageIsFallback = localItem.imageIsFallback === true;
      }
    } else if (record.imageKind === "device") {
      if (localItem?.image) {
        image = localItem.image;
        imageIsFallback = localItem.imageIsFallback === true;
      }
    } else if (localAutoArtwork) {
      // Release 1.12 no longer synchronizes automatically learned favicon metadata.
      // Preserve this Firefox's local cache while applying remote core fields.
      image = localItem.image;
      imageIsFallback = localItem.imageIsFallback === true;
    }

    let reconstructedSourceKind = remoteSourceKind;
    let reconstructedSourceUrl = normalizeImageSourceUrl(record.imageSourceUrl);
    // Treat favicon/firefox metadata from older Sync records as local-cache data.
    // Never copy another device's learned favicon URL into the new core record.
    if (["favicon", "firefox"].includes(remoteSourceKind)) {
      reconstructedSourceKind = localAutoArtwork ? localSourceKind : "none";
      reconstructedSourceUrl = localAutoArtwork && localSourceKind === "favicon"
        ? normalizeImageSourceUrl(localItem?.imageSourceUrl)
        : "";
    } else if (remoteSourceKind === "none" && localAutoArtwork) {
      reconstructedSourceKind = localSourceKind;
      reconstructedSourceUrl = localSourceKind === "favicon"
        ? normalizeImageSourceUrl(localItem?.imageSourceUrl)
        : "";
    }
    if (builtinIcon) {
      image = "";
      imageSyncData = "";
      imageIsFallback = false;
      reconstructedSourceKind = "builtin";
      reconstructedSourceUrl = "";
    }

    const shortcut = {
      type: "shortcut",
      id: record.id,
      title: cleanTitle(record.title, 80) || hostLabel(url),
      url,
      builtinIcon,
      colorTag,
      image,
      imageSyncData,
      imageAssetId: builtinIcon ? "" : (["sync", "local"].includes(record.imageKind) && typeof record.imageAssetId === "string" ? record.imageAssetId : ""),
      imageSyncKind: builtinIcon ? "none" : normalizeImageSyncKind(record.imageKind, Boolean(image) || Boolean(imageSyncData), Boolean(record.imageAssetId)),
      imageSourceKind: reconstructedSourceKind,
      imageSourceUrl: reconstructedSourceUrl,
      imageIsFallback,
      imageStyle: record.imageStyle === "cover" ? "cover" : "contain",
      position: Number.isInteger(record.position) && record.position >= 0 ? record.position : 0,
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now(),
      modifiedAt: Number.isFinite(record.modifiedAt) ? record.modifiedAt : now(),
      spaceMoveAt: Number.isFinite(record.spaceMoveAt) ? record.spaceMoveAt : 0,
      source: record.source === "firefox-import" ? "firefox-import" : "manual"
    };

    if (record.parentId && folders.has(record.parentId)) {
      if (!childrenByFolder.has(record.parentId)) childrenByFolder.set(record.parentId, []);
      childrenByFolder.get(record.parentId).push(shortcut);
    } else {
      topLevel.push(shortcut);
    }
  }

  for (const folder of folders.values()) {
    const children = (childrenByFolder.get(folder.id) || [])
      .sort(comparePositionThenModified)
      .map((child, index) => ({ ...child, position: index }));
    if (children.length >= 2) {
      folder.items = children;
      topLevel.push(folder);
    } else if (children.length === 1) {
      topLevel.push({ ...children[0], position: folder.position });
    }
  }

  const settings = settingsFromRecord(settingsRecord, local, assets);
  return normalizeState({
    schemaVersion: STATE_SCHEMA_VERSION,
    shortcuts: topLevel,
    settings,
    settingsModifiedAt: Number.isFinite(settingsRecord?.modifiedAt) ? settingsRecord.modifiedAt : local.settingsModifiedAt,
    updatedAt: Math.max(local.updatedAt, newestRecordTimestamp(records), Number(settingsRecord?.modifiedAt) || 0)
  });
}

function settingsFromRecord(record, localState, assets) {
  if (!record?.settings || typeof record.settings !== "object") return { ...localState.settings };
  const incoming = record.settings;
  let backgroundImage = "";
  if (incoming.backgroundImageKind === "sync" || incoming.backgroundImageKind === "local") {
    // One-way compatibility bridge for pre-1.9 snapshots: if Firefox has already
    // delivered the legacy wallpaper asset, keep it locally once. It is converted
    // to device-only state and will never be uploaded again by Release 1.9.
    backgroundImage = assets.get(incoming.backgroundAssetId) || "";
    if (!backgroundImage && isSafeImageDataUrl(localState.settings.backgroundImage)) {
      backgroundImage = localState.settings.backgroundImage;
    }
  } else if (incoming.backgroundImageKind === "device" && isSafeImageDataUrl(localState.settings.backgroundImage)) {
    // A device-only wallpaper is a per-Firefox cache. Sync its settings intent
    // without erasing a receiving device's own local wallpaper bytes.
    backgroundImage = localState.settings.backgroundImage;
  }

  return {
    columns: incoming.columns,
    rows: incoming.rows,
    tileSize: clampInt(
      incoming.tileSize ?? (Number.isFinite(Number(incoming.iconSize)) ? Math.round(76 * Number(incoming.iconSize) / 48) : undefined),
      60, 96, localState.settings.tileSize ?? DEFAULT_SETTINGS.tileSize
    ),
    backgroundColor: incoming.backgroundColor,
    backgroundColorCustomized: typeof incoming.backgroundColorCustomized === "boolean" ? incoming.backgroundColorCustomized : undefined,
    backgroundImage,
    backgroundImageKind: backgroundImage ? "device" : "none",
    backgroundAssetId: "",
    backgroundSourceKind: normalizeImageSourceKind(incoming.backgroundSourceKind),
    backgroundSourceUrl: normalizeImageSourceUrl(incoming.backgroundSourceUrl),
    backgroundPreset: incoming.backgroundPreset,
    backgroundFit: incoming.backgroundFit,
    backgroundPosition: incoming.backgroundPosition,
    backgroundDim: incoming.backgroundDim,
    theme: incoming.theme,
    themeWallpapersEnabled: incoming.themeWallpapersEnabled === true,
    lightBackgroundPreset: typeof incoming.lightBackgroundPreset === "string" ? incoming.lightBackgroundPreset : localState.settings.lightBackgroundPreset,
    darkBackgroundPreset: typeof incoming.darkBackgroundPreset === "string" ? incoming.darkBackgroundPreset : localState.settings.darkBackgroundPreset,
    // Older synchronized records do not have per-appearance darkness fields.
    // Preserve the receiving device's already-migrated values in that case so
    // an older client cannot erase the new preference merely by publishing.
    lightBackgroundDim: normalizeOptionalBackgroundDim(incoming.lightBackgroundDim) ?? localState.settings.lightBackgroundDim,
    darkBackgroundDim: normalizeOptionalBackgroundDim(incoming.darkBackgroundDim) ?? localState.settings.darkBackgroundDim,
    brandVisible: incoming.brandVisible,
    frequentlyVisitedEnabled: typeof incoming.frequentlyVisitedEnabled === "boolean"
      ? incoming.frequentlyVisitedEnabled
      : localState.settings.frequentlyVisitedEnabled === true,
    frequentlyVisitedCount: [3, 5, 8, 10].includes(Number(incoming.frequentlyVisitedCount))
      ? Number(incoming.frequentlyVisitedCount)
      : ([3, 5, 8, 10].includes(Number(localState.settings.frequentlyVisitedCount)) ? Number(localState.settings.frequentlyVisitedCount) : DEFAULT_SETTINGS.frequentlyVisitedCount),
    spaceName: typeof incoming.spaceName === "string" ? incoming.spaceName : localState.settings.spaceName,
    multipleSpacesEnabled: typeof incoming.multipleSpacesEnabled === "boolean"
      ? incoming.multipleSpacesEnabled
      : localState.settings.multipleSpacesEnabled !== false,
    // Permission grants are profile-specific. Keep this preference local so a
    // denial or opt-out on one Firefox never disables icon learning elsewhere.
    autoSiteIcons: localState.settings.autoSiteIcons !== false,
    webAccessPrompted: localState.settings.webAccessPrompted === true
  };
}

export function newestRecordTimestamp(records) {
  let newest = 0;
  for (const record of records.values()) newest = Math.max(newest, recordTimestamp(record));
  return newest;
}

function findItemById(state, id) {
  for (const item of state.shortcuts || []) {
    if (item.id === id) return item;
    if (item.type === "folder") {
      const child = item.items.find(candidate => candidate.id === id);
      if (child) return child;
    }
  }
  return null;
}


function jsonOmittedType(type) { return type === "undefined" || type === "function" || type === "symbol"; }

function jsonSemanticEqual(a, b, ignoreDeviceId = false) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const aType = typeof a;
  const bType = typeof b;
  if (aType !== bType) return false;
  if (aType === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (aType !== "object") return false;
  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;
  if (aArray) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!jsonSemanticEqual(a[index], b[index], false)) return false;
    }
    return true;
  }
  let aCount = 0;
  for (const key in a) {
    if (!Object.prototype.hasOwnProperty.call(a, key) || (ignoreDeviceId && key === "deviceId")) continue;
    const value = a[key];
    if (jsonOmittedType(typeof value)) continue;
    aCount += 1;
    if (!Object.prototype.hasOwnProperty.call(b, key) || !jsonSemanticEqual(value, b[key], false)) return false;
  }
  let bCount = 0;
  for (const key in b) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || (ignoreDeviceId && key === "deviceId")) continue;
    const value = b[key];
    if (jsonOmittedType(typeof value)) continue;
    bCount += 1;
  }
  return aCount === bCount;
}

export function syncRecordEqual(a, b) {
  return jsonSemanticEqual(a, b, true);
}

export function settingsRecordEqual(a, b) {
  return jsonSemanticEqual(a, b, true);
}

export function createCrossSpaceSyncIntentNormalized(oldState, newState, {
  fromSpaceId,
  toSpaceId,
  shortcutIds = [],
  deviceId = "",
  timestamp = now()
} = {}) {
  if (!SPACE_IDS.includes(fromSpaceId) || !SPACE_IDS.includes(toSpaceId) || fromSpaceId === toSpaceId) return null;
  const oldNormalized = oldState && typeof oldState === "object" && oldState.spaces && typeof oldState.spaces === "object"
    ? oldState
    : normalizeState(oldState);
  const newNormalized = newState && typeof newState === "object" && newState.spaces && typeof newState.spaces === "object"
    ? newState
    : normalizeState(newState);

  const build = spaceId => {
    const oldWorkspace = workspaceStateNormalized(oldNormalized, spaceId);
    const newWorkspace = workspaceStateNormalized(newNormalized, spaceId);
    const oldRecords = flattenStateNormalized(oldWorkspace, deviceId);
    const newRecords = flattenStateNormalized(newWorkspace, deviceId);
    const upserts = [];
    const deletes = [];
    for (const [id, record] of newRecords) {
      const previous = oldRecords.get(id);
      if (!previous || !syncRecordEqual(previous, record)) upserts.push(record);
    }
    for (const id of oldRecords.keys()) {
      if (!newRecords.has(id)) deletes.push(id);
    }
    const oldSettings = makeSettingsRecordNormalized(oldWorkspace, deviceId);
    const newSettings = makeSettingsRecordNormalized(newWorkspace, deviceId);
    return {
      spaceId,
      upserts,
      deletes,
      settings: settingsRecordEqual(oldSettings, newSettings) ? null : newSettings
    };
  };

  const normalizedShortcutIds = Array.isArray(shortcutIds)
    ? shortcutIds.filter(id => typeof id === "string" && id)
    : [];
  const destination = build(toSpaceId);
  const source = build(fromSpaceId);
  const movedIds = new Set(normalizedShortcutIds);
  const moveClock = destination.upserts.reduce((latest, record) => {
    if (!movedIds.has(record?.id) || record?.kind !== "shortcut") return latest;
    return Math.max(latest, Number(record.spaceMoveAt) || 0);
  }, 0);

  return {
    schemaVersion: 1,
    kind: "intent",
    intentId: uid("space-intent"),
    // Cross-Space moves make both workspace clocks monotonic. Use the explicit
    // move marker as the journal ordering clock so two moves created in the same
    // wall-clock millisecond still replay in the user's causal order.
    createdAt: Math.max(Number.isFinite(timestamp) ? timestamp : now(), moveClock),
    fromSpaceId,
    toSpaceId,
    shortcutIds: normalizedShortcutIds,
    destination,
    source
  };
}

export function createCrossSpaceSyncIntent(oldFullState, newFullState, options = {}) {
  return createCrossSpaceSyncIntentNormalized(normalizeState(oldFullState), normalizeState(newFullState), options);
}

export function localStateSyncClockSignature(state) {
  // Fast path for storage.onChanged. All synchronized/core mutations advance a
  // workspace updatedAt or settingsModifiedAt clock; device-local favicon/cache
  // hydration deliberately does not. Return an empty string for legacy/raw
  // shapes so callers fall back to the exact semantic signature.
  const source = state && typeof state === "object" ? state : null;
  if (!source || Number(source.schemaVersion) !== STATE_SCHEMA_VERSION || !source.spaces || typeof source.spaces !== "object") return "";
  const parts = [String(STATE_SCHEMA_VERSION)];
  for (const spaceId of SPACE_IDS) {
    const workspace = source.spaces?.[spaceId];
    if (!workspace || typeof workspace !== "object") return "";
    parts.push(
      spaceId,
      String(Number(workspace.updatedAt) || 0),
      String(Number(workspace.settingsModifiedAt) || 0)
    );
  }
  return parts.join(":");
}

function projectStateForSyncSignature(source) {
  const projectItem = item => {
    if (!item || typeof item !== "object") return null;
    if (item.type === "folder") {
      return {
        type: "folder",
        id: item.id,
        title: item.title,
        position: item.position,
        createdAt: item.createdAt,
        modifiedAt: item.modifiedAt,
        items: Array.isArray(item.items) ? item.items.map(projectItem).filter(Boolean) : []
      };
    }
    const localSourceKind = item.imageSourceKind || "none";
    const automaticallyLearnedArtwork = localSourceKind === "favicon" || localSourceKind === "firefox";
    return {
      type: "shortcut",
      id: item.id,
      title: item.title,
      url: item.url,
      builtinIcon: normalizeBuiltinShortcutIcon(item.builtinIcon),
      colorTag: normalizeShortcutColorTag(item.colorTag),
      imageAssetId: automaticallyLearnedArtwork ? "" : (item.imageAssetId || ""),
      imageSyncKind: automaticallyLearnedArtwork ? "none" : (item.imageSyncKind || "none"),
      imageSourceKind: automaticallyLearnedArtwork ? "none" : localSourceKind,
      imageSourceUrl: automaticallyLearnedArtwork ? "" : (item.imageSourceUrl || ""),
      imageStyle: item.imageStyle || "contain",
      position: item.position,
      createdAt: item.createdAt,
      modifiedAt: item.modifiedAt,
      spaceMoveAt: Number.isFinite(item.spaceMoveAt) ? item.spaceMoveAt : 0,
      source: item.source || "manual"
    };
  };
  const projectWorkspace = workspace => {
    const settings = workspace?.settings || {};
    return {
      shortcuts: Array.isArray(workspace?.shortcuts) ? workspace.shortcuts.map(projectItem).filter(Boolean) : [],
      settings: {
        columns: settings.columns,
        rows: settings.rows,
        tileSize: settings.tileSize,
        backgroundColor: settings.backgroundColor,
        backgroundColorCustomized: settings.backgroundColorCustomized === true,
        backgroundImageKind: (settings.backgroundImage || settings.backgroundLocalAssetId) ? "device" : "none",
        backgroundSourceKind: settings.backgroundSourceKind || "none",
        backgroundSourceUrl: settings.backgroundSourceUrl || "",
        backgroundPreset: settings.backgroundPreset || "",
        backgroundFit: settings.backgroundFit || "cover",
        backgroundPosition: settings.backgroundPosition || "center center",
        backgroundDim: settings.backgroundDim,
        theme: settings.theme,
        themeWallpapersEnabled: settings.themeWallpapersEnabled === true,
        lightBackgroundPreset: settings.lightBackgroundPreset || "",
        darkBackgroundPreset: settings.darkBackgroundPreset || "",
        ...projectThemeBackgroundDims(settings),
        brandVisible: settings.brandVisible,
        frequentlyVisitedEnabled: settings.frequentlyVisitedEnabled === true,
        frequentlyVisitedCount: [3, 5, 8, 10].includes(Number(settings.frequentlyVisitedCount)) ? Number(settings.frequentlyVisitedCount) : DEFAULT_SETTINGS.frequentlyVisitedCount,
        spaceName: settings.spaceName || "",
        multipleSpacesEnabled: settings.multipleSpacesEnabled !== false
      },
      settingsModifiedAt: workspace?.settingsModifiedAt,
      updatedAt: workspace?.updatedAt
    };
  };
  return {
    schemaVersion: source.schemaVersion,
    spaces: Object.fromEntries(SPACE_IDS.map(spaceId => [spaceId, projectWorkspace(source.spaces?.[spaceId])]))
  };
}

export function localStateSyncRawSignature(state) {
  // Current-schema storage writes are already canonical. Project their Sync
  // semantics directly without copying/validating embedded image strings first.
  // Returning empty for legacy/raw shapes keeps callers on the exact normalized
  // fallback instead of making assumptions about old schemas.
  if (!state || typeof state !== "object" || Number(state.schemaVersion) !== STATE_SCHEMA_VERSION || !state.spaces || typeof state.spaces !== "object") return "";
  if (SPACE_IDS.some(spaceId => !state.spaces?.[spaceId] || typeof state.spaces[spaceId] !== "object")) return "";
  return stableStringify(projectStateForSyncSignature(state));
}

export function localStateSyncSignature(state) {
  // Exact semantic signature used at trust boundaries. Device-local display
  // pixels are excluded; normalized state carries content-derived asset IDs for
  // artwork that really belongs in Sync.
  return stableStringify(projectStateForSyncSignature(normalizeState(state)));
}


function stableObjectKeys(value) {
  const integerKeys = [];
  const textKeys = [];
  for (const key of Object.keys(value)) {
    const number = Number(key);
    const isIndex = Number.isInteger(number) && number >= 0 && number < 0xffffffff && String(number) === key;
    (isIndex ? integerKeys : textKeys).push(key);
  }
  integerKeys.sort((a, b) => Number(a) - Number(b));
  textKeys.sort();
  return integerKeys.concat(textKeys);
}

function stableSerialize(value, seen) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") return JSON.stringify(value);
  if (type === "undefined" || type === "function" || type === "symbol") return undefined;
  if (type !== "object") return JSON.stringify(value);
  if (seen.has(value)) throw new TypeError("Converting circular structure to JSON");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      let output = "[";
      for (let index = 0; index < value.length; index += 1) {
        if (index) output += ",";
        const encoded = stableSerialize(value[index], seen);
        output += encoded === undefined ? "null" : encoded;
      }
      return `${output}]`;
    }
    let output = "{";
    let wrote = false;
    for (const key of stableObjectKeys(value)) {
      const encoded = stableSerialize(value[key], seen);
      if (encoded === undefined) continue;
      if (wrote) output += ",";
      output += `${JSON.stringify(key)}:${encoded}`;
      wrote = true;
    }
    return `${output}}`;
  } finally {
    seen.delete(value);
  }
}

export function stableStringify(value) {
  return stableSerialize(value, new Set());
}

export function hexLuminance(hex) {
  if (!validHex(hex)) return 0;
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}
