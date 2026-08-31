/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Canonical visual contract shared by every MosaicSync startup accelerator.
 *
 * A first-paint cache is allowed to be incomplete, but it must never contradict
 * authoritative state. Fields set to null mean "this layer has no opinion" and
 * must preserve an already-painted truthful value until a newer/authoritative
 * layer can replace it.
 */
import "./http-url-safety.js";
import { RENDER_PREVIEW_MAX_CHARS, SPACE_IDS } from "./constants.js";

export const FIRST_PAINT_CONTRACT_VERSION = 1;

export function normalizeFirstPaintSpaceName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
}

export function sanitizeFirstPaintFrequentSnapshot(snapshot) {
  if (snapshot == null) return null;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const count = [3, 5, 8, 10].includes(Number(snapshot.count)) ? Number(snapshot.count) : 5;
  const enabled = snapshot.enabled === true;
  const sites = [];
  if (enabled && Array.isArray(snapshot.sites)) {
    for (const site of snapshot.sites.slice(0, 10)) {
      if (!site || typeof site !== "object") continue;
      const safeUrl = globalThis.__mosaicsyncSafeShortcutNavigationUrl?.(site.url) || "";
      if (!safeUrl) continue;
      const parsed = new URL(safeUrl);
      const title = String(site.title || parsed.hostname).trim().slice(0, 120);
      const host = String(site.host || parsed.hostname).trim().slice(0, 253);
      const favicon = typeof site.favicon === "string" && site.favicon.length <= RENDER_PREVIEW_MAX_CHARS &&
        /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/i.test(site.favicon)
        ? site.favicon
        : "";
      if (!title || !host) continue;
      sites.push({ title, host, url: safeUrl, favicon });
    }
  }
  return { enabled, count, sites };
}

export function createFirstPaintFrequentProjection(settings, frequentSnapshot = null) {
  const source = settings && typeof settings === "object" ? settings : {};
  const frequentCount = [3, 5, 8, 10].includes(Number(source.frequentlyVisitedCount))
    ? Number(source.frequentlyVisitedCount)
    : 5;
  const frequentEnabled = source.frequentlyVisitedEnabled === true;
  const sanitizedFrequent = sanitizeFirstPaintFrequentSnapshot(frequentSnapshot);
  // A disabled synchronized preference is authoritative enough to actively
  // clear an older visual snapshot. When the feature is enabled but no current
  // device-local Top Sites snapshot is available, null continues to mean
  // "preserve an already-painted truthful snapshot until a newer layer knows".
  return !frequentEnabled
    ? { enabled: false, count: frequentCount, sites: [] }
    : sanitizedFrequent
      ? { enabled: true, count: frequentCount, sites: sanitizedFrequent.sites.slice(0, frequentCount) }
      : null;
}

export function createFirstPaintContract(state, frequentSnapshot = null) {
  const personalSettings = state?.spaces?.personal?.settings || state?.settings || {};
  const spacesDisabled = personalSettings.multipleSpacesEnabled === false;
  const activeSpaceId = spacesDisabled
    ? "personal"
    : (SPACE_IDS.includes(state?.activeSpaceId) ? state.activeSpaceId : "personal");
  const frequent = createFirstPaintFrequentProjection(personalSettings, frequentSnapshot);
  return {
    version: FIRST_PAINT_CONTRACT_VERSION,
    activeSpaceId,
    multipleSpacesEnabled: !spacesDisabled,
    spaceNames: {
      personal: normalizeFirstPaintSpaceName(state?.spaces?.personal?.settings?.spaceName),
      work: normalizeFirstPaintSpaceName(state?.spaces?.work?.settings?.spaceName)
    },
    // Frequently Visited is global/device-local rather than a workspace field.
    // null explicitly means that this cache layer has no newer device-local site
    // list; false is an explicit synchronized preference and must clear stale UI.
    frequent
  };
}

export function isFirstPaintContractValid(value, { allowUnknownFrequent = true } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.version !== FIRST_PAINT_CONTRACT_VERSION) return false;
  if (!SPACE_IDS.includes(value.activeSpaceId)) return false;
  if (typeof value.multipleSpacesEnabled !== "boolean") return false;
  if (!value.spaceNames || typeof value.spaceNames !== "object" || Array.isArray(value.spaceNames)) return false;
  for (const id of SPACE_IDS) {
    const name = value.spaceNames[id];
    if (typeof name !== "string" || name.length > 32) return false;
  }
  if (value.frequent == null) return allowUnknownFrequent;
  const frequent = sanitizeFirstPaintFrequentSnapshot(value.frequent);
  if (!frequent) return false;
  return JSON.stringify(frequent) === JSON.stringify(value.frequent);
}
