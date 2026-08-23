/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Firefox-native New Tab importer.
 * Import is replacement-only to avoid mixing stale MosaicSync and native shortcut sets.
 */
import { DEFAULT_SETTINGS } from "./constants.js";
import { hostLabel, now, uid } from "./model.js";
import { optimizeImageDataUrl } from "./image-optimizer.js";
import { getNativeTopSites, readNativeFaviconDataUrl } from "./platform.js";

export const FIREFOX_NATIVE_COLUMNS = 8;
export const FIREFOX_NATIVE_MAX_SHORTCUTS = 32;

export async function fetchFirefoxShortcuts(limit = FIREFOX_NATIVE_MAX_SHORTCUTS) {
  const requested = Math.max(1, Math.min(FIREFOX_NATIVE_MAX_SHORTCUTS, Number(limit) || FIREFOX_NATIVE_MAX_SHORTCUTS));
  // The platform adapter returns the browser's native ordered New Tab/top-sites list.
  const sites = await getNativeTopSites({ limit: requested });

  if (!Array.isArray(sites)) return [];
  const timestamp = now();
  return sites
    .filter(site => site?.url && /^https?:/i.test(site.url))
    .slice(0, requested)
    .map((site, index) => ({
      type: "shortcut",
      id: uid("shortcut"),
      title: (site.title || hostLabel(site.url)).trim(),
      url: site.url,
      // Firefox already owns this favicon cache. Preserve the exact bytes it
      // returns instead of recompressing them and degrading small logos. These
      // pixels are device-local and never enter MosaicSync's Sync asset budget.
      image: site.favicon?.startsWith("data:image/") ? site.favicon : "",
      imageSyncKind: site.favicon?.startsWith("data:image/") ? "device" : "none",
      imageSourceKind: site.favicon?.startsWith("data:image/") ? "firefox" : "none",
      imageSourceUrl: "",
      imageStyle: "contain",
      position: index,
      createdAt: timestamp,
      modifiedAt: timestamp,
      source: "firefox-import"
    }));
}

/**
 * Replace the MosaicSync top-level layout with Firefox's current native New Tab
 * shortcuts. Replacement is deliberate: merging an import into stale/synced
 * MosaicSync state can create mixed/duplicated grids, so import is replacement-only.
 */
export function replaceWithFirefoxShortcuts(state, imported) {
  const list = Array.isArray(imported) ? imported : [];
  state.shortcuts = list.map((item, index) => ({ ...item, position: index }));
  // Keep the full MosaicSync canvas visible. Import only populates the slots
  // Firefox actually returns; intentionally empty rows remain empty.
  state.settings.columns = FIREFOX_NATIVE_COLUMNS;
  state.settings.rows = DEFAULT_SETTINGS.rows;
  return state.shortcuts.length;
}

async function normalizeImportedFavicon(image) {
  if (typeof image !== "string" || !image.startsWith("data:image/") || image.length <= 22_000) return image || "";
  try {
    return await optimizeImageDataUrl(image, {
      maxWidth: 192, maxHeight: 192, minWidth: 64, minHeight: 64,
      targetBytes: 16_000, maxInputBytes: 1_000_000, initialQuality: 0.90
    });
  } catch {
    return image;
  }
}

/**
 * Normalize browser-provided favicons for the local render cache. Compact icons
 * are preserved byte-for-byte; only oversized cache entries are downscaled so
 * they can participate in MosaicSync's fast session snapshot.
 */
export async function prepareFirefoxShortcutFavicons(shortcuts) {
  if (!Array.isArray(shortcuts)) return [];
  // If the native list did not include favicon bytes (Chrome), resolve them from
  // the browser-local favicon cache with modest concurrency. These pixels never enter Sync.
  const pending = shortcuts.filter(shortcut => shortcut && typeof shortcut === "object");
  let cursor = 0;
  const workers = Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (cursor < pending.length) {
      const shortcut = pending[cursor++];
      if (!shortcut.image) shortcut.image = await readNativeFaviconDataUrl(shortcut.url, 128);
      shortcut.image = await normalizeImportedFavicon(shortcut.image);
      shortcut.imageAssetId = "";
      shortcut.imageSyncKind = shortcut.image ? "device" : "none";
      if (shortcut.image && shortcut.imageSourceKind === "none") shortcut.imageSourceKind = "firefox";
    }
  });
  await Promise.all(workers);
  return shortcuts;
}

