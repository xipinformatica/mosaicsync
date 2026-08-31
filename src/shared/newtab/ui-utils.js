/*
 * Shared, allocation-conscious New Tab helpers.
 * Kept independent of DOM state so they can be regression-tested directly.
 */
import "../core/http-url-safety.js";
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
