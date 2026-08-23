import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;
class Area { constructor(){this.data={};} async get(keys){if(keys==null)return structuredClone(this.data);if(typeof keys==="string")return Object.hasOwn(this.data,keys)?{[keys]:structuredClone(this.data[keys])}:{};if(Array.isArray(keys)){const o={};for(const k of keys)if(Object.hasOwn(this.data,k))o[k]=structuredClone(this.data[k]);return o;}const o={...keys};for(const k of Object.keys(keys||{}))if(Object.hasOwn(this.data,k))o[k]=structuredClone(this.data[k]);return o;} async set(o){for(const [k,v]of Object.entries(o))this.data[k]=structuredClone(v);} async remove(keys){for(const k of(Array.isArray(keys)?keys:[keys]))delete this.data[k];}}
globalThis.browser={storage:{local:new Area(),session:new Area()}};
const constants=await import("../dist/firefox/core/constants.js");
const model=await import("../dist/firefox/core/model.js");
const storage=await import("../dist/firefox/core/storage.js");

test("legacy inline single-Space profiles upgrade without losing shortcuts or artwork", async()=>{
  browser.storage.local.data={}; browser.storage.session.data={};
  const t=Date.now(), image=`data:image/png;base64,${Buffer.from("legacy-icon".repeat(60)).toString("base64")}`;
  browser.storage.local.data[constants.LOCAL_STATE_KEY]={schemaVersion:12,shortcuts:[{type:"shortcut",id:"legacy",title:"Legacy",url:"https://legacy.example/",image,imageSyncKind:"device",imageSourceKind:"favicon",imageStyle:"contain",position:0,createdAt:t,modifiedAt:t,source:"manual"}],settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:t,updatedAt:t};
  browser.storage.local.data[constants.LOCAL_META_KEY]={deviceId:"test-device",onboardingCompleted:true};
  const loaded=await storage.ensureLocalStorage({hydrateAssets:"all"});
  assert.equal(loaded.state.shortcuts.length,1);
  assert.equal(loaded.state.shortcuts[0].title,"Legacy");
  assert.equal(loaded.state.shortcuts[0].image,image);
  const persisted=browser.storage.local.data[constants.LOCAL_STATE_KEY];
  assert.ok(persisted.spaces?.personal);
  assert.equal(persisted.spaces.personal.shortcuts[0].image,"");
  assert.ok(persisted.spaces.personal.shortcuts[0].localImageAssetId);
  const assetKeys=Object.keys(browser.storage.local.data).filter(k=>k.startsWith(constants.LOCAL_ASSET_PREFIX));
  assert.equal(assetKeys.length,1);
});

test("a corrupt local asset degrades to a missing icon without destroying layout", async()=>{
  browser.storage.local.data={}; browser.storage.session.data={};
  const good=`data:image/png;base64,${Buffer.from("good".repeat(60)).toString("base64")}`;
  const assetId=model.assetIdForDataUrl(good), t=Date.now();
  const state=model.normalizeState({schemaVersion:constants.STATE_SCHEMA_VERSION,activeSpaceId:"personal",spaces:{personal:{shortcuts:[{type:"shortcut",id:"s",title:"Survives",url:"https://survives.example/",image:"",localImageAssetId:assetId,imageSyncKind:"device",imageSourceKind:"favicon",imageStyle:"contain",position:0,createdAt:t,modifiedAt:t,source:"manual"}],settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:t,updatedAt:t},work:{shortcuts:[],settings:{...constants.DEFAULT_SETTINGS},settingsModifiedAt:t,updatedAt:t}}});
  const compact=(await import("../dist/firefox/core/local-assets.js")).projectStateToLocalAssets(state).state;
  browser.storage.local.data[constants.LOCAL_STATE_KEY]=compact;
  browser.storage.local.data[constants.LOCAL_META_KEY]={deviceId:"test-device",onboardingCompleted:true};
  browser.storage.local.data[constants.LOCAL_ASSET_INDEX_KEY]={schemaVersion:constants.LOCAL_ASSET_STORE_SCHEMA_VERSION,ids:[assetId]};
  browser.storage.local.data[`${constants.LOCAL_ASSET_PREFIX}${assetId}`]="data:image/png;base64,AAAA";
  const loaded=await storage.ensureLocalStorage({hydrateAssets:"all"});
  assert.equal(loaded.state.shortcuts.length,1);
  assert.equal(loaded.state.shortcuts[0].title,"Survives");
  assert.equal(loaded.state.shortcuts[0].url,"https://survives.example/");
  assert.equal(loaded.state.shortcuts[0].image,"");
});

test("invalid session render snapshots are rejected rather than rendered", async()=>{
  browser.storage.session.data={
    [constants.SESSION_RENDER_STATE_KEY]:{renderSnapshotVersion:constants.RENDER_SNAPSHOT_SCHEMA_VERSION,activeSpaceId:"personal",shortcuts:[{type:"shortcut",id:"x",title:"Bad",url:"javascript:alert(1)",image:"",position:0}],settings:{...constants.DEFAULT_SETTINGS,backgroundImage:""},settingsModifiedAt:0,updatedAt:0},
    [constants.SESSION_RENDER_META_KEY]:{deviceId:"test-device"}
  };
  assert.equal(await storage.readSessionRenderCache(),null);
  assert.equal(storage.getSessionRenderCacheStatus(),"invalid");
});
