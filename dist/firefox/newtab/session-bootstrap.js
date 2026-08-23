/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Start the in-memory render-cache read before the ES-module graph is parsed.
 * The authoritative validator still lives in core/storage.js; this tiny script
 * only overlaps browser.storage.session I/O with module/CSS/DOM startup work.
 */
(() => {
  try {
    const storage = globalThis.browser?.storage?.session;
    if (!storage?.get) return;
    const startedAt = performance.now();
    const promise = Promise.resolve(storage.get([
      "mosaicsync.session.render-state.v2",
      "mosaicsync.session.render-meta.v1"
    ])).catch(() => null);
    globalThis.__mosaicsyncEarlySessionRead = { startedAt, promise };
  } catch {
    // Disposable acceleration only; normal startup performs its own read.
  }
})();
