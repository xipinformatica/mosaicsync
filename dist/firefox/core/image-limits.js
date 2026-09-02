/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Pure image-processing safety limits shared by the UI fallback and worker.
 * Keep this module free of DOM/WebExtension APIs so malformed internal
 * requests cannot bypass the same bounded geometry used by the main path.
 */
export const MAX_IMAGE_INPUT_BYTES = 32_000_000;
export const MAX_DECODED_PIXELS = 32_000_000;
export const MAX_SOURCE_DIMENSION = 16_384;
export const MAX_TARGET_BYTES = 32_000_000;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function boundedPositive(value, fallback, maximum) {
  return Math.max(1, Math.min(maximum, finitePositive(value, fallback)));
}

export function normalizeImageOptimizationOptions(options = {}) {
  const source = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  const maxWidth = boundedPositive(source.maxWidth, MAX_SOURCE_DIMENSION, MAX_SOURCE_DIMENSION);
  const maxHeight = boundedPositive(source.maxHeight, MAX_SOURCE_DIMENSION, MAX_SOURCE_DIMENSION);
  const targetBytes = boundedPositive(source.targetBytes, 1_000_000, MAX_TARGET_BYTES);
  const minWidth = Math.min(maxWidth, boundedPositive(source.minWidth, 32, MAX_SOURCE_DIMENSION));
  const minHeight = Math.min(maxHeight, boundedPositive(source.minHeight, 32, MAX_SOURCE_DIMENSION));
  const initialQuality = Math.max(0.05, Math.min(1, finitePositive(source.initialQuality, 0.82)));
  return { maxWidth, maxHeight, targetBytes, minWidth, minHeight, initialQuality };
}

export function normalizeImageInputLimit(value, fallback = MAX_IMAGE_INPUT_BYTES) {
  return Math.min(MAX_IMAGE_INPUT_BYTES, finitePositive(value, fallback));
}
