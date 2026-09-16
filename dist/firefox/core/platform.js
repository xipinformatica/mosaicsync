/*
 * Firefox-default browser adapter. Chrome overrides this module at build time.
 * Keeping native API differences here prevents browser-specific calls from
 * leaking into otherwise shared MosaicSync modules.
 */
export const PLATFORM_ID = "firefox";

export async function getNativeTopSites({ limit = 100 } = {}) {
  if (!browser.topSites?.get) return [];
  const requested = Math.max(1, Number(limit) || 100);
  try {
    const sites = await browser.topSites.get({ newtab: true, includeFavicon: true, limit: requested });
    return Array.isArray(sites) ? sites.slice(0, requested) : [];
  } catch {
    return [];
  }
}

export function platformHasPermissionFreeFaviconSource() { return false; }
export function nativeFaviconUrl() { return ""; }
export async function readNativeFaviconDataUrl() { return ""; }
export function isProtectedChromeStoreUrl() { return false; }
