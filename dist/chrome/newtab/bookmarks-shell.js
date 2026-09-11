/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

function append(parent, child) {
  parent.appendChild(child);
  return child;
}

function element(documentRef, tag, { id = "", className = "", text = "", attrs = {}, hidden = false } = {}) {
  const node = documentRef.createElement(tag);
  if (id) node.setAttribute("id", id);
  if (className) node.className = className;
  if (text) node.textContent = text;
  if (hidden) node.hidden = true;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function svgElement(documentRef, tag, attrs = {}) {
  const namespace = "http://www.w3.org/2000/svg";
  const node = documentRef.createElementNS(namespace, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function closeIcon(documentRef) {
  const svg = svgElement(documentRef, "svg", {
    class: "dialog-close-icon",
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false"
  });
  svg.appendChild(svgElement(documentRef, "path", { d: "M7 7 17 17M17 7 7 17" }));
  return svg;
}

function searchIcon(documentRef) {
  const svg = svgElement(documentRef, "svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  svg.appendChild(svgElement(documentRef, "circle", { cx: "11", cy: "11", r: "6.5" }));
  svg.appendChild(svgElement(documentRef, "path", { d: "m16 16 4 4" }));
  return svg;
}

function collectExisting(documentRef, dialog) {
  return {
    bookmarksDialog: dialog,
    bookmarksPermissionState: documentRef.getElementById("bookmarksPermissionState"),
    bookmarksPermissionButton: documentRef.getElementById("bookmarksPermissionButton"),
    bookmarksBrowser: documentRef.getElementById("bookmarksBrowser"),
    bookmarksSearch: documentRef.getElementById("bookmarksSearch"),
    bookmarksCount: documentRef.getElementById("bookmarksCount"),
    bookmarkFolderTree: documentRef.getElementById("bookmarkFolderTree"),
    bookmarkBreadcrumbs: documentRef.getElementById("bookmarkBreadcrumbs"),
    bookmarkFolderCards: documentRef.getElementById("bookmarkFolderCards"),
    bookmarkItems: documentRef.getElementById("bookmarkItems"),
    bookmarksEmpty: documentRef.getElementById("bookmarksEmpty"),
    bookmarksStatus: documentRef.getElementById("bookmarksStatus")
  };
}

// Snow Leopard II Step 3B: Bookmarks is an interaction-only surface. Keep its
// complete dialog shell out of the initial New Tab DOM and create it only after
// the persistent Bookmarks button is actually used.
export function mountBookmarksShell(documentRef = document, onClose = () => {}) {
  const existing = documentRef.getElementById("bookmarksDialog");
  if (existing) return collectExisting(documentRef, existing);

  const dialog = element(documentRef, "dialog", {
    id: "bookmarksDialog",
    className: "dialog bookmarks-dialog",
    attrs: { "aria-labelledby": "bookmarksDialogTitle" }
  });
  const card = append(dialog, element(documentRef, "section", { className: "dialog-card bookmarks-card" }));
  const heading = append(card, element(documentRef, "div", { className: "dialog-heading bookmarks-heading" }));
  const headingCopy = append(heading, element(documentRef, "div"));
  append(headingCopy, element(documentRef, "p", { className: "eyebrow", text: "Firefox" }));
  append(headingCopy, element(documentRef, "h2", { id: "bookmarksDialogTitle", text: "Bookmarks" }));
  const closeButton = append(heading, element(documentRef, "button", {
    className: "icon-button dialog-close-button",
    attrs: {
      type: "button",
      "data-close-dialog": "bookmarksDialog",
      "aria-label": "Close"
    }
  }));
  closeButton.appendChild(closeIcon(documentRef));
  closeButton.addEventListener("click", onClose);

  const bookmarksPermissionState = append(card, element(documentRef, "div", {
    id: "bookmarksPermissionState",
    className: "bookmarks-permission-state",
    hidden: true
  }));
  append(bookmarksPermissionState, element(documentRef, "div", {
    className: "bookmarks-permission-icon",
    text: "☆",
    attrs: { "aria-hidden": "true" }
  }));
  append(bookmarksPermissionState, element(documentRef, "h3", { text: "Show your Firefox bookmarks" }));
  append(bookmarksPermissionState, element(documentRef, "p", {
    text: "MosaicSync can display your bookmark folders without copying them into MosaicSync or Firefox Sync."
  }));
  const bookmarksPermissionButton = append(bookmarksPermissionState, element(documentRef, "button", {
    id: "bookmarksPermissionButton",
    className: "primary-button",
    text: "Allow bookmark access",
    attrs: { type: "button" }
  }));

  const bookmarksBrowser = append(card, element(documentRef, "div", {
    id: "bookmarksBrowser",
    className: "bookmarks-browser",
    hidden: true
  }));
  const toolbar = append(bookmarksBrowser, element(documentRef, "div", { className: "bookmarks-toolbar" }));
  const searchField = append(toolbar, element(documentRef, "label", { className: "bookmarks-search-field" }));
  searchField.appendChild(searchIcon(documentRef));
  const bookmarksSearch = append(searchField, element(documentRef, "input", {
    id: "bookmarksSearch",
    attrs: {
      type: "search",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "Search bookmarks",
      "aria-label": "Search bookmarks"
    }
  }));
  const bookmarksCount = append(toolbar, element(documentRef, "span", { id: "bookmarksCount", className: "bookmarks-count" }));

  const layout = append(bookmarksBrowser, element(documentRef, "div", { className: "bookmarks-layout" }));
  const sidebar = append(layout, element(documentRef, "aside", {
    className: "bookmarks-sidebar",
    attrs: { "aria-label": "Bookmark folders" }
  }));
  const bookmarkFolderTree = append(sidebar, element(documentRef, "div", { id: "bookmarkFolderTree", className: "bookmark-folder-tree" }));
  const main = append(layout, element(documentRef, "section", {
    className: "bookmarks-main",
    attrs: { "aria-live": "polite" }
  }));
  const bookmarkBreadcrumbs = append(main, element(documentRef, "div", { id: "bookmarkBreadcrumbs", className: "bookmark-breadcrumbs" }));
  const bookmarkFolderCards = append(main, element(documentRef, "div", { id: "bookmarkFolderCards", className: "bookmark-folder-cards" }));
  const bookmarkItems = append(main, element(documentRef, "div", { id: "bookmarkItems", className: "bookmark-items" }));
  const bookmarksEmpty = append(main, element(documentRef, "div", {
    id: "bookmarksEmpty",
    className: "bookmarks-empty",
    hidden: true
  }));
  append(bookmarksEmpty, element(documentRef, "strong", { text: "No bookmarks here" }));
  append(bookmarksEmpty, element(documentRef, "span", { text: "Choose another folder or search your bookmarks." }));

  const bookmarksStatus = append(card, element(documentRef, "div", {
    id: "bookmarksStatus",
    className: "bookmarks-status",
    attrs: { role: "status", "aria-live": "polite" }
  }));

  documentRef.body.appendChild(dialog);
  return {
    bookmarksDialog: dialog,
    bookmarksPermissionState,
    bookmarksPermissionButton,
    bookmarksBrowser,
    bookmarksSearch,
    bookmarksCount,
    bookmarkFolderTree,
    bookmarkBreadcrumbs,
    bookmarkFolderCards,
    bookmarkItems,
    bookmarksEmpty,
    bookmarksStatus
  };
}
