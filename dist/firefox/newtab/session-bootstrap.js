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
  const timing = globalThis.__mosaicsyncStartupTiming ||= { version: 1, phases: Object.create(null) };
  timing.version = 1;
  timing.phases ||= Object.create(null);
  // This classic script is immediately after the blocking critical stylesheet;
  // reaching it means the browser has fetched and parsed that critical CSS.
  timing.phases.criticalCssReady = (globalThis.performance?.now?.() ?? Date.now());
  try {
    const storage = globalThis.browser?.storage?.session;
    if (!storage?.get) return;
    const startedAt = (globalThis.performance?.now?.() ?? Date.now());
    const config = globalThis.__mosaicsyncBootstrapConfig;
    if (!config?.sessionRenderStateKey || !config?.sessionRenderMetaKey || !config?.sessionFrequentProjectionKey || !config?.sessionFrequentSuppressedKey) return;
    const promise = Promise.resolve(storage.get([
      config.sessionRenderStateKey,
      config.sessionRenderMetaKey,
      config.sessionFrequentProjectionKey,
      config.sessionFrequentSuppressedKey
    ])).catch(() => null);
    globalThis.__mosaicsyncEarlySessionRead = { startedAt, promise };
  } catch {
    // Disposable acceleration only; normal startup performs its own read.
  }
})();
