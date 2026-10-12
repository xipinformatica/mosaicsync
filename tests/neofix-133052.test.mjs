// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {friendlyShortcutName,cleanShortcutPageTitle} from '../src/shared/newtab/ui-utils.js';
const newtab = await readFile('src/shared/newtab/newtab.js','utf8');
const background = await readFile('src/shared/background/background-core.js','utf8');

function controllerHarness() {
  const events = new Map(), requests=[];
  const dialog={open:true,addEventListener:(name,fn)=>events.set('dialog-'+name,fn)};
  const ctx={URL, Date, Math, shortcutDialog:dialog, shortcutUrl:{value:'https://example.com/',addEventListener:(n,fn)=>events.set('url-'+n,fn)},shortcutId:{value:''},shortcutTitle:{value:'',focus(){}},updateImagePreview(){},webAccessGranted:true,normalizeShortcutUrl:value=>value,friendlyShortcutName,cleanShortcutPageTitle,browser:{runtime:{sendMessage:msg=>{requests.push(msg);return Promise.resolve({ok:false})}}}};
  const start=newtab.indexOf('  // Typing is strictly offline.');
  const end=newtab.indexOf('  async function openShortcutEditor(',start);
  const cancelStart=newtab.indexOf('  shortcutDialog.addEventListener("pointerdown"');
  const guardsEnd=newtab.indexOf('  shortcutUrl.addEventListener("input"',cancelStart);
  assert.ok(start>=0 && end>start && cancelStart>=0 && guardsEnd>cancelStart);
  runInNewContext(`${newtab.slice(start,end)}\n${newtab.slice(cancelStart,guardsEnd)}`,ctx);
  return {events,requests,ctx,dialog};
}

test('52: Google aliases never apply to attacker-owned lookalike hostnames',()=>{
  assert.equal(friendlyShortcutName('https://mail.google.com/'),'Gmail');
  for(const host of ['mail.google.evil','drive.google.example','docs.google.attacker.co.uk','en.wikipedia.evil','open.spotify.evil','web.whatsapp.evil']) {
    assert.notEqual(friendlyShortcutName(`https://${host}/`),'Gmail');
    assert.doesNotMatch(friendlyShortcutName(`https://${host}/`),/^(?:Google (?:Drive|Docs|Calendar)|Wikipedia|Spotify|WhatsApp)$/);
  }
});

test('52: generic error, verification, loading and bidi-control titles are rejected',()=>{
  for(const title of ['503 Service Unavailable','Zugriff verweigert','Verifica di sicurezza','人机验证','正在加载','Company\u202Eexe.txt','\u2066Legitimate\u2069']) assert.equal(cleanShortcutPageTitle(title,'Example'),'',title);
  assert.equal(cleanShortcutPageTitle('MosaicSync - Privacy-first new tab','Example'),'MosaicSync');
});

test('52: HTML title extraction skips comments and script raw text and decodes common entities',async()=>{
  const start=background.indexOf('  async function suggestShortcutPageTitle(');
  const end=background.indexOf('  async function discoverManifestIconCandidates(',start);
  assert.ok(start>0&&end>start);
  const samples=[
    ['<!-- <title>False Comment Brand</title> --><title>Real Company</title>','Real Company'],
    ['<script>const fake="<title>Script Brand</title>";</script><title>Actual Page</title>','Actual Page'],
    ['<title>Caf&eacute; &ccedil; &ndash; Travel</title>','Café ç – Travel'],
  ];
  for(const [html,expected] of samples){
    const ctx={URL,Date,httpOriginPattern:()=>'<all_urls>',fetchHtmlHead:async()=>({ok:true,text:html,finalPageUrl:'https://example.com/'})};
    runInNewContext(`${background.slice(start,end)}\n globalThis.extractTitle = suggestShortcutPageTitle;`,ctx);
    const result=await ctx.extractTitle('https://example.com/');
    assert.equal(result.title,expected,html);
  }
});

test('52: duplicate URL blur requests are deduplicated within one editor session',()=>{
  const {events,requests,ctx}=controllerHarness();
  for(let i=0;i<3;i++) events.get('url-blur')({relatedTarget:null});
  assert.equal(requests.filter(x=>x.type==='mosaicsync:suggest-shortcut-title').length,1);
  ctx.shortcutUrl.value='https://example.org/';
  events.get('url-blur')({relatedTarget:null});
  assert.equal(requests.filter(x=>x.type==='mosaicsync:suggest-shortcut-title').length,2);
});

test('52: Cancel, Escape, backdrop each independently prevent blur lookup in fresh contexts',()=>{
  for(const action of ['cancel','escape','backdrop']){
    const {events,requests,ctx,dialog}=controllerHarness();
    const target={closest:()=>target};
    if(action==='cancel') events.get('dialog-pointerdown')({target});
    if(action==='escape') events.get('dialog-keydown')({key:'Escape'});
    if(action==='backdrop') events.get('dialog-pointerdown')({target:dialog});
    events.get('url-blur')({relatedTarget:null});
    assert.equal(requests.filter(x=>x.type==='mosaicsync:suggest-shortcut-title').length,0,action);
  }
});

test('52: an outstanding title request is cancelled when URL changes or dialog closes',()=>{
  const {events,requests,ctx}=controllerHarness();
  events.get('url-blur')({relatedTarget:null});
  assert.equal(requests.filter(x=>x.type==='mosaicsync:suggest-shortcut-title').length,1);
  ctx.shortcutUrl.value='https://other.example/';
  ctx.suggestShortcutNameFromUrl();
  assert.equal(requests.filter(x=>x.type==='mosaicsync:cancel-shortcut-title').length,1);
  assert.match(newtab,/shortcutDialog\?\.addEventListener\("close",[^]*?invalidateShortcutNameSuggestion\(\)/);
  assert.match(background,/case "mosaicsync:cancel-shortcut-title"/);
});

test('52: background title request cancellation aborts only its own signal',async()=>{
  const start=background.indexOf('  // Title lookups have their own small cancellation registry.');
  const end=background.indexOf('  function faviconChoiceResultChars(',start);
  assert.ok(start>0&&end>start);
  let startedSignal;
  const ctx={AbortController,Map,Promise,normalizeFaviconChoiceRequestId:v=>String(v||''),suggestShortcutPageTitle:(_url,signal)=>{
    startedSignal=signal;
    return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({ok:false,title:''}),{once:true}));
  }};
  runInNewContext(`${background.slice(start,end)}\n globalThis.runTitle = runShortcutTitleRequest; globalThis.cancelTitle = cancelShortcutTitleRequest;`,ctx);
  const pending=ctx.runTitle('https://example.com/','name-test-123456');
  assert.equal(startedSignal.aborted,false);
  assert.equal(ctx.cancelTitle('name-test-123456'),true);
  assert.equal(startedSignal.aborted,true);
  assert.equal((await pending).ok,false);
  assert.equal(ctx.cancelTitle('name-test-123456'),false);
});

test('52: title fetch refuses redirects while favicon fetch retains default behavior',()=>{
  assert.match(background,/fetchHtmlHead\(pageUrl, \{ deadlineAt: Date\.now\(\) \+ 4_000, signal, redirect: "manual" \}\)/);
  assert.match(background,/async function fetchHtmlHead\(pageUrl, \{[^\n]*redirect = "follow"/);
  assert.match(background,/referrerPolicy: "no-referrer",\s*redirect,\s*signal: abort\.signal/);
});
