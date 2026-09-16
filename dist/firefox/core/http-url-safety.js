/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Tiny shared HTTP(S) URL safety primitive.
 *
 * Keeping this file free of import/export syntax preserves compatibility with
 * every existing shared caller while centralizing security-sensitive scheme
 * validation. Step 2.3 no longer needs navigation URLs in the synchronous
 * persistent render cache, so the classic first-frame grid does not execute this
 * helper at all; authoritative/session code still does.
 */
(() => {
  "use strict";

  const GLOBAL_KEY = "__mosaicsyncSafeShortcutNavigationUrl";
  if (typeof globalThis[GLOBAL_KEY] === "function") return;

  function safeShortcutNavigationUrl(value) {
    if (typeof value !== "string" || !value || value.length > 2048) return "";
    try {
      const parsed = new URL(value);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  try {
    Object.defineProperty(globalThis, GLOBAL_KEY, {
      value: safeShortcutNavigationUrl,
      configurable: false,
      enumerable: false,
      writable: false
    });
  } catch {
    // A failure here must not create a permissive fallback. Callers treat a
    // missing helper as invalid and fail closed.
  }
})();
