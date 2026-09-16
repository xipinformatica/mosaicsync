/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Secondary New Tab UI styles are loaded only when secondary UI is about to
 * become visible. Merely starting a New Tab must not mutate the CSSOM after
 * first paint. This stays CSP-safe: packaged external CSS only, no inline
 * handlers/styles and no remote resource.
 */
(() => {
  let secondaryStylesPromise = null;

  globalThis.__mosaicsyncEnsureSecondaryStyles = function ensureSecondaryStyles() {
    if (secondaryStylesPromise) return secondaryStylesPromise;

    const existing = document.getElementById("mosaicsyncSecondaryStyles");
    if (existing?.dataset?.mosaicsyncLoaded === "true" || existing?.sheet) {
      secondaryStylesPromise = Promise.resolve(true);
      return secondaryStylesPromise;
    }

    secondaryStylesPromise = new Promise(resolve => {
      const link = existing || document.createElement("link");
      if (!existing) {
        link.id = "mosaicsyncSecondaryStyles";
        link.rel = "stylesheet";
        link.href = "newtab-secondary.css";
      }

      link.addEventListener("load", () => {
        if (link.dataset) link.dataset.mosaicsyncLoaded = "true";
        const timing = globalThis.__mosaicsyncStartupTiming;
        if (timing?.phases) timing.phases.secondaryCssReady = (globalThis.performance?.now?.() ?? Date.now());
        resolve(true);
      }, { once: true });
      link.addEventListener("error", () => {
        console.error("MosaicSync: packaged secondary New Tab stylesheet failed to load.");
        resolve(false);
      }, { once: true });

      if (!existing) document.head.append(link);
    });

    return secondaryStylesPromise;
  };
})();
