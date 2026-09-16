/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { SYNC_DATA_COLLECTION_TYPES } from "./constants.js";

/*
 * Firefox-default permission capabilities. Chrome overrides this module at
 * build time; browser-neutral Top Sites / web-origin policy stays in
 * permissions.js.
 */
export const TOP_SITES_REQUEST_UNAVAILABLE_MESSAGE = "Firefox could not request access to its New Tab shortcuts.";

export function requestSyncConsentFromGesture() {
  if (!browser.permissions?.request) {
    return Promise.reject(new Error("Firefox 140 or newer is required for MosaicSync's built-in Sync consent."));
  }
  // Keep this call synchronous with the user's click. Firefox only permits
  // permissions.request() while a user-gesture token is still active.
  return browser.permissions.request({ data_collection: [...SYNC_DATA_COLLECTION_TYPES] });
}

export async function removeSyncConsent() {
  if (!browser.permissions?.remove) return false;
  try {
    return await browser.permissions.remove({ data_collection: [...SYNC_DATA_COLLECTION_TYPES] });
  } catch {
    return false;
  }
}
