/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Disposable synchronous first-frame grid projection.
 *
 * Since 1.24.10, tiny, strictly-budgeted favicon previews are used. They are visual-cache
 * derivatives only: authoritative artwork remains in the content-addressed
 * local asset store. This lets the very first frame contain wallpaper + tiles +
 * recognizable icons instead of visibly stepping through fallback letters.
 */
(() => {
  const KEY = "mosaicsync.render-manifest.v1";
  const MAX_PREVIEW_CHARS = 6000;
  const root = document.documentElement;
  const grid = document.getElementById("shortcutGrid");
  const emptyState = document.getElementById("emptyState");
  const frequentSection = document.getElementById("frequentSitesSection");
  const frequentList = document.getElementById("frequentSitesList");
  const brand = document.querySelector(".brand");
  if (!grid || !emptyState) return;

  function validUrl(value) { return typeof value === "string" && /^https?:\/\//i.test(value); }
  function validPreview(value) {
    return typeof value === "string" && value.length <= MAX_PREVIEW_CHARS &&
      /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/i.test(value);
  }
  function fallback(title) {
    const icon = document.createElement("span");
    icon.className = "fallback-icon";
    icon.textContent = Array.from(String(title || "?").trim())[0] || "?";
    return icon;
  }
  function appendPreviewOrFallback(target, item) {
    if (validPreview(item?.preview)) {
      const image = document.createElement("img");
      image.src = item.preview;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      target.append(image);
      return;
    }
    target.append(fallback(item?.title));
  }
  function shortcutSlot(item) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot";
    slot.dataset.id = item.id;
    const card = document.createElement("a");
    card.className = "shortcut-card";
    card.href = item.url;
    card.rel = "noreferrer";
    card.title = `${item.title}\n${item.url}`;
    card.setAttribute("aria-label", `${item.title}, ${item.url}`);
    const tile = document.createElement("span");
    tile.className = `tile ${item.imageStyle === "cover" ? "cover" : ""}`.trim();
    appendPreviewOrFallback(tile, item);
    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = item.title;
    card.append(tile, label);
    slot.append(card);
    return slot;
  }
  function folderSlot(item) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot folder-slot";
    slot.dataset.id = item.id;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "shortcut-card folder-card";
    const tile = document.createElement("span");
    tile.className = "tile folder-tile";
    const mosaic = document.createElement("span");
    mosaic.className = "folder-mosaic";
    for (const child of item.items.slice(0, 4)) {
      const cell = document.createElement("span");
      cell.className = `folder-mosaic-cell ${child.imageStyle === "cover" ? "cover" : ""}`.trim();
      appendPreviewOrFallback(cell, child);
      mosaic.append(cell);
    }
    tile.append(mosaic);
    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = item.title || "Folder";
    card.append(tile, label);
    slot.append(card);
    return slot;
  }

  function frequentCard(site) {
    const card = document.createElement("a");
    card.className = "frequent-site-card";
    card.href = site.url;
    card.rel = "noreferrer";
    card.title = `${site.title || site.host}
${site.url}`;
    if (validPreview(site.favicon)) {
      const icon = document.createElement("img");
      icon.className = "frequent-site-icon";
      icon.src = site.favicon;
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      card.append(icon);
    } else {
      const fallbackIcon = document.createElement("span");
      fallbackIcon.className = "frequent-site-fallback";
      fallbackIcon.textContent = Array.from(String(site.title || site.host || "?").trim())[0]?.toUpperCase() || "?";
      fallbackIcon.setAttribute("aria-hidden", "true");
      card.append(fallbackIcon);
    }
    const copy = document.createElement("span");
    copy.className = "frequent-site-copy";
    const title = document.createElement("strong");
    title.textContent = site.title || site.host;
    const host = document.createElement("small");
    host.textContent = site.host;
    copy.append(title, host);
    card.append(copy);
    return card;
  }

  function paintFrequentSnapshot(snapshot) {
    if (!frequentSection || !frequentList || !snapshot || snapshot.enabled !== true || !Array.isArray(snapshot.sites)) return;
    const count = [3, 5, 8, 10].includes(Number(snapshot.count)) ? Number(snapshot.count) : 5;
    const fragment = document.createDocumentFragment();
    let shown = 0;
    for (const rawSite of snapshot.sites) {
      if (shown >= count) break;
      if (!rawSite || typeof rawSite !== "object" || !validUrl(rawSite.url)) continue;
      const site = {
        title: String(rawSite.title || "").trim().slice(0, 120),
        host: String(rawSite.host || "").trim().slice(0, 253),
        url: rawSite.url,
        favicon: validPreview(rawSite.favicon) ? rawSite.favicon : ""
      };
      if (!site.title || !site.host) continue;
      fragment.append(frequentCard(site));
      shown += 1;
    }
    if (!shown) return;
    frequentList.replaceChildren(fragment);
    frequentSection.hidden = false;
    root.dataset.bootFrequent = "true";
  }

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const manifest = JSON.parse(raw);
    if (!manifest || manifest.version !== 2 || manifest.onboardingCompleted !== true) return;
    if (!Array.isArray(manifest.shortcuts) || manifest.shortcuts.length > 96) return;
    const columns = Number(manifest.columns), rows = Number(manifest.rows), tileSize = Number(manifest.tileSize);
    if (!Number.isInteger(columns) || columns < 6 || columns > 12 ||
        !Number.isInteger(rows) || rows < 2 || rows > 8 ||
        !Number.isFinite(tileSize) || tileSize < 60 || tileSize > 96) return;
    const scale = tileSize / 76;
    root.style.setProperty("--columns", String(columns));
    root.style.setProperty("--tile-size", `${tileSize}px`);
    root.style.setProperty("--shortcut-icon-size", `${Math.round(tileSize * 48 / 76)}px`);
    root.style.setProperty("--col-gap", `${Math.round(27 * scale)}px`);
    root.style.setProperty("--row-gap", `${Math.round(26 * scale)}px`);
    if (brand) brand.hidden = manifest.brandVisible === false;
    paintFrequentSnapshot(manifest.frequent);

    const byPosition = new Map();
    for (const source of manifest.shortcuts) {
      if (!source || typeof source !== "object" || typeof source.id !== "string" || !source.id ||
          typeof source.title !== "string" || !Number.isInteger(source.position) || source.position < 0) continue;
      const item = { ...source };
      if (item.preview && !validPreview(item.preview)) item.preview = "";
      if (item.type === "shortcut") {
        if (!validUrl(item.url)) continue;
      } else if (item.type === "folder") {
        if (!Array.isArray(item.items)) continue;
        item.items = item.items.filter(child => child && typeof child.title === "string" && validUrl(child.url)).map(child => ({
          ...child,
          preview: validPreview(child.preview) ? child.preview : ""
        }));
      } else continue;
      byPosition.set(item.position, item);
    }

    const capacity = columns * rows;
    const fragment = document.createDocumentFragment();
    for (let position = 0; position < capacity; position += 1) {
      const item = byPosition.get(position);
      if (item) fragment.append(item.type === "folder" ? folderSlot(item) : shortcutSlot(item));
      else {
        const empty = document.createElement("div");
        empty.className = "shortcut-slot empty-slot";
        empty.dataset.position = String(position);
        fragment.append(empty);
      }
    }
    const hasShortcuts = byPosition.size > 0;
    grid.replaceChildren(fragment);
    grid.hidden = !hasShortcuts;
    emptyState.hidden = hasShortcuts;
    root.dataset.bootGrid = "true";
    globalThis.__mosaicsyncBootGrid = { manifest };
  } catch {
    // Disposable cache corruption must never block authoritative startup.
  }
})();
