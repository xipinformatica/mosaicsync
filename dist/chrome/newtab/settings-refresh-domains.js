/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { SPACE_IDS } from "../core/constants.js";
import { synchronizedFrequentlyVisitedSettings } from "./frequently-visited-preference.js";
export { synchronizedFrequentlyVisitedSettings } from "./frequently-visited-preference.js";

// Pure presentation-domain decisions. This module must not access DOM,
// browser storage, or the page controller's mutable state. Callers supply
// both normalized snapshots and retain ownership of actual UI updates.
export const SETTINGS_REFRESH_KEYS = Object.freeze({
  grid: Object.freeze(["columns", "rows", "tileSize"]),
  theme: Object.freeze(["theme"]),
  background: Object.freeze([
    "backgroundColor", "backgroundColorCustomized", "backgroundPreset", "backgroundSourceKind",
    "backgroundSourceUrl", "backgroundImage", "backgroundDim", "themeWallpapersEnabled",
    "lightBackgroundPreset", "darkBackgroundPreset", "lightBackgroundDim", "darkBackgroundDim"
  ]),
  autoIcons: Object.freeze(["autoSiteIcons"])
});

function settingsKeysChanged(previousSettings, nextSettings, keys) {
  for (const key of keys) {
    if (!Object.is(previousSettings?.[key], nextSettings?.[key])) return true;
  }
  return false;
}

function spacesSettingsChanged(previousState, nextState) {
  for (const spaceId of SPACE_IDS) {
    const before = previousState?.spaces?.[spaceId]?.settings || {};
    const after = nextState?.spaces?.[spaceId]?.settings || {};
    if (!Object.is(before.multipleSpacesEnabled, after.multipleSpacesEnabled) ||
        !Object.is(before.spaceName, after.spaceName)) return true;
  }
  return false;
}

export function settingsRefreshDomains(previousState, nextState) {
  if (!previousState || !nextState) return new Set(["grid", "theme", "spaces", "frequent", "background", "autoIcons"]);
  if (previousState.activeSpaceId !== nextState.activeSpaceId) {
    return new Set(["grid", "theme", "spaces", "frequent", "background", "autoIcons"]);
  }
  const previousSettings = previousState.settings || {};
  const nextSettings = nextState.settings || {};
  const domains = new Set();
  if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.grid)) domains.add("grid");
  if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.theme)) domains.add("theme");
  if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.background)) domains.add("background");
  if (settingsKeysChanged(previousSettings, nextSettings, SETTINGS_REFRESH_KEYS.autoIcons)) domains.add("autoIcons");
  if (spacesSettingsChanged(previousState, nextState)) domains.add("spaces");
  const beforeFrequent = synchronizedFrequentlyVisitedSettings(previousState);
  const afterFrequent = synchronizedFrequentlyVisitedSettings(nextState);
  if (beforeFrequent.enabled !== afterFrequent.enabled || beforeFrequent.count !== afterFrequent.count) domains.add("frequent");
  return domains;
}
