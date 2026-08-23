import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const targets = [
  ["Welcome", "src/shared/welcome/welcome.html"],
  ["Firefox New Tab", "src/firefox/newtab/newtab.html"],
  ["Chrome New Tab", "src/chrome/newtab/newtab.html"],
];

const privacy = "https://xipinformatica.cat/mosaicsync/#privacy";
const license = "https://xipinformatica.cat/mosaicsync/#license";
const retired = [
  "https://xipinformatica.cat/mosaicsync/privacy/",
  "https://xipinformatica.cat/mosaicsync/license/",
];

test("1.24.14m3 all extension legal links target the unified website anchors", () => {
  for (const [name, path] of targets) {
    const html = fs.readFileSync(path, "utf8");
    assert.ok(html.includes(`href="${privacy}"`), `${name}: missing unified #privacy link`);
    assert.ok(html.includes(`href="${license}"`), `${name}: missing unified #license link`);
    for (const old of retired) assert.equal(html.includes(old), false, `${name}: retired legal URL returned: ${old}`);
  }
});
