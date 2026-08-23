import "./browser-shim.js";

/*
 * MosaicSync browser adapter.
 * Chrome-specific API differences live here instead of leaking into profile/model code.
 */
export const PLATFORM_ID = "chrome";
export const PLATFORM_NAME = "Chrome";
export const ACCOUNT_PROVIDER_NAME = "Google";

export async function getNativeTopSites({ limit = 100 } = {}) {
  if (!browser.topSites?.get) return [];
  // Chrome's topSites.get() accepts no Firefox-style options object.
  const sites = await browser.topSites.get();
  return Array.isArray(sites) ? sites.slice(0, Math.max(1, Number(limit) || 100)) : [];
}

export function platformHasPermissionFreeFaviconSource() { return true; }

export function nativeFaviconUrl(pageUrl, size = 64) {
  if (!browser.runtime?.getURL || !/^https?:/i.test(String(pageUrl || ""))) return "";
  const px = Math.max(16, Math.min(256, Math.round(Number(size) || 64)));
  return browser.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${px}`);
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + step)));
  }
  return btoa(binary);
}

async function readNativeFaviconBytes(pageUrl, size) {
  const url = nativeFaviconUrl(pageUrl, size);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > 512000) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length) return null;
    const type = /^image\//i.test(blob.type || "") ? blob.type : "image/png";
    return { bytes, type };
  } catch {
    return null;
  }
}

const placeholderSignatures = new Map();
async function nativePlaceholderSignature(size) {
  const px = Math.max(16, Math.min(256, Math.round(Number(size) || 128)));
  if (placeholderSignatures.has(px)) return placeholderSignatures.get(px);
  const pending = (async () => {
    // Chromium returns its generic globe for unknown pages instead of a cache
    // miss. Learn that process-local placeholder once and reject byte-identical
    // responses so MosaicSync never persists the browser's generic fallback as
    // if it were real site artwork. `.invalid` is reserved and cannot resolve.
    const marker = browser.runtime?.id || "mosaicsync";
    const sample = await readNativeFaviconBytes(`https://mosaicsync-placeholder-${marker}.invalid/`, px);
    return sample?.bytes ? bytesToBase64(sample.bytes) : "";
  })();
  placeholderSignatures.set(px, pending);
  return pending;
}

export async function readNativeFaviconDataUrl(pageUrl, size = 128) {
  const result = await readNativeFaviconBytes(pageUrl, size);
  if (!result?.bytes) return "";
  const signature = bytesToBase64(result.bytes);
  const placeholder = await nativePlaceholderSignature(size);
  if (placeholder && signature === placeholder) return "";
  return `data:${result.type};base64,${signature}`;
}

export function isProtectedChromeStoreUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return false;
    if (host === "chromewebstore.google.com") return true;
    return host === "chrome.google.com" && /^\/webstore(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}
