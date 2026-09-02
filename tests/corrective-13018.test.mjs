import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

class Area {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    if (Array.isArray(keys)) {
      const out = {};
      for (const key of keys) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
      return out;
    }
    return {};
  }
  async set(items) { Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}

globalThis.browser ||= { storage: { local: new Area(), session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const storage = await import("../dist/firefox/core/storage.js");
const { manualGridRenderEquivalent } = await import("../dist/firefox/newtab/ui-utils.js");

function shortcut(id, position, overrides = {}) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image: "", builtinIcon: "",
    colorTag: "", imageStyle: "contain", localImageAssetId: "", imageAssetId: "",
    imageSourceKind: "none", imageSourceUrl: "", position, createdAt: 1, modifiedAt: 1, source: "manual",
    ...overrides
  };
}
function folder(id, position, items) {
  return { type: "folder", id, title: id, position, items, createdAt: 1, modifiedAt: 1 };
}
function stateWith(shortcuts, settings = {}) {
  return model.normalizeState({
    shortcuts,
    settings: { ...constants.DEFAULT_SETTINGS, ...settings },
    settingsModifiedAt: 10,
    updatedAt: 10
  });
}

test("1.30.18 Manual-grid equivalence ignores unrelated Settings but invalidates exact render inputs", () => {
  const base = stateWith([shortcut("a", 0), folder("f", 1, [shortcut("c1", 0), shortcut("c2", 1), shortcut("c3", 2), shortcut("c4", 3), shortcut("c5", 4)])]);
  const unrelated = structuredClone(base);
  unrelated.settings.theme = "light";
  unrelated.settings.backgroundColor = "#112233";
  unrelated.settings.brandVisible = false;
  unrelated.settings.frequentlyVisitedCount = 10;
  assert.equal(manualGridRenderEquivalent(base, unrelated), true, "non-grid Settings must not force a full Manual-grid rebuild");

  for (const mutate of [
    s => { s.shortcuts[0].title = "Renamed"; },
    s => { s.shortcuts[0].url = "https://changed.example/"; },
    s => { s.shortcuts[0].position = 2; },
    s => { s.shortcuts[0].image = "data:image/png;base64,AA=="; },
    s => { s.shortcuts[0].imageSourceKind = "remote"; s.shortcuts[0].imageSourceUrl = "https://changed.example/icon.png"; },
    s => { s.settings.autoSiteIcons = false; },
    s => { s.settings.webAccessPrompted = true; },
    s => { s.settings.columns += 1; },
    s => { s.shortcuts[1].items[1].builtinIcon = "code"; }
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.equal(manualGridRenderEquivalent(base, changed), false);
  }

  const hiddenChildOnly = structuredClone(base);
  hiddenChildOnly.shortcuts[1].items[4].title = "Hidden child changed";
  assert.equal(manualGridRenderEquivalent(base, hiddenChildOnly), true,
    "a closed folder's child after the first four does not alter the top-level grid when the item count is unchanged");
});

test("1.30.18 session render snapshots force Personal when Multiple Spaces is disabled", () => {
  const personal = {
    shortcuts: [shortcut("personal-item", 0)],
    settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: false, spaceName: "Personal" },
    settingsClock: {}, settingsModifiedAt: 100, updatedAt: 100
  };
  const work = {
    shortcuts: [shortcut("work-item", 0)],
    settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: false, spaceName: "Work" },
    settingsClock: {}, settingsModifiedAt: 200, updatedAt: 200
  };
  const inconsistent = model.normalizeState({ activeSpaceId: "work", spaces: { personal, work } });
  assert.equal(inconsistent.activeSpaceId, "work", "the model itself intentionally does not own the local presentation invariant");
  const snapshot = storage.createRenderSnapshot(inconsistent);
  assert.equal(snapshot.activeSpaceId, "personal");
  assert.deepEqual(snapshot.shortcuts.map(item => item.id), ["personal-item"]);
  assert.equal(snapshot.settings.multipleSpacesEnabled, false);
});

test("1.30.18 New Tab external-render optimization remains deliberately fail-closed", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /const canSkipExternalGridRender =\s*!isSettingsOpen\(\) &&\s*!activeFolderId &&\s*folderPopover\.hidden &&\s*shortcutOrderMode !== "recent" &&\s*!isAwaitingRemote\(meta\) &&\s*manualGridRenderEquivalent\(previousStateForSettingsRefresh, state\)/s);
  assert.match(source, /reconcileLauncherAfterExternalState\(\{ renderGrid: !canSkipExternalGridRender \}\)/);
});

test("1.30.18 inactive-Space background preload is gated and resumes when Spaces are enabled", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  assert.match(source, /function preloadOtherSpaceBackgrounds\(\) \{\s*if \(!isMultipleSpacesEnabled\(\)\) return;/s);
  assert.match(source, /async function setMultipleSpacesEnabled\(enabled\)[\s\S]*?if \(enabled\) preloadOtherSpaceBackgrounds\(\);/);
});

test("1.30.18 profile import remains disclosed whole-profile authority", () => {
  const source = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const english = fs.readFileSync("src/shared/core/i18n-locales/en.js", "utf8");
  assert.match(english, /This replaces both Spaces, folders, settings, icons and wallpapers on this browser\./);
  assert.match(english, /the imported profile will also become the synchronized MosaicSync profile on your other computers/);
  assert.match(source, /function stampImportedProfileState\(importedState\)[\s\S]*?for \(const spaceId of SPACE_IDS\)[\s\S]*?settingsClock: Object\.fromEntries\(SETTINGS_SYNC_CLOCK_KEYS\.map/s);
  assert.match(source, /let importedState = stampImportedProfileState\(parsed\.state\);/);
});
