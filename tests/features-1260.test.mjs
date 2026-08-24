import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  DEFAULT_WORKSPACE,
  STATE_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  VERSION
} from "../dist/firefox/core/constants.js";
import {
  makeSettingsRecordNormalized,
  normalizeState,
  stateFromRecords
} from "../dist/firefox/core/model.js";
import {
  createProfilePackage,
  parseProfilePackage,
  serializeProfilePackage
} from "../dist/firefox/core/profile.js";

const themedState = () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    themeWallpapersEnabled: true,
    lightBackgroundPreset: "aurora",
    darkBackgroundPreset: "aetherFlow"
  };
  const personal = { ...DEFAULT_WORKSPACE, settings, settingsModifiedAt: 100, updatedAt: 100 };
  return normalizeState({
    schemaVersion: STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: { personal, work: DEFAULT_WORKSPACE },
    shortcuts: personal.shortcuts,
    settings,
    settingsModifiedAt: 100,
    updatedAt: 100
  });
};

test("1.27.2 public version and schema changes are unified", () => {
  assert.equal(VERSION, "1.27.2");
  assert.equal(STATE_SCHEMA_VERSION, 18);
  assert.equal(SYNC_SCHEMA_VERSION, 10);
});

test("light/dark built-in wallpaper choices survive normalization and Sync reconstruction", () => {
  const state = themedState();
  assert.equal(state.settings.themeWallpapersEnabled, true);
  assert.equal(state.settings.lightBackgroundPreset, "aurora");
  assert.equal(state.settings.darkBackgroundPreset, "aetherFlow");

  const settingsRecord = makeSettingsRecordNormalized(state, "device-a");
  assert.equal(settingsRecord.settings.themeWallpapersEnabled, true);
  assert.equal(settingsRecord.settings.lightBackgroundPreset, "aurora");
  assert.equal(settingsRecord.settings.darkBackgroundPreset, "aetherFlow");
  for (const localOnly of ["frequentlyVisitedCount", "deviceDefaultSpace", "bookmarkFolderColors"]) {
    assert.equal(Object.hasOwn(settingsRecord.settings, localOnly), false, `${localOnly} must stay out of browser Sync`);
  }

  const rebuilt = stateFromRecords(new Map(), settingsRecord, state, new Map());
  assert.equal(rebuilt.settings.themeWallpapersEnabled, true);
  assert.equal(rebuilt.settings.lightBackgroundPreset, "aurora");
  assert.equal(rebuilt.settings.darkBackgroundPreset, "aetherFlow");
});

test("invalid theme wallpaper preset identifiers are rejected at the state boundary", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    themeWallpapersEnabled: true,
    lightBackgroundPreset: "../../evil",
    darkBackgroundPreset: "https://example.invalid/image.jpg"
  };
  const personal = { ...DEFAULT_WORKSPACE, settings };
  const state = normalizeState({
    schemaVersion: STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: { personal, work: DEFAULT_WORKSPACE },
    shortcuts: personal.shortcuts,
    settings,
    settingsModifiedAt: 0,
    updatedAt: 0
  });
  assert.equal(state.settings.lightBackgroundPreset, "");
  assert.equal(state.settings.darkBackgroundPreset, "");
});

test("profile backup carries the frequently-visited count but not device Space choice or bookmark color IDs", async () => {
  const packaged = await createProfilePackage(themedState(), {
    uiLocale: "fr",
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 8,
    deviceDefaultSpace: "work",
    bookmarkFolderColors: { "42": "violet" }
  });
  assert.deepEqual(packaged.profile.preferences, {
    uiLocale: "fr",
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 8
  });
  const parsed = await parseProfilePackage(serializeProfilePackage(packaged));
  assert.deepEqual(parsed.preferences, {
    uiLocale: "fr",
    frequentlyVisitedEnabled: true,
    frequentlyVisitedCount: 8
  });
});

test("1.26.0 New Tab interaction code implements requested mouse, Space and frequent-site behavior in both browsers", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(js, /card\.addEventListener\("contextmenu", event => \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*openShortcutInNewTab\(item\);/s,
      `${browser}: shortcut right-click should open a background tab`);
    assert.match(js, /card\.addEventListener\("auxclick"[\s\S]*?event\.button !== 1[\s\S]*?expect-shortcut-navigation/,
      `${browser}: shortcut middle-click should preserve native new-tab behavior and navigation tracking`);
    assert.match(js, /showFrequentSiteContextMenu\(event, site\)/, `${browser}: frequent sites need a right-click menu`);
    for (const key of ["openInNewTab", "addShortcut", "addToBookmarks"]) assert.ok(js.includes(`t("${key}")`), `${browser}: missing frequent menu action ${key}`);
    assert.match(js, /event\.altKey[\s\S]*event\.shiftKey[\s\S]*event\.code === "Digit1"[\s\S]*"personal"[\s\S]*event\.code === "Digit2"[\s\S]*"work"/,
      `${browser}: Alt+Shift+1/2 Space switching missing`);
    assert.match(js, /FREQUENTLY_VISITED_COUNT_PREF_KEY/, `${browser}: frequent count preference missing`);
    assert.match(js, /BOOKMARK_FOLDER_COLORS_PREF_KEY/, `${browser}: bookmark-folder color preference missing`);
  }
});

test("new 1.26.0 labels are localized in all 32 UI catalogs and are not hardcoded into the new HTML controls", async () => {
  const required = [
    "openSpaceOnThisDevice", "lastUsed", "spaceKeyboardHint", "frequentCount",
    "lightDarkWallpapers", "themeWallpapersDescription", "useCurrentBackground",
    "openInNewTab", "addToBookmarks", "bookmarkAdded", "folderColor"
  ];
  for (const browser of ["firefox", "chrome"]) {
    const localeDir = `dist/${browser}/core/i18n-locales`;
    const files = (await readdir(localeDir)).filter(name => name.endsWith(".js"));
    assert.equal(files.length, 32);
    for (const file of files) {
      const { MESSAGES } = await import(`../${localeDir}/${file}?feature126-${Date.now()}-${file}`);
      for (const key of required) assert.ok(String(MESSAGES[key] || "").trim(), `${browser}/${file}: missing ${key}`);
      assert.doesNotMatch(MESSAGES.frequentlyVisitedDescription, /up to five|jusqu[’']à cinq|hasta cinco|fino a cinque/i,
        `${browser}/${file}: frequently-visited description still hardcodes five`);
    }
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    for (const english of [
      "Default Space on this device", "Number shown", "Separate light and dark wallpapers",
      "Current background", "Open in new tab", "Add to bookmarks", "Folder color"
    ]) assert.equal(html.includes(english), false, `${browser}: new UI English must not be hardcoded in HTML: ${english}`);
  }
});

test("bookmark creation is user-triggered and limited to normal http(s) URLs", async () => {
  const previous = globalThis.browser;
  const created = [];
  globalThis.browser = { bookmarks: { create: async value => { created.push(value); return { id: "1", ...value }; } } };
  try {
    const { createBookmark } = await import(`../dist/firefox/core/bookmarks.js?feature126-bookmarks-${Date.now()}`);
    assert.equal(await createBookmark({ title: "Bad", url: "javascript:alert(1)" }), null);
    assert.equal(created.length, 0);
    const result = await createBookmark({ title: "Example", url: "https://example.com/" });
    assert.equal(result.url, "https://example.com/");
    assert.deepEqual(created, [{ title: "Example", url: "https://example.com/" }]);
  } finally {
    if (previous === undefined) delete globalThis.browser;
    else globalThis.browser = previous;
  }
});

test("Unsplash/network wallpaper gallery integration is intentionally absent from 1.26.0", async () => {
  for (const browser of ["firefox", "chrome"]) {
    for (const file of ["newtab/newtab.js", "newtab/newtab.html", "manifest.json"]) {
      const source = await readFile(`dist/${browser}/${file}`, "utf8");
      assert.doesNotMatch(source, /unsplash/i);
    }
  }
});
