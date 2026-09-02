/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser bookmark access for MosaicSync.
 * The optional permission is requested only from an explicit user gesture.
 * Reading remains local; creation happens only when the user explicitly asks for it.
 * Bookmark data is never copied into MosaicSync state or browser Sync.
 */

const BOOKMARKS_PERMISSION = Object.freeze({ permissions: ["bookmarks"] });

export async function hasBookmarksPermission() {
  if (!browser.permissions?.contains) return false;
  try {
    return await browser.permissions.contains(BOOKMARKS_PERMISSION);
  } catch {
    return false;
  }
}

export async function requestBookmarksPermissionFromGesture() {
  if (!browser.permissions?.request) return false;
  return Boolean(await browser.permissions.request(BOOKMARKS_PERMISSION));
}


export function isWebBookmarkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function readBookmarkTree() {
  if (!browser.bookmarks?.getTree) return [];
  const tree = await browser.bookmarks.getTree();
  return Array.isArray(tree) ? tree : [];
}

export function flattenBookmarkFolders(tree) {
  const folders = [];
  const walk = (nodes, depth = 0, parentId = "") => {
    for (const node of nodes || []) {
      if (!node || typeof node !== "object") continue;
      if (node.type === "separator") continue;
      const children = Array.isArray(node.children) ? node.children : [];
      const isFolder = node.type === "folder" || !node.url;
      if (isFolder) {
        folders.push({
          id: String(node.id ?? ""),
          title: String(node.title || ""),
          depth,
          parentId
        });
        walk(children, depth + 1, String(node.id ?? ""));
      }
    }
  };
  walk(tree, 0, "");
  return folders;
}

export function flattenBookmarks(tree) {
  const bookmarks = [];
  const walk = (nodes, path = []) => {
    for (const node of nodes || []) {
      if (!node || typeof node !== "object") continue;
      const children = Array.isArray(node.children) ? node.children : [];
      if (typeof node.url === "string" && isWebBookmarkUrl(node.url)) {
        bookmarks.push({
          id: String(node.id ?? ""),
          title: String(node.title || node.url),
          url: node.url,
          path: path.filter(Boolean)
        });
      }
      if (children.length) walk(children, [...path, String(node.title || "")]);
    }
  };
  walk(tree);
  return bookmarks;
}

export function directFolderBookmarks(folderNode) {
  return (folderNode?.children || [])
    .filter(node => node && typeof node.url === "string" && isWebBookmarkUrl(node.url))
    .map(node => ({
      id: String(node.id ?? ""),
      title: String(node.title || node.url),
      url: node.url,
      path: []
    }));
}

export function directChildFolders(folderNode) {
  return (folderNode?.children || [])
    .filter(node => node && node.type !== "separator" && Array.isArray(node.children) && !node.url)
    .map(node => ({
      id: String(node.id ?? ""),
      title: String(node.title || "")
    }));
}

export async function createBookmark({ title = "", url = "" } = {}) {
  if (!browser.bookmarks?.create || !isWebBookmarkUrl(url)) return null;
  return browser.bookmarks.create({ title: String(title || url).slice(0, 255), url });
}
