/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Disposable synchronous first-frame Personal-grid projection.
 *
 * Step 2.3 makes this cache presentation-only. It contains no navigation URLs,
 * mutation clocks, Frequently Visited candidates or shared semantic first-paint
 * state. The grid is inert until newtab.js verifies it against session/local
 * authority and wires real interactions.
 */
(() => {
  const timing = globalThis.__mosaicsyncStartupTiming ||= { version: 1, phases: Object.create(null) };
  timing.phases ||= Object.create(null);
  timing.phases.bootGridStart = (globalThis.performance?.now?.() ?? Date.now());
  const config = globalThis.__mosaicsyncBootstrapConfig;
  const KEY = config?.renderManifestKey || "";
  const SHORTCUT_ORDER_KEY = ["mosaicsync", "shortcut-order", "v1"].join(".");
  const SHORTCUT_USAGE_KEY = ["mosaicsync", "shortcut-usage", "v1"].join(".");
  const DEFAULT_SPACE_KEY = ["mosaicsync", "default-space", "v1"].join(".");
  const COLOR_TAGS = new Set(["red", "orange", "amber", "green", "teal", "blue", "violet", "pink"]);
  const MAX_PREVIEW_CHARS = 6000;
  const root = document.documentElement;
  const grid = document.getElementById("shortcutGrid");
  const emptyState = document.getElementById("emptyState");
  const brand = document.querySelector(".brand");
  if (!grid || !emptyState) return;

  function validPreview(value) {
    return typeof value === "string" && value.length <= MAX_PREVIEW_CHARS &&
      /^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/i.test(value);
  }
  function readShortcutUsage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHORTCUT_USAGE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const entries = [];
      for (const [id, raw] of Object.entries(parsed)) {
        const timestamp = Number(raw);
        if (!id || id.length > 256 || !Number.isFinite(timestamp) || timestamp <= 0) continue;
        entries.push([id, Math.trunc(timestamp)]);
      }
      entries.sort((a, b) => b[1] - a[1]);
      return Object.fromEntries(entries.slice(0, 512));
    } catch {
      return {};
    }
  }
  function lastOpenedAt(item, usage) {
    const read = id => {
      const value = Number(usage?.[id]);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    if (item?.type === "folder") {
      let latest = 0;
      for (const child of item.items || []) latest = Math.max(latest, read(child?.id));
      return latest;
    }
    return read(item?.id);
  }
  function recentOrder(items) {
    const usage = readShortcutUsage();
    return [...items].sort((a, b) => {
      const recentDelta = lastOpenedAt(b, usage) - lastOpenedAt(a, usage);
      if (recentDelta) return recentDelta;
      if (a.position !== b.position) return a.position - b.position;
      return String(a.id).localeCompare(String(b.id));
    });
  }
  function applyColorTag(target, item) {
    if (target && COLOR_TAGS.has(item?.colorTag)) target.dataset.colorTag = item.colorTag;
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
      image.decoding = "async";
      image.src = item.preview;
      image.alt = "";
      image.setAttribute("aria-hidden", "true");
      target.append(image);
      return;
    }
    if (globalThis.__mosaicsyncBuiltinIcons?.append?.(target, item?.builtinIcon)) return;
    // An imageKey means authoritative state knows artwork exists. If the tiny
    // derivative is absent, an empty tile is more truthful than flashing a letter.
    if (typeof item?.imageKey === "string" && item.imageKey) return;
    target.append(fallback(item?.title));
  }
  function shortcutSlot(item) {
    const slot = document.createElement("div");
    slot.className = "shortcut-slot";
    slot.dataset.id = item.id;
    // Deliberately no href here. The entire cache is inert until authoritative
    // state validates it; configureShortcutSlotInteractions() installs the real
    // validated navigation target during handoff.
    const card = document.createElement("a");
    card.className = "shortcut-card";
    card.title = item.title;
    card.setAttribute("aria-label", item.title);
    const tile = document.createElement("span");
    tile.className = `tile ${item.imageStyle === "cover" ? "cover" : ""}`.trim();
    applyColorTag(tile, item);
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
      if (typeof child.id === "string" && child.id) cell.dataset.id = child.id;
      applyColorTag(cell, child);
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

  try {
    if (!KEY || !Number.isInteger(config?.renderManifestVersion)) return;
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const manifest = JSON.parse(raw);
    if (!manifest || manifest.version !== config.renderManifestVersion || manifest.ready !== true) return;

    // Persistent synchronous grid paint remains deliberately Personal-only. If a
    // device is configured to open Work directly, do not flash Personal first.
    if (manifest.paintSpaceId !== "personal") return;
    try {
      const defaultSpace = localStorage.getItem(DEFAULT_SPACE_KEY) || "last";
      if (manifest.spaceSwitcher?.visible === true && defaultSpace === "work") return;
    } catch {}

    const layout = manifest.layout;
    if (!layout || typeof layout !== "object" || !Array.isArray(manifest.shortcuts) || manifest.shortcuts.length > 96) return;
    const columns = Number(layout.columns), rows = Number(layout.rows), tileSize = Number(layout.tileSize);
    if (!Number.isInteger(columns) || columns < 6 || columns > 12 ||
        !Number.isInteger(rows) || rows < 2 || rows > 8 ||
        !Number.isFinite(tileSize) || tileSize < 60 || tileSize > 96) return;
    const scale = tileSize / 76;
    root.style.setProperty("--columns", String(columns));
    root.style.setProperty("--tile-size", `${tileSize}px`);
    root.style.setProperty("--shortcut-icon-size", `${Math.round(tileSize * 53 / 76)}px`);
    root.style.setProperty("--col-gap", `${Math.round(27 * scale)}px`);
    root.style.setProperty("--row-gap", `${Math.round(26 * scale)}px`);
    if (brand) brand.hidden = layout.brandVisible === false;

    const validItems = [];
    for (const source of manifest.shortcuts) {
      if (!source || typeof source !== "object" || typeof source.id !== "string" || !source.id ||
          typeof source.title !== "string" || !Number.isInteger(source.position) || source.position < 0) continue;
      const item = { ...source };
      if (item.preview && !validPreview(item.preview)) item.preview = "";
      item.builtinIcon = globalThis.__mosaicsyncBuiltinIcons?.isValid?.(item.builtinIcon) ? item.builtinIcon : "";
      item.colorTag = COLOR_TAGS.has(item.colorTag) ? item.colorTag : "";
      if (item.type === "shortcut") {
        // Visual-only shortcut: no URL is expected or accepted in this layer.
      } else if (item.type === "folder") {
        if (!Array.isArray(item.items)) continue;
        item.items = item.items.filter(child => child && typeof child.id === "string" && child.id && typeof child.title === "string").map(child => ({
          ...child,
          builtinIcon: globalThis.__mosaicsyncBuiltinIcons?.isValid?.(child.builtinIcon) ? child.builtinIcon : "",
          colorTag: COLOR_TAGS.has(child.colorTag) ? child.colorTag : "",
          preview: validPreview(child.preview) ? child.preview : ""
        }));
      } else continue;
      validItems.push(item);
    }

    const capacity = columns * rows;
    const byPosition = new Map();
    let recentMode = false;
    try { recentMode = localStorage.getItem(SHORTCUT_ORDER_KEY) === "recent"; } catch {}
    if (recentMode) {
      const ordered = recentOrder(validItems.filter(item => item.position < capacity));
      ordered.forEach((item, index) => byPosition.set(index, item));
    } else {
      for (const item of validItems) byPosition.set(item.position, item);
    }
    const fragment = document.createDocumentFragment();
    for (let position = 0; position < capacity; position += 1) {
      const item = byPosition.get(position);
      const slot = item ? (item.type === "folder" ? folderSlot(item) : shortcutSlot(item)) : null;
      if (slot) {
        fragment.append(slot);
      } else {
        const empty = document.createElement("div");
        empty.className = "shortcut-slot empty-slot";
        empty.dataset.position = String(position);
        fragment.append(empty);
      }
    }
    const hasShortcuts = byPosition.size > 0;
    grid.inert = true;
    emptyState.inert = true;
    grid.replaceChildren(fragment);
    grid.hidden = !hasShortcuts;
    emptyState.hidden = hasShortcuts;
    root.dataset.bootGrid = "true";
    globalThis.__mosaicsyncBootGrid = { manifest };
    timing.phases.bootGridReady = (globalThis.performance?.now?.() ?? Date.now());
    timing.renderManifestChars = raw.length;
    timing.bootGridSlots = capacity;
    const stampPaint = () => {
      timing.phases.firstLauncherPaint = (globalThis.performance?.now?.() ?? Date.now());
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(stampPaint));
    else setTimeout(stampPaint, 0);
  } catch {
    // Disposable cache corruption must never block authoritative startup.
  }
})();
