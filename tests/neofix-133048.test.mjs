// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNewTabPersistenceGateway } from '../src/shared/newtab/persistence-gateway.js';

const source = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const gatewaySource = fs.readFileSync('src/shared/newtab/persistence-gateway.js', 'utf8');

function recordingGateway() {
  const calls=[];
  const write = (state, options) => {
    const output = {state, compactBaseline: {written:true}};
    calls.push({state,options,output});
    return Promise.resolve(output);
  };
  return {gateway:createNewTabPersistenceGateway(write),calls};
}

test('.48 forwards ordinary user-edit transaction without copying state or changing options', async () => {
  const {gateway,calls}=recordingGateway();
  const state={shortcuts:[{title:'Edited'}]}, baseline={previous:1};
  const result=await gateway.commitWithBaseline(state,baseline,{recordSyncMutation:true});
  assert.equal(calls.length,1);
  assert.equal(calls[0].state,state);
  assert.deepEqual(calls[0].options,{baseState:baseline,baseStateIsCompact:true,recordSyncMutation:true});
  assert.equal(result,calls[0].output);
});

test('.48 cache-only saves preserve cross-Space null and false Sync flag exactly', async()=>{
  const {gateway,calls}=recordingGateway();
  await gateway.commitWithBaseline({},null,{crossSpaceSyncIntent:null,recordSyncMutation:false});
  assert.deepEqual(calls[0].options,{baseState:null,baseStateIsCompact:false,crossSpaceSyncIntent:null,recordSyncMutation:false});
});

test('.48 cross-Space moves retain their dedicated intent and do not get a second Sync journal', async()=>{
  const {gateway,calls}=recordingGateway();
  const intent={fromSpaceId:'personal',toSpaceId:'work',shortcutIds:['a']};
  await gateway.commitWithBaseline({}, {compact:'yes'}, {crossSpaceSyncIntent:intent,recordSyncMutation:false});
  assert.equal(calls[0].options.crossSpaceSyncIntent,intent);
  assert.equal(calls[0].options.recordSyncMutation,false);
  assert.equal(calls.length,1);
});

test('.48 Frequently Visited migration retains its explicit publishLegacyIntent=false', async()=>{
  const {gateway,calls}=recordingGateway();
  await gateway.commitWithBaseline({}, {prior:true}, {recordSyncMutation:false});
  assert.deepEqual(calls[0].options,{baseState:{prior:true},baseStateIsCompact:true,recordSyncMutation:false});
});

test('.48 imported profile still requires the examined durable snapshot', async()=>{
  const {gateway,calls}=recordingGateway();
  const imported={spaces:{}};const snapshot={state:{old:true}};
  await gateway.commitImportedProfile(imported,snapshot);
  assert.equal(calls[0].state,imported);
  assert.deepEqual(calls[0].options,{recordSyncMutation:true,requireUnchangedCompactState:snapshot});
  assert.equal(Object.hasOwn(calls[0].options,'baseState'),false);
});

test('.48 rejects unchanged error identity and does not retry a failed save', async()=>{
  const err=Object.assign(new Error('storage write failed'),{code:'STORAGE_LOCAL_WRITE_FAILED'});
  let count=0;
  const gateway=createNewTabPersistenceGateway(()=>{count++;return Promise.reject(err)});
  await assert.rejects(gateway.commitWithBaseline({},null,{recordSyncMutation:true}),e=>e===err);
  await assert.rejects(gateway.commitImportedProfile({},{}),e=>e===err);
  assert.equal(count,2);
});

test('.48 gateway does not serialize writes or introduce hidden storage operations', async()=>{
  const finish=[];
  const gateway=createNewTabPersistenceGateway(()=>new Promise(resolve=>finish.push(resolve)));
  const one=gateway.commitWithBaseline({},null,{recordSyncMutation:false});
  const two=gateway.commitWithBaseline({},null,{recordSyncMutation:true});
  assert.equal(finish.length,2,'both writes must reach core persistence synchronously, as before');
  finish[1]({id:2});finish[0]({id:1});
  assert.equal((await one).id,1);assert.equal((await two).id,2);
});

test('.48 all six New Tab writes route through the gateway, preserving caller ownership',()=>{
  assert.equal((source.match(/persistenceGateway\.commitWithBaseline\(/g)||[]).length,5);
  assert.equal((source.match(/persistenceGateway\.commitImportedProfile\(/g)||[]).length,1);
  assert.doesNotMatch(source,/\bwriteLocalStateWithBaseline\s*\(/,'no bypass of shared gateway');
  assert.match(source,/catch\s*\(error\)[\s\S]*?presentLocalPersistenceError\(error\)/);
  assert.match(source,/rollbackCustomBrandingImport\(brandingTransaction\)/);
  assert.match(source,/settlePersistedSettingsDraft\(\)/);
  assert.doesNotMatch(gatewaySource,/\b(setTimeout|queueMicrotask|storage\.sync|storage\.local|localStorage)\s*[.(]/);
});
