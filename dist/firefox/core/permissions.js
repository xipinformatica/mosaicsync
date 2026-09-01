/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Shared runtime permission policy. Gesture-sensitive browser capabilities
 * remain in permission-platform.js and are re-exported without adding an
 * asynchronous hop.
 */
import {
  TOP_SITES_REQUEST_UNAVAILABLE_MESSAGE,
  removeSyncConsent,
  requestSyncConsentFromGesture
} from "./permission-platform.js";

export { removeSyncConsent, requestSyncConsentFromGesture };

const TOP_SITES_PERMISSION = "topSites";
const WEB_ORIGINS = Object.freeze(["http://*/*", "https://*/*"]);

export function requestTopSitesPermissionFromGesture() {
  if (!browser.permissions?.request) {
    return Promise.reject(new Error(TOP_SITES_REQUEST_UNAVAILABLE_MESSAGE));
  }
  return browser.permissions.request({ permissions: [TOP_SITES_PERMISSION] });
}

export async function hasTopSitesPermission() {
  if (!browser.permissions?.contains) return false;
  return browser.permissions.contains({ permissions: [TOP_SITES_PERMISSION] });
}

export function permissionChangeAffectsTopSites(change) {
  return Array.isArray(change?.permissions) && change.permissions.includes(TOP_SITES_PERMISSION);
}

export function permissionChangeAffectsWebAccess(change) {
  const origins = Array.isArray(change?.origins) ? change.origins : [];
  return WEB_ORIGINS.some(origin => origins.includes(origin));
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
    // Only edit the permission set if the browser exposes the two current global
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
