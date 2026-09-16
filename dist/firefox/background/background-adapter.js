/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {
  cleanupLegacyWebOriginPermissions,
  permissionChangeAffectsTopSites
} from "../core/permissions.js";
import { platformHasPermissionFreeFaviconSource } from "../core/platform.js";

async function resolveBrowserCachedFavicon(pageUrl, {
  signal = null,
  hasWebAccess,
  normalizeLocalFaviconDataUrl,
  fetchImageDataUrlDetailed
} = {}) {
  // With the already-granted website host permission Firefox exposes favIconUrl
  // for matching open tabs without requiring the broad `tabs` permission. Query
  // only this host so favicon recovery never scans unrelated browsing tabs.
  if (signal?.aborted || !browser.tabs?.query || !(await hasWebAccess())) return null;
  let parsed;
  try { parsed = new URL(pageUrl); } catch { return null; }
  const patterns = [`${parsed.protocol}//${parsed.host}/*`];
  const host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) patterns.push(`${parsed.protocol}//${host.slice(4)}/*`);
  else if (host.split(".").length >= 2) patterns.push(`${parsed.protocol}//www.${host}/*`);
  for (const pattern of patterns) {
    let tabs = [];
    try { tabs = await browser.tabs.query({ url: pattern }); } catch { continue; }
    if (signal?.aborted) return null;
    for (const tab of tabs || []) {
      if (signal?.aborted) return null;
      const favicon = String(tab?.favIconUrl || "");
      if (/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(favicon)) {
        const image = await normalizeLocalFaviconDataUrl(favicon);
        if (image) return { image, sourceUrl: "", reason: "", width: 0, height: 0, qualitySide: 0, declared: false, sourceKind: "browser", native: true };
      }
      if (/^https?:/i.test(favicon)) {
        const image = await fetchImageDataUrlDetailed(favicon, { deadlineAt: Date.now() + 2_500, declared: true, sourceKind: "browser", signal });
        if (image.image) return { ...image, native: true };
      }
    }
  }
  return null;
}

async function resolveTabNativeFavicon(tab, { fetchImageDataUrl } = {}) {
  // Firefox's tab favicon is an excellent instant fallback, but it can be only
  // 16x16 or 32x32. Resolve/fetch it outside the serialized state queue.
  const sourceUrl = /^https?:/i.test(tab?.favIconUrl || "") ? tab.favIconUrl : "";
  let image = /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(tab?.favIconUrl || "")
    ? tab.favIconUrl
    : "";
  if (!image && sourceUrl) {
    try { image = await fetchImageDataUrl(sourceUrl); } catch {}
  }
  return image ? { image, sourceKind: "firefox", sourceUrl } : null;
}

export const backgroundAdapter = Object.freeze({
  cleanupLegacyWebOriginPermissions,
  permissionChangeAffectsTopSites,
  platformHasPermissionFreeFaviconSource,
  resolveBrowserCachedFavicon,
  resolveTabNativeFavicon,
  isProtectedFaviconUrl: () => false,
  handlesDataCollectionPermission: true,
  resetProfileProtectionOnSyncDisable: false
});
