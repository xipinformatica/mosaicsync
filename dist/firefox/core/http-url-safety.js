/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Tiny classic/module-compatible HTTP(S) URL safety primitive.
 *
 * `render-bootstrap.js` must remain a synchronous classic script for the first
 * frame, while the authoritative UI/model/storage code is ES-module based.
 * Keeping this file free of import/export syntax lets both worlds execute the
 * exact same validator without duplicating security-sensitive scheme logic.
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
