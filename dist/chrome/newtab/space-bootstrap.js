/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Synchronous first-frame Space labels.
 *
 * The static document intentionally contains no visible default Space names.
 * When the disposable render manifest has trustworthy custom names, project
 * them before the browser can paint the switcher. Otherwise keep the switcher
 * visually hidden until newtab.js applies the authoritative localized labels.
 */
(() => {
  const switcher = document.getElementById("spaceSwitcher");
  if (!switcher) return;
  try {
    const config = globalThis.__mosaicsyncBootstrapConfig;
    if (!config?.renderManifestKey || !Number.isInteger(config?.renderManifestVersion)) return;
    const raw = localStorage.getItem(config.renderManifestKey);
    if (!raw) return;
    const manifest = JSON.parse(raw);
    if (!manifest || manifest.version !== config.renderManifestVersion || manifest.onboardingCompleted !== true) return;
    const firstPaint = manifest.firstPaint?.version === 1 ? manifest.firstPaint : null;
    if (!firstPaint) return;
    if (firstPaint.multipleSpacesEnabled === false) {
      switcher.hidden = true;
      switcher.classList.remove("space-switcher-first-paint-pending");
      return;
    }
    const names = firstPaint.spaceNames;
    const personal = typeof names?.personal === "string" ? names.personal.trim().replace(/\s+/g, " ").slice(0, 32) : "";
    const work = typeof names?.work === "string" ? names.work.trim().replace(/\s+/g, " ").slice(0, 32) : "";
    // Only reveal synchronously when both visible labels are known. Empty custom
    // names require locale-aware defaults, which the authoritative module applies
    // moments later without ever exposing the static English placeholders.
    if (!personal || !work) return;
    const personalButton = switcher.querySelector('[data-space-id="personal"]');
    const workButton = switcher.querySelector('[data-space-id="work"]');
    if (!personalButton || !workButton) return;
    personalButton.textContent = personal;
    workButton.textContent = work;
    switcher.classList.remove("space-switcher-first-paint-pending");
  } catch {
    // Disposable cache corruption must never block authoritative startup.
  }
})();
