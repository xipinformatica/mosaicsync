/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Load the complete New Tab stylesheet only after the critical launcher frame
 * has had a chance to paint. This stays CSP-safe: no inline script/event handler,
 * no remote resource and no change to the extension's CSP.
 */
(() => {
  const load = () => {
    if (document.getElementById("mosaicsyncSecondaryStyles")) return;
    const link = document.createElement("link");
    link.id = "mosaicsyncSecondaryStyles";
    link.rel = "stylesheet";
    link.href = "newtab.css";
    link.addEventListener("load", () => {
      const timing = globalThis.__mosaicsyncStartupTiming;
      if (timing?.phases) timing.phases.secondaryCssReady = (globalThis.performance?.now?.() ?? Date.now());
    }, { once: true });
    document.head.append(link);
  };
  if (typeof requestAnimationFrame === "function") {
    // Two frames are intentional: the first callback is still before the first
    // paint. Queueing the stylesheet from the second callback guarantees the
    // critical launcher CSS gets a rendering opportunity before the complete
    // secondary UI sheet joins the document.
    requestAnimationFrame(() => requestAnimationFrame(load));
  } else {
    setTimeout(() => setTimeout(load, 0), 0);
  }
})();
