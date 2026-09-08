/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { BOOKMARK_FOLDER_COLORS_PREF_KEY, PRODUCT_NAME } from "../core/constants.js";
import { localizeDocument, t } from "../core/i18n.js";
import { hexLuminance } from "../core/model.js";

const BOOKMARK_FOLDER_COLOR_PALETTE = Object.freeze({
  violet: "#8b5cf6", blue: "#3b82f6", teal: "#14b8a6", green: "#10b981",
  amber: "#f59e0b", red: "#ef4444", pink: "#ec4899"
});

/**
 * Own the Bookmarks dialog's device-local UI state and rendering lifecycle.
 * Browser bookmark access remains lazy through loadBookmarksModule(), while the
 * New Tab orchestrator retains global menu coordination and first-paint work.
 */
export function createBookmarksController({
  loadBookmarksModule,
  ensureSecondaryStyles,
  closeDialog,
  positionFloatingMenu,
  graphemeSegmenter,
  elements = {}
} = {}) {
  const {
    bookmarksButton,
    bookmarksDialog,
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
  } = elements;

  let bookmarksApi = null;
  let bookmarkTree = [];
  let bookmarkFolders = [];
  let bookmarkAllItems = [];
  let activeBookmarkFolderId = "all";
  let bookmarkFolderColors = {};
  let bookmarkColorMenu = null;

  function readBookmarkFolderColors() {
    try {
      const raw = JSON.parse(localStorage.getItem(BOOKMARK_FOLDER_COLORS_PREF_KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const safe = {};
      for (const [folderId, colorKey] of Object.entries(raw)) {
        if (typeof folderId === "string" && folderId.length <= 256 && BOOKMARK_FOLDER_COLOR_PALETTE[colorKey]) safe[folderId] = colorKey;
      }
      return safe;
    } catch {
      return {};
    }
  }

  function writeBookmarkFolderColors() {
    try { localStorage.setItem(BOOKMARK_FOLDER_COLORS_PREF_KEY, JSON.stringify(bookmarkFolderColors)); } catch {}
  }

  function bookmarkFolderRecord(id) {
    return bookmarkFolders.find(folder => folder.id === id) || null;
  }

  function bookmarkNodeRecord(id) {
    const wanted = String(id ?? "");
    const stack = [...(bookmarkTree || [])];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (String(node.id ?? "") === wanted) return node;
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return null;
  }

  function bookmarkFolderPath(id) {
    const path = [];
    let current = bookmarkFolderRecord(id);
    const seen = new Set();
    while (current && current.id && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.title) path.unshift(current.title);
      current = current.parentId ? bookmarkFolderRecord(current.parentId) : null;
    }
    return path;
  }

  function bookmarkDisplayHost(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./i, "") || parsed.protocol.replace(":", "");
    } catch {
      return url;
    }
  }

  function bookmarkInitial(item) {
    const source = String(item?.title || bookmarkDisplayHost(item?.url || "") || "★").trim();
    return graphemeSegmenter ? [...graphemeSegmenter.segment(source)][0]?.segment || "★" : Array.from(source)[0] || "★";
  }

  function createBookmarkLink(item, { showPath = false } = {}) {
    const link = document.createElement("a");
    link.className = "bookmark-item";
    link.href = item.url;
    link.title = `${item.title}\n${item.url}`;
    link.setAttribute("aria-label", `${t("openBookmark")}: ${item.title}`);

    const icon = document.createElement("span");
    icon.className = "bookmark-item-icon";
    icon.textContent = bookmarkInitial(item);
    icon.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "bookmark-item-copy";
    const title = document.createElement("strong");
    title.className = "bookmark-item-title";
    title.textContent = item.title || item.url;
    const url = document.createElement("small");
    url.className = "bookmark-item-url";
    url.textContent = bookmarkDisplayHost(item.url);
    copy.append(title, url);
    if (showPath && item.path?.length) {
      const path = document.createElement("small");
      path.className = "bookmark-item-path";
      path.textContent = item.path.join(" › ");
      copy.append(path);
    }
    link.append(icon, copy);
    return link;
  }

  function closeColorMenu() {
    if (bookmarkColorMenu?.isConnected) {
      try { bookmarkColorMenu.hidePopover?.(); } catch {}
      bookmarkColorMenu.remove();
    }
    bookmarkColorMenu = null;
  }

  function closeColorMenuIfOutside(target) {
    if (bookmarkColorMenu?.isConnected && !bookmarkColorMenu.contains(target)) closeColorMenu();
  }

  function applyBookmarkFolderColor(button, folderId) {
    const colorKey = bookmarkFolderColors[String(folderId || "")];
    const color = BOOKMARK_FOLDER_COLOR_PALETTE[colorKey] || "";
    button.classList.toggle("has-folder-color", Boolean(color));
    if (color) {
      button.style.setProperty("--bookmark-folder-color", color);
      button.style.setProperty("--bookmark-folder-contrast", hexLuminance(color) > 0.46 ? "#201a26" : "#ffffff");
    } else {
      button.style.removeProperty("--bookmark-folder-color");
      button.style.removeProperty("--bookmark-folder-contrast");
    }
  }

  function showBookmarkFolderColorMenu(event, folder) {
    closeColorMenu();
    const folderId = String(folder?.id || "");
    if (!folderId) return;
    const menu = document.createElement("div");
    menu.className = "bookmark-color-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", t("folderColor"));

    const addSwatch = (colorKey, color, reset = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.dataset.reset = reset ? "true" : "false";
      if (color) button.style.backgroundColor = color;
      const label = reset ? t("reset") : `${t("folderColor")} ${Object.keys(BOOKMARK_FOLDER_COLOR_PALETTE).indexOf(colorKey) + 1}`;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (reset) delete bookmarkFolderColors[folderId];
        else bookmarkFolderColors[folderId] = colorKey;
        writeBookmarkFolderColors();
        closeColorMenu();
        renderBookmarkBrowser();
      });
      menu.append(button);
    };
    addSwatch("", "", true);
    for (const [colorKey, color] of Object.entries(BOOKMARK_FOLDER_COLOR_PALETTE)) addSwatch(colorKey, color, false);
    // A modal <dialog> makes DOM outside the dialog inert. The palette must be
    // a *descendant* of the Bookmarks dialog before it enters the popover top
    // layer; appending it to <body> makes it visible but unclickable. Keeping
    // dialog ancestry also gives the non-Popover fallback normal interaction.
    menu.setAttribute("popover", "manual");
    bookmarksDialog?.append(menu);
    bookmarkColorMenu = menu;
    try { menu.showPopover(); } catch {
      // Firefox 140+ and current Chromium support Popover. In unusual runtimes
      // it remains an ordinary positioned child of the active modal dialog.
      menu.removeAttribute("popover");
    }
    positionFloatingMenu(menu, event.clientX, event.clientY);
    menu.querySelector("button")?.focus({ preventScroll: true });
  }

  function createBookmarkFolderButton(folder, { card = false } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = card ? "bookmark-folder-card" : "bookmark-folder-button";
    if (!card) {
      button.style.paddingInlineStart = `${8 + Math.max(0, folder.depth - 1) * 13}px`;
      button.classList.toggle("selected", activeBookmarkFolderId === folder.id);
    }
    const label = document.createElement("span");
    label.textContent = folder.title || t("folder");
    button.append(label);
    button.title = `${folder.title || t("folder")} · ${t("folderColor")}`;
    applyBookmarkFolderColor(button, folder.id);
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      showBookmarkFolderColorMenu(event, folder);
    });
    button.addEventListener("click", () => {
      activeBookmarkFolderId = folder.id;
      if (bookmarksSearch) bookmarksSearch.value = "";
      renderBookmarkBrowser();
    });
    return button;
  }

  function renderBookmarkSidebar() {
    if (!bookmarkFolderTree) return;
    bookmarkFolderTree.replaceChildren();
    const all = document.createElement("button");
    all.type = "button";
    all.className = "bookmark-folder-button";
    all.classList.toggle("selected", activeBookmarkFolderId === "all");
    const allLabel = document.createElement("span");
    allLabel.textContent = t("allBookmarks");
    all.append(allLabel);
    all.addEventListener("click", () => {
      activeBookmarkFolderId = "all";
      if (bookmarksSearch) bookmarksSearch.value = "";
      renderBookmarkBrowser();
    });
    bookmarkFolderTree.append(all);

    for (const folder of bookmarkFolders) {
      if (!folder.title || folder.depth === 0) continue;
      bookmarkFolderTree.append(createBookmarkFolderButton(folder));
    }
  }

  function renderBookmarkBrowser() {
    if (!bookmarksBrowser || !bookmarkItems || !bookmarkFolderCards || !bookmarksEmpty) return;
    renderBookmarkSidebar();
    bookmarkItems.replaceChildren();
    bookmarkFolderCards.replaceChildren();

    const query = String(bookmarksSearch?.value || "").trim().toLocaleLowerCase();
    let items = [];
    let childFolders = [];
    let breadcrumb = "";
    let showPath = false;

    if (query) {
      items = bookmarkAllItems.filter(item =>
        `${item.title} ${item.url} ${(item.path || []).join(" ")}`.toLocaleLowerCase().includes(query)
      );
      breadcrumb = t("searchBookmarks");
      showPath = true;
    } else if (activeBookmarkFolderId === "all") {
      items = bookmarkAllItems;
      const rootNode = bookmarkTree[0] || null;
      childFolders = bookmarksApi.directChildFolders(rootNode).map(folder => ({ ...folder, depth: 1, parentId: String(rootNode?.id || "") }));
      breadcrumb = t("allBookmarks");
      showPath = true;
    } else {
      const folder = bookmarkFolderRecord(activeBookmarkFolderId);
      if (folder) {
        const folderNode = bookmarkNodeRecord(folder.id);
        items = bookmarksApi.directFolderBookmarks(folderNode);
        childFolders = bookmarksApi.directChildFolders(folderNode).map(child => ({ ...child, depth: folder.depth + 1, parentId: folder.id }));
        breadcrumb = bookmarkFolderPath(folder.id).join(" › ") || folder.title;
      }
    }

    if (bookmarkBreadcrumbs) bookmarkBreadcrumbs.textContent = breadcrumb;
    if (bookmarksCount) bookmarksCount.textContent = t("bookmarksCount", { count: items.length });

    const folderFragment = document.createDocumentFragment();
    for (const folder of childFolders) folderFragment.append(createBookmarkFolderButton(folder, { card: true }));
    bookmarkFolderCards.append(folderFragment);

    const itemFragment = document.createDocumentFragment();
    for (const item of items) itemFragment.append(createBookmarkLink(item, { showPath }));
    bookmarkItems.append(itemFragment);

    const empty = items.length === 0 && childFolders.length === 0;
    bookmarksEmpty.hidden = !empty;
    if (empty) {
      const strong = bookmarksEmpty.querySelector("strong");
      const detail = bookmarksEmpty.querySelector("span");
      if (strong) strong.textContent = query ? t("noSearchResults") : t("noBookmarksHere");
      if (detail) detail.textContent = query ? t("searchResultHint") : t("chooseFolderOrSearch");
    }
  }

  async function loadBookmarksIntoDialog() {
    if (!bookmarksPermissionState || !bookmarksBrowser) return;
    bookmarksStatus.textContent = "";
    const api = await loadBookmarksModule();
    bookmarksApi = api;
    const allowed = await api.hasBookmarksPermission();
    bookmarksPermissionState.hidden = allowed;
    bookmarksBrowser.hidden = !allowed;
    if (!allowed) {
      queueMicrotask(() => bookmarksPermissionButton?.focus());
      return;
    }

    try {
      bookmarkTree = await api.readBookmarkTree();
      bookmarkFolders = api.flattenBookmarkFolders(bookmarkTree);
      bookmarkAllItems = api.flattenBookmarks(bookmarkTree);
      bookmarkFolderColors = readBookmarkFolderColors();
      const validFolderIds = new Set(bookmarkFolders.map(folder => String(folder.id || "")).filter(Boolean));
      let prunedFolderColors = false;
      for (const folderId of Object.keys(bookmarkFolderColors)) {
        if (validFolderIds.has(folderId)) continue;
        delete bookmarkFolderColors[folderId];
        prunedFolderColors = true;
      }
      if (prunedFolderColors) writeBookmarkFolderColors();
      activeBookmarkFolderId = "all";
      renderBookmarkBrowser();
      queueMicrotask(() => bookmarksSearch?.focus());
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: bookmark read failed`, error);
      bookmarksBrowser.hidden = true;
      bookmarksPermissionState.hidden = false;
      bookmarksStatus.textContent = t("bookmarksLoadError");
    }
  }

  async function open() {
    if (!bookmarksDialog) return;
    if (bookmarksDialog.open) {
      closeDialog(bookmarksDialog);
      return;
    }
    await ensureSecondaryStyles();
    bookmarksApi = await loadBookmarksModule();
    localizeDocument(bookmarksDialog);
    bookmarksDialog.showModal();
    await loadBookmarksIntoDialog();
  }

  async function requestPermissionFromGesture() {
    bookmarksStatus.textContent = "";
    try {
      const permissionPromise = bookmarksApi?.requestBookmarksPermissionFromGesture?.();
      if (!permissionPromise) throw new Error("BOOKMARK_MODULE_NOT_READY");
      const granted = await permissionPromise;
      if (!granted) {
        bookmarksStatus.textContent = t("bookmarksPermissionDenied");
        return;
      }
      bookmarksStatus.textContent = t("permissionGranted");
      await loadBookmarksIntoDialog();
    } catch (error) {
      console.warn(`${PRODUCT_NAME}: bookmark permission request failed`, error);
      bookmarksStatus.textContent = t("permissionRequestFailed");
    }
  }

  function reset() {
    closeColorMenu();
    bookmarkTree = [];
    bookmarkFolders = [];
    bookmarkAllItems = [];
    activeBookmarkFolderId = "all";
    if (bookmarksSearch) bookmarksSearch.value = "";
    bookmarkFolderTree?.replaceChildren();
    bookmarkFolderCards?.replaceChildren();
    bookmarkItems?.replaceChildren();
    if (bookmarksStatus) bookmarksStatus.textContent = "";
  }

  function refreshLocalizedUi() {
    if (!bookmarkTree.length) return;
    renderBookmarkSidebar();
    renderBookmarkBrowser();
  }

  function hydratePostPaintPreferences() {
    bookmarkFolderColors = readBookmarkFolderColors();
  }

  function bind() {
    bookmarksButton?.addEventListener("click", () => { void open(); });
    bookmarksPermissionButton?.addEventListener("click", () => { void requestPermissionFromGesture(); });
    bookmarksSearch?.addEventListener("input", renderBookmarkBrowser);
    bookmarksDialog?.addEventListener("close", reset);
    bookmarksDialog?.addEventListener("click", event => {
      if (event.target === bookmarksDialog) closeDialog(bookmarksDialog);
    });
  }

  return Object.freeze({
    bind,
    closeColorMenu,
    closeColorMenuIfOutside,
    hydratePostPaintPreferences,
    open,
    refreshLocalizedUi
  });
}
