/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Begin the authoritative storage.local transaction before the large New Tab
 * ES-module graph is parsed. These four persisted key literals are deliberately
 * frozen and regression-tested against core/constants.js; changing one requires
 * the same data migration that changing the core constant would require.
 */
(() => {
  try {
    const storage = globalThis.browser?.storage?.local;
    if (!storage?.get) return;
    const startedAt = (globalThis.performance?.now?.() ?? Date.now());
    const timing = globalThis.__mosaicsyncStartupTiming ||= { version: 1, phases: Object.create(null) };
    timing.phases ||= Object.create(null);
    timing.phases.localStorageBootstrapStart = startedAt;
    const promise = Promise.resolve(storage.get([
      "mosaicsync.state",
      "mosaicsync.meta",
      "mosaicsync.active-space.v1",
      "mosaicsync.local-assets.v1"
    ])).catch(() => null);
    globalThis.__mosaicsyncEarlyLocalRead = { startedAt, promise };
  } catch {
    // Acceleration only. The module falls back to readLocalStorageRaw().
  }
})();
