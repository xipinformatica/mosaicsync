/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Cross-context optimistic concurrency helpers.
 *
 * New Tab pages keep an in-memory working copy for responsiveness. Two open
 * New Tabs can therefore mutate different records from the same persisted base
 * before storage.onChanged reaches the second page. These pure helpers rebase
 * only the caller's delta onto the latest persisted state, preserving unrelated
 * concurrent changes rather than replacing the whole workspace with stale data.
 */
import {
  chooseNewerRecord,
  flattenStateNormalized,
  makeSettingsRecordNormalized,
  makeTombstone,
  mergeSettingsRecords,
  normalizeState,
  normalizeWorkspace,
  replaceWorkspaceNormalized,
  selectActiveSpaceNormalized,
  stampSettingsMutationClocks,
  stateFromRecords,
  syncRecordEqual
} from "./model.js";
import { SPACE_IDS } from "./constants.js";

const ARTWORK_FIELDS = Object.freeze([
  "image",
  "localImageAssetId",
  "imageSyncData",
  "imageAssetId",
  "imageSyncKind",
  "imageSourceKind",
  "imageSourceUrl",
  "imageIsFallback"
]);

const BACKGROUND_ASSET_IDENTITY_FIELDS = Object.freeze([
  "backgroundImageKind",
  "backgroundAssetId",
  "backgroundSourceKind",
  "backgroundSourceUrl",
  "backgroundPreset"
]);

function jsonValueEqual(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return false;
  if (typeof left !== typeof right) return false;
  if (typeof left !== "object") return Number.isNaN(left) && Number.isNaN(right);
  const leftArray = Array.isArray(left);
  if (leftArray !== Array.isArray(right)) return false;
  if (leftArray) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonValueEqual(left[index], right[index])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || !jsonValueEqual(left[key], right[key])) return false;
  }
  return true;
}

/** Compare only the persisted workspace payload; activeSpaceId has its own key. */
export function persistedWorkspacePayloadEqual(left, right) {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Number(left.schemaVersion) !== Number(right.schemaVersion)) return false;
  for (const spaceId of SPACE_IDS) {
    if (!jsonValueEqual(left.spaces?.[spaceId], right.spaces?.[spaceId])) return false;
  }
  return true;
}

function workspaceAsState(workspace) {
  return normalizeState({
    shortcuts: workspace?.shortcuts || [],
    settings: workspace?.settings || {},
    settingsClock: workspace?.settingsClock || {},
    settingsModifiedAt: Number(workspace?.settingsModifiedAt) || 0,
    updatedAt: Number(workspace?.updatedAt) || 0
  });
}

function itemIndex(workspace) {
  const index = new Map();
  for (const item of workspace?.shortcuts || []) {
    if (!item || typeof item !== "object") continue;
    index.set(item.id, item);
    if (item.type === "folder") {
      for (const child of item.items || []) {
        if (child?.id) index.set(child.id, child);
      }
    }
  }
  return index;
}

function artworkChanged(baseItem, intendedItem) {
  if (!baseItem || !intendedItem) return baseItem !== intendedItem;
  return ARTWORK_FIELDS.some(key => baseItem[key] !== intendedItem[key]);
}

function copyArtwork(target, source) {
  if (!target || !source || target.type !== "shortcut" || source.type !== "shortcut") return;
  for (const key of ARTWORK_FIELDS) target[key] = source[key];
}

function applyShortcutArtwork(mergedWorkspace, { baseWorkspace, intendedWorkspace, latestWorkspace, intendedRecords, latestRecords, mergedRecords, deltaRecords, winnerSources }) {
  const baseItems = itemIndex(baseWorkspace);
  const intendedItems = itemIndex(intendedWorkspace);
  const latestItems = itemIndex(latestWorkspace);
  const mergedItems = itemIndex(mergedWorkspace);

  for (const [id, target] of mergedItems) {
    if (target?.type !== "shortcut") continue;
    const finalRecord = mergedRecords.get(id);
    if (!finalRecord || finalRecord.kind !== "shortcut") continue;

    const intendedItem = intendedItems.get(id);
    const latestItem = latestItems.get(id);
    const baseItem = baseItems.get(id);
    const intendedRecord = intendedRecords.get(id);
    const latestRecord = latestRecords.get(id);
    const deltaRecord = deltaRecords.get(id);
    const winnerSource = winnerSources.get(id) || "latest";

    const intendedArtworkChanged = intendedItem && artworkChanged(baseItem, intendedItem);
    const latestArtworkChanged = latestItem && artworkChanged(baseItem, latestItem);

    // Device-local artwork is an independent cache. If this mutation explicitly
    // changed it, keep that change whenever the merged shortcut still refers to
    // the same URL. This covers custom artwork and local favicon hydration.
    if (intendedArtworkChanged && intendedRecord && finalRecord.url === intendedRecord.url) {
      copyArtwork(target, intendedItem);
      continue;
    }

    // Conversely, a concurrent tab may have learned a favicon while this tab was
    // renaming/reordering the same shortcut. Preserve that newer local cache when
    // this mutation did not touch artwork and the URL did not change.
    if (latestArtworkChanged && latestRecord && finalRecord.url === latestRecord.url) {
      copyArtwork(target, latestItem);
      continue;
    }

    // No independent artwork mutation occurred. Follow whichever core record won.
    if (winnerSource === "intended" && deltaRecord?.kind === "shortcut" && intendedItem) {
      copyArtwork(target, intendedItem);
      continue;
    }
    if (latestItem && latestRecord && syncRecordEqual(finalRecord, latestRecord)) copyArtwork(target, latestItem);
  }
}

function localBackgroundChanged(baseSettings, intendedSettings) {
  return (baseSettings?.backgroundImage || "") !== (intendedSettings?.backgroundImage || "") ||
    (baseSettings?.backgroundLocalAssetId || "") !== (intendedSettings?.backgroundLocalAssetId || "");
}

function settingsFieldsMatch(leftRecord, rightRecord, fields) {
  const left = leftRecord?.settings || {};
  const right = rightRecord?.settings || {};
  return fields.every(key => jsonValueEqual(left[key], right[key]));
}

function rebaseWorkspace(baseWorkspace, intendedWorkspace, latestWorkspace) {
  const baseState = workspaceAsState(baseWorkspace);
  const intendedState = workspaceAsState(intendedWorkspace);
  const latestState = workspaceAsState(latestWorkspace);
  const baseRecords = flattenStateNormalized(baseState);
  const intendedRecords = flattenStateNormalized(intendedState);
  const latestRecords = flattenStateNormalized(latestState);
  const deltaRecords = new Map();

  for (const [id, record] of intendedRecords) {
    const previous = baseRecords.get(id);
    if (!previous || !syncRecordEqual(previous, record)) deltaRecords.set(id, record);
  }
  for (const [id, previous] of baseRecords) {
    if (intendedRecords.has(id)) continue;
    const deletionAt = Math.max(
      Number(intendedWorkspace?.updatedAt) || 0,
      (Number(previous?.modifiedAt) || 0) + 1
    );
    deltaRecords.set(id, makeTombstone(id, "", deletionAt));
  }

  const mergedRecords = new Map(latestRecords);
  const winnerSources = new Map();
  for (const [id, delta] of deltaRecords) {
    const latest = latestRecords.get(id);
    const winner = chooseNewerRecord(latest, delta);
    mergedRecords.set(id, winner);
    winnerSources.set(id, winner === delta ? "intended" : "latest");
  }

  const baseSettingsRecord = makeSettingsRecordNormalized(baseState);
  const intendedSettingsRecord = makeSettingsRecordNormalized(intendedState);
  const latestSettingsRecord = makeSettingsRecordNormalized(latestState);
  const mergedSettingsRecord = mergeSettingsRecords(latestSettingsRecord, intendedSettingsRecord);
  const intendedWinsConflict = chooseNewerRecord(latestSettingsRecord, intendedSettingsRecord) === intendedSettingsRecord;

  const reconstructed = stateFromRecords(mergedRecords, mergedSettingsRecord, {
    shortcuts: latestWorkspace?.shortcuts || [],
    settings: latestWorkspace?.settings || {},
    settingsClock: latestWorkspace?.settingsClock || {},
    settingsModifiedAt: Number(latestWorkspace?.settingsModifiedAt) || 0,
    updatedAt: Number(latestWorkspace?.updatedAt) || 0
  });
  const mergedWorkspace = reconstructed.spaces.personal;

  applyShortcutArtwork(mergedWorkspace, {
    baseWorkspace,
    intendedWorkspace,
    latestWorkspace,
    intendedRecords,
    latestRecords,
    mergedRecords,
    deltaRecords,
    winnerSources
  });

  const baseSettings = baseWorkspace?.settings || {};
  const intendedSettings = intendedWorkspace?.settings || {};
  const latestSettings = latestWorkspace?.settings || {};
  const finalSettings = mergedWorkspace.settings;

  // Browser-local preferences are independent of synchronized settings. If this
  // mutation changed them, keep that explicit local action even when another tab
  // concurrently changed a different visual setting.
  if (baseSettings.autoSiteIcons !== intendedSettings.autoSiteIcons) {
    finalSettings.autoSiteIcons = intendedSettings.autoSiteIcons !== false;
  } else {
    finalSettings.autoSiteIcons = latestSettings.autoSiteIcons !== false;
  }
  if (baseSettings.webAccessPrompted !== intendedSettings.webAccessPrompted) {
    finalSettings.webAccessPrompted = intendedSettings.webAccessPrompted === true;
  } else {
    finalSettings.webAccessPrompted = latestSettings.webAccessPrompted === true;
  }

  // Wallpaper pixels are device-local. Carry the intended pixels/reference only
  // if the final core settings still describe the intended wallpaper; otherwise
  // retain the latest tab's local pixels for the core settings that won.
  const intendedBackgroundChanged = localBackgroundChanged(baseSettings, intendedSettings);
  const latestBackgroundChanged = localBackgroundChanged(baseSettings, latestSettings);
  const finalMatchesIntendedBackground = settingsFieldsMatch(mergedSettingsRecord, intendedSettingsRecord, BACKGROUND_ASSET_IDENTITY_FIELDS);
  let backgroundSource = latestSettings;
  if (intendedBackgroundChanged && latestBackgroundChanged) {
    backgroundSource = intendedWinsConflict ? intendedSettings : latestSettings;
  } else if (intendedBackgroundChanged && finalMatchesIntendedBackground) {
    backgroundSource = intendedSettings;
  } else if (settingsFieldsMatch(mergedSettingsRecord, intendedSettingsRecord, BACKGROUND_ASSET_IDENTITY_FIELDS) &&
      !settingsFieldsMatch(baseSettingsRecord, intendedSettingsRecord, BACKGROUND_ASSET_IDENTITY_FIELDS)) {
    // An intended preset/source change may deliberately clear device-local bytes.
    backgroundSource = intendedSettings;
  }
  finalSettings.backgroundImage = backgroundSource.backgroundImage || "";
  finalSettings.backgroundLocalAssetId = backgroundSource.backgroundLocalAssetId || "";

  return normalizeWorkspace(mergedWorkspace);
}

/**
 * Rebase the mutation represented by base -> intended onto latest persisted data.
 * Unrelated concurrent additions/edits survive; same-record conflicts use the
 * exact deterministic record semantics already used by MosaicSync Sync.
 */
export function rebaseConcurrentState(baseState, intendedState, latestState) {
  const base = normalizeState(baseState);
  const intended = stampSettingsMutationClocks(base, normalizeState(intendedState));
  const latest = stampSettingsMutationClocks(base, normalizeState(latestState));

  let merged = latest;
  for (const spaceId of SPACE_IDS) {
    const workspace = rebaseWorkspace(base.spaces[spaceId], intended.spaces[spaceId], latest.spaces[spaceId]);
    merged = replaceWorkspaceNormalized(merged, spaceId, workspace);
  }

  return selectActiveSpaceNormalized(merged, intended.activeSpaceId);
}
