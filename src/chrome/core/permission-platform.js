/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/* Chrome-only permission capabilities; common permission policy is shared. */
export const TOP_SITES_REQUEST_UNAVAILABLE_MESSAGE = "MosaicSync could not request access to browser top sites.";

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
