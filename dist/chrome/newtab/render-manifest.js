/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Disposable synchronous-first-frame manifest maintenance.
 * Loaded only after first paint; none of this code sits on the New Tab's static
 * module graph. Preview images are tiny visual derivatives, never authoritative
 * profile assets.
 */
import "../core/http-url-safety.js";
import { optimizeImageDataUrl } from "../core/image-optimizer.js";
import { createFirstPaintContract, sanitizeFirstPaintFrequentSnapshot } from "../core/first-paint-contract.js";
import {
  RENDER_MANIFEST_KEY,
  RENDER_MANIFEST_SCHEMA_VERSION,
  RENDER_MANIFEST_MAX_CHARS,
  RENDER_PREVIEW_CONCURRENCY,
  RENDER_PREVIEW_DIMENSION,
  RENDER_PREVIEW_MAX_CHARS,
  RENDER_PREVIEW_TARGET_BYTES,
  BUILTIN_SHORTCUT_ICON_KEYS,
  SHORTCUT_COLOR_TAG_KEYS
} from "../core/constants.js";

const KEY = RENDER_MANIFEST_KEY;
let manifestCache = null;
let lastSerialized = null;

function ensureManifestCache() {
  if (manifestCache) return manifestCache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if ([2, RENDER_MANIFEST_SCHEMA_VERSION].includes(parsed?.version) && Array.isArray(parsed.shortcuts)) {
      manifestCache = parsed;
      lastSerialized = raw;
    }
  } catch {}
  return manifestCache;
}

export function seedRenderManifest(manifest) {
  if (!manifestCache && [2, RENDER_MANIFEST_SCHEMA_VERSION].includes(manifest?.version)) {
    manifestCache = manifest;
    lastSerialized = JSON.stringify(manifest);
  } else ensureManifestCache();
}

function previewIdentity(item) {
  const assetId = item?.localImageAssetId || item?.imageAssetId || "";
  if (assetId) return assetId;
  const image = typeof item?.image === "string" ? item.image : "";
  if (!image) return "";
  let hash = 0x811c9dc5;
  const samples = 8;
  for (let index = 0; index < samples; index += 1) {
    const offset = Math.min(image.length - 1, Math.floor(index * Math.max(1, image.length - 1) / Math.max(1, samples - 1)));
    hash ^= image.charCodeAt(offset) || 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `inline:${image.length}:${(hash >>> 0).toString(36)}`;
}

function cachedPreviews() {
  ensureManifestCache();
  const previews = new Map();
  const visit = item => {
    if (!item || typeof item !== "object") return;
    if (item.imageKey && typeof item.preview === "string" && item.preview.length <= RENDER_PREVIEW_MAX_CHARS) previews.set(item.imageKey, item.preview);
    if (item.type === "folder") for (const child of item.items || []) visit(child);
  };
  for (const item of manifestCache?.shortcuts || []) visit(item);
  return previews;
}

function projectItem(item, previews) {
  const imageKey = previewIdentity(item);
  if (item?.type === "folder") {
    return {
      type: "folder",
      id: item.id,
      title: item.title || "Folder",
      position: item.position,
      // A closed folder can show at most four cells. Keep the synchronous
      // first-frame manifest proportional to what is actually visible instead of
      // spending localStorage/JSON/preview budget on hidden children.
      items: (item.items || []).slice(0, 4).map(child => {
        const childKey = previewIdentity(child);
        return {
          id: child.id,
          title: child.title,
          url: child.url,
          builtinIcon: BUILTIN_SHORTCUT_ICON_KEYS.includes(child.builtinIcon) ? child.builtinIcon : "",
          colorTag: SHORTCUT_COLOR_TAG_KEYS.includes(child.colorTag) ? child.colorTag : "",
          imageStyle: child.imageStyle === "cover" ? "cover" : "contain",
          imageKey: childKey,
          preview: childKey ? (previews.get(childKey) || "") : ""
        };
      })
    };
  }
  return {
    type: "shortcut",
    id: item.id,
    title: item.title,
    url: item.url,
    builtinIcon: BUILTIN_SHORTCUT_ICON_KEYS.includes(item.builtinIcon) ? item.builtinIcon : "",
    colorTag: SHORTCUT_COLOR_TAG_KEYS.includes(item.colorTag) ? item.colorTag : "",
    position: item.position,
    imageStyle: item.imageStyle === "cover" ? "cover" : "contain",
    imageKey,
    preview: imageKey ? (previews.get(imageKey) || "") : ""
  };
}

function serializeWithinBudget(manifest) {
  let serialized = JSON.stringify(manifest);
  if (serialized.length <= RENDER_MANIFEST_MAX_CHARS) return serialized;

  // Frequently Visited artwork is a convenience inside an already-disposable
  // snapshot. Drop those previews before sacrificing shortcut/favicon previews.
  for (const site of manifest.firstPaint?.frequent?.sites || []) {
    if (serialized.length <= RENDER_MANIFEST_MAX_CHARS) break;
    if (!site.favicon) continue;
    site.favicon = "";
    serialized = JSON.stringify(manifest);
  }

  const previewItems = [];
  const visit = item => {
    if (item?.preview) previewItems.push(item);
    if (item?.type === "folder") for (const child of item.items || []) visit(child);
  };
  for (const item of manifest.shortcuts || []) visit(item);
  for (let index = previewItems.length - 1; index >= 0 && serialized.length > RENDER_MANIFEST_MAX_CHARS; index -= 1) {
    previewItems[index].preview = "";
    serialized = JSON.stringify(manifest);
  }

  while (manifest.firstPaint?.frequent?.sites?.length && serialized.length > RENDER_MANIFEST_MAX_CHARS) {
    manifest.firstPaint.frequent.sites.pop();
    serialized = JSON.stringify(manifest);
  }
  return serialized;
}

export function persistRenderManifest(currentState, currentMeta, extraPreviews = null, frequentSnapshot = undefined) {
  if (!currentState?.settings || !currentMeta) return false;
  const spacesDisabled = currentState?.spaces?.personal?.settings?.multipleSpacesEnabled === false;
  const personal = currentState?.spaces?.personal;
  const source = spacesDisabled && currentState.activeSpaceId !== "personal" && personal
    ? {
        ...currentState,
        activeSpaceId: "personal",
        shortcuts: personal.shortcuts || [],
        settings: personal.settings || currentState.settings,
        settingsModifiedAt: Number(personal.settingsModifiedAt) || 0,
        updatedAt: Number(personal.updatedAt) || 0
      }
    : currentState;
  const previews = cachedPreviews();
  if (extraPreviews) for (const [key, value] of extraPreviews) previews.set(key, value);
  const manifest = {
    version: RENDER_MANIFEST_SCHEMA_VERSION,
    onboardingCompleted: currentMeta.onboardingCompleted === true,
    activeSpaceId: source.activeSpaceId,
    updatedAt: Number(source.updatedAt) || 0,
    settingsModifiedAt: Number(source.settingsModifiedAt) || 0,
    columns: source.settings.columns,
    rows: source.settings.rows,
    tileSize: source.settings.tileSize,
    brandVisible: source.settings.brandVisible !== false,
    firstPaint: createFirstPaintContract(currentState, frequentSnapshot === undefined
      ? sanitizeFirstPaintFrequentSnapshot(manifestCache?.firstPaint?.frequent ?? manifestCache?.frequent)
      : frequentSnapshot),
    shortcuts: (source.shortcuts || []).map(item => projectItem(item, previews))
  };
  const serialized = serializeWithinBudget(manifest);
  if (serialized.length > RENDER_MANIFEST_MAX_CHARS) {
    try { localStorage.removeItem(KEY); } catch {}
    lastSerialized = null;
    manifestCache = null;
    return false;
  }
  if (serialized === lastSerialized) return true;
  try {
    localStorage.setItem(KEY, serialized);
    lastSerialized = serialized;
    manifestCache = manifest;
    return true;
  } catch {
    return false;
  }
}

export async function refreshRenderManifestPreviews(currentState, currentMeta, { shouldCommit = null } = {}) {
  if (!currentState?.settings || currentMeta?.onboardingCompleted !== true) return false;
  const existing = cachedPreviews();
  const generated = new Map();
  const jobs = new Map();
  const visit = item => {
    if (!item || item.type !== "shortcut") return;
    const image = typeof item.image === "string" ? item.image : "";
    const key = previewIdentity(item);
    if (!image || !key || existing.has(key) || jobs.has(key)) return;
    jobs.set(key, image);
  };
  for (const item of currentState.shortcuts || []) {
    if (item?.type === "folder") {
      for (const child of (item.items || []).slice(0, 4)) visit(child);
    } else visit(item);
  }
  if (!jobs.size) return false;

  const entries = [...jobs];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(RENDER_PREVIEW_CONCURRENCY, entries.length) }, async () => {
    while (cursor < entries.length) {
      const [key, image] = entries[cursor++];
      try {
        const preview = image.length <= RENDER_PREVIEW_MAX_CHARS ? image : await optimizeImageDataUrl(image, {
          maxWidth: RENDER_PREVIEW_DIMENSION,
          maxHeight: RENDER_PREVIEW_DIMENSION,
          minWidth: 16,
          minHeight: 16,
          targetBytes: RENDER_PREVIEW_TARGET_BYTES,
          initialQuality: 0.78
        });
        if (typeof preview === "string" && preview.length <= RENDER_PREVIEW_MAX_CHARS) generated.set(key, preview);
      } catch {}
    }
  });
  await Promise.all(workers);
  if (!generated.size || (shouldCommit && !shouldCommit())) return false;
  return persistRenderManifest(currentState, currentMeta, generated);
}
