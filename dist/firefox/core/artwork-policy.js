/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure artwork ownership/provenance policy.
 *
 * Keep these decisions browser-neutral. New Tab and the background resolver
 * both acquire device-local favicon pixels, but neither should independently
 * redefine which sources are acceptable, which learned sources are refreshable,
 * or when user-owned provenance must win over an automatic fallback.
 */
import { parseImageDataUrl } from "./image-data.js";

const AUTOMATIC_ARTWORK_SOURCE_KINDS = new Set(["favicon", "firefox"]);

export function isAcceptedRasterArtworkDataUrl(value) {
  return Boolean(parseImageDataUrl(value));
}

export function isAutomaticArtworkSourceKind(value) {
  return AUTOMATIC_ARTWORK_SOURCE_KINDS.has(String(value || "none"));
}

export function isDeviceUploadArtworkFallback(shortcut) {
  return Boolean(shortcut) && shortcut.imageSourceKind === "upload" && shortcut.imageSyncKind === "device";
}

export function hasSiteDiscoveredArtwork(shortcut) {
  return Boolean(shortcut?.image) && shortcut.imageSourceKind === "favicon";
}

/**
 * Whether browser-native/history favicon pixels may fill the shortcut now.
 * Site-discovered artwork is deliberately stronger than the browser fallback.
 */
export function browserNativeFaviconFallbackNeeded(shortcut) {
  if (!shortcut || shortcut.builtinIcon) return false;
  const sourceKind = shortcut.imageSourceKind || "none";
  if (hasSiteDiscoveredArtwork(shortcut)) return false;
  if (sourceKind === "firefox" || sourceKind === "none") return !shortcut.image;
  return !shortcut.image && isDeviceUploadArtworkFallback(shortcut);
}

/**
 * True when the current image is automatically learned, device-local artwork.
 */
export function automaticFaviconArtwork(shortcut) {
  return Boolean(shortcut?.image) && shortcut.imageSyncKind === "device" &&
    isAutomaticArtworkSourceKind(shortcut.imageSourceKind) && /^https?:/i.test(shortcut.url || "");
}

/**
 * Learned site discovery outranks browser-native/history fallback. Re-evaluate
 * this at commit time because a stronger image may have arrived while an async
 * native-cache lookup was in flight.
 */
export function learnedArtworkMayReplace(shortcut, { sourceKind = "favicon" } = {}) {
  if (String(sourceKind || "none") !== "firefox") return true;
  if (shortcut && !shortcut.builtinIcon && shortcut.imageSourceKind === "firefox") return true;
  return browserNativeFaviconFallbackNeeded(shortcut);
}

/**
 * Whether network/site favicon recovery should run for a shortcut. Existing
 * browser-native artwork remains refreshable; complete site-discovered artwork
 * does not need an ordinary recovery pass. An explicit manual favicon preference
 * may opt into recovery independently of the current automatic source.
 */
export function shortcutNeedsProactiveFavicon(shortcut, { manualPreferencePending = false } = {}) {
  if (!shortcut || shortcut.type !== "shortcut" || shortcut.builtinIcon || !/^https?:/i.test(shortcut.url || "")) return false;
  if (manualPreferencePending) return true;
  const sourceKind = shortcut.imageSourceKind || "none";
  if (sourceKind === "firefox") return true;
  if (sourceKind === "favicon" || sourceKind === "none") return !shortcut.image;
  return !shortcut.image && isDeviceUploadArtworkFallback(shortcut);
}

/**
 * Resolve provenance fields when learned pixels are applied. A device-only
 * custom upload may temporarily display learned pixels as a fallback, but its
 * explicit user provenance must remain intact so automatic learning cannot
 * silently turn user artwork into browser/site-owned artwork.
 */
export function learnedArtworkDisposition(shortcut, { sourceKind = "favicon", sourceUrl = "" } = {}) {
  const preservesUserProvenance = isDeviceUploadArtworkFallback(shortcut);
  return {
    imageSourceKind: preservesUserProvenance ? shortcut.imageSourceKind : String(sourceKind || "none"),
    imageSourceUrl: preservesUserProvenance ? String(shortcut.imageSourceUrl || "") : String(sourceUrl || ""),
    imageIsFallback: preservesUserProvenance,
    preservesUserProvenance
  };
}
