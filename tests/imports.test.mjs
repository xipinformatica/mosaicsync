import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
async function walk(dir,out=[]){for(const n of await readdir(dir)){const p=join(dir,n),s=await stat(p);if(s.isDirectory())await walk(p,out);else if(p.endsWith(".js"))out.push(p);}return out;}
for(const browser of ["firefox","chrome"]) test(`${browser}: every relative JS import resolves`,async()=>{
  const root=resolve(`dist/${browser}`), missing=[];
  for(const file of await walk(root)){
    const text=await readFile(file,"utf8");
    const rx=/(?:import\s+(?:[^"']+?\s+from\s+)?|import\s*\()\s*["'](\.[^"']+)["']/g;
    for(const m of text.matchAll(rx)){const target=resolve(dirname(file),m[1]);try{await stat(target);}catch{missing.push(`${file} -> ${m[1]}`);}}
  }
  assert.deepEqual(missing,[]);
});
