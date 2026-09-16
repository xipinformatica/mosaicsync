/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

function append(parent, child) {
  parent.appendChild(child);
  return child;
}

function element(documentRef, tag, { id = "", className = "", text = "", attrs = {} } = {}) {
  const node = documentRef.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function closeIcon(documentRef) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = documentRef.createElementNS(namespace, "svg");
  svg.classList.add("dialog-close-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = documentRef.createElementNS(namespace, "path");
  path.setAttribute("d", "M7 7 17 17M17 7 7 17");
  svg.appendChild(path);
  return svg;
}

// Snow Leopard II Step 3: this shell is intentionally absent from the initial
// New Tab DOM. It is constructed only when Settings actually opens the gallery.
export function mountWallpaperGalleryShell(documentRef = document, onClose = () => {}) {
  const existing = documentRef.getElementById("wallpaperGalleryDialog");
  if (existing) {
    return {
      dialog: existing,
      grid: existing.querySelector("#wallpaperGalleryGrid")
    };
  }

  const dialog = element(documentRef, "dialog", {
    id: "wallpaperGalleryDialog",
    className: "dialog wallpaper-gallery-dialog",
    attrs: { "aria-labelledby": "wallpaperGalleryTitle" }
  });
  const card = append(dialog, element(documentRef, "div", { className: "dialog-card wallpaper-gallery-card" }));
  const heading = append(card, element(documentRef, "div", { className: "dialog-heading" }));
  const copy = append(heading, element(documentRef, "div"));
  append(copy, element(documentRef, "p", { className: "eyebrow", text: "Backgrounds" }));
  append(copy, element(documentRef, "h2", { id: "wallpaperGalleryTitle", text: "More wallpapers" }));
  append(copy, element(documentRef, "p", {
    className: "wallpaper-gallery-intro",
    text: "Choose from all MosaicSync backgrounds, including light and dark designs."
  }));

  const closeButton = append(heading, element(documentRef, "button", {
    className: "icon-button dialog-close-button",
    attrs: {
      type: "button",
      "data-close-dialog": "wallpaperGalleryDialog",
      "aria-label": "Close"
    }
  }));
  closeButton.appendChild(closeIcon(documentRef));
  closeButton.addEventListener("click", onClose);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) onClose();
  });

  const grid = append(card, element(documentRef, "div", {
    id: "wallpaperGalleryGrid",
    className: "wallpaper-gallery-grid",
    attrs: { "aria-label": "Wallpaper gallery" }
  }));

  // Snow Leopard II Step 6A: the lazy shell is cheap to retain, but the
  // generated wallpaper choices are interaction-only payload. Release those
  // button/listener/thumbnail nodes whenever the native dialog closes; the
  // orchestrator rebuilds the grid synchronously before every later showModal().
  dialog.addEventListener("close", () => grid.replaceChildren());

  documentRef.body.appendChild(dialog);
  return { dialog, grid };
}
