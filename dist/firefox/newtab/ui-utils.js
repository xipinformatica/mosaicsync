/*
 * Shared, allocation-conscious New Tab helpers.
 * Kept independent of DOM state so they can be regression-tested directly.
 */
import "../core/http-url-safety.js";
import {
  BUILTIN_SHORTCUT_ICON_KEYS,
  SHORTCUT_COLOR_TAG_KEYS,
  RENDER_PREVIEW_MAX_CHARS
} from "../core/constants.js";
const canonicalHostCache = new Map();
const CANONICAL_HOST_CACHE_MAX = 256;

export function canonicalSiteHost(value) {
  const key = String(value || "");
  if (!key) return "";
  if (canonicalHostCache.has(key)) return canonicalHostCache.get(key);
  let host = "";
  try { host = new URL(key).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""); } catch {}
  canonicalHostCache.set(key, host);
  if (canonicalHostCache.size > CANONICAL_HOST_CACHE_MAX) canonicalHostCache.delete(canonicalHostCache.keys().next().value);
  return host;
}


export function shortcutHostsAcrossSpaces(state) {
  const hosts = new Set();
  const visit = item => {
    if (item?.type === "folder") {
      for (const child of item.items || []) visit(child);
      return;
    }
    if (item?.type !== "shortcut") return;
    const host = canonicalSiteHost(item.url);
    if (host) hosts.add(host);
  };

  const spaces = state?.spaces && typeof state.spaces === "object"
    ? Object.values(state.spaces)
    : [];
  if (spaces.length) {
    for (const workspace of spaces) {
      for (const item of workspace?.shortcuts || []) visit(item);
    }
  } else {
    // Backward-compatible fallback for pre-Spaces/partial state shapes.
    for (const item of state?.shortcuts || []) visit(item);
  }
  return hosts;
}



export function createShortcutHostsAcrossSpacesMemo() {
  let cachedState = null;
  let cachedGeneration = Number.NaN;
  let cachedHosts = null;
  return (state, generation = 0) => {
    const token = Number(generation);
    const normalizedGeneration = Number.isFinite(token) ? token : 0;
    if (cachedHosts && cachedState === state && cachedGeneration === normalizedGeneration) return cachedHosts;
    cachedState = state;
    cachedGeneration = normalizedGeneration;
    cachedHosts = shortcutHostsAcrossSpaces(state);
    return cachedHosts;
  };
}

export function visibleTextBottom(element, documentRef = globalThis.document) {
  const elementRect = element?.getBoundingClientRect?.();
  const fallback = Number(elementRect?.bottom);
  if (!Number.isFinite(fallback)) return 0;

  if (typeof documentRef?.createRange !== "function") return fallback;
  let range = null;
  try {
    range = documentRef.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects?.() || []);
    let bottom = 0;
    for (const rect of rects) {
      const top = Number(rect?.top);
      const candidateBottom = Number(rect?.bottom);
      const width = Number(rect?.width);
      const height = Number(rect?.height);
      if (![top, candidateBottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
      // Ignore line boxes clipped by the two-line label viewport. In particular,
      // this prevents a hidden third line from turning the fixed label box back
      // into the positioning anchor.
      if (top < elementRect.top - 1 || candidateBottom > elementRect.bottom + 1) continue;
      bottom = Math.max(bottom, candidateBottom);
    }
    return bottom || fallback;
  } catch {
    return fallback;
  } finally {
    try { range?.detach?.(); } catch {}
  }
}

export function safeShortcutNavigationUrl(value) {
  return globalThis.__mosaicsyncSafeShortcutNavigationUrl?.(value) || "";
}

export function normalizeShortcutUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) throw new Error("Enter a URL.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const looksLocal = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?(\/|$)/i.test(value);
    value = `${looksLocal ? "http" : "https"}://${value}`;
  }
  const safeUrl = safeShortcutNavigationUrl(value);
  if (!safeUrl) throw new Error("MosaicSync supports http:// and https:// shortcuts.");
  return safeUrl;
}


function sameShortcutRenderInputs(left, right) {
  if (!left || !right || left.type !== "shortcut" || right.type !== "shortcut") return false;
  for (const key of [
    "id", "title", "url", "image", "builtinIcon", "colorTag", "imageStyle",
    "localImageAssetId", "imageAssetId", "imageSourceKind", "imageSourceUrl"
  ]) {
    if (!Object.is(left[key] ?? "", right[key] ?? "")) return false;
  }
  return Number(left.position) === Number(right.position);
}

function sameFolderRenderInputs(left, right) {
  if (!left || !right || left.type !== "folder" || right.type !== "folder") return false;
  if (left.id !== right.id || (left.title || "Folder") !== (right.title || "Folder") ||
      Number(left.position) !== Number(right.position)) return false;
  const leftItems = Array.isArray(left.items) ? left.items : [];
  const rightItems = Array.isArray(right.items) ? right.items : [];
  if (leftItems.length !== rightItems.length) return false;
  const visible = Math.min(4, leftItems.length);
  for (let index = 0; index < visible; index += 1) {
    if (!sameShortcutRenderInputs(leftItems[index], rightItems[index])) return false;
  }
  return true;
}

export function manualGridRenderEquivalent(leftState, rightState) {
  if (!leftState || !rightState || leftState.activeSpaceId !== rightState.activeSpaceId) return false;
  const leftSettings = leftState.settings || {};
  const rightSettings = rightState.settings || {};
  for (const key of ["columns", "rows", "autoSiteIcons", "webAccessPrompted"]) {
    if (!Object.is(leftSettings[key], rightSettings[key])) return false;
  }
  const leftItems = Array.isArray(leftState.shortcuts) ? leftState.shortcuts : [];
  const rightItems = Array.isArray(rightState.shortcuts) ? rightState.shortcuts : [];
  if (leftItems.length !== rightItems.length) return false;

  const rightByPosition = new Map();
  for (const item of rightItems) {
    if (!Number.isInteger(item?.position) || rightByPosition.has(item.position)) return false;
    rightByPosition.set(item.position, item);
  }
  for (const left of leftItems) {
    if (!Number.isInteger(left?.position)) return false;
    const right = rightByPosition.get(left.position);
    if (!right || left.type !== right.type) return false;
    const same = left.type === "folder"
      ? sameFolderRenderInputs(left, right)
      : sameShortcutRenderInputs(left, right);
    if (!same) return false;
  }
  return true;
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

export function clearCanonicalHostCacheForTests() { canonicalHostCache.clear(); }
export function getCanonicalHostCacheSizeForTests() { return canonicalHostCache.size; }

export function shortcutLastOpenedAt(item, usage) {
  const valueForId = id => {
    const raw = usage instanceof Map ? usage.get(id) : usage?.[id];
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  if (item?.type === "folder") {
    let latest = 0;
    for (const child of item.items || []) latest = Math.max(latest, valueForId(child?.id));
    return latest;
  }
  return valueForId(item?.id);
}

export function sortTopLevelByRecent(items, usage) {
  const source = Array.isArray(items) ? items : [];
  return [...source].sort((left, right) => {
    const recentDelta = shortcutLastOpenedAt(right, usage) - shortcutLastOpenedAt(left, usage);
    if (recentDelta) return recentDelta;
    const leftPosition = Number.isInteger(left?.position) ? left.position : Number.MAX_SAFE_INTEGER;
    const rightPosition = Number.isInteger(right?.position) ? right.position : Number.MAX_SAFE_INTEGER;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}


/* Step 2.3 persistent presentation-only visual-cache projection helpers. */
function normalizedBuiltinIcon(value) {
  return BUILTIN_SHORTCUT_ICON_KEYS.includes(value) ? value : "";
}

function normalizedColorTag(value) {
  return SHORTCUT_COLOR_TAG_KEYS.includes(value) ? value : "";
}

export function renderCachePreviewUsable(value) {
  return typeof value === "string" && value.length <= RENDER_PREVIEW_MAX_CHARS &&
    /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

export function renderPreviewIdentity(item) {
  const assetId = item?.localImageAssetId || item?.imageAssetId || "";
  if (assetId) return assetId;
  const image = typeof item?.image === "string" ? item.image : "";
  if (!image) return "";
  let hash = 0x811c9dc5;
  const samples = 8;
  for (let index = 0; index < samples; index += 1) {
    const offset = Math.min(
      image.length - 1,
      Math.floor(index * Math.max(1, image.length - 1) / Math.max(1, samples - 1))
    );
    hash ^= image.charCodeAt(offset) || 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `inline:${image.length}:${(hash >>> 0).toString(36)}`;
}

function projectShortcutVisual(item, previewForKey) {
  const imageKey = renderPreviewIdentity(item);
  return {
    type: "shortcut",
    id: item.id,
    title: item.title,
    position: item.position,
    builtinIcon: normalizedBuiltinIcon(item.builtinIcon),
    colorTag: normalizedColorTag(item.colorTag),
    imageStyle: item.imageStyle === "cover" ? "cover" : "contain",
    imageKey,
    preview: imageKey ? (previewForKey?.(imageKey) || "") : ""
  };
}

export function projectRenderCacheItem(item, previewForKey = null) {
  if (!item || typeof item !== "object") return null;
  if (item.type !== "folder") return projectShortcutVisual(item, previewForKey);
  return {
    type: "folder",
    id: item.id,
    title: item.title || "Folder",
    position: item.position,
    // Closed-folder first paint can expose only four children. Nothing else from
    // the folder belongs in persistent Web Storage.
    items: (item.items || []).slice(0, 4).map(child => {
      const imageKey = renderPreviewIdentity(child);
      return {
        id: child.id,
        title: child.title,
        builtinIcon: normalizedBuiltinIcon(child.builtinIcon),
        colorTag: normalizedColorTag(child.colorTag),
        imageStyle: child.imageStyle === "cover" ? "cover" : "contain",
        imageKey,
        preview: imageKey ? (previewForKey?.(imageKey) || "") : ""
      };
    })
  };
}

function shortcutVisualMatches(cached, item) {
  if (!cached || !item || cached.type !== "shortcut" || item.type === "folder") return false;
  if (cached.id !== item.id || String(cached.title || "") !== String(item.title || "")) return false;
  if (Number(cached.position) !== Number(item.position)) return false;
  if (String(cached.builtinIcon || "") !== normalizedBuiltinIcon(item.builtinIcon)) return false;
  if (String(cached.colorTag || "") !== normalizedColorTag(item.colorTag)) return false;
  if ((cached.imageStyle === "cover" ? "cover" : "contain") !== (item.imageStyle === "cover" ? "cover" : "contain")) return false;
  if (String(cached.imageKey || "") !== renderPreviewIdentity(item)) return false;
  // If the session projection already carries immediately drawable inline
  // artwork, reusing a persistent cache with no preview would needlessly keep an
  // empty tile on screen. In that case let the newer session renderer paint.
  if (typeof item.image === "string" && item.image && !renderCachePreviewUsable(cached.preview)) return false;
  return true;
}

function folderVisualMatches(cached, item) {
  if (!cached || !item || cached.type !== "folder" || item.type !== "folder") return false;
  if (cached.id !== item.id || String(cached.title || "Folder") !== String(item.title || "Folder")) return false;
  if (Number(cached.position) !== Number(item.position)) return false;
  const children = (item.items || []).slice(0, 4);
  if (!Array.isArray(cached.items) || cached.items.length !== children.length) return false;
  for (let index = 0; index < children.length; index += 1) {
    const left = cached.items[index], right = children[index];
    if (!left || !right || left.id !== right.id || String(left.title || "") !== String(right.title || "")) return false;
    if (String(left.builtinIcon || "") !== normalizedBuiltinIcon(right.builtinIcon)) return false;
    if (String(left.colorTag || "") !== normalizedColorTag(right.colorTag)) return false;
    if ((left.imageStyle === "cover" ? "cover" : "contain") !== (right.imageStyle === "cover" ? "cover" : "contain")) return false;
    if (String(left.imageKey || "") !== renderPreviewIdentity(right)) return false;
    if (typeof right.image === "string" && right.image && !renderCachePreviewUsable(left.preview)) return false;
  }
  return true;
}

/**
 * Compare only what the persistent cache is allowed to paint. Revision clocks,
 * URLs and nonvisual metadata intentionally have no role in cache reuse.
 */
export function renderCacheGridMatchesState(manifest, state) {
  if (!manifest || typeof manifest !== "object" || !state?.settings) return false;
  if (manifest.paintSpaceId !== state.activeSpaceId || state.activeSpaceId !== "personal") return false;
  const layout = manifest.layout;
  if (!layout || typeof layout !== "object") return false;
  if (Number(layout.columns) !== Number(state.settings.columns) ||
      Number(layout.rows) !== Number(state.settings.rows) ||
      Number(layout.tileSize) !== Number(state.settings.tileSize) ||
      Boolean(layout.brandVisible !== false) !== Boolean(state.settings.brandVisible !== false)) return false;
  const cachedItems = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
  const stateItems = Array.isArray(state.shortcuts) ? state.shortcuts : [];
  if (cachedItems.length !== stateItems.length) return false;
  const byId = new Map(cachedItems.map(item => [item?.id, item]));
  if (byId.size !== cachedItems.length) return false;
  for (const item of stateItems) {
    const cached = byId.get(item?.id);
    if (item?.type === "folder") {
      if (!folderVisualMatches(cached, item)) return false;
    } else if (!shortcutVisualMatches(cached, item)) return false;
  }
  return true;
}

