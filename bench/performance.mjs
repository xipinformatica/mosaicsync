import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";
import { makeWorstCaseProfile } from "../fixtures/worst-case-profile.mjs";
globalThis.crypto ||= webcrypto;
const model=await import("../dist/firefox/core/model.js");
const assets=await import("../dist/firefox/core/local-assets.js");
const storage=await import("../dist/firefox/core/storage.js");
const raw=makeWorstCaseProfile({count:200});
function bench(name,fn,iterations=30){for(let i=0;i<5;i++)fn();const start=performance.now();for(let i=0;i<iterations;i++)fn();const ms=(performance.now()-start)/iterations;console.log(`${name}: ${ms.toFixed(3)} ms avg (${iterations} iterations)`);return ms;}
const normalized=model.normalizeState(raw);
bench("normalizeState(200)",()=>model.normalizeState(raw),20);
bench("stableStringify(200)",()=>model.stableStringify(normalized),20);
bench("projectStateToLocalAssets(200)",()=>assets.projectStateToLocalAssets(normalized),20);
bench("createWriteBaseline(200)",()=>storage.createWriteBaseline(normalized),20);
const projected=assets.projectStateToLocalAssets(normalized);
bench("hydrate active Space",()=>assets.hydrateStateLocalAssets(projected.state,projected.assets,{spaceIds:["personal"]}),30);
const hydratedStartup=assets.hydrateStateLocalAssets(projected.state,projected.assets,{spaceIds:["personal"]});
const validatedAssetMemo=new Map([...projected.assets].map(([assetId,dataUrl])=>[dataUrl,assetId]));
bench("startup normalize without validated memo",()=>model.normalizeState(hydratedStartup),20);
bench("startup normalize with validated memo",()=>model.normalizeState(hydratedStartup,new Map(validatedAssetMemo)),20);
bench("startup baseline without validated memo",()=>storage.createWriteBaseline(hydratedStartup),20);
bench("startup baseline with validated memo",()=>storage.createWriteBaseline(hydratedStartup,new Map(validatedAssetMemo)),20);
console.log(`core JSON bytes: ${Buffer.byteLength(JSON.stringify(projected.state))}`);
console.log(`deduplicated assets: ${projected.assets.size}`);
const personal=model.workspaceStateNormalized(normalized,'personal');
bench('flattenState trust-boundary',()=>model.flattenState(personal,'bench-device'),30);
bench('flattenState normalized fast path',()=>model.flattenStateNormalized(personal,'bench-device'),30);
bench('settings record trust-boundary',()=>model.makeSettingsRecord(personal,'bench-device'),50);
bench('settings record normalized fast path',()=>model.makeSettingsRecordNormalized(personal,'bench-device'),50);
const records=[...model.flattenStateNormalized(personal,'bench-device').values()];
const recordA=records[0], recordB={...recordA,deviceId:'other-device'};
bench('syncRecordEqual allocation-light',()=>model.syncRecordEqual(recordA,recordB),10000);
bench('syncRecordEqual legacy stringify equivalent',()=>model.stableStringify((({deviceId,...rest})=>rest)(recordA))===model.stableStringify((({deviceId,...rest})=>rest)(recordB)),1000);
bench("startup compact-baseline clone(200)",()=>structuredClone(projected.state),20);
const projectedAssetIds=[];
for(const item of projected.state.spaces.personal.shortcuts){
  if(item.type==="folder") for(const child of item.items||[]) { if(child.localImageAssetId) projectedAssetIds.push(child.localImageAssetId); }
  else if(item.localImageAssetId) projectedAssetIds.push(item.localImageAssetId);
}
const folderHeavyIds=projectedAssetIds.slice(0,150);
const folderHeavyCompact={spaces:{personal:{shortcuts:Array.from({length:5},(_,folderIndex)=>({
  type:"folder",id:`bench-large-folder-${folderIndex}`,items:folderHeavyIds.slice(folderIndex*30,(folderIndex+1)*30).map((id,index)=>({type:"shortcut",localImageAssetId:id,position:index}))
}))}}};
const allFolderAssets=assets.collectStateLocalAssetIds(folderHeavyCompact,{spaceIds:["personal"],includeBackground:false});
const visibleFolderAssets=assets.collectStateLocalAssetIds(folderHeavyCompact,{spaceIds:["personal"],includeBackground:false,folderChildLimit:4});
console.log(`closed-folder startup artwork IDs: ${allFolderAssets.size} full -> ${visibleFolderAssets.size} first-frame visible`);
