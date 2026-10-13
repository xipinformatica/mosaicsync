// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_STATE, LOCAL_STATE_KEY, LOCAL_ACTIVE_SPACE_KEY, LOCAL_META_KEY } from '../src/shared/core/constants.js';
import { normalizeState, selectActiveSpaceNormalized, normalizeMeta, createCrossSpaceSyncIntentNormalized, moveShortcutBetweenSpacesNormalized } from '../src/shared/core/model.js';
import { createNewTabPersistenceGateway } from '../src/shared/newtab/persistence-gateway.js';
import { writeLocalStateWithBaseline } from '../src/shared/core/storage.js';
import { LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX } from '../src/shared/core/constants.js';
const source=fs.readFileSync('src/shared/newtab/newtab.js','utf8');
function extract(name) {
 const asyncStart=source.indexOf(`async function ${name}(`);
 const start=asyncStart>=0?asyncStart:source.indexOf(`function ${name}(`);
 assert.ok(start>=0,name);
 const open=source.indexOf('{\n',start);
 let depth=0,quote='',escape=false,comment=false;
 for(let i=open;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(comment){if(c==='\n')comment=false;continue;}
  if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
  if(c==='/'&&n==='/'){comment=true;i++;continue;}
  if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
  if(c==='{')depth++;if(c==='}'&&!--depth)return source.slice(start,i+1);
 }
 throw Error(`unterminated ${name}`);
}
const clone=x=>structuredClone(x);
function makeProfile(items=[]){
 const s=normalizeState(DEFAULT_STATE);
 s.spaces.personal.shortcuts=items.map((x,i)=>({type:'shortcut',id:x.id||`id-${i}`,url:x.url||`https://${x.title}.example/`,title:x.title,position:i,createdAt:100+i,modifiedAt:100+i,source:'manual'}));
 s.shortcuts=s.spaces.personal.shortcuts;
 return selectActiveSpaceNormalized(normalizeState(s),'personal');
}
function ctx(initial, {onWrite}={}){
 let durable=clone(initial),writes=0;
 const local={
  [LOCAL_STATE_KEY]:clone(durable),[LOCAL_ACTIVE_SPACE_KEY]:'personal',[LOCAL_META_KEY]:{deviceId:'device-1',onboardingCompleted:true}
 };
 const context={
  browser:{storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,clone(local[k])] ))}}},
  LOCAL_STATE_KEY,LOCAL_ACTIVE_SPACE_KEY,LOCAL_META_KEY,
  rawStateMultipleSpacesEnabled:s=>s.spaces?.personal?.settings?.multipleSpacesEnabled!==false,
  SPACE_IDS:['personal','work'],
  normalizeState,selectActiveSpaceNormalized,normalizeMeta,
  hydratePersistedState:async x=>clone(x),
  createPersistedWriteBaseline:clone,
  DEFAULT_STATE,
  ERROR_CODES:{STORAGE_LOCAL_QUOTA_EXCEEDED:'quota',STORAGE_LOCAL_WRITE_FAILED:'write'},
  state:clone(durable),writeBaseline:clone(durable),meta:{deviceId:'device-1'},
  stateMutationGeneration:0,persistedStateChangeGeneration:0,failedShortcutRecoveryPending:false,
  nextMutationTime:()=>Date.now(),repairTopLevelPositionsWithinCapacity:a=>a,visibleTopLevelCapacity:()=>64,
  pendingSettingsDraft:new Map(),applyPendingSettingsDraft(){},
  syncFrequentlyVisitedLocalsFromState(){},refreshSettingsControlsAfterExternalState(){},
  reconcileLauncherAfterExternalState(){},updateSpaceSwitcher(){},scheduleAppearanceHintRefresh(){},
  refreshFirstPaintCaches(){},scheduleRenderPreviewRefresh(){},settlePersistedSettingsDraft(){},
  refreshRenderManifestAfterArtworkChange(){},t:k=>k,
  console:{warn(){}},PRODUCT_NAME:'MosaicSync',
  persistenceGateway:null
 };
 context.persistenceGateway=createNewTabPersistenceGateway(async (next,opts)=>{
  writes++;
  if(onWrite){await onWrite({next,opts,local,writes});}
  else local[LOCAL_STATE_KEY]=clone(next);
  return {state:clone(next),compactBaseline:clone(local[LOCAL_STATE_KEY])};
 });
 vm.createContext(context);
 vm.runInContext([extract('presentLocalPersistenceError').replace('function presentLocalPersistenceError','function presentLocalPersistenceError'),extract('reAdoptDurableShortcutStateAfterFailure'),extract('saveState')].join('\n')+'\nthis.save=saveState;',context);
 return {context,local,get durable(){return local[LOCAL_STATE_KEY];},get writes(){return writes}};
}
function addToState(s,id,title){s.spaces.personal.shortcuts.push({type:'shortcut',id,url:`https://${id}.example/`,title,position:s.spaces.personal.shortcuts.length,createdAt:100,modifiedAt:100,source:'manual'});}
const has=(s,id,space='personal')=>s.spaces[space].shortcuts.some(x=>x.id===id);
test('ED-1 failed add re-adopts durable truth: cancelled ghost never rides a later save',async()=>{
 const h=ctx(makeProfile([{title:'Existing'}]),{onWrite:async ({next,local,writes})=>{
  if(writes===1)throw Error('simulated disk failure');local[LOCAL_STATE_KEY]=clone(next);
 }});
 addToState(h.context.state,'ghost','Ghost');
 await assert.rejects(h.context.save({recoverOnFailure:true}),/disk failure/);
 assert.equal(has(h.context.state,'ghost'),false);
 assert.equal(has(h.durable,'ghost'),false);
 addToState(h.context.state,'other','Other');await h.context.save();
 assert.equal(has(h.durable,'ghost'),false);assert.equal(has(h.durable,'other'),true);
});
test('ED-1 ambiguous write re-adopts a committed identity rather than a pre-save snapshot',async()=>{
 const h=ctx(makeProfile(),{onWrite:async ({next,local,writes})=>{
  local[LOCAL_STATE_KEY]=clone(next);if(writes===1)throw Error('commit then reject');
 }});
 addToState(h.context.state,'stable-editor-id','Once');
 await assert.rejects(h.context.save({recoverOnFailure:true}),/commit then reject/);
 assert.equal(has(h.context.state,'stable-editor-id'),true);
 assert.equal(has(h.durable,'stable-editor-id'),true);
});
test('ED-1 D3 other tab wins during failure; re-adoption preserves the concurrent commit',async()=>{
 const h=ctx(makeProfile([{title:'Existing'}]),{onWrite:async ({next,local,writes})=>{
  if(writes===1){addToState(local[LOCAL_STATE_KEY],'other-tab','Other tab');throw Error('failed while waiting');}
  local[LOCAL_STATE_KEY]=clone(next);
 }});
 addToState(h.context.state,'ghost','Ghost');
 await assert.rejects(h.context.save({recoverOnFailure:true}),/failed while waiting/);
 assert.equal(has(h.context.state,'other-tab'),true);
 assert.equal(has(h.context.state,'ghost'),false);
 addToState(h.context.state,'later','Later');await h.context.save();
 assert.equal(has(h.durable,'other-tab'),true);assert.equal(has(h.durable,'ghost'),false);
});
test('ED-1 failed cross-Space move restores the durable Personal placement and Space pointer',async()=>{
 const initial=makeProfile([{title:'Existing'}]);
 const h=ctx(initial,{onWrite:async ({next,local,writes})=>{if(writes===1)throw Error('move failed');local[LOCAL_STATE_KEY]=clone(next);}});
 const id=h.context.state.shortcuts[0].id;
 h.context.state=moveShortcutBetweenSpacesNormalized(h.context.state,{shortcutId:id,fromSpaceId:'personal',toSpaceId:'work'});
 assert.equal(has(h.context.state,id,'work'),true);
 await assert.rejects(h.context.save({recoverOnFailure:true}),/move failed/);
 assert.equal(h.context.state.activeSpaceId,'personal');
 assert.equal(has(h.context.state,id,'personal'),true);
 assert.equal(has(h.context.state,id,'work'),false);
});
test('ED-1 cross-Space intent must include source deletion from durable state',()=>{
 const initial=makeProfile([{title:'Existing'}]);
 const id=initial.shortcuts[0].id;
 const moved=moveShortcutBetweenSpacesNormalized(initial,{shortcutId:id,fromSpaceId:'personal',toSpaceId:'work'});
 const intent=createCrossSpaceSyncIntentNormalized(initial,moved,{fromSpaceId:'personal',toSpaceId:'work',shortcutIds:[id],deviceId:'device-1'});
 assert.ok(intent.source.deletes.includes(id));
 assert.ok(intent.destination.upserts.some(x=>x.id===id));
 assert.match(fs.readFileSync('src/shared/core/storage.js','utf8'),/createCrossSpaceSyncIntent\(latestRaw \|\| baseState \|\| DEFAULT_STATE, finalState/);
});
test('ED-1 stable operation identity is minted on editor open and reused for new shortcut saves',()=>{
 assert.match(source,/editingNewShortcutId = item \? "" : uid\(\)/);
 assert.match(source,/const operationId = id \|\| editingNewShortcutId \|\| \(editingNewShortcutId = uid\(\)\)/);
 assert.match(source,/id: operationId,/);
 assert.match(source,/let savedShortcutId = operationId;/);
});
test('ED-1 if the recovery read itself fails, the next save cannot publish the ghost',async()=>{
 const h=ctx(makeProfile([{title:'Existing'}]),{onWrite:async ({next,local,writes})=>{
  if(writes===1)throw Error('write failed');local[LOCAL_STATE_KEY]=clone(next);
 }});
 const realGet=h.context.browser.storage.local.get;
 let reads=0;
 h.context.browser.storage.local.get=async keys=>{
  if(++reads===1)throw Error('read also failed');
  return realGet(keys);
 };
 addToState(h.context.state,'ghost','Ghost');
 await assert.rejects(h.context.save({recoverOnFailure:true}),/write failed/);
 assert.equal(h.context.failedShortcutRecoveryPending,true);
 addToState(h.context.state,'other','Other');
 await assert.rejects(h.context.save(),/localSaveFailedUnsaved/);
 assert.equal(h.context.failedShortcutRecoveryPending,false);
 assert.equal(has(h.durable,'ghost'),false);
 assert.equal(has(h.durable,'other'),false);
 addToState(h.context.state,'deliberate','Deliberate');await h.context.save();
 assert.equal(has(h.durable,'deliberate'),true);
 assert.equal(has(h.durable,'ghost'),false);
});

test('ED-1 real storage gateway regenerates a stale move intent from durable source, without a rebase',async()=>{
 const original=makeProfile([{title:'Existing'}]);
 const id=original.shortcuts[0].id;
 const moved=moveShortcutBetweenSpacesNormalized(original,{shortcutId:id,fromSpaceId:'personal',toSpaceId:'work'});
 // This stale intent is what a failed .60 move leaves behind on retry: no
 // Personal deletion, because the caller incorrectly compares moved to moved.
 const stale=createCrossSpaceSyncIntentNormalized(moved,moved,{fromSpaceId:'personal',toSpaceId:'work',shortcutIds:[id],deviceId:'device-1'});
 assert.equal(stale.source.deletes.length,0);
 const data={
  [LOCAL_STATE_KEY]:clone(original),
  [LOCAL_ACTIVE_SPACE_KEY]:'personal',
  [LOCAL_META_KEY]:{deviceId:'device-1',syncEnabled:true,syncInitialized:true}
 };
 const previous=globalThis.browser;
 globalThis.browser={storage:{local:{
  async get(keys){const out={};for(const k of typeof keys==='string'?[keys]:keys||Object.keys(data))if(Object.hasOwn(data,k))out[k]=clone(data[k]);return out;},
  async set(items){Object.assign(data,clone(items));},
  async remove(keys){for(const k of typeof keys==='string'?[keys]:keys)delete data[k];}
 }}};
 try {
  await writeLocalStateWithBaseline(moved,{baseState:clone(original),baseStateIsCompact:true,crossSpaceSyncIntent:stale,recordSyncMutation:false});
  const keys=Object.keys(data).filter(k=>k.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX));
  assert.equal(keys.length,1,'cross-Space recovery journal must be written');
  const committed=data[keys[0]];
  assert.ok(committed.source.deletes.includes(id),'durable Personal copy must be tombstoned');
  assert.ok(committed.destination.upserts.some(x=>x.id===id),'destination Work upsert must be included');
 } finally {globalThis.browser=previous;}
});
