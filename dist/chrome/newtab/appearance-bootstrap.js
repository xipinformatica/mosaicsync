/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * First-paint appearance hint.
 *
 * browser.storage.local remains authoritative. This tiny Web Storage entry is
 * intentionally non-authoritative and contains only display-critical values plus
 * an optional tiny local wallpaper preview. It exists solely to avoid showing an
 * unrelated solid color while asynchronous extension storage is still loading.
 */
(() => {
  const APPEARANCE_HINT_KEY = "mosaicsync.appearance.v1";
  const MAX_PREVIEW_CHARS = 48_000;
  try {
    const raw = localStorage.getItem(APPEARANCE_HINT_KEY);
    if (!raw) return;
    const hint = JSON.parse(raw);
    const root = document.documentElement;

    const dim = Number(hint?.backgroundDim);
    if (Number.isFinite(dim)) {
      root.style.setProperty("--background-dim", String(Math.min(100, Math.max(0, dim)) / 100));
    }

    const DEFAULT_DARK_BACKGROUND = "#2b0050";
    const DEFAULT_LIGHT_BACKGROUND = /^#[0-9a-f]{6}$/i.test(hint?.defaultLightBackgroundColor || "")
      ? hint.defaultLightBackgroundColor
      : "#e9e2f1";
    const color = typeof hint?.backgroundColor === "string" ? hint.backgroundColor : "";
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      // Old hints predate the customization marker. Preserve a genuinely custom
      // historical color, but treat the old #2b0050 default as automatic.
      const customized = typeof hint?.backgroundColorCustomized === "boolean"
        ? hint.backgroundColorCustomized
        : color.toLowerCase() !== DEFAULT_DARK_BACKGROUND;
      const configuredTheme = ["dark", "light", "system"].includes(hint?.theme) ? hint.theme : "system";
      const cachedEffectiveTheme = ["dark", "light"].includes(hint?.effectiveTheme) ? hint.effectiveTheme : "";
      const effectiveTheme = configuredTheme === "system"
        ? (cachedEffectiveTheme || (globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"))
        : configuredTheme;
      // First-frame launcher variables are keyed by this attribute in critical CSS.
      // Set it from the same disposable appearance hint already trusted for the
      // page color so Light mode never paints one Dark-tile frame before the main
      // module reconciles authoritative browser.storage.local state.
      root.dataset.effectiveTheme = effectiveTheme;
      root.style.setProperty("--page-bg", customized
        ? color
        : (effectiveTheme === "light" ? DEFAULT_LIGHT_BACKGROUND : DEFAULT_DARK_BACKGROUND));
    }

    let background = "";
    const presetFile = typeof hint?.backgroundPresetFile === "string" ? hint.backgroundPresetFile : "";
    if (/^assets\/backgrounds\/[a-z0-9-]+\.svg$/i.test(presetFile)) {
      background = browser.runtime.getURL(presetFile);
    } else {
      const preview = typeof hint?.backgroundPreview === "string" ? hint.backgroundPreview : "";
      if (preview.length <= MAX_PREVIEW_CHARS && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(preview)) {
        background = preview;
      }
    }

    if (background) {
      const escaped = background.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      root.style.setProperty("--boot-background-image", `url("${escaped}")`);
    }
  } catch {
    // The hint is disposable. Invalid/blocked Web Storage simply falls back to
    // the storage.session/storage.local startup path.
  }
})();
