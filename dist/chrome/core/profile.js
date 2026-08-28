/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser-neutral MosaicSync profile backup format.
 *
 * Format v2 mirrors the 1.24.6 content-addressed local asset store: profile
 * structure is compact and heavy image bytes are deduplicated in `assets`.
 * Format v1 remains importable for backwards compatibility.
 */
import { PRODUCT_NAME, VERSION } from "./constants.js";
import { ERROR_CODES, codedError } from "./errors.js";
import { normalizeState, repairWorkspaceRecordIdsNormalized, stableStringify } from "./model.js";
import {
  collectStateLocalAssetIds,
  hydrateStateLocalAssets,
  projectStateToLocalAssets,
  validateLocalAsset
} from "./local-assets.js";

export const PROFILE_FORMAT = "mosaicsync-profile";
export const PROFILE_FORMAT_VERSION = 2;
export const PROFILE_FILE_EXTENSION = ".mosaicsync";

// This is deliberately an abuse/OOM ceiling, not a normal profile quota.
// MosaicSync profiles remain file-backed and independent of Firefox/Chrome Sync
// storage limits; the high ceiling only prevents JSON.parse from accepting an
// absurdly large hostile file before any structural validation can run.
export const PROFILE_IMPORT_MAX_CHARS = 256 * 1024 * 1024;
// File.size is measured in bytes. Keep the pre-read ceiling at the same abuse
// boundary so a hostile file is rejected before Blob/File.text() can allocate it.
export const PROFILE_IMPORT_MAX_BYTES = PROFILE_IMPORT_MAX_CHARS;

const encoder = new TextEncoder();

export function isProfileImportTextLengthAllowed(length) {
  return Number.isFinite(Number(length)) && Number(length) >= 0 && Number(length) <= PROFILE_IMPORT_MAX_CHARS;
}

export function isProfileImportFileSizeAllowed(size) {
  return Number.isFinite(Number(size)) && Number(size) >= 0 && Number(size) <= PROFILE_IMPORT_MAX_BYTES;
}

export async function readProfileImportText(file) {
  const size = Number(file?.size);
  if (!Number.isFinite(size) || size < 0 || typeof file?.text !== "function") {
    throw codedError(ERROR_CODES.PROFILE_INVALID_FILE, "The selected file is not valid MosaicSync profile data.");
  }
  if (!isProfileImportFileSizeAllowed(size)) {
    throw codedError(ERROR_CODES.PROFILE_TOO_LARGE, "The selected MosaicSync profile is too large to import.");
  }
  return file.text();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}


function repairProfileRecordIds(state) {
  const normalized = normalizeState(state);
  const used = new Set();
  const spaces = {};
  for (const spaceId of ["personal", "work"]) {
    spaces[spaceId] = repairWorkspaceRecordIdsNormalized(normalized.spaces?.[spaceId], used);
  }
  const active = spaces[normalized.activeSpaceId] || spaces.personal;
  return {
    ...normalized,
    spaces,
    shortcuts: active.shortcuts,
    settings: active.settings,
    settingsClock: active.settingsClock,
    settingsModifiedAt: active.settingsModifiedAt,
    updatedAt: active.updatedAt
  };
}

function normalizePreferences(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const uiLocale = typeof source.uiLocale === "string" && source.uiLocale.length <= 32
    ? source.uiLocale
    : "auto";
  const frequentCount = Number(source.frequentlyVisitedCount);
  return {
    uiLocale,
    frequentlyVisitedEnabled: source.frequentlyVisitedEnabled === true,
    frequentlyVisitedCount: [3, 5, 8, 10].includes(frequentCount) ? frequentCount : 5
  };
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) throw codedError(ERROR_CODES.PROFILE_UNSUPPORTED_CRYPTO, "This browser cannot verify MosaicSync profile integrity.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalProfileV2(state) {
  const normalized = repairProfileRecordIds(state);
  const projection = projectStateToLocalAssets(normalized);
  const missing = [...projection.referencedIds].filter(assetId => !projection.assets.has(assetId));
  if (missing.length) throw codedError(ERROR_CODES.PROFILE_ASSETS_INCOMPLETE, "MosaicSync profile assets are not fully materialized.");
  return {
    state: cloneJson(projection.state),
    assets: Object.fromEntries([...projection.assets.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

function packageBody({ state, preferences, exportedAt }) {
  const projected = canonicalProfileV2(state);
  return {
    format: PROFILE_FORMAT,
    formatVersion: PROFILE_FORMAT_VERSION,
    application: {
      name: PRODUCT_NAME,
      version: VERSION
    },
    exportedAt: Number.isFinite(exportedAt) ? Math.max(0, Math.trunc(exportedAt)) : Date.now(),
    profile: {
      state: projected.state,
      assets: projected.assets,
      preferences: normalizePreferences(preferences)
    }
  };
}

export async function createProfilePackage(state, preferences = {}) {
  const body = packageBody({ state, preferences, exportedAt: Date.now() });
  const checksum = await sha256Hex(stableStringify(body));
  return {
    ...body,
    integrity: {
      algorithm: "SHA-256",
      value: checksum
    }
  };
}

export function serializeProfilePackage(profilePackage) {
  return `${JSON.stringify(profilePackage)}\n`;
}

function assertPackageShape(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw codedError(ERROR_CODES.PROFILE_INVALID_FILE, "This is not a MosaicSync profile file.");
  if (raw.format !== PROFILE_FORMAT) throw codedError(ERROR_CODES.PROFILE_INVALID_FILE, "This is not a MosaicSync profile file.");
  const version = Number(raw.formatVersion);
  if (!Number.isInteger(version) || version < 1) throw codedError(ERROR_CODES.PROFILE_INVALID_FORMAT, "The MosaicSync profile format is invalid.");
  if (version > PROFILE_FORMAT_VERSION) {
    throw codedError(ERROR_CODES.PROFILE_NEWER_VERSION, "This profile was created by a newer MosaicSync version. Update MosaicSync before importing it.");
  }
  if (!raw.profile || typeof raw.profile !== "object" || !raw.profile.state || typeof raw.profile.state !== "object") {
    throw codedError(ERROR_CODES.PROFILE_INVALID_STATE, "The MosaicSync profile does not contain a valid profile state.");
  }
  if (raw.integrity?.algorithm !== "SHA-256" || !/^[0-9a-f]{64}$/i.test(String(raw.integrity?.value || ""))) {
    throw codedError(ERROR_CODES.PROFILE_INVALID_INTEGRITY, "The MosaicSync profile integrity information is missing or invalid.");
  }
}

function assertV2AssetEnvelope(profile) {
  const rawAssets = profile?.assets && typeof profile.assets === "object" && !Array.isArray(profile.assets)
    ? profile.assets
    : {};
  const referenced = collectStateLocalAssetIds(profile?.state, { spaceIds: ["personal", "work"] });
  const assetIds = Object.keys(rawAssets);

  // A valid v2 export contains exactly the assets referenced by its compact
  // state. Reject extras before hashing/decoding their image payloads: an
  // attacker can construct a checksum-valid file, so integrity alone must not
  // turn unused giant assets into avoidable CPU/memory work during import.
  if (assetIds.length !== referenced.size) {
    throw codedError(ERROR_CODES.PROFILE_DAMAGED, "This MosaicSync profile is damaged or has been modified.");
  }
  for (const assetId of assetIds) {
    if (!referenced.has(assetId)) {
      throw codedError(ERROR_CODES.PROFILE_DAMAGED, "This MosaicSync profile is damaged or has been modified.");
    }
  }
  return { rawAssets, referenced };
}

function parseV2State(profile, envelope = null) {
  const { rawAssets, referenced } = envelope || assertV2AssetEnvelope(profile);
  const assets = new Map();
  for (const assetId of referenced) {
    const dataUrl = rawAssets[assetId];
    if (!validateLocalAsset(assetId, dataUrl)) {
      throw codedError(ERROR_CODES.PROFILE_DAMAGED, "This MosaicSync profile is damaged or has been modified.");
    }
    assets.set(assetId, dataUrl);
  }
  const hydrated = hydrateStateLocalAssets(profile.state, assets, { spaceIds: ["personal", "work"] });
  return repairProfileRecordIds(hydrated);
}

export async function parseProfilePackage(text) {
  const sourceText = String(text || "");
  if (!isProfileImportTextLengthAllowed(sourceText.length)) {
    throw codedError(ERROR_CODES.PROFILE_INVALID_FILE, "The selected file is not valid MosaicSync profile data.");
  }
  let raw;
  try {
    raw = JSON.parse(sourceText);
  } catch {
    throw codedError(ERROR_CODES.PROFILE_INVALID_FILE, "The selected file is not valid MosaicSync profile data.");
  }
  assertPackageShape(raw);
  const version = Number(raw.formatVersion);
  const v2Envelope = version >= 2 ? assertV2AssetEnvelope(raw.profile) : null;

  const { integrity, ...body } = raw;
  const actual = await sha256Hex(stableStringify(body));
  if (actual.toLowerCase() !== String(integrity.value).toLowerCase()) {
    throw codedError(ERROR_CODES.PROFILE_DAMAGED, "This MosaicSync profile is damaged or has been modified.");
  }

  const state = version >= 2 ? parseV2State(raw.profile, v2Envelope) : repairProfileRecordIds(raw.profile.state);
  return {
    formatVersion: version,
    exportedAt: Number(raw.exportedAt) || 0,
    sourceVersion: typeof raw.application?.version === "string" ? raw.application.version : "",
    state,
    preferences: normalizePreferences(raw.profile.preferences)
  };
}

export function profileFileName(date = new Date()) {
  const safe = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const stamp = safe.toISOString().replace(/[:.]/g, "-");
  return `MosaicSync-profile-${stamp}${PROFILE_FILE_EXTENSION}`;
}
