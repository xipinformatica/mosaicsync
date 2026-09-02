/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Synchronous first-frame Space labels.
 *
 * The static document intentionally contains no visible default Space names.
 * The persistent visual cache may carry only the tiny switcher presentation
 * hint needed before asynchronous extension storage responds. Semantic Space
 * truth remains owned by storage.session/storage.local.
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
    if (!manifest || manifest.version !== config.renderManifestVersion || manifest.ready !== true) return;
    const hint = manifest.spaceSwitcher;
    if (!hint || typeof hint !== "object") return;
    if (hint.visible === false) {
      switcher.hidden = true;
      switcher.classList.remove("space-switcher-first-paint-pending");
      return;
    }
    if (hint.visible !== true) return;
    const normalize = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 32) : "";
    const personal = normalize(hint.personal);
    const work = normalize(hint.work);
    // Only reveal synchronously when both visible labels are known. Empty custom
    // names require locale-aware defaults, which the authoritative module applies
    // moments later without exposing static English placeholders.
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
