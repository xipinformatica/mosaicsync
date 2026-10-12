// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchShortcutTitleResponse } from '../src/shared/background/shortcut-title-redirects.js';

function harness() {
  const before = new Set(); const headers = new Set();
  const event = listeners => ({
    addListener(fn) { if (listeners.has(fn)) throw Error('duplicate listener'); listeners.add(fn); },
    removeListener(fn) { listeners.delete(fn); }
  });
  return {
    api: { runtime: { getURL: () => 'chrome-extension://mosaic/' }, webRequest: {
      onBeforeRequest: event(before), onHeadersReceived: event(headers) } },
    counts: () => [before.size, headers.size],
    emitStart(url,id) { for (const fn of before) fn({url,requestId:id,method:'GET',type:'xmlhttprequest',initiator:'chrome-extension://mosaic'}); },
    emitHeader(url,id,location) { for (const fn of headers) fn({url,requestId:id,method:'GET',type:'xmlhttprequest',initiator:'chrome-extension://mosaic',statusCode:302,responseHeaders:[{name:'Location',value:location}]}); }
  };
}
const page='https://example.org/original';
const response={type:'basic',status:200,url:page};
const allow=async()=>true;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('59: request listeners are absent until lookup and are removed after idle', async () => {
  const h=harness();
  assert.deepEqual(h.counts(),[0,0],'no persistent webRequest listeners at startup');
  let releaseFetch;
  const waiting=new Promise(resolve=>{releaseFetch=resolve;});
  const run=fetchShortcutTitleResponse(page,{api:h.api,canReadOrigin:allow,fetchImpl:async()=>{await waiting;return response;}});
  await delay(110);
  assert.deepEqual(h.counts(),[1,1],'listener pair present while request in flight');
  releaseFetch();
  assert.equal((await run).response,response);
  assert.deepEqual(h.counts(),[1,1],'brief idle tail catches late request events');
  await delay(5300);
  assert.deepEqual(h.counts(),[0,0],'listener pair removed when idle');
  const again=await fetchShortcutTitleResponse(page,{api:h.api,canReadOrigin:allow,fetchImpl:async()=>response});
  assert.equal(again.response,response);
  assert.deepEqual(h.counts(),[1,1],'listener pair reattaches on next lookup');
});

test('59: simultaneous title lookups keep one listener pair through both requests', async () => {
  const h=harness(); let doneFirst,doneSecond;
  const firstWaiting=new Promise(r=>doneFirst=r),secondWaiting=new Promise(r=>doneSecond=r);
  const request=i=>fetchShortcutTitleResponse(page+`?${i}`,{api:h.api,canReadOrigin:allow,fetchImpl:async()=>{await (i===1?firstWaiting:secondWaiting);return response;}});
  const first=request(1),second=request(2);
  await delay(115);
  assert.deepEqual(h.counts(),[1,1]);
  doneFirst();await first;
  assert.deepEqual(h.counts(),[1,1],'still listening while second lookup is in flight');
  doneSecond();await second;
  assert.deepEqual(h.counts(),[1,1]);
});

test('59: denying site access does not register global network listeners', async()=>{
  const h=harness();
  const denied=await fetchShortcutTitleResponse(page,{api:h.api,canReadOrigin:async()=>false,fetchImpl:()=>{throw Error('must not fetch');}});
  assert.equal(denied.reason,'permission');
  assert.deepEqual(h.counts(),[0,0]);
});
