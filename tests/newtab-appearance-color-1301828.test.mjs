import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { validHex } from "../src/shared/core/model.js";
import { clampUnit, hexToRgb, rgbToHsv, hsvToHex, normalizeHexColor } from "../src/shared/newtab/appearance-color.js";

function oldClampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
function oldHexToRgb(hex) {
  if (!validHex(hex)) return null;
  const value = String(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}
function oldRgbToHsv({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}
function oldHsvToHex(hue, saturation, value) {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = oldClampUnit(saturation);
  const v = oldClampUnit(value);
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = v - chroma;
  let rgb = [0, 0, 0];
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb.map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function oldNormalizeHexColor(value) {
  let text = String(value || "").trim();
  if (/^[0-9a-f]{6}$/i.test(text)) text = `#${text}`;
  return validHex(text) ? text.toLowerCase() : "";
}

function extractSwatchStartupBlock(source) {
  const startMarker = '  document.querySelectorAll("[data-color-swatch]").forEach(button => {';
  const endMarker = '  moreWallpapersButton?.addEventListener("click", () => {';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "generated New Tab must retain the reviewed color-swatch startup block");
  return source.slice(start, end);
}

test("1.30.18.28 appearance-color extraction preserves the exact 1.30.18.25 one-argument public contract", () => {
  assert.equal(clampUnit.length, 1);
  assert.equal(hexToRgb.length, 1, "hexToRgb must not require an injected validator");
  assert.equal(rgbToHsv.length, 1);
  assert.equal(hsvToHex.length, 3);
  assert.equal(normalizeHexColor.length, 1, "normalizeHexColor must not require an injected validator");

  for (const value of [undefined, null, "", -1, 0, 0.25, 1, 2, "0.5", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(clampUnit(value), oldClampUnit(value));
  }
  for (const value of ["#000000", "#ffffff", "#2B0050", "2b0050", " bad ", "", null]) {
    assert.deepEqual(hexToRgb(value), oldHexToRgb(value));
    assert.equal(normalizeHexColor(value), oldNormalizeHexColor(value));
  }
  for (const rgb of [{r:0,g:0,b:0},{r:255,g:255,b:255},{r:255,g:0,b:0},{r:43,g:0,b:80},{r:12,g:200,b:99}]) {
    assert.deepEqual(rgbToHsv(rgb), oldRgbToHsv(rgb));
  }
  for (const vector of [[0,0,0],[0,1,1],[60,1,1],[120,1,1],[180,1,1],[240,1,1],[300,1,1],[-60,1,1],[420,.4,.8],[33,-1,2]]) {
    assert.equal(hsvToHex(...vector), oldHsvToHex(...vector));
  }
});

test("1.30.18.28 extracted color owner is pure while every existing New Tab call site keeps the old call shape", async () => {
  const owner = await fs.readFile("src/shared/newtab/appearance-color.js", "utf8");
  const newtab = await fs.readFile("src/shared/newtab/newtab.js", "utf8");
  assert.doesNotMatch(owner, /\bbrowser\.|\bdocument\.|\bwindow\.|\blocalStorage\b|\bsessionStorage\b|Date\.now|setTimeout|setInterval|requestAnimationFrame|\basync\b|\bawait\b/);
  assert.match(owner, /import \{ validHex \} from "\.\.\/core\/model\.js";/,
    "the extracted owner must carry its old pure validation dependency itself");
  assert.match(newtab, /from "\.\/appearance-color\.js"/);
  for (const name of ["clampUnit", "hexToRgb", "rgbToHsv", "hsvToHex", "normalizeHexColor"]) {
    assert.doesNotMatch(newtab, new RegExp(`function\\s+${name}\\s*\\(`));
  }
  assert.doesNotMatch(newtab, /normalizeHexColor\([^\n)]*,/, "no normalizeHexColor caller may be rewritten to inject dependencies");
  assert.doesNotMatch(newtab, /hexToRgb\([^\n)]*,/, "no hexToRgb caller may be rewritten to inject dependencies");
  assert.match(newtab, /const normalized = normalizeHexColor\(hex\) \|\| DEFAULT_STATE\.settings\.backgroundColor;\s*\n\s*const rgb = hexToRgb\(normalized\);/);
  assert.match(newtab, /const color = normalizeHexColor\(button\.dataset\.colorSwatch\);/,
    "the exact startup call that broke 1.30.18.26 must retain its original one-argument contract");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.28 ${browser} generated startup executes the real color-swatch initialization before Settings/FV continuation`, async () => {
    const runtimePath = path.resolve(`dist/${browser}/newtab/appearance-color.js`);
    const runtime = await import(`${pathToFileURL(runtimePath).href}?browser=${browser}&v=1301828`);
    assert.equal(runtime.normalizeHexColor.length, 1);
    assert.equal(runtime.hexToRgb.length, 1);

    const sourceOwner = await fs.readFile("src/shared/newtab/appearance-color.js", "utf8");
    assert.equal(await fs.readFile(runtimePath, "utf8"), sourceOwner,
      `${browser}: generated browser must use the canonical shared owner byte-for-byte`);

    const html = await fs.readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    const swatches = [...html.matchAll(/data-color-swatch="([^"]+)"/g)].map(match => match[1]);
    assert.ok(swatches.length >= 1, `${browser}: real generated HTML must expose color swatches`);

    const buttons = swatches.map(color => {
      const listeners = new Map();
      return {
        dataset: { colorSwatch: color },
        style: {},
        addEventListener(type, listener) { listeners.set(type, listener); },
        listeners
      };
    });
    const selected = [];
    const context = {
      document: { querySelectorAll(selector) { return selector === "[data-color-swatch]" ? buttons : []; } },
      normalizeHexColor: runtime.normalizeHexColor,
      setColorPickerFromHex(color) { selected.push(color); },
      pendingBackgroundColorCustomized: false,
      applyBackgroundControlsLive() {},
      moreWallpapersButton: null
    };
    vm.createContext(context);

    const newtab = await fs.readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const swatchIndex = newtab.indexOf('document.querySelectorAll("[data-color-swatch]")');
    const settingsIndex = newtab.indexOf('settingsButton.addEventListener("click"');
    const loadIndex = newtab.indexOf('loadState().then(');
    assert.ok(swatchIndex >= 0 && settingsIndex > swatchIndex && loadIndex > settingsIndex,
      `${browser}: this startup gate must still precede Settings wiring and final state startup`);

    assert.doesNotThrow(() => vm.runInContext(extractSwatchStartupBlock(newtab), context),
      `${browser}: the synchronous startup swatch pass must never abort module initialization`);
    for (const button of buttons) {
      assert.equal(button.style.backgroundColor, runtime.normalizeHexColor(button.dataset.colorSwatch));
      assert.equal(typeof button.listeners.get("click"), "function");
    }
    buttons[0].listeners.get("click")();
    assert.deepEqual(selected, [runtime.normalizeHexColor(buttons[0].dataset.colorSwatch)]);
  });
}
