import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  let depth = 0, quote = "", esc = false, line = false, block = false;
  for (let i = brace; i < src.length; i += 1) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function resolverCode(src) {
  return ["faviconQualitySide","faviconCandidateSuitability","faviconCandidatePreference","faviconCandidateIsAuthoritativelyGoodEnough","betterFaviconCandidate","parentHostFaviconUrl","probeConventionalFaviconFallbacks","probeConventionalFaviconQualityUpgrade","probeOriginalOriginDeclaredIcons","resolveFaviconForUrl"].map(n => extract(src,n)).join("\n");
}
function icon(name, side, url) { return { image:`data:image/png;base64,${name}`, sourceUrl:url, reason:"", width:side, height:side, qualitySide:side, declared:true, sourceKind:"link" }; }

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.1 ${browser} final favicon quality pass scans past adequate 64px art and selects later 192px art`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const calls = [];
    const low = icon("LOW64",64,"https://fixture.test/64.png");
    const high = icon("HIGH192",192,"https://fixture.test/192.png");
    const ctx = {
      console, URL, Date, ICON_RECOVERY_FETCH_TIMEOUT_MS:8000, ICON_RECOVERY_HIGH_QUALITY_SIDE:128, FAVICON_AUTHORITATIVE_SUITABILITY:375,
      isProtectedChromeStoreUrl:()=>false, hasWebAccess:async()=>true, resolveBrowserCachedFavicon:async()=>null,
      discoverPageIconInfo:async url => ({ candidates:[{url:low.sourceUrl,sideHint:64,source:"link"},{url:high.sourceUrl,sideHint:192,source:"link"}], finalPageUrl:url, reason:"" }),
      fetchImageDataUrlDetailed:async url => { calls.push(url); if (url===low.sourceUrl) return low; if (url===high.sourceUrl) return high; return {image:"",reason:"http-404",width:0,height:0,qualitySide:0}; }
    };
    vm.createContext(ctx); vm.runInContext(resolverCode(src),ctx);
    const result = await ctx.resolveFaviconForUrl("https://fixture.test/",{preferQuality:true});
    assert.ok(calls.includes(low.sourceUrl), "adequate candidate must be inspected");
    assert.ok(calls.includes(high.sourceUrl), "final audit must continue to later superior candidate");
    assert.equal(result.sourceUrl, high.sourceUrl);
    assert.equal(result.qualityComplete, true);
    assert.equal(result.provisional, false);
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.1 ${browser} favicon quality ledger suppresses current audits but expires and policy-invalidates deterministically`, () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const ctx = { URL, Date, FAVICON_QUALITY_AUDIT_MAX_ENTRIES:256, FAVICON_QUALITY_AUDIT_POLICY_VERSION:1, FAVICON_QUALITY_AUDIT_TTL_MS:30*24*60*60*1000 };
    vm.createContext(ctx); vm.runInContext(`${extract(src,"normalizeFaviconQualityAuditLedger")}\n${extract(src,"faviconQualityAuditNeeded")}`,ctx);
    const now = 10_000_000_000;
    const url = "https://fixture.test/";
    let ledger = ctx.normalizeFaviconQualityAuditLedger({items:[{url,checkedAt:now-1000,policyVersion:1}]});
    assert.equal(ctx.faviconQualityAuditNeeded(ledger,url,now), false);
    ledger = ctx.normalizeFaviconQualityAuditLedger({items:[{url,checkedAt:now-(31*24*60*60*1000),policyVersion:1}]});
    assert.equal(ctx.faviconQualityAuditNeeded(ledger,url,now), true);
    ledger = ctx.normalizeFaviconQualityAuditLedger({items:[{url,checkedAt:now-1000,policyVersion:99}]});
    assert.equal(ctx.faviconQualityAuditNeeded(ledger,url,now), true);
  });
}

const newtab = fs.readFileSync("src/shared/newtab/newtab.js","utf8");
const settingsContext = {
  SPACE_IDS:["personal","work"],
  SETTINGS_REFRESH_KEYS: {
    grid:["columns","rows","tileSize"], theme:["theme"],
    background:["backgroundColor","backgroundPreset","backgroundSource","backgroundImage","backgroundDim","themeWallpapersEnabled","lightBackgroundPreset","lightBackgroundDim","darkBackgroundPreset","darkBackgroundDim"],
    autoIcons:["autoSiteIcons"]
  }
};
vm.createContext(settingsContext);
vm.runInContext(`${extract(newtab,"synchronizedFrequentlyVisitedSettings")}\n${extract(newtab,"settingsKeysChanged")}\n${extract(newtab,"spacesSettingsChanged")}\n${extract(newtab,"settingsRefreshDomains")}`,settingsContext);
const base = () => ({settings:{columns:8,rows:4,tileSize:76,theme:"system",backgroundColor:"#fff",backgroundPreset:"default",backgroundSource:"preset",backgroundImage:"",backgroundDim:0,themeWallpapersEnabled:false,lightBackgroundPreset:"default",lightBackgroundDim:0,darkBackgroundPreset:"default",darkBackgroundDim:0,autoSiteIcons:true,frequentlyVisitedEnabled:false,frequentlyVisitedCount:5},spaces:{personal:{name:"Personal"},work:{name:"Work"}}});

test("1.30.1 exact own-state echo produces zero Settings refresh domains", () => {
  const a=base(); const b=structuredClone(a); assert.deepEqual([...settingsContext.settingsRefreshDomains(a,b)],[]);
});
test("1.30.1 Frequently Visited change refreshes only Frequently Visited and never Background", () => {
  const a=base(), b=structuredClone(a); b.settings.frequentlyVisitedEnabled=true;
  assert.deepEqual([...settingsContext.settingsRefreshDomains(a,b)],["frequent"]);
});
test("1.30.1 separate Light/Dark wallpaper change refreshes only Background", () => {
  const a=base(), b=structuredClone(a); b.settings.themeWallpapersEnabled=true;
  assert.deepEqual([...settingsContext.settingsRefreshDomains(a,b)],["background"]);
});

test("1.30.1 permission classification isolates Top Sites from Website Access", () => {
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/core/permissions.js`,"utf8");
    const ctx={TOP_SITES_PERMISSION:"topSites",WEB_ORIGINS:["http://*/*","https://*/*"]}; vm.createContext(ctx);
    vm.runInContext(`${extract(src,"permissionChangeAffectsTopSites")}\n${extract(src,"permissionChangeAffectsWebAccess")}`,ctx);
    assert.equal(ctx.permissionChangeAffectsTopSites({permissions:["topSites"]}),true);
    assert.equal(ctx.permissionChangeAffectsWebAccess({permissions:["topSites"]}),false);
  }
});
test("1.30.1 permission classification isolates Website Access from Frequently Visited", () => {
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/core/permissions.js`,"utf8");
    const ctx={TOP_SITES_PERMISSION:"topSites",WEB_ORIGINS:["http://*/*","https://*/*"]}; vm.createContext(ctx);
    vm.runInContext(`${extract(src,"permissionChangeAffectsTopSites")}\n${extract(src,"permissionChangeAffectsWebAccess")}`,ctx);
    assert.equal(ctx.permissionChangeAffectsWebAccess({origins:["https://*/*"]}),true);
    assert.equal(ctx.permissionChangeAffectsTopSites({origins:["https://*/*"]}),false);
  }
});

test("1.30.1 automatic favicon upgrade remains device-local and never targets explicit user artwork", () => {
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8"); const ctx={}; vm.createContext(ctx); vm.runInContext(extract(src,"automaticFaviconArtwork"),ctx);
    assert.equal(ctx.automaticFaviconArtwork({image:"data:x",imageSyncKind:"device",imageSourceKind:"favicon",url:"https://a.test/"}),true);
    assert.equal(ctx.automaticFaviconArtwork({image:"data:x",imageSyncKind:"sync",imageSourceKind:"upload",url:"https://a.test/"}),false);
    assert.equal(ctx.automaticFaviconArtwork({image:"data:x",imageSyncKind:"device",imageSourceKind:"builtin",url:"https://a.test/"}),false);
  }
});

test("1.30.1 favicon recovery deduplicates identical exact-URL work while keeping fast and quality passes distinct", () => {
  for (const browser of ["firefox","chrome"]) {
    const src=fs.readFileSync(`dist/${browser}/background/background.js`,"utf8"); const fn=extract(src,"processIconRecoveryQueue");
    assert.match(fn,/const key = `\$\{item\.qualityUpgrade \? "quality" : "fast"\}\\n\$\{item\.url\}`/);
    assert.match(fn,/existing\.items\.push\(item\)/);
  }
});
