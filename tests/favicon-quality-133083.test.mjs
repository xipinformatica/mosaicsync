// @kind integration
import test from "node:test";
import assert from "node:assert/strict";
import { readBackgroundSource } from "./harness/background-source.mjs";
import vm from "node:vm";
import { automaticFaviconArtwork, learnedArtworkMayReplace, learnedArtworkDisposition } from "../src/shared/core/artwork-policy.js";

function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = src.indexOf("{\n",start);
  let depth = 0, quoted = "", comment = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (comment) { if (c === "\n") comment=false; continue; }
    if (quoted) { if (c === quoted && src[i-1] !== "\\") quoted=""; continue; }
    if (c === '"' || c === "'" || c === '`') { quoted=c; continue; }
    if (c === "{" ) depth++;
    if (c === "}" && --depth === 0) return src.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}
function fakePng(side, mark) {
  const b=Buffer.alloc(32); Buffer.from('89504e470d0a1a0a0000000d49484452','hex').copy(b);
  b.writeUInt32BE(side,16); b.writeUInt32BE(side,20); b[24]=8; b[25]=6; b[31]=mark;
  return `data:image/png;base64,${b.toString('base64')}`;
}
function run(browser, variant) {
  const process = spawnSync(globalThis.process.execPath, ['tests/harness/background-runtime-scenario.mjs',browser,'audit-ig'],
    {cwd:globalThis.process.cwd(), env:{...globalThis.process.env,IG_VARIANT:variant}, encoding:'utf8', timeout:30000});
  assert.equal(process.status,0, `${browser} ${variant} failed: ${process.stderr.slice(-800)}`);
  return JSON.parse(process.stdout.trim().split('\n').at(-1));
}
for (const browser of ["firefox","chrome"]) {
  test(`.83 ${browser}: tab-learn and queued overwrite guards compare actual stored sizes`, async () => {
    const src=readBackgroundSource(browser);
    const ctx={Uint8Array,TextDecoder, textDecoder:new TextDecoder(),atob,REMOTE_IMAGE_TYPES:new Set(['image/png','image/jpeg','image/webp','image/gif','image/x-icon']),
      automaticFaviconArtwork, learnedArtworkMayReplace, learnedArtworkDisposition,
      normalizeLocalFaviconDataUrl:async image=>image, writeLocalState:async()=>{ctx.writes++},writes:0};
    vm.createContext(ctx);
    vm.runInContext(['sniffImageMime','imageDimensionsFromBytes','storedArtworkSide','automaticFaviconWouldDowngrade']
      .map(n=>extract(src,n)).join('\n'),ctx);
    const strong=fakePng(192,1), weak=fakePng(32,2), sharper=fakePng(192,3);
    const shortcut={type:'shortcut',id:'ig',url:'https://www.instagram.com/',image:strong,imageSyncKind:'device',imageSourceKind:'favicon',imageSourceUrl:'https://www.instagram.com/icon192.png',imageAssetId:'',imageIsFallback:false};
    assert.equal(ctx.storedArtworkSide(strong),192);
    assert.equal(ctx.storedArtworkSide(weak),32);
    assert.equal(ctx.automaticFaviconWouldDowngrade(shortcut,weak),true);
    assert.equal(ctx.automaticFaviconWouldDowngrade(shortcut,sharper),false);
    assert.equal(ctx.automaticFaviconWouldDowngrade({...shortcut,imageSourceKind:'upload'},weak),false);
    const first=src.indexOf('async function applyLearnedFavicon(');
    assert.ok(first>=0);
    const apply=src.slice(first,src.indexOf('\n  function findFaviconLearningTargets(',first));
    vm.runInContext(apply,ctx);
    assert.equal(await ctx.applyLearnedFavicon({state:{},compactBaseline:null},[shortcut],{image:weak,sourceKind:'favicon',sourceUrl:'https://www.instagram.com/weak.ico'}),false);
    assert.equal(shortcut.image,strong);
    assert.equal(ctx.writes,0);
    assert.equal(await ctx.applyLearnedFavicon({state:{},compactBaseline:null},[shortcut],{image:sharper,sourceKind:'favicon',sourceUrl:'https://www.instagram.com/icon192-new.png'}),true);
    assert.equal(ctx.writes,1);
  });
}
