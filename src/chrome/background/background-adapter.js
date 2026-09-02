/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import "../core/browser-shim.js";
import {
  cleanupLegacyWebOriginPermissions,
  permissionChangeAffectsTopSites
} from "../core/permissions.js";
import {
  isProtectedChromeStoreUrl,
  platformHasPermissionFreeFaviconSource,
  readNativeFaviconDataUrl
} from "../core/platform.js";

async function resolveBrowserCachedFavicon(pageUrl, { signal = null } = {}) {
  // Chrome exposes its own favicon cache through the private _favicon endpoint.
  // This is local browser data: no website request and no external favicon proxy.
  if (signal?.aborted) return null;
  try {
    const image = await readNativeFaviconDataUrl(pageUrl, 128);
    if (signal?.aborted) return null;
    if (image) {
      // `_favicon?size=128` describes Chrome's output canvas, not the intrinsic
      // quality of the cached source. Keep it as a fast provisional fallback.
      return { image, sourceUrl: "", reason: "", width: 0, height: 0, qualitySide: 0, declared: false, sourceKind: "browser", native: true };
    }
  } catch {}
  return null;
}

async function resolveTabNativeFavicon(tab, { fetchImageDataUrl } = {}) {
  // Chrome's local favicon cache is the fastest and safest native fallback.
  // The legacy `firefox` source-kind name remains for profile interoperability.
  const protectedStore = isProtectedChromeStoreUrl(tab?.url || "");
  const sourceUrl = /^https?:/i.test(tab?.favIconUrl || "") ? tab.favIconUrl : "";
  let image = /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(tab?.favIconUrl || "")
    ? tab.favIconUrl
    : "";
  if (!image) {
    try { image = await readNativeFaviconDataUrl(tab?.url || "", 128); } catch {}
  }
  if (!image && sourceUrl && !protectedStore) {
    try { image = await fetchImageDataUrl(sourceUrl); } catch {}
  }
  return image ? {
    image,
    sourceKind: "firefox",
    sourceUrl: protectedStore ? "" : sourceUrl
  } : null;
}

export const backgroundAdapter = Object.freeze({
  cleanupLegacyWebOriginPermissions,
  permissionChangeAffectsTopSites,
  platformHasPermissionFreeFaviconSource,
  resolveBrowserCachedFavicon,
  resolveTabNativeFavicon,
  isProtectedFaviconUrl: isProtectedChromeStoreUrl,
  handlesDataCollectionPermission: false,
  resetProfileProtectionOnSyncDisable: true
});
