import "./browser-shim.js";

/*
 * MosaicSync browser adapter.
 * Chrome-specific API differences live here instead of leaking into profile/model code.
 */
export const PLATFORM_ID = "chrome";

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
  // Pin Chromium's rendered output scale so the browser placeholder has a
  // stable geometry across the sentinel and real-page reads. `_favicon` is a
  // browser-local source; this does not contact the website.
  return browser.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${px}&scaleFactor=1x`);
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
    // Do not force HTTP-cache reuse for the private Chromium endpoint. Its
    // backing favicon database can change after the user visits a page, and a
    // stale generic globe must not survive as a cached response.
    const response = await fetch(url, { cache: "no-store" });
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

// Chromium returns a rendered generic globe for unknown pages instead of a
// cache miss. Learn successful sentinel signatures per output size and reject
// them before any native bytes can become durable MosaicSync artwork.
//
// Failures are deliberately NOT cached: a transient private-endpoint failure
// must never switch the policy from "reject unknown native artwork" to "trust
// everything for the rest of this MV3 worker lifetime". Successful signatures
// are kept as a tiny set because Chromium may legitimately change the rendered
// placeholder after a theme/browser update while the worker is still alive.
const placeholderSignatures = new Map();
const placeholderProbePromises = new Map();
const placeholderProbeAt = new Map();
const PLACEHOLDER_SIGNATURE_MAX = 4;
const PLACEHOLDER_REPROBE_MS = 60_000;

function placeholderSignatureSet(size) {
  const px = Math.max(16, Math.min(256, Math.round(Number(size) || 128)));
  if (!placeholderSignatures.has(px)) placeholderSignatures.set(px, new Set());
  return placeholderSignatures.get(px);
}

async function nativePlaceholderSignature(size, { refresh = false } = {}) {
  const px = Math.max(16, Math.min(256, Math.round(Number(size) || 128)));
  const known = placeholderSignatureSet(px);
  const lastProbeAt = Number(placeholderProbeAt.get(px)) || 0;
  if (!refresh && known.size && Date.now() - lastProbeAt < PLACEHOLDER_REPROBE_MS) {
    return known;
  }
  if (placeholderProbePromises.has(px)) {
    await placeholderProbePromises.get(px);
    return placeholderSignatureSet(px);
  }

  const pending = (async () => {
    // `.invalid` is reserved and cannot resolve. Any successful bytes therefore
    // represent Chromium's own generic placeholder for this exact render size.
    const marker = browser.runtime?.id || "mosaicsync";
    const sample = await readNativeFaviconBytes(`https://mosaicsync-placeholder-${marker}.invalid/`, px);
    if (!sample?.bytes) return "";
    const signature = bytesToBase64(sample.bytes);
    const set = placeholderSignatureSet(px);
    // Maintain a tiny bounded history of successful placeholder variants.
    if (set.has(signature)) set.delete(signature);
    set.add(signature);
    while (set.size > PLACEHOLDER_SIGNATURE_MAX) set.delete(set.values().next().value);
    placeholderProbeAt.set(px, Date.now());
    return signature;
  })().finally(() => {
    placeholderProbePromises.delete(px);
  });

  placeholderProbePromises.set(px, pending);
  const learned = await pending;
  // No timestamp and no negative sentinel value are stored on failure, so the
  // next native request can retry rather than trusting an unidentified globe.
  if (!learned) return null;
  return placeholderSignatureSet(px);
}

export async function readNativeFaviconDataUrl(pageUrl, size = 128) {
  const result = await readNativeFaviconBytes(pageUrl, size);
  if (!result?.bytes) return "";
  const signature = bytesToBase64(result.bytes);
  const placeholders = await nativePlaceholderSignature(size);
  // The placeholder identity is a safety prerequisite for persisting Chrome's
  // private native artwork. If the sentinel cannot be learned, fail closed and
  // let normal website discovery / a later retry provide the real favicon.
  if (!placeholders) return "";
  if (placeholders.has(signature)) return "";
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
