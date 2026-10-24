// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';
const root = new URL('../', import.meta.url);
const [newtab, background, storage] = await Promise.all([
  readFile(new URL('src/shared/newtab/newtab.js', root), 'utf8'),
  readFile(new URL('src/shared/background/background-core.js', root), 'utf8'),
  readFile(new URL('src/shared/core/storage.js', root), 'utf8'),
]);

function sample() {
  const item = {type:'shortcut',id:'new-a',url:'https://elpais.com/',title:'Elpais',modifiedAt:102,createdAt:100,position:0,image:'',builtinIcon:''};
  const other = {type:'shortcut',id:'other',url:'https://other.example/',title:'Other',modifiedAt:50,createdAt:40,position:1,image:'new-artwork'};
  const state = {schemaVersion:14,activeSpaceId:'personal',spaces:{
    personal:{shortcuts:[item,other],settings:{},settingsClock:{},settingsModifiedAt:0,updatedAt:102},
    work:{shortcuts:[],settings:{},settingsClock:{},settingsModifiedAt:0,updatedAt:1}
  }};
  return {state,item,expected:{id:'new-a',url:item.url,title:item.title,modifiedAt:item.modifiedAt,createdAt:item.createdAt,newTitle:'El País'}};
}

test('55: fresh storage-only name patch modifies only title and logical clocks', async () => {
  const {planShortcutNameEnrichment} = await import('../src/shared/core/storage.js');
  const {state,expected} = sample();
  const before = structuredClone(state);
  const result = planShortcutNameEnrichment(state, expected, () => 200);
  assert.ok(result, 'matching persisted shortcut must be eligible');
  assert.equal(result.spaces.personal.shortcuts[0].title,'El País');
  assert.equal(result.spaces.personal.shortcuts[0].modifiedAt,200);
  assert.equal(result.spaces.personal.updatedAt,200);
  assert.deepEqual(result.spaces.personal.shortcuts[1],before.spaces.personal.shortcuts[1]);
  assert.deepEqual(result.spaces.work,before.spaces.work);
  assert.deepEqual(state,before,'do not mutate caller or old persisted state');
});

test('55: no rename after a manual edit even when it uses the identical fallback title', async () => {
  const {planShortcutNameEnrichment} = await import('../src/shared/core/storage.js');
  const {state,expected} = sample();
  const title = state.spaces.personal.shortcuts[0];
  for(const change of [{title:'Custom'}, {modifiedAt:104}, {url:'https://elsewhere.example/'}, {createdAt:101}, {id:'other-id'}]) {
    const latest=structuredClone(state);
    Object.assign(latest.spaces.personal.shortcuts[0],change);
    assert.equal(planShortcutNameEnrichment(latest, expected, () => 200),null,JSON.stringify(change));
  }
  const deleted=structuredClone(state); deleted.spaces.personal.shortcuts.shift();
  assert.equal(planShortcutNameEnrichment(deleted, expected,()=>200),null,'deletion must not resurrect record');
});

test('55: folder and Space identity remain intact; unrelated image/position changes never revert', async () => {
  const {planShortcutNameEnrichment} = await import('../src/shared/core/storage.js');
  const {state,expected} = sample();
  const shortcut=state.spaces.personal.shortcuts.shift();
  shortcut.image='data:image/png;base64,NEWER'; shortcut.position=2;
  state.spaces.work.shortcuts.push(shortcut);
  const patched=planShortcutNameEnrichment(state,expected,()=>210);
  assert.ok(patched, 'a pure move can retain eligibility if name identity clocks unchanged');
  assert.equal(patched.spaces.work.shortcuts[0].title,'El País');
  assert.equal(patched.spaces.work.shortcuts[0].image,'data:image/png;base64,NEWER');
  assert.equal(patched.spaces.work.shortcuts[0].position,2);
  assert.equal(patched.spaces.personal.shortcuts.some(x=>x.id===expected.id),false);
  const folderState=structuredClone(state);
  folderState.spaces.work.shortcuts=[{type:'folder',id:'folder',title:'Links',modifiedAt:130,items:[shortcut]}];
  const folderPatched=planShortcutNameEnrichment(folderState,expected,()=>220);
  assert.equal(folderPatched.spaces.work.shortcuts[0].items[0].title,'El País');
  assert.equal(folderPatched.spaces.work.shortcuts[0].modifiedAt,220);
});

test('55: candidate commit checks latest persisted data while write lock is held', () => {
  assert.match(storage,/conditionalShortcutName/);
  assert.match(storage,/planShortcutNameEnrichment\(normalizeState\(latestRaw/);
  assert.match(storage,/recordSyncMutation: true/);
  assert.match(storage,/return \{[^\n]*applied: false/);
});

test('55: original save must complete before optional one-shot enrichment; never wait for network before render', () => {
  const section=newtab.slice(newtab.indexOf('shortcutForm.addEventListener("submit"'),newtab.indexOf('deleteShortcutButton.addEventListener("click"'));
  assert.match(section,/await saveState\(\{ crossSpaceSyncIntent, recoverOnFailure: true \}\)/);
  assert.match(section,/runPostSaveShortcutNameEnrichment/);
  assert.ok(section.indexOf('await saveState({ crossSpaceSyncIntent, recoverOnFailure: true })') < section.indexOf('runPostSaveShortcutNameEnrichment'));
  assert.match(section,/shortcutAutomaticName\.checked/);
  assert.match(section,/webAccessGranted/);
  assert.doesNotMatch(section,/await runPostSaveShortcutNameEnrichment/);
});

test('55: website metadata is separate from the page title and retains existing redirect policy',()=>{
  assert.match(background,/og:site_name/);
  assert.match(background,/siteName/);
  assert.match(background,/redirect: "manual", stopAtHeadEnd: false/);
  assert.match(newtab,/chooseShortcutPageName\(result, saved\.title, saved\.url\)/);
});

function titleHarness() {
  const start=background.indexOf('  async function suggestShortcutPageTitle(');
  const end=background.indexOf('  async function discoverManifestIconCandidates(',start);
  assert.ok(start>0 && end>start);
  const ctx={URL,Date,httpOriginPattern:()=>'<all_urls>',
    htmlAttribute:(tag,name)=> { const m=new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i').exec(tag); return m?.[1]??m?.[2]??m?.[3]??''; },
    fetchHtmlHead:async()=>({ok:false,text:'',finalPageUrl:'https://elpais.com/'})};
  runInNewContext(`${background.slice(start,end)}\nglobalThis.getIdentity=suggestShortcutPageTitle;`,ctx);
  return ctx;
}

test('55: OG site identity wins over generic page title and decodes brand accents',async()=>{
  const ctx=titleHarness();
  const pages=[
    ['<html><head><meta property="og:site_name" content="El Pa&iacute;s"><title>Breaking News - elpais.com</title></head></html>','El País','Breaking News - elpais.com'],
    ['<head><meta content="IKEA" property="og:site_name"><title>Furniture and more</title></head>','IKEA','Furniture and more'],
    ['<head><script>const fake=`<meta property="og:site_name" content="Fake">`;</script><meta property="og:site_name" content="El País"><title>Real Page</title>','El País','Real Page'],
    ['<head><!--<meta property="og:site_name" content="Fake">--><title>Real Page</title>','', 'Real Page'],
    ['<head><meta name="application-name" content="Shared Hosting"><title>Alice Site</title>','','Alice Site'],
  ];
  for (const [html,siteName,title] of pages){
    ctx.fetchHtmlHead=async()=>({ok:true,text:html,finalPageUrl:'https://elpais.com/'});
    const result=await ctx.getIdentity('https://elpais.com/');
    assert.equal(result.ok,true,html);
    assert.equal(result.siteName,siteName,html);
    assert.equal(result.title,title,html);
  }
});

test('55: validation rejects adversarial metadata, failure and redirects retain fallback',async()=>{
  const ctx=titleHarness();
  const {cleanShortcutPageTitle} = await import('../src/shared/newtab/ui-utils.js');
  for (const tag of ['<meta property="og:site_name" content="Loading...">','<meta property="og:site_name" content="503 Service Unavailable">', '<meta property="og:site_name" content="Company&#x202E;exe">']) {
    ctx.fetchHtmlHead=async()=>({ok:true,text:`<head>${tag}<title>Real Page</title></head>`,finalPageUrl:'https://elpais.com/'});
    const result=await ctx.getIdentity('https://elpais.com/');
    assert.equal(cleanShortcutPageTitle(result.siteName,'Elpais'),'',tag);
    assert.equal(cleanShortcutPageTitle(result.title,'Elpais'),'Real Page');
  }
  ctx.fetchHtmlHead=async()=>({ok:false,text:'',reason:'http-redirect',finalPageUrl:'https://www.elpais.com/'});
  assert.equal((await ctx.getIdentity('https://elpais.com/')).ok,false);
});

test('55: actual conditional persistence never commits after a later edit, deletion, or failure', async()=>{
  const {normalizeState}=await import('../src/shared/core/model.js');
  const {DEFAULT_STATE,LOCAL_STATE_KEY,LOCAL_ASSET_INDEX_KEY,LOCAL_PENDING_SYNC_MUTATION_KEY,LOCAL_META_KEY}=await import('../src/shared/core/constants.js');
  const {enrichShortcutNameIfUnchanged}=await import('../src/shared/core/storage.js');
  const {item,expected}=sample();
  const initial=normalizeState(DEFAULT_STATE);
  initial.spaces.personal.shortcuts=[structuredClone(item)];
  initial.spaces.personal.updatedAt=102;
  // storage.local contains the compact spaces payload, not live UI aliases.
  for(const alias of ['shortcuts','settings','settingsClock','settingsModifiedAt','updatedAt']) delete initial[alias];
  const store={[LOCAL_STATE_KEY]:structuredClone(initial),[LOCAL_META_KEY]:{syncEnabled:true,syncInitialized:true}};
  const events=[];
  let fail=false;
  const originalBrowser=globalThis.browser;
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,cb)=>cb()}}});
    globalThis.browser={storage:{local:{
      async get(keys){const result={};for(const key of typeof keys==='string'?[keys]:keys) result[key]=structuredClone(store[key]);return result;},
      async set(values){if(fail)throw Error('disk full');Object.assign(store,structuredClone(values));events.push(values);},
      async remove(keys){for(const key of keys)delete store[key];}
    },session:{set:async()=>{},get:async()=>({})}}};
    assert.equal(await enrichShortcutNameIfUnchanged(expected),true);
    assert.equal(store[LOCAL_STATE_KEY].spaces.personal.shortcuts[0].title,'El País');
    assert.ok(store[LOCAL_PENDING_SYNC_MUTATION_KEY],'Sync-eligible change should have durable journal');
    assert.equal(events.length,1,'state and Sync journal atomic in one set');
    assert.equal(await enrichShortcutNameIfUnchanged(expected),false,'never repeat the one-shot mutation');
    assert.equal(events.length,1,'failed ownership emits zero writes');
    store[LOCAL_STATE_KEY].spaces.personal.shortcuts[0].title='Elpais';
    store[LOCAL_STATE_KEY].spaces.personal.shortcuts[0].modifiedAt=103;
    assert.equal(await enrichShortcutNameIfUnchanged(expected),false,'manual edit with same fallback title still wins');
    store[LOCAL_STATE_KEY].spaces.personal.shortcuts=[];
    assert.equal(await enrichShortcutNameIfUnchanged(expected),false,'deleted record never resurrected');
    store[LOCAL_STATE_KEY].spaces.personal.shortcuts=[structuredClone(item)];
    fail=true;
    await assert.rejects(enrichShortcutNameIfUnchanged(expected));
    assert.equal(store[LOCAL_STATE_KEY].spaces.personal.shortcuts[0].title,'Elpais','failed persistence leaves old title');
  } finally {
    if(originalBrowser===undefined) delete globalThis.browser;else globalThis.browser=originalBrowser;
    if(originalNavigator) Object.defineProperty(globalThis,'navigator',originalNavigator);
  }
});
