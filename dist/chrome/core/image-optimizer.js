/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Local image validation and compression.
 * MosaicSync prefers a packaged Web Worker using createImageBitmap + OffscreenCanvas
 * so decoding/downscaling/WebP encoding stays off the UI thread. A bounded DOM-canvas
 * implementation remains as a compatibility fallback. This module performs no
 * network I/O; remote-source retrieval, when explicitly authorized, is handled
 * separately and its bytes are passed into this local optimizer.
 */
import { imageDataUrlByteLength } from "./image-data.js";
import {
  MAX_DECODED_PIXELS,
  MAX_IMAGE_INPUT_BYTES,
  MAX_SOURCE_DIMENSION,
  normalizeImageInputLimit,
  normalizeImageOptimizationOptions
} from "./image-limits.js";

const textEncoder = new TextEncoder();
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);
const pendingWorkerRequests = new Map();
const IMAGE_WORKER_IDLE_MS = 3000;
const IMAGE_WORKER_REQUEST_TIMEOUT_MS = 30_000;
let imageWorker = null;
let workerUnavailable = false;
let workerFailureCount = 0;
let workerRetryAfter = 0;
const MAX_TRANSIENT_WORKER_FAILURES = 3;
const WORKER_RETRY_COOLDOWN_MS = 750;
let workerRequestCounter = 0;
let imageWorkerIdleTimer = null;

export function dataUrlByteLength(dataUrl) {
  const imageBytes = imageDataUrlByteLength(dataUrl);
  if (imageBytes) return imageBytes;
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return textEncoder.encode(dataUrl).length;
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(dataUrl.slice(0, comma))) return 0;
  try {
    return textEncoder.encode(decodeURIComponent(payload)).length;
  } catch {
    return textEncoder.encode(payload).length;
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the image file."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read the optimized image."));
    reader.readAsDataURL(blob);
  });
}

export async function imageBlobToDataUrl(blob, { maxInputBytes = 1_000_000 } = {}) {
  const type = String(blob?.type || "").toLowerCase().split(";")[0];
  if (!blob || !ALLOWED_IMAGE_TYPES.has(type)) throw new Error("Choose a PNG, JPEG, WebP, GIF, or ICO image.");
  if (!Number.isFinite(blob.size) || blob.size <= 0) throw new Error("That image is empty.");
  if (blob.size > maxInputBytes) throw new Error(`That image is too large. Try one under ${Math.max(1, Math.round(maxInputBytes / 1_000_000))} MB.`);
  return blobToDataUrl(blob);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const detachHandlers = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      detachHandlers();
      resolve(image);
    };
    image.onerror = () => {
      detachHandlers();
      reject(new Error("Couldn't decode the image."));
    };
    image.src = src;
  });
}

function clearWorkerIdleTimer() {
  clearTimeout(imageWorkerIdleTimer);
  imageWorkerIdleTimer = null;
}

function terminateIdleWorker() {
  clearWorkerIdleTimer();
  if (!imageWorker || pendingWorkerRequests.size) return;
  try { imageWorker.terminate(); } catch {}
  imageWorker = null;
}

function scheduleWorkerIdleShutdown() {
  clearWorkerIdleTimer();
  if (!imageWorker || pendingWorkerRequests.size) return;
  imageWorkerIdleTimer = setTimeout(terminateIdleWorker, IMAGE_WORKER_IDLE_MS);
}

function disposeWorker(error = new Error("Image worker stopped unexpectedly."), { permanent = false, countFailure = true } = {}) {
  clearWorkerIdleTimer();
  try { imageWorker?.terminate(); } catch {}
  imageWorker = null;

  if (permanent) {
    workerUnavailable = true;
  } else if (countFailure) {
    workerFailureCount += 1;
    workerRetryAfter = Date.now() + WORKER_RETRY_COOLDOWN_MS;
    if (workerFailureCount >= MAX_TRANSIENT_WORKER_FAILURES) workerUnavailable = true;
  } else {
    // A watchdog timeout proves that one Worker instance wedged, not that the
    // Worker pipeline is unsupported. Let the next small job try a fresh
    // Worker immediately instead of contributing to the permanent breaker.
    workerRetryAfter = 0;
  }

  const fallbackError = error instanceof Error ? error : new Error(String(error));
  fallbackError.code = "UNSUPPORTED";
  for (const { reject } of pendingWorkerRequests.values()) reject(fallbackError);
  pendingWorkerRequests.clear();
}

function getImageWorker() {
  if (workerUnavailable || typeof Worker !== "function" || Date.now() < workerRetryAfter) return null;
  clearWorkerIdleTimer();
  if (imageWorker) return imageWorker;

  try {
    const worker = new Worker(new URL("./image-worker.js", import.meta.url), { type: "module", name: "MosaicSync image optimizer" });
    imageWorker = worker;
    worker.addEventListener("message", event => {
      // A terminated Worker can still have an already-queued event. Never let
      // stale Worker A settle requests or dispose a newer Worker B.
      if (worker !== imageWorker) return;
      const response = event.data;
      const pending = pendingWorkerRequests.get(response?.id);
      if (!pending) return;
      pendingWorkerRequests.delete(response.id);
      if (response.ok) {
        workerFailureCount = 0;
        workerRetryAfter = 0;
        pending.resolve(response.blob);
        scheduleWorkerIdleShutdown();
        return;
      }
      const error = new Error(response.error || "Couldn't optimize the image.");
      error.code = response.code || "PROCESSING_ERROR";
      pending.reject(error);
      scheduleWorkerIdleShutdown();
    });
    worker.addEventListener("error", event => {
      if (worker !== imageWorker) return;
      event.preventDefault?.();
      disposeWorker(new Error("The image worker could not start."));
    });
    worker.addEventListener("messageerror", () => {
      if (worker !== imageWorker) return;
      disposeWorker(new Error("The image worker could not read an image request."));
    });
    return worker;
  } catch {
    workerUnavailable = true;
    imageWorker = null;
    return null;
  }
}

async function optimizeWithWorker(sourceKind, source, options) {
  const worker = getImageWorker();
  if (!worker) {
    const error = new Error("Worker image optimization is unavailable.");
    error.code = "UNSUPPORTED";
    throw error;
  }

  const id = `image-${Date.now().toString(36)}-${(++workerRequestCounter).toString(36)}`;
  let resolveResult;
  let rejectResult;
  let watchdogTimer = null;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const clearWatchdog = () => {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  };

  pendingWorkerRequests.set(id, {
    resolve(value) {
      clearWatchdog();
      resolveResult(value);
    },
    reject(error) {
      clearWatchdog();
      rejectResult(error);
    }
  });
  watchdogTimer = setTimeout(() => {
    if (!pendingWorkerRequests.has(id)) return;
    // Leave this request in the map: disposeWorker() rejects every request owned
    // by the wedged worker, clears each watchdog through the wrappers above, and
    // lets every caller use the bounded DOM fallback normally.
    disposeWorker(new Error("Image worker request timed out."), { countFailure: false });
  }, IMAGE_WORKER_REQUEST_TIMEOUT_MS);

  try {
    worker.postMessage({ id, sourceKind, source, options });
  } catch (error) {
    // DataCloneError is request-specific: keep the worker and any unrelated
    // pending optimizations alive, then let only this request use the bounded
    // DOM fallback. Other synchronous post failures imply a worker-level issue.
    if (error?.name === "DataCloneError") {
      pendingWorkerRequests.delete(id);
      clearWatchdog();
      scheduleWorkerIdleShutdown();
      const requestError = new Error("This image could not be sent to the image worker.");
      requestError.code = "UNSUPPORTED";
      throw requestError;
    }
    // The failed request is still registered so disposeWorker() settles it along
    // with any other jobs before this function returns its explicit error.
    disposeWorker(error);
    const unsupported = new Error("Worker image optimization is unavailable.");
    unsupported.code = "UNSUPPORTED";
    throw unsupported;
  }

  return result;
}

export async function optimizeImageFile(file, options = {}) {
  if (!file || !ALLOWED_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) throw new Error("Choose a PNG, JPEG, WebP, GIF, or ICO image.");
  const maxInputBytes = normalizeImageInputLimit(options.maxInputBytes, 20_000_000);
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("That image is empty.");
  if (file.size > maxInputBytes) throw new Error(`That image is too large. Try a file under ${Math.round(maxInputBytes / 1_000_000)} MB.`);

  try {
    return await blobToDataUrl(await optimizeWithWorker("blob", file, options));
  } catch (error) {
    if (error?.code !== "UNSUPPORTED") throw error;
    return optimizeImageDataUrlFallback(await fileToDataUrl(file), options);
  }
}

export async function optimizeImageDataUrl(source, options = {}) {
  if (typeof source !== "string" || !/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/i.test(source)) throw new Error("Unsupported local image.");
  const inputBytes = dataUrlByteLength(source);
  if (!inputBytes) throw new Error("Unsupported local image.");
  const maxInputBytes = normalizeImageInputLimit(options.maxInputBytes, MAX_IMAGE_INPUT_BYTES);
  if (inputBytes > maxInputBytes) throw new Error(`That image is too large. Try one under ${Math.max(1, Math.round(maxInputBytes / 1_000_000))} MB.`);
  try {
    return await blobToDataUrl(await optimizeWithWorker("data-url", source, options));
  } catch (error) {
    if (error?.code !== "UNSUPPORTED") throw error;
    return optimizeImageDataUrlFallback(source, options);
  }
}

async function optimizeImageDataUrlFallback(source, options = {}) {
  const { maxWidth, maxHeight, targetBytes, minWidth, minHeight, initialQuality } =
    normalizeImageOptimizationOptions(options);
  const image = await loadImage(source);
  if (!image.naturalWidth || !image.naturalHeight) {
    image.src = "";
    throw new Error("That image has invalid dimensions.");
  }
  if (image.naturalWidth > MAX_SOURCE_DIMENSION || image.naturalHeight > MAX_SOURCE_DIMENSION ||
      image.naturalWidth * image.naturalHeight > MAX_DECODED_PIXELS) {
    image.src = "";
    throw new Error("That image is too large to process safely.");
  }

  const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  let width = Math.max(1, Math.round(image.naturalWidth * ratio));
  let height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const outputMinWidth = Math.min(minWidth, width);
  const outputMinHeight = Math.min(minHeight, height);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    image.src = "";
    throw new Error("This Firefox build couldn't create an image canvas.");
  }

  const qualities = [initialQuality, 0.66, 0.52, 0.40, 0.30, 0.22];
  let best = "";
  let result = "";

  try {
    for (let scalePass = 0; scalePass < 7 && !result; scalePass += 1) {
      canvas.width = width;
      canvas.height = height;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const candidate = canvas.toDataURL("image/webp", quality);
        best = candidate;
        if (dataUrlByteLength(candidate) <= targetBytes) {
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

    if (!result) result = best || canvas.toDataURL("image/webp", 0.22);
    return result;
  } finally {
    image.src = "";
    canvas.width = 1;
    canvas.height = 1;
  }
}
