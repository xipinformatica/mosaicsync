// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchShortcutTitleResponse } from '../src/shared/background/shortcut-title-redirects.js';

function fakeApi() {
  const before = [], headers = [];
  const event = listeners => ({
    addListener(handler) { listeners.push(handler); },
    removeListener(handler) { const i=listeners.indexOf(handler); if(i>=0)listeners.splice(i,1); }
  });
  return {
    api: { runtime: { getURL: () => 'chrome-extension://mosaic/' }, webRequest: { onBeforeRequest:event(before), onHeadersReceived:event(headers) } },
    emitForeignBefore(id,url) { for(const fn of before)fn({requestId:id,url,method:'GET',type:'xmlhttprequest',initiator:'https://another.example'}); },
    emitBefore(id,url) { for(const fn of before)fn({requestId:id, url, method:'GET',type:'xmlhttprequest',initiator:'chrome-extension://mosaic'}); },
    emitHeaders(id,url,status,location) { for(const fn of headers)fn({requestId:id,url,method:'GET',type:'xmlhttprequest',initiator:'chrome-extension://mosaic',statusCode:status,responseHeaders:[{name:'Location',value:location}]}); },
    get listenerCounts() { return [before.length,headers.length]; }
  };
}
const original='https://example.com/news';
const redirected='https://example.com/en/';
const redirectResponse={type:'opaqueredirect',status:0,body:null};
const okResponse={type:'basic',status:200,url:redirected};
const immediate=async () => true;

test('58: response-header arrives after fetch finishes, approved redirect still succeeds',async()=>{
  const h=fakeApi();assert.deepEqual(h.listenerCounts,[0,0]);const requests=[];
  const result=await fetchShortcutTitleResponse(original,{api:h.api,canReadOrigin:immediate,fetchImpl:async url=>{
    requests.push(url);if(url===original){h.emitBefore('1',url);setTimeout(()=>h.emitHeaders('1',url,301,'/en/'),25);return redirectResponse;}
    h.emitBefore('2',url);return okResponse;
  }});
  assert.equal(result.finalPageUrl,redirected);
  assert.deepEqual(requests,[original,redirected]);
  assert.deepEqual(h.listenerCounts,[1,1]);
});

test('58: same observer reused across multiple title requests',async()=>{
 const h=fakeApi();
 for(let n=0;n<3;n++) await fetchShortcutTitleResponse(redirected,{api:h.api,canReadOrigin:immediate,fetchImpl:async()=>okResponse});
 assert.deepEqual(h.listenerCounts,[1,1]);
});

test('58: foreign redirects are never contacted when late headers arrive',async()=>{
 const h=fakeApi();const called=[];
 const result=await fetchShortcutTitleResponse(original,{api:h.api,canReadOrigin:immediate,fetchImpl:async url=>{
  called.push(url); h.emitBefore('3',url);setTimeout(()=>h.emitHeaders('3',url,302,'https://other.test/forbidden'),25);return redirectResponse;
 }});
 assert.equal(result.reason,'redirect-blocked');assert.deepEqual(called,[original]);
});

test('58: wrong initiator never supplies redirect location',async()=>{
 const h=fakeApi();
 const result=await fetchShortcutTitleResponse(original,{api:h.api,canReadOrigin:immediate,fetchImpl:async url=>{
  h.emitForeignBefore('foreign',url);
  return redirectResponse;
 }});
 assert.equal(result.reason,'redirect-unavailable');
});

test('58: redirect event wait is bounded and abortable',async()=>{
 const h=fakeApi();const controller=new AbortController();setTimeout(()=>controller.abort(),15);
 const began=Date.now();
 const result=await fetchShortcutTitleResponse(original,{api:h.api,signal:controller.signal,canReadOrigin:immediate,fetchImpl:async()=>redirectResponse});
 assert.equal(result.reason,'cancelled');assert.ok(Date.now()-began<200);
});

test('58: unverified redirect fails closed instead of following',async()=>{
 const h=fakeApi();let count=0;
 const began=Date.now();
 const result=await fetchShortcutTitleResponse(original,{api:h.api,canReadOrigin:immediate,fetchImpl:async()=>{count++;return redirectResponse;}});
 assert.equal(result.reason,'redirect-unavailable');assert.equal(count,1);
 assert.ok(Date.now()-began>=250 && Date.now()-began<1200);
});
