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

export async function readNativeFaviconDataUrl(pageUrl, size = 128) {
  const url = nativeFaviconUrl(pageUrl, size);
  if (!url) return "";
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob.size || blob.size > 512000) return "";
    const type = /^image\//i.test(blob.type || "") ? blob.type : "image/png";
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${type};base64,${bytesToBase64(bytes)}`;
  } catch {
    return "";
  }
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
