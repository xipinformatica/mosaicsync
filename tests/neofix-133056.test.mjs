// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { approvedTitleRedirect, fetchShortcutTitleResponse } from '../src/shared/background/shortcut-title-redirects.js';
import { cleanShortcutPageTitle } from '../src/shared/newtab/ui-utils.js';

function harness(routes, { permitted = true, observer = true, foreign = false, duplicate = false, existing = false } = {}) {
  const listeners = new Set(), starts = new Set(), calls = [];
  const api = { runtime: { getURL: () => 'moz-extension://mosaic-id/' }, webRequest: { onHeadersReceived: {
    addListener(fn, filter, extra) { assert.deepEqual(extra, ['responseHeaders']); listeners.add(fn); },
    removeListener(fn) { listeners.delete(fn); }
  }, onBeforeRequest: { addListener(fn) { starts.add(fn); }, removeListener(fn) { starts.delete(fn); } } } };
  if (!observer) delete api.webRequest;
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    const route = routes[url]; assert.ok(route, `UNEXPECTED CONTACT: ${url}`);
    if (route.error) throw Error('network');
    const emit = (requestId, old = false) => {
      const details = {
      url, requestId, method:'GET', type:'xmlhttprequest',
      originUrl: foreign ? 'https://unrelated.example/' : 'moz-extension://mosaic-id/background/background.html',
      statusCode: route.location ? 301 : 200,
      responseHeaders: route.location ? [{name:'Location',value:route.location}] : []
    };
      if (!old) for (const fn of starts) fn(details);
      for (const fn of listeners) fn(details);
    };
    if (existing) emit('old-favicon',true);
    emit('ours'); if (duplicate) emit('other');
    route.onReply?.();
    // Browser-accurate opaque response: there is NO readable Location/status.
    return route.location ? { type:'opaqueredirect', status:0, ok:false, headers:new Headers(), body:null, url:'' }
      : new Response(route.body || '<title>El Periódico - Noticias y última hora</title>', {headers:{'content-type':'text/html'}});
  };
  return { calls, listeners, starts, api, run:(url, signal) => fetchShortcutTitleResponse(url, {api,signal,canReadOrigin:async()=>typeof permitted === 'function' ? permitted() : permitted,fetchImpl}) };
}

test('56: canonical path redirects expose metadata using opaque browser responses', async()=>{
  const h=harness({'https://www.elperiodico.com/':{location:'/es/'},'https://www.elperiodico.com/es/':{}});
  const r=await h.run('https://www.elperiodico.com/');
  assert.equal(r.finalPageUrl,'https://www.elperiodico.com/es/');
  const html=await r.response.text();
  assert.equal(cleanShortcutPageTitle(/<title>(.*?)<\/title>/.exec(html)[1],'Elperiodico',r.finalPageUrl),'El Periódico');
  assert.deepEqual(h.calls,['https://www.elperiodico.com/','https://www.elperiodico.com/es/']);
  assert.equal(h.listeners.size,0);
});

test('56: HTTP upgrade and www canonicalization may precede a language path', async()=>{
  const h=harness({'http://example.com/':{location:'https://www.example.com/'},'https://www.example.com/':{location:'/es/'},'https://www.example.com/es/':{}});
  assert.ok((await h.run('http://example.com/')).response.ok);
  assert.equal(h.calls.length,3);
});

test('56: cross-host, downgrade, userinfo and changed-port redirects are rejected before contact',async()=>{
  for (const location of ['https://accounts.example.com/','https://example.com.attacker.test/','https://evil.test/','http://example.com/','https://user:pass@example.com/','https://example.com:444/','javascript:alert(1)','data:text/html,foo']) {
    const h=harness({'https://example.com/':{location}});
    assert.equal((await h.run('https://example.com/')).reason,'redirect-blocked',location);
    assert.equal(h.calls.length,1,location); assert.equal(h.listeners.size,0);
  }
});

test('56: a safe first redirect cannot authorize an unsafe second redirect',async()=>{
  const h=harness({'https://example.com/':{location:'/es/'},'https://example.com/es/':{location:'https://attacker.test/'}});
  assert.equal((await h.run('https://example.com/')).reason,'redirect-blocked');
  assert.equal(h.calls.length,2);
});

test('56: loops and more than three redirects terminate with explicit reasons',async()=>{
  const loop=harness({'https://example.com/':{location:'/a'},'https://example.com/a':{location:'/'}});
  assert.equal((await loop.run('https://example.com/')).reason,'redirect-loop');assert.equal(loop.calls.length,2);
  const routes={};for(let i=0;i<5;i++)routes[`https://example.com/${i}`]={location:`/${i+1}`};
  const chain=harness(routes);
  assert.equal((await chain.run('https://example.com/0')).reason,'redirect-limit');assert.equal(chain.calls.length,4);
});

test('56: missing observation, foreign initiators and ambiguous requests fail closed',async()=>{
  for (const config of [{observer:false},{foreign:true},{duplicate:true}]) {
    const h=harness({'https://example.com/':{location:'/es/'}},config);
    assert.equal((await h.run('https://example.com/')).reason, config.duplicate?'redirect-ambiguous':'redirect-unavailable');
    assert.equal(h.calls.length,1);assert.equal(h.listeners.size,0);
  }
});

test('56: direct responses work without webRequest observation',async()=>{
  const h=harness({'https://elperiodic.ad/':{body:'<meta property="og:site_name" content="El Periòdic d\'Andorra">'}},{observer:false});
  assert.ok((await h.run('https://elperiodic.ad/')).response.ok);
});

test('56: no request without website permission or after cancellation',async()=>{
  const h=harness({}, {permitted:false});
  assert.equal((await h.run('https://example.com/')).reason,'permission');assert.equal(h.calls.length,0);
  const ctrl=new AbortController();ctrl.abort();
  assert.equal((await h.run('https://example.com/',ctrl.signal)).reason,'cancelled');assert.equal(h.calls.length,0);
});

test('56: listener removed after network failure',async()=>{
  const h=harness({'https://example.com/':{error:true}});
  await assert.rejects(h.run('https://example.com/'),/network/);assert.equal(h.listeners.size,0);
});

test('56: equivalent hosts preserve exact identity and reject deceptive Unicode',()=>{
  assert.equal(approvedTitleRedirect('https://elperiodico.com/','https://www.elperiodico.com/es/'),'https://www.elperiodico.com/es/');
  assert.equal(approvedTitleRedirect('https://example.com/','https://еxample.com/'),null); // Cyrillic e
  assert.equal(approvedTitleRedirect('https://example.com/','//example.com.evil.test/'),null);
  assert.equal(approvedTitleRedirect('https://example.com/','https://www.www.example.com/'),null);
});

test('56: production diagnostics count only outcomes, never URLs or shortcut titles',async()=>{
  const code=await readFile('src/shared/background/background-core.js','utf8');
  const start=code.indexOf('  const shortcutTitleRequests = new Map();');
  const end=code.indexOf('  function faviconChoiceResultChars(',start);
  const ctx={AbortController,normalizeFaviconChoiceRequestId:String,suggestShortcutPageTitle:async()=>({ok:false,reason:'redirect-blocked',title:''})};
  runInNewContext(`${code.slice(start,end)}\nglobalThis.run=runShortcutTitleRequest;globalThis.counts=shortcutTitleDiagnostics;`,ctx);
  await ctx.run('https://private.example/secret?q=private','private-id-123');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.counts)),{'redirect-blocked':1});
});


test('56: permission loss between hops prevents the next request',async()=>{
  const h=harness({'https://example.com/':{location:'/next'}},{permitted:()=>h.calls.length===0});
  assert.equal((await h.run('https://example.com/')).reason,'permission');
  assert.equal(h.calls.length,1);assert.equal(h.listeners.size,0);
});

test('56: cancellation after redirect headers prevents the next request',async()=>{
  const ctrl=new AbortController();
  const h=harness({'https://example.com/':{location:'/next',onReply:()=>ctrl.abort()}});
  assert.equal((await h.run('https://example.com/',ctrl.signal)).reason,'cancelled');
  assert.equal(h.calls.length,1);assert.equal(h.listeners.size,0);
});


test('56: response from an already-running favicon request cannot contaminate the title redirect',async()=>{
  const h=harness({'https://example.com/':{location:'/es/'},'https://example.com/es/':{}},{existing:true});
  assert.ok((await h.run('https://example.com/')).response.ok);
  assert.equal(h.calls.length,2);assert.equal(h.listeners.size,0);assert.equal(h.starts.size,0);
});
