/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Synchronous, privacy-safe Frequently Visited geometry reservation.
 *
 * Browser-derived Top Sites, titles, URLs and favicons remain session/live-only.
 * This bootstrap reads only the existing enabled/count compatibility hints so
 * the shortcut grid can begin at its final vertical coordinate while the real
 * device-local FV projection is still loading and decoding.
 */
(() => {
  try {
    const config = globalThis.__mosaicsyncBootstrapConfig;
    const prefKey = config?.frequentPrefKey || "";
    const countKey = config?.frequentCountPrefKey || "";
    const section = document.getElementById("frequentSitesSection");
    const list = document.getElementById("frequentSitesList");
    if (!prefKey || !countKey || !section || !list) return;
    if (localStorage.getItem(prefKey) !== "1") return;

    const rawCount = Number.parseInt(localStorage.getItem(countKey) || "5", 10);
    const count = [3, 5, 8, 10].includes(rawCount) ? rawCount : 5;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) {
      const card = document.createElement("div");
      card.classList.add("frequent-site-card", "frequent-site-first-paint-placeholder");
      card.setAttribute("aria-hidden", "true");
      // aria-hidden protects the accessibility tree; visibility:hidden protects
      // the actual first painted frame while preserving the exact card geometry.
      card.style.visibility = "hidden";
      card.style.pointerEvents = "none";
      const heightAnchor = document.createElement("span");
      heightAnchor.classList.add("frequent-site-fallback");
      card.append(heightAnchor);
      fragment.append(card);
    }

    section.classList.add("frequent-sites-first-paint-reserved", "frequent-sites-heading-first-paint-pending");
    section.setAttribute("aria-hidden", "true");
    section.dataset.frequentLayoutCapacity = String(count);
    // Hide the complete reservation, not merely its heading. visibility:hidden
    // retains layout, so normal FV tile chrome can never flash before the real
    // detached/decode-before-commit fragment is ready.
    section.style.visibility = "hidden";
    list.replaceChildren(fragment);
    section.hidden = false;
    document.documentElement.dataset.bootFrequentGeometry = String(count);
  } catch {
    // Presentation acceleration only. Authoritative startup owns the real FV UI.
  }
})();
