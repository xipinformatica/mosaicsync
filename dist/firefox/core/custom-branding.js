/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Device-local Custom Branding domain.
 *
 * This record deliberately lives outside the synchronized MosaicSync state.
 * It is never part of storage.sync, Sync clocks, pending journals or Recovery.
 * The profile backup layer explicitly opts it into export/import instead.
 */
import { LOCAL_CUSTOM_BRANDING_KEY } from "./constants.js";
import { parseImageDataUrl } from "./image-data.js";

export const CUSTOM_BRANDING_SCHEMA_VERSION = 1;
export const CUSTOM_BRANDING_TEXT_MAX_CHARS = 120;
export const CUSTOM_BRANDING_LOGO_MAX_BYTES = 512_000;
export const CUSTOM_BRANDING_LOGO_INPUT_MAX_BYTES = 8_000_000;
export const CUSTOM_BRANDING_LOGO_TARGET_BYTES = 320_000;
export const CUSTOM_BRANDING_LOGO_MAX_WIDTH = 900;
export const CUSTOM_BRANDING_LOGO_MAX_HEIGHT = 360;
export const CUSTOM_BRANDING_ALLOWED_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp"
]);
const ALLOWED_MIME_TYPES = new Set(CUSTOM_BRANDING_ALLOWED_MIME_TYPES);

export const DEFAULT_CUSTOM_BRANDING = Object.freeze({
  schemaVersion: CUSTOM_BRANDING_SCHEMA_VERSION,
  enabled: false,
  text: "",
  logo: ""
});

function cloneDefault() {
  return { ...DEFAULT_CUSTOM_BRANDING };
}

function normalizeText(value, { strict = false } = {}) {
  if (value == null) return "";
  if (typeof value !== "string") {
    if (strict) throw new Error("Invalid custom branding text.");
    return "";
  }
  if (value.length > CUSTOM_BRANDING_TEXT_MAX_CHARS) {
    if (strict) throw new Error("Custom branding text is too long.");
    return value.slice(0, CUSTOM_BRANDING_TEXT_MAX_CHARS);
  }
  return value;
}

export function normalizeCustomBrandingLogo(value, { strict = false } = {}) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    if (strict) throw new Error("Invalid custom branding logo.");
    return "";
  }
  const parsed = parseImageDataUrl(value);
  if (!parsed || !ALLOWED_MIME_TYPES.has(parsed.mimeType) || parsed.byteLength > CUSTOM_BRANDING_LOGO_MAX_BYTES) {
    if (strict) throw new Error("Invalid custom branding logo.");
    return "";
  }
  return parsed.canonical;
}

export function normalizeCustomBranding(value, { strict = false } = {}) {
  if (value == null) return cloneDefault();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (strict) throw new Error("Invalid custom branding data.");
    return cloneDefault();
  }
  const schemaVersion = Number(value.schemaVersion ?? CUSTOM_BRANDING_SCHEMA_VERSION);
  if (schemaVersion !== CUSTOM_BRANDING_SCHEMA_VERSION) {
    if (strict) throw new Error("Unsupported custom branding data.");
    return cloneDefault();
  }
  if (strict && value.enabled != null && typeof value.enabled !== "boolean") {
    throw new Error("Invalid custom branding state.");
  }
  return {
    schemaVersion: CUSTOM_BRANDING_SCHEMA_VERSION,
    enabled: value.enabled === true,
    text: normalizeText(value.text, { strict }),
    logo: normalizeCustomBrandingLogo(value.logo, { strict })
  };
}

export function customBrandingIsVisible(value) {
  const branding = normalizeCustomBranding(value);
  return branding.enabled && Boolean(branding.logo || branding.text);
}

export async function readCustomBranding({ failClosed = false } = {}) {
  try {
    const result = await browser.storage.local.get(LOCAL_CUSTOM_BRANDING_KEY);
    return normalizeCustomBranding(result?.[LOCAL_CUSTOM_BRANDING_KEY]);
  } catch (error) {
    if (failClosed) throw error;
    return cloneDefault();
  }
}

export async function writeCustomBranding(value) {
  const branding = normalizeCustomBranding(value, { strict: true });
  await browser.storage.local.set({ [LOCAL_CUSTOM_BRANDING_KEY]: branding });
  return branding;
}

