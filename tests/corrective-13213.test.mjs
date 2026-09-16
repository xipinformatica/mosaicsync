import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { TINY_PNG, TINY_WEBP, TINY_JPEG } from "./harness/raster-fixtures.mjs";

globalThis.crypto ||= webcrypto;

class Area {
  constructor(){ this.data = {}; }
  async get(keys){
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    return {};
  }
  async set(items){ Object.assign(this.data, structuredClone(items)); }
  async remove(keys){ for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}
const local = new Area();
globalThis.browser = { storage: { local, sync: new Area(), session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const branding = await import("../dist/firefox/core/custom-branding.js");
const assets = await import("../dist/firefox/core/local-assets.js");
const profile = await import("../dist/firefox/core/profile.js");

function shortcut(id, position){
  const t = 1000 + position;
  return { type:"shortcut", id, title:id, url:`https://${id}.example/`, image:"", imageSyncKind:"none", imageSourceKind:"none", imageStyle:"contain", position, createdAt:t, modifiedAt:t, source:"manual" };
}
function workspace(shortcuts, columns=6, rows=2){
  return { shortcuts, settings:{...constants.DEFAULT_SETTINGS, columns, rows}, settingsModifiedAt:1, updatedAt:1 };
}
function stateWith(personal, work){
  return model.normalizeState({ schemaVersion: constants.STATE_SCHEMA_VERSION, activeSpaceId:"personal", spaces:{ personal, work } });
}

test("1.32.1.3 full destination rejects cross-Space move without mutating source", () => {
  const source = workspace([shortcut("move",0)],6,2);
  const dest = workspace(Array.from({length:12},(_,i)=>shortcut(`d${i}`,i)),6,2);
  const before = stateWith(source,dest);
  const after = model.moveShortcutBetweenSpacesNormalized(before,{shortcutId:"move",fromSpaceId:"personal",toSpaceId:"work"});
  assert.equal(after.spaces.personal.shortcuts.some(x=>x.id==="move"), true);
  assert.equal(after.spaces.work.shortcuts.some(x=>x.id==="move"), false);
  assert.deepEqual(after, before);
});

test("1.32.1.3 explicit out-of-grid cross-Space position is rejected", () => {
  const before = stateWith(workspace([shortcut("move",0)]), workspace([]));
  const after = model.moveShortcutBetweenSpacesNormalized(before,{shortcutId:"move",fromSpaceId:"personal",toSpaceId:"work",position:12});
  assert.deepEqual(after,before);
});

test("1.32.1.3 legacy recoverable out-of-grid state expands/reflows into visible capacity", () => {
  const raw = { shortcuts:Array.from({length:13},(_,i)=>shortcut(`s${i}`, i===12 ? 99 : i)), settings:{...constants.DEFAULT_SETTINGS,columns:6,rows:2}, updatedAt:1 };
  const normalized = model.normalizeWorkspace(raw);
  const capacity = model.visibleTopLevelCapacity(normalized.settings);
  assert.ok(capacity >= 13 && capacity <= 96);
  assert.equal(normalized.shortcuts.length,13);
  assert.equal(normalized.shortcuts.every(item=>item.position>=0 && item.position<capacity),true);
  assert.equal(new Set(normalized.shortcuts.map(item=>item.position)).size,13);
});

test("1.32.1.3 moving a folder child out cannot exceed a full grid", () => {
  const folder={type:"folder",id:"f",title:"F",position:0,createdAt:1,modifiedAt:1,items:[shortcut("a",0),shortcut("b",1)]};
  const top=[folder,...Array.from({length:11},(_,i)=>shortcut(`x${i}`,i+1))];
  const before=model.normalizeState({shortcuts:top,settings:{...constants.DEFAULT_SETTINGS,columns:6,rows:2},updatedAt:1});
  const after=model.moveShortcutOutOfFolder(before,{shortcutId:"a",position:11});
  assert.deepEqual(after,before);
});

test("1.32.1.3 raster trust boundary accepts real PNG/JPEG/WebP and rejects fake labels", () => {
  for (const dataUrl of [TINY_PNG,TINY_JPEG,TINY_WEBP]) {
    const id=model.assetIdForDataUrl(dataUrl);
    assert.equal(assets.validateLocalAsset(id,dataUrl),true);
  }
  for (const mime of ["png","jpeg","webp"]) {
    const fake=`data:image/${mime};base64,${Buffer.from("THIS IS NOT AN IMAGE").toString("base64")}`;
    assert.equal(assets.validateLocalAsset(model.assetIdForDataUrl(fake),fake),false);
    assert.throws(()=>branding.normalizeCustomBrandingLogo(fake,{strict:true}));
  }
});

test("1.32.1.3 checksum-valid profile cannot import fake raster bytes", async () => {
  const pkg=await profile.createProfilePackage(constants.DEFAULT_STATE,{}, {enabled:true,text:"Brand",logo:TINY_PNG});
  pkg.profile.branding.logo=`data:image/png;base64,${Buffer.from("FAKE PNG").toString("base64")}`;
  const {integrity,...body}=pkg;
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(model.stableStringify(body))));
  pkg.integrity={algorithm:"SHA-256",value:[...digest].map(b=>b.toString(16).padStart(2,"0")).join("")};
  await assert.rejects(()=>profile.parseProfilePackage(JSON.stringify(pkg)), e=>e?.code==="PROFILE_DAMAGED");
});

test("1.32.1.3 hostile deep profile rejects with coded error instead of stack overflow", async () => {
  const prefix = JSON.stringify({format:"mosaicsync-profile",formatVersion:3,application:{name:"MosaicSync",version:"1.32.1.3"},exportedAt:1,profile:{state:constants.DEFAULT_STATE,assets:{},preferences:{},branding:branding.DEFAULT_CUSTOM_BRANDING}}).slice(0,-2);
  const deep = '{"next":'.repeat(5000) + '{"leaf":true}' + '}'.repeat(5000);
  const text = `${prefix},"deep":${deep}},"integrity":{"algorithm":"SHA-256","value":"${"0".repeat(64)}"}}`;
  await assert.rejects(()=>profile.parseProfilePackage(text), e=>e?.code==="PROFILE_DAMAGED" && !(e instanceof RangeError));
});

test("1.32.1.3 profile preflight rejects more than 96 top-level records", async () => {
  const state={...constants.DEFAULT_STATE,shortcuts:Array.from({length:97},(_,i)=>shortcut(`s${i}`,i)),settings:{...constants.DEFAULT_SETTINGS,columns:12,rows:8}};
  const raw={format:"mosaicsync-profile",formatVersion:1,application:{name:"MosaicSync",version:"1.0"},exportedAt:1,profile:{state,preferences:{}},integrity:{algorithm:"SHA-256",value:"0".repeat(64)}};
  await assert.rejects(()=>profile.parseProfilePackage(JSON.stringify(raw)), e=>e?.code==="PROFILE_DAMAGED");
});

test("1.32.1.3 branding rollback restores previous value only while import still owns current value", async () => {
  local.data={};
  await branding.writeCustomBranding({enabled:true,text:"P",logo:TINY_PNG});
  const tx=await branding.beginCustomBrandingImport({enabled:true,text:"I",logo:TINY_PNG});
  await branding.writeCustomBranding({enabled:true,text:"N",logo:TINY_PNG});
  const result=await branding.rollbackCustomBrandingImport(tx);
  assert.equal(result.rolledBack,false);
  assert.equal((await branding.readCustomBranding()).text,"N");
});

test("1.32.1.3 branding rollback restores prior value when no newer writer exists", async () => {
  local.data={};
  await branding.writeCustomBranding({enabled:true,text:"P",logo:TINY_PNG});
  const tx=await branding.beginCustomBrandingImport({enabled:true,text:"I",logo:TINY_PNG});
  const result=await branding.rollbackCustomBrandingImport(tx);
  assert.equal(result.rolledBack,true);
  assert.equal((await branding.readCustomBranding()).text,"P");
});

test("1.32.1.3 Settings import does not install candidate state before durable commit", () => {
  const source=fs.readFileSync("src/shared/newtab/newtab.js","utf8");
  const start=source.indexOf("const brandingTransaction = await brandingModule.beginCustomBrandingImport(parsed.branding)");
  const write=source.indexOf("persisted = await writeLocalStateWithBaseline(importedState",start);
  const install=source.indexOf("state = persisted.state",write);
  assert.ok(start>=0 && write>start && install>write);
  const between=source.slice(start,write);
  assert.equal(/state\s*=\s*importedState/.test(between),false);
});

test("1.32.1.3 Welcome import uses conditional branding rollback", () => {
  const source=fs.readFileSync("src/shared/welcome/welcome.js","utf8");
  assert.match(source,/beginCustomBrandingImport\(candidate\.branding\)/);
  assert.match(source,/rollbackCustomBrandingImport\(brandingTransaction\)/);
});

test("1.32.1.3 New Tab adopts external Custom Branding storage changes", () => {
  const source=fs.readFileSync("src/shared/newtab/newtab.js","utf8");
  assert.match(source,/changes\[LOCAL_CUSTOM_BRANDING_KEY\]/);
  assert.match(source,/paintBrandIdentity\(incoming\)/);
});

test("1.32.1.3 all top-level UI producers use bounded capacity behavior", () => {
  const source=fs.readFileSync("src/shared/newtab/newtab.js","utf8");
  assert.match(source,/return null;\n  }\n\n  async function showDropChoice/);
  assert.match(source,/requiredTopLevelCount > capacity/);
  assert.match(source,/state\.shortcuts\.length > nextCapacity/);
  assert.match(source,/repairTopLevelPositionsWithinCapacity\(state\.shortcuts, visibleTopLevelCapacity\(state\.settings\)\)/);
});
