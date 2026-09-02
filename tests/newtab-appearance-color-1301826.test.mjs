import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validHex } from "../src/shared/core/model.js";
import { clampUnit, hexToRgb, rgbToHsv, hsvToHex, normalizeHexColor } from "../src/shared/newtab/appearance-color.js";

function oldClampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}
function oldHexToRgb(hex) {
  if (!validHex(hex)) return null;
  const value = String(hex).slice(1);
  return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) };
}
function oldRgbToHsv({ r, g, b }) {
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
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
  const s = oldClampUnit(saturation), v = oldClampUnit(value), chroma = v * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)), match = v - chroma;
  let rgb = [0, 0, 0];
  if (h < 60) rgb = [chroma, x, 0]; else if (h < 120) rgb = [x, chroma, 0]; else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma]; else if (h < 300) rgb = [x, 0, chroma]; else rgb = [chroma, 0, x];
  return `#${rgb.map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function oldNormalizeHexColor(value) {
  let text = String(value || "").trim();
  if (/^[0-9a-f]{6}$/i.test(text)) text = `#${text}`;
  return validHex(text) ? text.toLowerCase() : "";
}

test("1.30.18.26 extracted appearance-color policy is expression-equivalent to the 1.30.18.25 New Tab helpers", () => {
  for (const value of [undefined, null, "", -1, 0, 0.25, 1, 2, "0.5", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(clampUnit(value), oldClampUnit(value));
  }
  for (const value of ["#000000", "#ffffff", "#2B0050", "2b0050", " bad ", "", null]) {
    assert.deepEqual(hexToRgb(value, validHex), oldHexToRgb(value));
    assert.equal(normalizeHexColor(value, validHex), oldNormalizeHexColor(value));
  }
  for (const rgb of [{r:0,g:0,b:0},{r:255,g:255,b:255},{r:255,g:0,b:0},{r:43,g:0,b:80},{r:12,g:200,b:99}]) {
    assert.deepEqual(rgbToHsv(rgb), oldRgbToHsv(rgb));
  }
  for (const vector of [[0,0,0],[0,1,1],[60,1,1],[120,1,1],[180,1,1],[240,1,1],[300,1,1],[-60,1,1],[420,.4,.8],[33,-1,2]]) {
    assert.equal(hsvToHex(...vector), oldHsvToHex(...vector));
  }
});

test("1.30.18.26 appearance-color owner stays pure and New Tab keeps only UI orchestration", async () => {
  const owner = await fs.readFile("src/shared/newtab/appearance-color.js", "utf8");
  const newtab = await fs.readFile("src/shared/newtab/newtab.js", "utf8");
  assert.doesNotMatch(owner, /\bbrowser\.|\bdocument\.|\bwindow\.|\blocalStorage\b|\bsessionStorage\b|Date\.now|setTimeout|setInterval|requestAnimationFrame|\basync\b|\bawait\b/);
  assert.match(newtab, /from "\.\/appearance-color\.js"/);
  for (const name of ["clampUnit", "hexToRgb", "rgbToHsv", "hsvToHex", "normalizeHexColor"]) {
    assert.doesNotMatch(newtab, new RegExp(`function\\s+${name}\\s*\\(`));
  }
  assert.match(newtab, /function updateColorPickerVisuals\(\)/);
  assert.match(newtab, /function setColorPickerFromHex\(hex\)/);
  assert.match(newtab, /function updateColorPlaneFromPointer\(event\)/);
});

test("1.30.18.26 generated Firefox and Chromium runtimes contain and execute the same appearance-color module", async () => {
  const source = await fs.readFile("src/shared/newtab/appearance-color.js", "utf8");
  for (const browser of ["firefox", "chrome"]) {
    const runtimePath = path.resolve(`dist/${browser}/newtab/appearance-color.js`);
    assert.equal(await fs.readFile(runtimePath, "utf8"), source);
    const runtime = await import(`${pathToFileURL(runtimePath).href}?browser=${browser}&v=1301826`);
    assert.equal(runtime.normalizeHexColor("2B0050", validHex), "#2b0050");
    assert.deepEqual(runtime.hexToRgb("#2b0050", validHex), { r: 43, g: 0, b: 80 });
    assert.equal(runtime.hsvToHex(270, 1, 0.5), "#400080");
  }
});
