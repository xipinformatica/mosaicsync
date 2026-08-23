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
import { optimizeImageDataUrl } from "../core/image-optimizer.js";
import {
  RENDER_MANIFEST_KEY,
  RENDER_MANIFEST_MAX_CHARS,
  RENDER_PREVIEW_CONCURRENCY,
  RENDER_PREVIEW_DIMENSION,
  RENDER_PREVIEW_MAX_CHARS,
  RENDER_PREVIEW_TARGET_BYTES
} from "../core/constants.js";

const KEY = RENDER_MANIFEST_KEY;
let manifestCache = null;
let lastSerialized = null;

function ensureManifestCache() {
  if (manifestCache) return manifestCache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.version === 2 && Array.isArray(parsed.shortcuts)) manifestCache = parsed;
  } catch {}
  return manifestCache;
}

export function seedRenderManifest(manifest) {
  if (!manifestCache && manifest?.version === 2) manifestCache = manifest;
  else ensureManifestCache();
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
      items: (item.items || []).map(child => {
        const childKey = previewIdentity(child);
        return {
          id: child.id,
          title: child.title,
          url: child.url,
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
    position: item.position,
    imageStyle: item.imageStyle === "cover" ? "cover" : "contain",
    imageKey,
    preview: imageKey ? (previews.get(imageKey) || "") : ""
  };
}

function serializeWithinBudget(manifest) {
  let serialized = JSON.stringify(manifest);
  if (serialized.length <= RENDER_MANIFEST_MAX_CHARS) return serialized;
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
  return serialized;
}

export function persistRenderManifest(currentState, currentMeta, extraPreviews = null) {
  if (!currentState?.settings || !currentMeta) return false;
  const previews = cachedPreviews();
  if (extraPreviews) for (const [key, value] of extraPreviews) previews.set(key, value);
  const manifest = {
    version: 2,
    onboardingCompleted: currentMeta.onboardingCompleted === true,
    activeSpaceId: currentState.activeSpaceId,
    updatedAt: Number(currentState.updatedAt) || 0,
    settingsModifiedAt: Number(currentState.settingsModifiedAt) || 0,
    columns: currentState.settings.columns,
    rows: currentState.settings.rows,
    tileSize: currentState.settings.tileSize,
    brandVisible: currentState.settings.brandVisible !== false,
    shortcuts: (currentState.shortcuts || []).map(item => projectItem(item, previews))
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
    if (item?.type === "folder") for (const child of item.items || []) visit(child);
    else visit(item);
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
