import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const secondaryCss = fs.readFileSync(resolve(root, "src/shared/newtab/newtab-secondary.css"), "utf8");
const newtabJs = fs.readFileSync(resolve(root, "src/shared/newtab/newtab.js"), "utf8");

test("1.30.18.45 folder popup removes excess dead space above shortcut tiles", () => {
  assert.match(secondaryCss, /\.folder-header\{[^}]*padding:\s*14px\s+14px\s+3px\s+16px;/s,
    "folder header should keep its title position while substantially reducing bottom padding");
  assert.match(secondaryCss, /\.folder-items\{[^}]*padding:\s*2px\s+13px\s+13px;/s,
    "folder grid should begin close to the title row");
  assert.match(secondaryCss, /\.folder-item-card\{[^}]*padding:\s*4px\s+3px\s+6px;/s,
    "folder item card should not reintroduce excessive top padding");
});

test("1.30.18.45 shortcut image-style selector updates the editor preview live in compact and normal layouts", () => {
  assert.match(newtabJs, /shortcutImageStyle\.addEventListener\(["']change["'],\s*updateImagePreview\)/,
    "changing Image style must repaint the editor preview immediately");
  assert.match(newtabJs, /imagePreview\.classList\.toggle\(["']cover["'],\s*shortcutImageStyle\.value\s*===\s*["']cover["']\)/,
    "preview repaint must toggle the same cover mode used by saved shortcut tiles");
  assert.match(secondaryCss, /#shortcutDialog\s+\.image-preview\.cover\s+img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s,
    "cover preview must outrank the compact-editor img sizing rule so Fill tile is visible before Save");
});
