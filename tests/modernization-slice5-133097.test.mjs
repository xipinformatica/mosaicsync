// @kind behavioral
// Slice 5: one pending-wallpaper reset and one immediate settings persistence owner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("src/shared/newtab/newtab.js", "utf8");
function extractFunction(name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} is present`);
  const end = source.indexOf("\n  function ", start + marker.length);
  assert.ok(end > start, `${name} has an independent lexical boundary`);
  return source.slice(start, end);
}

test("Slice 5: the wallpaper artwork reset cancels old uploads and clears metadata, retaining the requested preset", () => {
  const ctx = vm.createContext({
    backgroundUploadGeneration: 7,
    pendingBackgroundImage: "data:image/png;base64,OLD",
    pendingBackgroundSourceKind: "upload",
    pendingBackgroundSourceUrl: "https://old.test/wallpaper.png",
    pendingBackgroundPreset: "previous",
    pendingBackgroundColorCustomized: true
  });
  vm.runInContext(`${extractFunction("clearPendingBackgroundArtwork")}\nthis.resetForTest = clearPendingBackgroundArtwork;`, ctx);
  ctx.resetForTest("mountain");
  assert.equal(ctx.backgroundUploadGeneration, 8);
  assert.equal(ctx.pendingBackgroundImage, "");
  assert.equal(ctx.pendingBackgroundSourceKind, "none");
  assert.equal(ctx.pendingBackgroundSourceUrl, "");
  assert.equal(ctx.pendingBackgroundPreset, "mountain");
  assert.equal(ctx.pendingBackgroundColorCustomized, true, "don't reset user-selected color");
  ctx.pendingBackgroundImage = "data:image/png;base64,NEW";
  ctx.resetForTest();
  assert.equal(ctx.backgroundUploadGeneration, 9);
  assert.equal(ctx.pendingBackgroundImage, "");
  assert.equal(ctx.pendingBackgroundPreset, "");
});

test("Slice 5: plain/preset/clear/reset paths all share pending artwork reset without changing their individual side effects", () => {
  const plain = extractFunction("selectPlainColorBackground");
  const preset = extractFunction("createBackgroundChoice");
  assert.match(plain, /clearPendingBackgroundArtwork\(\);/);
  assert.match(plain, /pendingBackgroundColorCustomized = true/);
  assert.match(preset, /if \(plain\) \{\s*selectPlainColorBackground\(\{ closeGallery \}\)/);
  assert.match(preset, /clearPendingBackgroundArtwork\(id\);/);
  assert.match(preset, /if \(wallpaperGalleryDialog\?\.open\) renderWallpaperGallery\(\)/);
  const clear = source.slice(source.indexOf('clearBackgroundImage.addEventListener("click"'), source.indexOf('resetBackground.addEventListener("click"'));
  const reset = source.slice(source.indexOf('resetBackground.addEventListener("click"'), source.indexOf('settingsAutoSiteIcons?.addEventListener("change"'));
  assert.match(clear, /clearPendingBackgroundArtwork\(\)/);
  assert.match(clear, /showToast\(t\("backgroundCleared"\)\)/);
  assert.doesNotMatch(clear, /pendingBackgroundColorCustomized = false/);
  assert.match(reset, /clearPendingBackgroundArtwork\(\)/);
  assert.match(reset, /pendingBackgroundColorCustomized = false/);
  assert.match(reset, /settingsBackgroundDim\.value = String\(DEFAULT_STATE\.settings\.backgroundDim\)/);
});

test("Slice 5: immediate background persistence clears timer and preserves translated error presentation", async () => {
  const cleared = [], notices = [];
  const context = vm.createContext({
    backgroundPersistTimer: 431,
    clearTimeout(timer) { cleared.push(timer); },
    saveSettingsState: () => Promise.reject(new Error("storage unavailable")),
    localizePresentationError(error, key) { return `${key}:${error.message}`; },
    showToast(text) { notices.push(text); }
  });
  vm.runInContext(`${extractFunction("persistBackgroundSettingsImmediately")}\nthis.persistNow = persistBackgroundSettingsImmediately;`, context);
  context.persistNow();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(cleared, [431]);
  assert.deepEqual(notices, ["operationFailed:storage unavailable"]);
  const sourceCalls = [
    'settingsLightWallpaperDim?.addEventListener("change", persistBackgroundSettingsImmediately)',
    'settingsDarkWallpaperDim?.addEventListener("change", persistBackgroundSettingsImmediately)',
    'backgroundColorHue?.addEventListener("change", persistBackgroundSettingsImmediately)',
    'settingsBackgroundDim.addEventListener("change", persistBackgroundSettingsImmediately)',
    'backgroundColorPlane.releasePointerCapture?.(event.pointerId);\n    persistBackgroundSettingsImmediately();'
  ];
  for (const call of sourceCalls) assert.ok(source.includes(call), `${call} still shares the immediate owner`);
});
