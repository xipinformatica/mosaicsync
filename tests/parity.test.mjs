import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

async function walk(root, dir=root, out=[]) { for (const name of await readdir(dir)) { const p=join(dir,name); const s=await stat(p); if(s.isDirectory()) await walk(root,p,out); else out.push(relative(root,p).replaceAll("\\\\","/")); } return out; }
const approved = [
  /^_locales\//, /^assets\/icon-(16|32|48|128)\.png$/,
  /^background\/background\.js$/, /^core\/(browser-shim|i18n-platform|platform|permissions)\.js$/,
  /^manifest\.json$/, /^newtab\/(newtab\.css|newtab\.html|newtab\.js)$/
];

test("Firefox/Chrome runtime divergence is confined to approved adapters/overlays", async () => {
  const ff=resolve("dist/firefox"), ch=resolve("dist/chrome");
  const files=[...new Set([...(await walk(ff)), ...(await walk(ch))])].sort();
  const unexpected=[];
  for(const rel of files){
    let a=null,b=null; try{a=await readFile(join(ff,rel));}catch{} try{b=await readFile(join(ch,rel));}catch{}
    const differs=!a||!b||!a.equals(b);
    if(differs && !approved.some(rx=>rx.test(rel))) unexpected.push(rel);
  }
  assert.deepEqual(unexpected, []);
});

test("both manifests use version 1.27.7", async () => {
  for(const browser of ["firefox","chrome"]) {
    const manifest=JSON.parse(await readFile(resolve(`dist/${browser}/manifest.json`),"utf8"));
    assert.equal(manifest.version,"1.27.7");
    assert.equal(manifest.manifest_version,3);
  }
});


test("browser-specific display-version manifest policy is valid", async () => {
  const firefox=JSON.parse(await readFile(resolve("dist/firefox/manifest.json"),"utf8"));
  const chrome=JSON.parse(await readFile(resolve("dist/chrome/manifest.json"),"utf8"));
  assert.equal(Object.hasOwn(firefox,"version_name"),false,"Firefox must not receive Chrome-only version_name");
  assert.equal(chrome.version_name,"1.27.7");
});
