import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for(const browser of ["firefox","chrome"]) test(`${browser}: no direct English fallback was added to toast/status error paths`, async()=>{
  const files=[`dist/${browser}/newtab/newtab.js`,`dist/${browser}/welcome/welcome.js`];
  const offenders=[];
  for(const file of files){
    const text=await readFile(file,"utf8");
    for(const [n,line] of text.split(/\r?\n/).entries()) {
      if(/(?:showToast|setStatus)\([^\n]*error\.message\s*\|\|\s*["'][A-Za-z]/.test(line)) offenders.push(`${file}:${n+1}`);
    }
  }
  assert.deepEqual(offenders,[]);
});
