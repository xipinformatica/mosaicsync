import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;
class Area { constructor(){this.data={};} async get(keys){if(keys==null)return structuredClone(this.data); if(typeof keys==="string")return Object.hasOwn(this.data,keys)?{[keys]:structuredClone(this.data[keys])}:{}; if(Array.isArray(keys)){const o={};for(const k of keys)if(Object.hasOwn(this.data,k))o[k]=structuredClone(this.data[k]);return o;}const o={...keys};for(const k of Object.keys(keys||{}))if(Object.hasOwn(this.data,k))o[k]=structuredClone(this.data[k]);return o;} async set(o){for(const [k,v]of Object.entries(o))this.data[k]=structuredClone(v);} async remove(keys){for(const k of(Array.isArray(keys)?keys:[keys]))delete this.data[k];}}
globalThis.browser={storage:{local:new Area(),session:new Area()}};
const constants=await import("../dist/firefox/core/constants.js");
const {normalizeState}=await import("../dist/firefox/core/model.js");
const storage=await import("../dist/firefox/core/storage.js");
const profile=await import("../dist/firefox/core/profile.js");

test("content-addressed assets deduplicate and v2 profiles round-trip", async()=>{
  const img=`data:image/png;base64,${Buffer.from("same".repeat(200)).toString("base64")}`, t=Date.now();
  const raw={schemaVersion:16,activeSpaceId:"personal",spaces:{personal:{shortcuts:[0,1].map(i=>({type:"shortcut",id:`s${i}`,title:`S${i}`,url:`https://s${i}.test/`,image:img,imageSyncKind:"device",imageSourceKind:"favicon",imageStyle:"contain",position:i,createdAt:t,modifiedAt:t,source:"manual"})),settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:t,updatedAt:t},work:{shortcuts:[],settings:{...constants.DEFAULT_SETTINGS,spaceName:"Work"},settingsModifiedAt:t,updatedAt:t}}};
  await storage.writeLocalState(normalizeState(raw));
  const assetKeys=Object.keys(browser.storage.local.data).filter(k=>k.startsWith(constants.LOCAL_ASSET_PREFIX));
  assert.equal(assetKeys.length,1);
  const all=await storage.ensureLocalStorage({hydrateAssets:"all"});
  const pkg=await profile.createProfilePackage(all.state,{uiLocale:"nap"});
  assert.equal(pkg.formatVersion,2); assert.equal(Object.keys(pkg.profile.assets).length,1);
  const parsed=await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  assert.equal(parsed.state.spaces.personal.shortcuts[1].image,img);
  const tampered=structuredClone(pkg); tampered.profile.assets[Object.keys(tampered.profile.assets)[0]] += "A";
  await assert.rejects(()=>profile.parseProfilePackage(JSON.stringify(tampered)), e=>e.code==="PROFILE_DAMAGED");
});
