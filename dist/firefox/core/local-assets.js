/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser-neutral local asset projection.
 *
 * MosaicSync's runtime state keeps convenient data URLs for rendering, while
 * storage.local persists the heavy pixels once under content-addressed keys.
 * The compact state stores only references. This module is deliberately free of
 * browser APIs so profile backup/import can use exactly the same representation.
 */
import { DEFAULT_SPACE_ID, SPACE_IDS } from "./constants.js";
import { assetIdForDataUrl } from "./model.js";
import { parseImageDataUrl } from "./image-data.js";

const LOCAL_ASSET_ID_RE = /^a[0-9a-z]+-[0-9a-z]+$/;
const LOCAL_ASSET_ID_MAX_CHARS = 64;
export const LOCAL_ASSET_COLLISION_ERROR_CODE = "LOCAL_ASSET_COLLISION";

function storeProjectedAsset(assets, assetId, dataUrl) {
  const existing = assets.get(assetId);
  if (existing !== undefined && existing !== dataUrl) {
    const error = new Error();
    error.code = LOCAL_ASSET_COLLISION_ERROR_CODE;
    throw error;
  }
  assets.set(assetId, dataUrl);
}

export function isLocalAssetId(value) {
  return typeof value === "string" && value.length <= LOCAL_ASSET_ID_MAX_CHARS && LOCAL_ASSET_ID_RE.test(value);
}

export function validateLocalAsset(id, dataUrl) {
  return isLocalAssetId(id) && typeof dataUrl === "string" && Boolean(parseImageDataUrl(dataUrl)) && assetIdForDataUrl(dataUrl) === id;
}

function projectShortcut(item, assets, referencedIds, memo = null) {
  if (!item || typeof item !== "object") return item;
  if (item.type === "folder") {
    const sourceItems = Array.isArray(item.items) ? item.items : [];
    let changed = false;
    const items = sourceItems.map(child => {
      const projected = projectShortcut(child, assets, referencedIds, memo);
      if (projected !== child) changed = true;
      return projected;
    });
    return changed ? { ...item, items } : item;
  }

  const dataUrl = typeof item.image === "string" && item.image ? item.image : "";
  const existingId = isLocalAssetId(item.localImageAssetId) ? item.localImageAssetId : "";
  // Content-addressed assets are immutable. If fresh pixels are present, their
  // hash is authoritative; never pin a replacement favicon to the previous ID.
  const assetId = dataUrl ? assetIdForDataUrl(dataUrl, memo) : existingId;
  if (assetId && dataUrl) storeProjectedAsset(assets, assetId, dataUrl);
  if (assetId) referencedIds.add(assetId);
  if (!dataUrl && item.image === "" && item.localImageAssetId === assetId) return item;
  return { ...item, image: "", localImageAssetId: assetId };
}

function projectWorkspace(workspace, assets, referencedIds, memo = null) {
  const source = workspace && typeof workspace === "object" ? workspace : {};
  const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
  const backgroundData = typeof settings.backgroundImage === "string" && settings.backgroundImage ? settings.backgroundImage : "";
  const existingBackgroundId = isLocalAssetId(settings.backgroundLocalAssetId) ? settings.backgroundLocalAssetId : "";
  const backgroundAssetId = existingBackgroundId || (backgroundData ? assetIdForDataUrl(backgroundData, memo) : "");
  if (backgroundAssetId && backgroundData) storeProjectedAsset(assets, backgroundAssetId, backgroundData);
  if (backgroundAssetId) referencedIds.add(backgroundAssetId);

  const sourceShortcuts = Array.isArray(source.shortcuts) ? source.shortcuts : [];
  let shortcutsChanged = false;
  const shortcuts = sourceShortcuts.map(item => {
    const projected = projectShortcut(item, assets, referencedIds, memo);
    if (projected !== item) shortcutsChanged = true;
    return projected;
  });
  const settingsChanged = Boolean(backgroundData) || settings.backgroundImage !== "" || settings.backgroundLocalAssetId !== backgroundAssetId;
  const projectedSettings = settingsChanged ? { ...settings, backgroundImage: "", backgroundLocalAssetId: backgroundAssetId } : settings;

  if (!shortcutsChanged && projectedSettings === settings && Array.isArray(source.shortcuts)) return source;
  return {
    shortcuts,
    settings: projectedSettings,
    settingsModifiedAt: Number(source.settingsModifiedAt) || 0,
    updatedAt: Number(source.updatedAt) || 0
  };
}

export function projectStateToLocalAssets(state, memo = null) {
  const source = state && typeof state === "object" ? state : {};
  const assets = new Map();
  const referencedIds = new Set();
  const spaces = {};
  for (const spaceId of SPACE_IDS) {
    spaces[spaceId] = projectWorkspace(source.spaces?.[spaceId], assets, referencedIds, memo);
  }
  return {
    state: {
      schemaVersion: Number(source.schemaVersion) || 0,
      activeSpaceId: SPACE_IDS.includes(source.activeSpaceId) ? source.activeSpaceId : DEFAULT_SPACE_ID,
      spaces
    },
    assets,
    referencedIds
  };
}

function collectShortcutRefs(item, ids) {
  if (!item || typeof item !== "object") return;
  if (item.type === "folder") {
    for (const child of item.items || []) collectShortcutRefs(child, ids);
    return;
  }
  if (isLocalAssetId(item.localImageAssetId)) ids.add(item.localImageAssetId);
}

export function collectStateLocalAssetIds(state, { spaceIds = SPACE_IDS } = {}) {
  const ids = new Set();
  for (const spaceId of spaceIds) {
    const workspace = state?.spaces?.[spaceId];
    if (!workspace || typeof workspace !== "object") continue;
    for (const item of workspace.shortcuts || []) collectShortcutRefs(item, ids);
    if (isLocalAssetId(workspace.settings?.backgroundLocalAssetId)) ids.add(workspace.settings.backgroundLocalAssetId);
  }
  return ids;
}

function hydrateShortcut(item, assets) {
  if (!item || typeof item !== "object") return item;
  if (item.type === "folder") {
    const sourceItems = Array.isArray(item.items) ? item.items : [];
    let changed = false;
    const items = sourceItems.map(child => {
      const hydrated = hydrateShortcut(child, assets);
      if (hydrated !== child) changed = true;
      return hydrated;
    });
    return changed ? { ...item, items } : item;
  }
  const assetId = isLocalAssetId(item.localImageAssetId) ? item.localImageAssetId : "";
  const asset = assetId ? assets.get(assetId) : "";
  const image = asset || (typeof item.image === "string" ? item.image : "");
  return image === item.image ? item : { ...item, image };
}

function hydrateWorkspace(workspace, assets) {
  if (!workspace || typeof workspace !== "object") return workspace;
  const settings = workspace.settings && typeof workspace.settings === "object" ? workspace.settings : {};
  const assetId = isLocalAssetId(settings.backgroundLocalAssetId) ? settings.backgroundLocalAssetId : "";
  const backgroundAsset = assetId ? assets.get(assetId) : "";
  const backgroundImage = backgroundAsset || (typeof settings.backgroundImage === "string" ? settings.backgroundImage : "");

  const sourceShortcuts = Array.isArray(workspace.shortcuts) ? workspace.shortcuts : [];
  let shortcutsChanged = false;
  const shortcuts = sourceShortcuts.map(item => {
    const hydrated = hydrateShortcut(item, assets);
    if (hydrated !== item) shortcutsChanged = true;
    return hydrated;
  });
  const settingsChanged = backgroundImage !== settings.backgroundImage;
  if (!shortcutsChanged && !settingsChanged) return workspace;
  return {
    ...workspace,
    shortcuts: shortcutsChanged ? shortcuts : sourceShortcuts,
    settings: settingsChanged ? { ...settings, backgroundImage } : settings
  };
}

export function hydrateStateLocalAssets(state, assets, { spaceIds = SPACE_IDS } = {}) {
  const source = state && typeof state === "object" ? state : {};
  const targetIds = new Set(spaceIds.filter(id => SPACE_IDS.includes(id)));
  let spaces = source.spaces || {};
  let changed = false;
  for (const spaceId of SPACE_IDS) {
    if (!targetIds.has(spaceId)) continue;
    const current = source.spaces?.[spaceId];
    const hydrated = hydrateWorkspace(current, assets);
    if (hydrated === current) continue;
    if (!changed) spaces = { ...spaces };
    spaces[spaceId] = hydrated;
    changed = true;
  }
  return changed ? { ...source, spaces } : source;
}


function dehydrateShortcut(item) {
  if (!item || typeof item !== "object") return item;
  if (item.type === "folder") {
    const sourceItems = Array.isArray(item.items) ? item.items : [];
    let changed = false;
    const items = sourceItems.map(child => {
      const dehydrated = dehydrateShortcut(child);
      if (dehydrated !== child) changed = true;
      return dehydrated;
    });
    return changed ? { ...item, items } : item;
  }
  return isLocalAssetId(item.localImageAssetId) && item.image ? { ...item, image: "" } : item;
}

export function dehydrateStateLocalAssets(state, { spaceIds = SPACE_IDS } = {}) {
  const source = state && typeof state === "object" ? state : {};
  const targetIds = new Set(spaceIds.filter(id => SPACE_IDS.includes(id)));
  let spaces = source.spaces || {};
  let changed = false;
  for (const spaceId of SPACE_IDS) {
    if (!targetIds.has(spaceId)) continue;
    const workspace = source.spaces?.[spaceId];
    if (!workspace || typeof workspace !== "object") continue;
    const settings = workspace.settings && typeof workspace.settings === "object" ? workspace.settings : {};
    const sourceShortcuts = Array.isArray(workspace.shortcuts) ? workspace.shortcuts : [];
    let shortcutsChanged = false;
    const shortcuts = sourceShortcuts.map(item => {
      const dehydrated = dehydrateShortcut(item);
      if (dehydrated !== item) shortcutsChanged = true;
      return dehydrated;
    });
    const settingsChanged = isLocalAssetId(settings.backgroundLocalAssetId) && Boolean(settings.backgroundImage);
    if (!shortcutsChanged && !settingsChanged) continue;
    if (!changed) spaces = { ...spaces };
    spaces[spaceId] = {
      ...workspace,
      shortcuts: shortcutsChanged ? shortcuts : sourceShortcuts,
      settings: settingsChanged ? { ...settings, backgroundImage: "" } : settings
    };
    changed = true;
  }
  if (!changed) return source;
  const result = { ...source, spaces };
  if (targetIds.has(source.activeSpaceId) && spaces[source.activeSpaceId]) {
    const active = spaces[source.activeSpaceId];
    result.shortcuts = active.shortcuts;
    result.settings = active.settings;
    result.settingsModifiedAt = active.settingsModifiedAt;
    result.updatedAt = active.updatedAt;
  }
  return result;
}

function shortcutHasInlineAsset(item) {
  if (!item || typeof item !== "object") return false;
  if (item.type === "folder") return (item.items || []).some(shortcutHasInlineAsset);
  return typeof item.image === "string" && item.image.startsWith("data:image/");
}

export function stateHasInlineLocalAssets(state) {
  for (const spaceId of SPACE_IDS) {
    const workspace = state?.spaces?.[spaceId];
    if (!workspace) continue;
    if ((workspace.shortcuts || []).some(shortcutHasInlineAsset)) return true;
    if (typeof workspace.settings?.backgroundImage === "string" && workspace.settings.backgroundImage.startsWith("data:image/")) return true;
  }
  // Pre-Spaces states can still have their active workspace at top level.
  if ((state?.shortcuts || []).some(shortcutHasInlineAsset)) return true;
  return typeof state?.settings?.backgroundImage === "string" && state.settings.backgroundImage.startsWith("data:image/");
}
