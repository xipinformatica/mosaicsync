/* Stable internal error categories for diagnostics/tests. User-facing text stays localized separately. */
export const ERROR_CODES = Object.freeze({
  PROFILE_UNSUPPORTED_CRYPTO: "PROFILE_UNSUPPORTED_CRYPTO",
  PROFILE_INVALID_FILE: "PROFILE_INVALID_FILE",
  PROFILE_TOO_LARGE: "PROFILE_TOO_LARGE",
  PROFILE_INVALID_FORMAT: "PROFILE_INVALID_FORMAT",
  PROFILE_NEWER_VERSION: "PROFILE_NEWER_VERSION",
  PROFILE_INVALID_STATE: "PROFILE_INVALID_STATE",
  PROFILE_INVALID_INTEGRITY: "PROFILE_INVALID_INTEGRITY",
  PROFILE_DAMAGED: "PROFILE_DAMAGED",
  PROFILE_ASSETS_INCOMPLETE: "PROFILE_ASSETS_INCOMPLETE",
  STORAGE_LOCAL_WRITE_FAILED: "STORAGE_LOCAL_WRITE_FAILED",
  STORAGE_LOCAL_QUOTA_EXCEEDED: "STORAGE_LOCAL_QUOTA_EXCEEDED"
});
export function codedError(code, message) { const error = new Error(message); error.code = code; return error; }

export function isQuotaExceededError(error) {
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 6 && !seen.has(current); depth += 1) {
    seen.add(current);
    const name = String(current?.name || "");
    const message = String(current?.message || "");
    if (name === "QuotaExceededError" || /quota/i.test(message) || /storage(?:\.local)?[^\n]{0,48}(?:full|limit)/i.test(message)) return true;
    current = current?.cause;
  }
  return false;
}

export function localStorageWriteError(error) {
  const quota = isQuotaExceededError(error);
  const wrapped = codedError(
    quota ? ERROR_CODES.STORAGE_LOCAL_QUOTA_EXCEEDED : ERROR_CODES.STORAGE_LOCAL_WRITE_FAILED,
    quota ? "Local storage quota exceeded." : "Local storage write failed."
  );
  try { wrapped.cause = error; } catch {}
  return wrapped;
}
