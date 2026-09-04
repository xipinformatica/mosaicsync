import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");
const js = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.30.18.46 image-style preview has one universal dialog cover rule that beats every responsive contain size", () => {
  const universal = "#shortcutDialog .image-preview.cover > img";
  const universalIndex = css.lastIndexOf(universal);
  const lastResponsiveContain = css.lastIndexOf("#shortcutDialog .image-preview img");
  assert.ok(universalIndex >= 0, "a universal dialog-specific cover selector must exist");
  assert.ok(universalIndex > lastResponsiveContain,
    "the universal cover rule must come after every responsive dialog image-size rule");

  const tail = css.slice(universalIndex, universalIndex + 180);
  assert.match(tail, /width:\s*100%/);
  assert.match(tail, /height:\s*100%/);
  assert.match(tail, /object-fit:\s*cover/);
});

test("1.30.18.46 fit-fill-fit remains a live preview-only editor transition", () => {
  assert.match(js, /shortcutImageStyle\.addEventListener\(["']change["'],\s*updateImagePreview\)/);
  assert.match(js, /imagePreview\.classList\.toggle\(["']cover["'],\s*shortcutImageStyle\.value\s*===\s*["']cover["']\)/);
  assert.doesNotMatch(js, /shortcutImageStyle\.addEventListener\(["']change["'][\s\S]{0,260}(?:writeLocalState|save|persist)/i,
    "changing Image style must remain preview-only until the existing Save action");
});
