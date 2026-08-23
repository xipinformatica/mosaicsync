/*
 * Shared, allocation-conscious New Tab helpers.
 * Kept independent of DOM state so they can be regression-tested directly.
 */
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


export function safeShortcutNavigationUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return "";
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export function normalizeShortcutUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) throw new Error("Enter a URL.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const looksLocal = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?(\/|$)/i.test(value);
    value = `${looksLocal ? "http" : "https"}://${value}`;
  }
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("MosaicSync supports http:// and https:// shortcuts.");
  return parsed.href;
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

export function clearCanonicalHostCacheForTests() { canonicalHostCache.clear(); }
export function getCanonicalHostCacheSizeForTests() { return canonicalHostCache.size; }
