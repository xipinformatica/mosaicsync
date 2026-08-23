import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox","chrome"]) {
  test(`${browser}: every dialog has a programmatic accessible name`, async () => {
    const html=await readFile(`dist/${browser}/newtab/newtab.html`,"utf8");
    const dialogs=[...html.matchAll(/<dialog\b([^>]*)>/g)];
    assert.ok(dialogs.length >= 4);
    for (const match of dialogs) {
      const attrs=match[1];
      const label=attrs.match(/\baria-label="([^"]+)"/i)?.[1];
      const labelledBy=attrs.match(/\baria-labelledby="([^"]+)"/i)?.[1];
      assert.ok(label || labelledBy, `dialog lacks aria-label/aria-labelledby: ${match[0]}`);
      if (labelledBy) assert.match(html, new RegExp(`\\bid=["']${labelledBy}["']`), `missing aria-labelledby target ${labelledBy}`);
    }
  });

  test(`${browser}: interactive buttons declare their type`, async () => {
    const html=await readFile(`dist/${browser}/newtab/newtab.html`,"utf8");
    const offenders=[...html.matchAll(/<button\b([^>]*)>/g)].filter(m=>!(/\btype="(?:button|submit|reset)"/i.test(m[1]))).map(m=>m[0]);
    assert.deepEqual(offenders,[]);
  });
}
