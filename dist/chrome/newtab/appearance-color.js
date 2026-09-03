/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { validHex } from "../core/model.js";

export function clampUnit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function hexToRgb(hex) {
  if (!validHex(hex)) return null;
  const value = String(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

export function rgbToHsv({ r, g, b }) {
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

export function hsvToHex(hue, saturation, value) {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = clampUnit(saturation);
  const v = clampUnit(value);
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

export function normalizeHexColor(value) {
  let text = String(value || "").trim();
  if (/^[0-9a-f]{6}$/i.test(text)) text = `#${text}`;
  return validHex(text) ? text.toLowerCase() : "";
}
