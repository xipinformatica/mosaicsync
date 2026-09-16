/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * MosaicSync image worker.
 * Decoding, downscaling, and WebP encoding happen off the New Tab/UI thread.
 */
import { decodeImageDataUrlBytes, imageDataUrlByteLength } from "./image-data.js";
import {
  MAX_DECODED_PIXELS,
  MAX_IMAGE_INPUT_BYTES,
  MAX_SOURCE_DIMENSION,
  normalizeImageOptimizationOptions
} from "./image-limits.js";
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);

function unsupported(message) {
  const error = new Error(message);
  error.code = "UNSUPPORTED";
  return error;
}

function dataUrlToBlob(source) {
  const { bytes, mimeType } = decodeImageDataUrlBytes(source);
  return new Blob([bytes], { type: mimeType });
}

async function optimizeBlob(sourceBlob, options = {}) {
  if (typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") {
    throw unsupported("This Firefox build cannot optimize images in a worker.");
  }
  if (!sourceBlob || !ALLOWED_IMAGE_TYPES.has(String(sourceBlob.type || "").toLowerCase())) {
    throw new Error("Choose a PNG, JPEG, WebP, GIF, or ICO image.");
  }

  const { maxWidth, maxHeight, targetBytes, minWidth, minHeight, initialQuality } =
    normalizeImageOptimizationOptions(options);

  let bitmap;
  let canvas;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch {
    // A valid browser-decodable format (notably some ICO variants) may not be
    // supported by createImageBitmap. Let the bounded DOM decoder try it.
    throw unsupported("The worker could not decode this image format.");
  }

  try {
    const sourceWidth = Number(bitmap.width) || 0;
    const sourceHeight = Number(bitmap.height) || 0;
    if (!sourceWidth || !sourceHeight) throw new Error("That image has invalid dimensions.");
    if (sourceWidth > MAX_SOURCE_DIMENSION || sourceHeight > MAX_SOURCE_DIMENSION ||
        sourceWidth * sourceHeight > MAX_DECODED_PIXELS) {
      throw new Error("That image is too large to process safely.");
    }

    const ratio = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    let width = Math.max(1, Math.round(sourceWidth * ratio));
    let height = Math.max(1, Math.round(sourceHeight * ratio));
    // Never let a malformed minWidth/minHeight option upscale a smaller decoded
    // image on a later compression pass. Minimums are floors only within the
    // already-bounded initial output geometry.
    const outputMinWidth = Math.min(minWidth, width);
    const outputMinHeight = Math.min(minHeight, height);
    canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx || typeof canvas.convertToBlob !== "function") {
      throw unsupported("This Firefox build cannot encode images in a worker.");
    }

    const qualities = [initialQuality, 0.66, 0.52, 0.40, 0.30, 0.22];
    let best = null;
    let result = null;

    for (let scalePass = 0; scalePass < 7 && !result; scalePass += 1) {
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        let candidate;
        try {
          candidate = await canvas.convertToBlob({ type: "image/webp", quality });
        } catch {
          throw unsupported("This Firefox build cannot encode WebP images in a worker.");
        }
        if (!candidate?.size) continue;
        best = candidate;
        if (candidate.size <= targetBytes) {
          result = candidate;
          break;
        }
      }

      if (result) break;
      const nextWidth = Math.max(outputMinWidth, Math.round(width * 0.82));
      const nextHeight = Math.max(outputMinHeight, Math.round(height * 0.82));
      if (nextWidth === width && nextHeight === height) break;
      width = nextWidth;
      height = nextHeight;
    }

    if (!result) result = best;
    if (!result) throw new Error("Couldn't encode the image.");
    return result;
  } finally {
    bitmap?.close?.();
    // Release the potentially large backing store promptly instead of waiting
    // for GC pressure to reclaim native canvas memory. Each concurrent job owns
    // its own canvas, so shrinking it here cannot interfere with another task.
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return "Invalid worker request.";
  if (typeof request.id !== "string" || !request.id) return "Invalid worker request ID.";
  if (!(["data-url", "blob"].includes(request.sourceKind))) return "Invalid image source kind.";
  if (request.sourceKind === "data-url") {
    if (typeof request.source !== "string") return "Invalid data-URL image source.";
    const byteLength = imageDataUrlByteLength(request.source);
    if (!byteLength) return "Invalid data-URL image source.";
    if (byteLength > MAX_IMAGE_INPUT_BYTES) return "That image is too large to process safely.";
  }
  if (request.sourceKind === "blob") {
    if (!(request.source instanceof Blob)) return "Invalid Blob image source.";
    if (!Number.isFinite(request.source.size) || request.source.size <= 0) return "That image is empty.";
    if (request.source.size > MAX_IMAGE_INPUT_BYTES) return "That image is too large to process safely.";
  }
  if (request.options != null && (typeof request.options !== "object" || Array.isArray(request.options))) return "Invalid image options.";
  return "";
}

self.addEventListener("message", event => {
  const request = event.data;
  const validationError = validateRequest(request);
  if (validationError) {
    // A malformed message is request-specific. Fail fast without disturbing any
    // valid jobs already running in this dedicated worker.
    if (typeof request?.id === "string" && request.id) {
      self.postMessage({ id: request.id, ok: false, code: "PROCESSING_ERROR", error: validationError });
    }
    return;
  }

  void (async () => {
    try {
      const blob = request.sourceKind === "data-url"
        ? dataUrlToBlob(request.source)
        : request.source;
      const result = await optimizeBlob(blob, request.options);
      self.postMessage({ id: request.id, ok: true, blob: result });
    } catch (error) {
      self.postMessage({
        id: request.id,
        ok: false,
        code: error?.code || "PROCESSING_ERROR",
        error: error?.message || String(error)
      });
    }
  })();
});
