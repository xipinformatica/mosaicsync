import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const targets = [
  ["Welcome", "src/shared/welcome/welcome.css"],
  ["Firefox Settings", "src/firefox/newtab/newtab.css"],
  ["Chrome Settings", "src/chrome/newtab/newtab.css"],
];

function selectorBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  assert.ok(end > open, `unterminated ${selector}`);
  return css.slice(start, end + 1);
}

const bubbleBlock = css => selectorBlock(css, ".donate-mascot-bubble");

test("1.24.14m2 donate bubbles use an inset antialiased ring instead of a physical rounded border", () => {
  for (const [name, path] of targets) {
    const css = fs.readFileSync(path, "utf8");
    const block = bubbleBlock(css);
    assert.match(block, /border:\s*0;/, `${name}: physical border must be removed`);
    assert.doesNotMatch(block, /border:\s*1px\s+solid/, `${name}: old aliased border returned`);
    assert.match(block, /box-shadow:\s*inset 0 0 0 1px rgba\(255,255,255,\.18\),\s*0 7px 18px rgba\(0,0,0,\.20\);/, `${name}: missing inset ring`);
    assert.match(block, /padding:\s*3px 9px;/, `${name}: total pill width must be compensated after removing the border`);
  }
});

test("1.24.14m2 light Settings donate bubbles keep a non-rasterizing inset ring", () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = fs.readFileSync(`src/${browser}/newtab/newtab.css`, "utf8");
    const block = selectorBlock(css, ':root[data-effective-theme="light"] .donate-mascot-bubble');
    assert.match(block, /box-shadow:\s*inset 0 0 0 1px #cfc7d8,\s*0 7px 18px rgba\(0,0,0,\.16\);/, `${browser}: light bubble inset ring missing`);
    assert.doesNotMatch(block, /border-color:/, `${browser}: light theme must not reintroduce a physical border`);
  }
});
