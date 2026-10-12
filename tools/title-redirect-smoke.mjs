#!/usr/bin/env node
// Native browser API check. Runtime bytes are copied unchanged from dist; only
// the disposable test manifest pregrants website access and uses a test addon ID.
// Production optional-permission prompts/upgrades are NOT exercised here.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { WebDriverClient, browserCapabilities, discoverBrowserSmokeEnvironment, openBrowserNewTab, waitForExtensionPage, stabilizeChromeSmokeTab } from './browser-smoke.mjs';
import { waitForFreshProfileWelcome } from './title-welcome-wait.mjs';
const kind=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1];
if (!['firefox','chrome'].includes(kind)) throw Error('Use --browser=firefox or --browser=chrome');
const environment=await discoverBrowserSmokeEnvironment();
const binary=kind==='chrome'?environment.chrome:environment.firefox;
const driverBinary=kind==='chrome'?environment.chromedriver:environment.geckodriver;
if(!binary||!driverBinary)throw Error(`Missing ${kind} browser/driver`);
const scratch=await mkdtemp(join(tmpdir(),'mosaicsync-title-smoke-'));
let driver,client;
const hits=[];
const server=createServer((req,res)=>{
  hits.push(req.url);
  const base=`http://127.0.0.1:${server.address().port}`;
  if(req.url==='/canonical') {res.writeHead(301,{location:'/es/'});res.end();}
  else if(req.url==='/foreign') {res.writeHead(302,{location:base.replace('127.0.0.1','localhost')+'/forbidden'});res.end();}
  else if(req.url==='/loop') {res.writeHead(302,{location:'/loop'});res.end();}
  else if(req.url==='/slow') {setTimeout(()=>{res.writeHead(200,{'content-type':'text/html'});res.end('<title>Too Late</title>');},5000).unref();}
  else {res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<title>El Periódico - Noticias y última hora</title>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  const extension=join(scratch,'extension');await cp(resolve('dist',kind),extension,{recursive:true});
  const manifestPath=join(extension,'manifest.json');const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.host_permissions=[...manifest.optional_host_permissions];delete manifest.optional_host_permissions;
  if(kind==='firefox')manifest.browser_specific_settings.gecko.id='mosaicsync-title-smoke@invalid.test';
  await writeFile(manifestPath,JSON.stringify(manifest));
  const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const driverPort=portServer.address().port;await new Promise(r=>portServer.close(r));
  driver=spawn(driverBinary,[`--port=${driverPort}`],{stdio:['ignore','ignore','pipe']});let driverLog='';driver.stderr.on('data',v=>driverLog+=v);
  const driverUrl=`http://127.0.0.1:${driverPort}`;
  for(let i=0;i<100;i++) {try{if((await fetch(driverUrl+'/status')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  client=new WebDriverClient(driverUrl);
  const caps=browserCapabilities(kind,{browserBinary:binary,chromeExtensionPath:extension});
  if(kind==='chrome')caps['goog:chromeOptions'].args.push('--headless=new',`--user-data-dir=${join(scratch,'profile')}`);
  await client.newSession(caps);
  if(kind==='firefox') {
    const addon=join(scratch,'title-smoke.zip');
    execFileSync('python3',['-c','import sys,zipfile,pathlib; r=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w"); [z.write(p,p.relative_to(r)) for p in r.rglob("*") if p.is_file()]; z.close()',extension,addon]);
    await client.installFirefoxAddon(addon);
  }
  await openBrowserNewTab(client,kind);
  await waitForExtensionPage(client,kind==='chrome'?'chrome-extension://':'moz-extension://',20000);
  if(kind==='chrome')await stabilizeChromeSmokeTab(client);
  // The fresh-profile New Tab redirects to Welcome once onboarding state is loaded.
  // Wait for that expected navigation to finish before issuing extension messages.
  await waitForFreshProfileWelcome(client);
  const request=async(path,id)=>client.executeAsync(`const done=arguments[arguments.length-1]; (globalThis.browser||globalThis.chrome).runtime.sendMessage({type:'mosaicsync:suggest-shortcut-title',pageUrl:arguments[0],requestId:arguments[1]}).then(done,e=>done({error:String(e)}));`,[base+path,id]);
  // Direct document naming must always work even if the browser cannot
  // expose redirect response headers to its own MV3 service worker.
  const direct=await request('/es/','smoke-direct-58');
  assert.equal(direct.ok,true,JSON.stringify(direct));
  assert.equal(direct.title,'El Periódico - Noticias y última hora');
  const canonical=await request('/canonical','smoke-canonical-58');
  const redirectObservable=canonical.ok===true;
  // Chromium should observe same-host redirects in this controlled local
  // setup. A silent all-unavailable regression must not turn CI green.
  if(kind==='chrome')assert.equal(canonical.ok,true,`Chrome redirect title unavailable: ${JSON.stringify(canonical)}`);

  if(redirectObservable) {
    assert.equal(canonical.title,direct.title);
    assert.equal(canonical.finalPageUrl,base+'/es/');
  } else {
    // The safe fallback is an explicit refusal, NEVER fetch redirect:follow.
    assert.equal(canonical.reason,'redirect-unavailable',JSON.stringify(canonical));
    assert.equal(hits.filter(x=>x==='/canonical').length,1);
  }
  const foreign=await request('/foreign','smoke-foreign-58');
  assert.ok(['redirect-blocked','redirect-unavailable'].includes(foreign.reason),JSON.stringify(foreign));
  if(kind==='chrome')assert.equal(foreign.reason,'redirect-blocked','Chrome did not observe the unsafe redirect');

  assert.equal(hits.includes('/forbidden'),false,'unsafe redirect contacted');
  const loop=await request('/loop','smoke-loop-58');
  assert.ok(['redirect-loop','redirect-unavailable'].includes(loop.reason),JSON.stringify(loop));
  if(kind==='chrome')assert.equal(loop.reason,'redirect-loop','Chrome did not observe the redirect loop');
  assert.equal(hits.filter(x=>x==='/loop').length,1);
  const start=Date.now();const slow=await request('/slow','smoke-timeout-58');
  assert.equal(slow.reason,'timeout',JSON.stringify(slow));
  assert.ok(Date.now()-start<4800,'shared 4-second deadline');
  const diagnostics=await client.executeAsync(`const done=arguments[arguments.length-1]; (globalThis.browser||globalThis.chrome).runtime.sendMessage({type:'mosaicsync:get-shortcut-title-diagnostics'}).then(done);`);
  assert.ok(diagnostics.counts['metadata-found']>=1);
  assert.ok((diagnostics.counts['redirect-blocked']||0)+(diagnostics.counts['redirect-unavailable']||0)>=1);
  const report={ok:true,browser:kind,redirectCapability:{canonical:canonical.ok===true,foreign:foreign.reason,loop:loop.reason},permissionSetup:'test manifest pregrants website access; runtime unchanged',direct,canonical,foreign,loop,slow,diagnostics,hits};
  await writeFile(join(scratch,'title-redirect-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  try { await client?.deleteSession(); } catch(e) { console.error('Title-smoke session cleanup:',e.message); }
  driver?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});
}
