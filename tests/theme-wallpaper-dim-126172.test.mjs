import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE } from "../dist/firefox/core/constants.js";
import {
  effectiveBackgroundDimForTheme,
  initializeThemeWallpaperDims,
  makeSettingsRecordNormalized,
  normalizeState,
  stateFromRecords
} from "../dist/firefox/core/model.js";
import { createProfilePackage, parseProfilePackage, serializeProfilePackage } from "../dist/firefox/core/profile.js";

function themedState(overrides = {}) {
  const settings = {
    ...DEFAULT_SETTINGS,
    backgroundDim: 28,
    theme: "system",
    themeWallpapersEnabled: true,
    lightBackgroundPreset: "softLight",
    darkBackgroundPreset: "midnight",
    lightBackgroundDim: 6,
    darkBackgroundDim: 38,
    ...overrides
  };
  const personal = { ...DEFAULT_WORKSPACE, settings, settingsModifiedAt: 200, updatedAt: 200 };
  return normalizeState({
    activeSpaceId: "personal",
    spaces: { personal, work: DEFAULT_WORKSPACE },
    shortcuts: personal.shortcuts,
    settings,
    settingsModifiedAt: 200,
    updatedAt: 200
  });
}

test("1.26.17.2 migrates the legacy shared darkness into only the currently active appearance", () => {
  const legacy = {
    ...DEFAULT_SETTINGS,
    backgroundDim: 42,
    themeWallpapersEnabled: true,
    lightBackgroundDim: null,
    darkBackgroundDim: null
  };
  assert.deepEqual(initializeThemeWallpaperDims(legacy, "dark"), {
    changed: true,
    lightBackgroundDim: 0,
    darkBackgroundDim: 42
  });
  assert.deepEqual(initializeThemeWallpaperDims(legacy, "light"), {
    changed: true,
    lightBackgroundDim: 42,
    darkBackgroundDim: 0
  });
});

test("1.26.17.2 uses independent Light/Dark darkness only while separate wallpapers are enabled", () => {
  const settings = themedState().settings;
  assert.equal(effectiveBackgroundDimForTheme(settings, "light"), 6);
  assert.equal(effectiveBackgroundDimForTheme(settings, "dark"), 38);
  assert.equal(effectiveBackgroundDimForTheme({ ...settings, themeWallpapersEnabled: false }, "light"), 28);
  assert.equal(effectiveBackgroundDimForTheme({ ...settings, themeWallpapersEnabled: false }, "dark"), 28);
});

test("unmigrated legacy darkness does not publish placeholder Light/Dark fields into browser Sync", () => {
  const legacy = themedState({ lightBackgroundDim: null, darkBackgroundDim: null });
  const record = makeSettingsRecordNormalized(legacy, "device-a");
  assert.equal(Object.hasOwn(record.settings, "lightBackgroundDim"), false);
  assert.equal(Object.hasOwn(record.settings, "darkBackgroundDim"), false);
});

test("1.26.17.2 per-appearance darkness survives normalization and browser Sync reconstruction", () => {
  const state = themedState();
  assert.equal(state.settings.lightBackgroundDim, 6);
  assert.equal(state.settings.darkBackgroundDim, 38);
  const record = makeSettingsRecordNormalized(state, "device-a");
  assert.equal(record.settings.lightBackgroundDim, 6);
  assert.equal(record.settings.darkBackgroundDim, 38);
  const rebuilt = stateFromRecords(new Map(), record, state, new Map());
  assert.equal(rebuilt.settings.lightBackgroundDim, 6);
  assert.equal(rebuilt.settings.darkBackgroundDim, 38);
});

test("older synchronized settings cannot erase already-migrated per-appearance darkness", () => {
  const local = themedState({ lightBackgroundDim: 9, darkBackgroundDim: 44 });
  const oldRecord = makeSettingsRecordNormalized(local, "old-device");
  delete oldRecord.settings.lightBackgroundDim;
  delete oldRecord.settings.darkBackgroundDim;
  oldRecord.modifiedAt = local.settingsModifiedAt + 100;
  const rebuilt = stateFromRecords(new Map(), oldRecord, local, new Map());
  assert.equal(rebuilt.settings.lightBackgroundDim, 9);
  assert.equal(rebuilt.settings.darkBackgroundDim, 44);
});

test("complete .mosaicsync profile backup preserves both wallpaper darkness values", async () => {
  const packageData = await createProfilePackage(themedState(), {
    uiLocale: "auto",
    frequentlyVisitedEnabled: false,
    frequentlyVisitedCount: 5
  });
  const parsed = await parseProfilePackage(serializeProfilePackage(packageData));
  assert.equal(parsed.state.spaces.personal.settings.lightBackgroundDim, 6);
  assert.equal(parsed.state.spaces.personal.settings.darkBackgroundDim, 38);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.2 ${browser} UI couples each theme wallpaper with its own darkness control`, async () => {
    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(html, /id="settingsLightWallpaperDim"/);
    assert.match(html, /id="settingsDarkWallpaperDim"/);
    assert.match(html, /id="backgroundDimControls"/);
    assert.match(js, /effectiveBackgroundDimForTheme\(settings, effectiveThemeFor\(settings\)\)/,
      "first-paint hint should persist the active appearance's darkness");
    assert.match(js, /setProperty\("--background-dim", String\(effectiveBackgroundDim\(settings\) \/ 100\)\)/,
      "runtime wallpaper rendering should always use the effective appearance darkness");
    assert.match(js, /settingsLightWallpaperDim\?\.addEventListener\("input"/);
    assert.match(js, /settingsDarkWallpaperDim\?\.addEventListener\("input"/);
    assert.match(js, /backgroundDimControls\.hidden = enabled/,
      "legacy single darkness control should be hidden while separate wallpapers are enabled");
    assert.match(js, /t\("backgroundDarkness"\)/,
      "new controls must reuse the localized darkness label rather than hardcoded English");
  });
}
