import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src,name){let start=src.indexOf(`async function ${name}`);if(start<0)start=src.indexOf(`function ${name}`);assert.ok(start>=0,`missing ${name}`);const brace=src.indexOf("{\n",start);let depth=0,quote="",esc=false,lineComment=false,blockComment=false;for(let i=brace;i<src.length;i++){const c=src[i],n=src[i+1];if(lineComment){if(c==="\n")lineComment=false;continue;}if(blockComment){if(c==="*"&&n==="/"){blockComment=false;i++;}continue;}if(quote){if(esc){esc=false;continue;}if(c==="\\"){esc=true;continue;}if(c===quote)quote="";continue;}if(c==="/"&&n==="/"){lineComment=true;i++;continue;}if(c==="/"&&n==="*"){blockComment=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(start,i+1);}throw Error(`unterminated ${name}`);}

function qualitySide(candidate){const w=Math.max(0,Number(candidate?.width)||0),h=Math.max(0,Number(candidate?.height)||0);return w&&h?Math.min(w,h):Math.max(0,Number(candidate?.qualitySide)||0,w,h);}
function better(current,candidate){if(!candidate?.image)return current;if(!current?.image)return candidate;const a=qualitySide(current),b=qualitySide(candidate);if(a!==b)return b>a?candidate:current;return candidate.declared&&!current.declared?candidate:current;}
function image(name,side,url,{declared=false}={}){return {image:`data:image/png;base64,${name}`,sourceUrl:url,reason:"",width:side,height:side,qualitySide:side,declared};}
function resolverCode(src){return [
  extract(src,"faviconQualitySide"),
  extract(src,"faviconCandidateSuitability"),
  extract(src,"faviconCandidatePreference"),
  extract(src,"faviconCandidateIsAuthoritativelyGoodEnough"),
  extract(src,"betterFaviconCandidate"),
  extract(src,"parentHostFaviconUrl"),
  extract(src,"probeConventionalFaviconFallbacks"),
  extract(src,"probeConventionalFaviconQualityUpgrade"),
  extract(src,"probeOriginalOriginDeclaredIcons"),
  extract(src,"resolveFaviconForUrl")
].join("\n");}

for(const browser of ["firefox"]) test(`${browser}: fast first pass keeps favicon-first and app-subdomain fallback`, async()=>{
  const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
  const code=resolverCode(src);
  const calls=[]; let scenario={};
  const ctx={console,URL,Date,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>true,resolveBrowserCachedFavicon:async()=>scenario.native||null,fetchImageDataUrlDetailed:async(url)=>{calls.push(url);return scenario.fetch?.[url]||{image:"",reason:"http-404",qualitySide:0};},discoverPageIconInfo:async url=>{calls.push(`HTML:${url}`);return scenario.discovered||{candidates:[],finalPageUrl:url,reason:"http-403"};},betterFaviconCandidate:better,faviconQualitySide:qualitySide};
  vm.createContext(ctx); vm.runInContext(code,ctx);
  scenario={fetch:{"https://chat.mistral.ai/favicon.ico":{image:"",reason:"http-403",qualitySide:0},"https://mistral.ai/favicon.ico":image("M",64,"https://mistral.ai/favicon.ico")}};
  const result=await ctx.resolveFaviconForUrl("https://chat.mistral.ai/",{});
  assert.ok(result.image.includes("M"));
  assert.equal(calls.some(x=>x.startsWith("HTML:")),false,"fast parent-host fallback should avoid page parsing");

  scenario={fetch:{"https://elpais.com/favicon.ico":image("ELOW",32,"https://elpais.com/favicon.ico")}};calls.length=0;
  const el=await ctx.resolveFaviconForUrl("https://elpais.com/",{});
  assert.ok(el.image.includes("ELOW"));
  assert.equal(el.provisional,true);
  assert.equal(calls[0],"https://elpais.com/favicon.ico");
  assert.equal(calls.some(x=>x.startsWith("HTML:")),false,"first paint should not wait for HTML when favicon.ico exists");
});

for (const browser of ["firefox","chrome"]) test(`${browser}: quality pass prioritizes declared cross-host artwork before guessed root paths`, async()=>{
  const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
  const code=resolverCode(src);
  const calls=[];
  let now=0;
  const clock={now:()=>now};
  const high=image("ELPAIS_HD",180,"https://static.elpais.com/dist/resources/images/apple-touch-icon.png",{declared:true});
  const ctx={
    console,URL,Date:clock,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,
    isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>true,resolveBrowserCachedFavicon:async()=>null,
    faviconQualitySide:qualitySide,betterFaviconCandidate:better,
    discoverPageIconInfo:async url=>{calls.push(`HTML:${url}`);now+=3000;return {candidates:[{url:high.sourceUrl,score:1180,sideHint:180,order:0,source:"link"}],finalPageUrl:url,reason:""};},
    fetchImageDataUrlDetailed:async (url,options={})=>{calls.push(url);if(url===high.sourceUrl){now+=1000;return {...high,sourceKind:options.sourceKind||high.sourceKind||""};}if(/\/(?:icon\.ico|favicon\.(?:ico|svg|png)|apple-touch-icon\.png)$/.test(url)){now+=4000;return {image:"",reason:"timeout",width:0,height:0,qualitySide:0};}return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const result=await ctx.resolveFaviconForUrl("https://elpais.com/",{preferQuality:true});
  assert.ok(result.image.includes("ELPAIS_HD"));
  assert.equal(result.sourceUrl,high.sourceUrl);
  assert.equal(result.provisional,false);
  assert.equal(calls[0],"HTML:https://elpais.com/","authoritative page metadata must receive the budget first");
  assert.equal(calls.includes("https://elpais.com/icon.ico"),false,"guessed paths must not run when declared art already solved quality");
  assert.ok(now<8000,"declared artwork should complete inside the shared deadline even when guessed paths would have timed out");
});

for (const browser of ["firefox","chrome"]) test(`${browser}: conventional quality guesses are fallback-only and budget-isolated`, async()=>{
  const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
  const code=resolverCode(src);
  const calls=[];
  const low=image("LOW",32,"https://example.test/favicon.ico");
  const high=image("HIGH",256,"https://example.test/icon.ico",{declared:true});
  const ctx={
    console,URL,Date,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,
    isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>true,resolveBrowserCachedFavicon:async()=>null,
    faviconQualitySide:qualitySide,betterFaviconCandidate:better,
    discoverPageIconInfo:async url=>{calls.push(`HTML:${url}`);return {candidates:[],finalPageUrl:url,reason:"http-403"};},
    fetchImageDataUrlDetailed:async(url,options={})=>{calls.push(url);if(url==="https://example.test/favicon.ico")return {...low,sourceKind:options.sourceKind||low.sourceKind||""};if(url==="https://example.test/icon.ico")return {...high,sourceKind:options.sourceKind||high.sourceKind||""};return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const result=await ctx.resolveFaviconForUrl("https://example.test/path",{preferQuality:true});
  assert.ok(result.image.includes("HIGH"));
  assert.ok(calls.indexOf("HTML:https://example.test/path") < calls.indexOf("https://example.test/favicon.ico"));
  assert.ok(calls.indexOf("https://example.test/favicon.ico") < calls.indexOf("https://example.test/icon.ico"));
  assert.match(src,/const fallbackDeadline = Math\.min\(deadlineAt, Date\.now\(\) \+ 1_500\)/,"guessed quality paths must have an isolated post-discovery budget");
});

for (const browser of ["firefox","chrome"]) test(`${browser}: authenticated deep-link quality retry prefers original-site root artwork over login-provider favicon`, async()=>{
  const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
  const code=resolverCode(src);
  const calls=[];
  const newsHigh=image("GOOGLE_NEWS",256,"https://ssl.gstatic.com/gnews/logo/google_news_512.png",{declared:true});newsHigh.qualitySide=512;
  const loginIcon=image("LOGIN_G",96,"https://accounts.google.com/favicon.ico",{declared:true});
  const requested="https://news.google.com/foryou?hl=en-US&gl=US&ceid=US:en";
  const ctx={
    console,URL,Date,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,
    isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>true,resolveBrowserCachedFavicon:async()=>browser==="chrome"?{...image("GENERIC_G",0,""),native:true}:null,
    faviconQualitySide:qualitySide,betterFaviconCandidate:better,
    fetchImageDataUrlDetailed:async(url,options={})=>{calls.push(url);if(url===newsHigh.sourceUrl)return {...newsHigh,sourceKind:options.sourceKind||newsHigh.sourceKind||""};if(url===loginIcon.sourceUrl)return {...loginIcon,sourceKind:options.sourceKind||loginIcon.sourceKind||""};return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};},
    discoverPageIconInfo:async url=>{calls.push(`HTML:${url}`);if(url==="https://news.google.com/")return {candidates:[{url:newsHigh.sourceUrl,score:2112,sideHint:512,order:0,source:"link"}],finalPageUrl:url,reason:""};return {candidates:[{url:loginIcon.sourceUrl,score:696,sideHint:96,order:0,source:"link"}],finalPageUrl:"https://accounts.google.com/v3/signin/identifier?continue=...",reason:""};}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const upgraded=await ctx.resolveFaviconForUrl(requested,{preferQuality:true});
  assert.ok(upgraded.image.includes("GOOGLE_NEWS"));
  assert.equal(upgraded.sourceUrl,newsHigh.sourceUrl);
  assert.equal(upgraded.provisional,false);
  assert.ok(calls.includes("HTML:https://news.google.com/"));
  assert.equal(calls.includes(loginIcon.sourceUrl),false,"original-site high-resolution artwork must win before login-provider artwork is fetched");
});

test("Firefox/Chrome quality resolver architecture is declared-first with conventional fallback", ()=>{
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const fn=extract(src,"resolveFaviconForUrl");
    assert.match(src,/async function probeConventionalFaviconQualityUpgrade\(/);
    assert.match(src,/async function probeOriginalOriginDeclaredIcons\(/);
    const htmlIndex=fn.indexOf("await discoverPageIconInfo(pageUrl");
    const qualityGuessIndex=fn.indexOf("await probeConventionalFaviconQualityUpgrade(initialOrigin");
    assert.ok(htmlIndex>=0&&qualityGuessIndex>=0&&htmlIndex<qualityGuessIndex,"declared discovery must precede quality filename guesses");
  }
});

test("1.26.11 keeps the one-time favicon-quality repair without a current-version allowlist", ()=>{
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    assert.match(src,/const resolverQualityUpgrade = \/\^1\\.24\\.14\(\?:\\.\[1234\]\)\?\$\/.test\(previousVersion\);/);
    assert.doesNotMatch(src,/resolverQualityUpgrade = \[[^\n]+\]\.includes\(VERSION\)/);
    assert.match(src,/force: .*resolverQualityUpgrade/);
    assert.match(src,/upgradeRecoveredFavicons: .*resolverQualityUpgrade/);
  }
});

test("first provisional favicon schedules its quality pass immediately without consuming a failure attempt", ()=>{
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8");
    const code=extract(src,"nextIconRecoveryQualityRetry");
    let now=12345;
    const ctx={Date:{now:()=>now},nextIconRecoveryFailure:()=>{throw new Error("first quality pass must not use failure backoff");}};
    vm.createContext(ctx);vm.runInContext(code,ctx);
    const initial={id:"s1",url:"https://example.test",attempts:0,nextAttemptAt:0,qualityUpgrade:false};
    const next=ctx.nextIconRecoveryQualityRetry(initial);
    assert.equal(next.exhausted,false);
    assert.equal(next.item.qualityUpgrade,true);
    assert.equal(next.item.attempts,0,"intentional quality follow-up must not count as a failure");
    assert.equal(next.item.nextAttemptAt,now,"quality pass should be due immediately for the live-context continuation");
  }
});

test("chrome: native _favicon output size is treated as unknown source quality", ()=>{
  const src=fs.readFileSync("dist/chrome/background/background.js","utf8");
  assert.match(src,/return \{ image, sourceUrl: "", reason: "", width: 0, height: 0, qualitySide: 0, declared: false, sourceKind: "browser", native: true \};/);
  assert.doesNotMatch(src,/width: 128, height: 128, qualitySide: 128, declared: false, native: true/);
});

test("chrome: a never-visited site resolves from network metadata when Website Access is granted", async()=>{
  const src=fs.readFileSync("dist/chrome/background/background.js","utf8");
  const code=resolverCode(src);
  const calls=[];
  const high=image("NEW_SITE_HD",180,"https://static.example.test/apple-touch-icon.png",{declared:true});
  const ctx={
    console,URL,Date,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,
    isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>true,resolveBrowserCachedFavicon:async()=>null,
    faviconQualitySide:qualitySide,betterFaviconCandidate:better,
    fetchImageDataUrlDetailed:async url=>{calls.push(url);if(url===high.sourceUrl)return high;if(url==="https://example.test/favicon.ico")return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};},
    discoverPageIconInfo:async url=>{calls.push(`HTML:${url}`);return {candidates:[{url:high.sourceUrl,score:1180,sideHint:180,order:0,source:"link"}],finalPageUrl:url,reason:""};}
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const result=await ctx.resolveFaviconForUrl("https://example.test/",{});
  assert.ok(result.image.includes("NEW_SITE_HD"),"Chrome must not require a prior browser visit to obtain declared artwork");
  assert.ok(calls.includes("HTML:https://example.test/"));
});

test("chrome: local _favicon remains available without Website Access, but unknown sites still respect permission", async()=>{
  const src=fs.readFileSync("dist/chrome/background/background.js","utf8");
  const code=resolverCode(src);
  let native=image("CACHED",0,"",{declared:false});native.native=true;
  const ctx={console,URL,Date,ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,ICON_RECOVERY_HIGH_QUALITY_SIDE:128,FAVICON_AUTHORITATIVE_SUITABILITY:360,isProtectedChromeStoreUrl:()=>false,hasWebAccess:async()=>false,resolveBrowserCachedFavicon:async()=>native,faviconQualitySide:qualitySide,betterFaviconCandidate:better,fetchImageDataUrlDetailed:async()=>{throw new Error("network must not run without permission");},discoverPageIconInfo:async()=>{throw new Error("HTML must not run without permission");}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const cached=await ctx.resolveFaviconForUrl("https://known.test/",{});
  assert.ok(cached.image.includes("CACHED"));
  assert.equal(cached.provisional,true);
  native=null;
  const unknown=await ctx.resolveFaviconForUrl("https://unknown.test/",{});
  assert.equal(unknown.image,"");
  assert.equal(unknown.reason,"permission");
});

test("chrome: quality-upgrade queue accepts browser-native artwork as replaceable", ()=>{
  const src=fs.readFileSync("dist/chrome/background/background.js","utf8");
  assert.match(src,/\["favicon", "firefox"\]\.includes\(shortcut\.imageSourceKind\)/,
    "Chrome-native legacy source kind must be eligible for a direct quality upgrade");
  assert.match(src,/qualitySide: 0, declared: false, sourceKind: "browser", native: true/,
    "Chrome native cache must remain provisional quality metadata");
});
