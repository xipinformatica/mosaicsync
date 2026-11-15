/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { DEFAULT_STATE } from "../core/constants.js";

export function synchronizedFrequentlyVisitedSettings(currentState) {
  // Frequently Visited is a global MosaicSync presentation preference rather
  // than a Space-specific browser-history dataset. Personal is the canonical
  // synchronized home for the preference; both workspaces are kept mirrored
  // when a current client changes it so rolling-version devices converge.
  const settings = currentState?.spaces?.personal?.settings || currentState?.settings || DEFAULT_STATE.settings;
  const count = Number(settings?.frequentlyVisitedCount);
  return {
    enabled: settings?.frequentlyVisitedEnabled === true,
    count: [3, 5, 8, 10].includes(count) ? count : 5
  };
}
