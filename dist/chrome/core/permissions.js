/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Runtime permission helpers. Permission requests intentionally return their promise
 * immediately so callers can invoke them directly inside a user-gesture handler.
 */
import { SYNC_DATA_COLLECTION_TYPES } from "./constants.js";

const TOP_SITES_PERMISSION = "topSites";
const WEB_ORIGINS = Object.freeze(["http://*/*", "https://*/*"]);

export function requestSyncConsentFromGesture() {
  // Chrome exposes storage.sync without a Firefox-style data-collection permission.
  // Keep the same async contract so the shared onboarding state machine stays identical.
  return Promise.resolve(true);
}

export async function removeSyncConsent() {
  // Turning MosaicSync Sync off is a local product preference on Chrome; there is
  // no extension-level Chrome Sync permission to revoke.
  return false;
}

export function requestTopSitesPermissionFromGesture() {
  if (!browser.permissions?.request) {
    return Promise.reject(new Error("MosaicSync could not request access to browser top sites."));
  }
  return browser.permissions.request({ permissions: [TOP_SITES_PERMISSION] });
}

export async function hasTopSitesPermission() {
  if (!browser.permissions?.contains) return false;
  return browser.permissions.contains({ permissions: [TOP_SITES_PERMISSION] });
}

/**
 * MosaicSync uses one optional HTTP/HTTPS grant for automatic favicons and
 * user-requested web images. Asking once is substantially less disruptive than
 * showing Firefox's host-permission prompt for every new shortcut domain.
 * The permission is still optional: shortcut navigation works normally without it.
 */
export function requestWebAccessFromGesture() {
  if (!browser.permissions?.request) {
    return Promise.reject(new Error(""));
  }
  return browser.permissions.request({ origins: [...WEB_ORIGINS] });
}

export async function hasWebAccess() {
  if (!browser.permissions?.contains) return false;
  try {
    return await browser.permissions.contains({ origins: [...WEB_ORIGINS] });
  } catch {
    return false;
  }
}


export async function cleanupLegacyWebOriginPermissions() {
  if (!browser.permissions?.getAll || !browser.permissions?.remove) return 0;
  if (!(await hasWebAccess())) return 0;

  try {
    const granted = await browser.permissions.getAll();
    const origins = Array.isArray(granted?.origins) ? granted.origins : [];
    // Only edit the permission set if Firefox exposes the two current global
    // grants explicitly. This is intentionally more conservative than merely
    // relying on contains(): a browser-normalized broader pattern must never
    // be risked just to tidy old UI entries.
    if (!WEB_ORIGINS.every(origin => origins.includes(origin))) return 0;
    const legacyOrigins = origins.filter(origin =>
      /^https?:\/\//i.test(origin) && !WEB_ORIGINS.includes(origin)
    );
    let removed = 0;
    for (const origin of legacyOrigins) {
      try {
        if (await browser.permissions.remove({ origins: [origin] })) removed += 1;
      } catch {
        // Best-effort migration only. A failed legacy cleanup must never revoke
        // or interfere with the one current all-websites grant.
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

