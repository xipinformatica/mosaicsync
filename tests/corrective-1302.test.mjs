import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

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

function icon(name, side, url) {
  return { image:`data:image/png;base64,${name}`, sourceUrl:url, reason:"", width:side, height:side, qualitySide:side, declared:true, sourceKind:"link" };
}

function resolverCode(src) {
  return [
    "faviconQualitySide","faviconCandidateSuitability","faviconCandidatePreference",
    "faviconCandidateIsAuthoritativelyGoodEnough","betterFaviconCandidate","parentHostFaviconUrl",
    "probeConventionalFaviconFallbacks","probeConventionalFaviconQualityUpgrade",
    "probeOriginalOriginDeclaredIcons","resolveFaviconForUrl"
  ].map(name => extract(src, name)).join("\n");
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.2 ${browser} redirected-origin partial declared scan stays provisional after timeout`, async () => {
    const src = readBackgroundSource(browser);
    const strong = icon("STRONG192", 192, "https://fixture.test/strong.png");
    const timeoutUrl = "https://fixture.test/late.png";
    const ctx = {
      console, URL, Date,
      ICON_RECOVERY_FETCH_TIMEOUT_MS:8000,
      
      FAVICON_AUTHORITATIVE_SUITABILITY:375,
      hasWebAccess:async()=>true,
      isProtectedChromeStoreUrl:()=>false,
      isProtectedFaviconUrl:()=>false,
      platformHasPermissionFreeFaviconSource:()=>browser === "chrome",
      resolveBrowserCachedFavicon:async()=>null,
      discoverPageIconInfo:async url => {
        if (url === "https://fixture.test/") {
          return {
            candidates:[
              {url:strong.sourceUrl, sideHint:192, source:"link"},
              {url:timeoutUrl, sideHint:512, source:"link"}
            ],
            finalPageUrl:url,
            reason:""
          };
        }
        return { candidates:[], finalPageUrl:"https://login.test/", reason:"" };
      },
      fetchImageDataUrlDetailed:async url => {
        if (url === strong.sourceUrl) return strong;
        if (url === timeoutUrl) return {image:"",reason:"timeout",width:0,height:0,qualitySide:0};
        return {image:"",reason:"http-404",width:0,height:0,qualitySide:0};
      }
    };
    vm.createContext(ctx);
    vm.runInContext(resolverCode(src), ctx);
    const result = await ctx.resolveFaviconForUrl("https://fixture.test/private", { preferQuality:true });
    assert.equal(result.sourceUrl, strong.sourceUrl);
    assert.equal(result.qualityComplete, false, "partial original-origin audit must never enter the completed ledger");
    assert.equal(result.provisional, true);
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.2 ${browser} favicon quality ledger rejects non-finite timestamps and policy versions`, () => {
    const src = readBackgroundSource(browser);
    const ctx = { URL, FAVICON_QUALITY_AUDIT_MAX_ENTRIES:256 };
    vm.createContext(ctx);
    vm.runInContext(extract(src, "normalizeFaviconQualityAuditLedger"), ctx);
    const ledger = ctx.normalizeFaviconQualityAuditLedger({items:[
      {url:"https://infinite-time.test/", checkedAt:Infinity, policyVersion:1},
      {url:"https://infinite-policy.test/", checkedAt:1234, policyVersion:Infinity},
      {url:"https://finite.test/", checkedAt:1234, policyVersion:1}
    ]});
    assert.deepEqual(JSON.parse(JSON.stringify(ledger.items)), [
      {url:"https://finite.test/", checkedAt:1234, policyVersion:1}
    ]);
  });

  test(`1.30.2 ${browser} concurrent favicon quality ledger completions preserve both URLs`, async () => {
    const src = readBackgroundSource(browser);
    const key = "ledger";
    let stored = { version:1, items:[] };
    const ctx = {
      URL, Date,
      LOCAL_FAVICON_QUALITY_AUDIT_KEY:key,
      FAVICON_QUALITY_AUDIT_MAX_ENTRIES:256,
      FAVICON_QUALITY_AUDIT_POLICY_VERSION:1,
      browser:{storage:{local:{
        get:async()=>({[key]:structuredClone(stored)}),
        set:async value=>{
          await new Promise(resolve=>setTimeout(resolve, 8));
          stored=structuredClone(value[key]);
        }
      }}}
    };
    vm.createContext(ctx);
    vm.runInContext(`var faviconQualityAuditWriteQueue=Promise.resolve();\n${extract(src,"normalizeFaviconQualityAuditLedger")}\n${extract(src,"readFaviconQualityAuditLedger")}\n${extract(src,"markFaviconQualityAuditsComplete")}`,ctx);
    await Promise.all([
      ctx.markFaviconQualityAuditsComplete(["https://alpha.test/"]),
      ctx.markFaviconQualityAuditsComplete(["https://beta.test/"])
    ]);
    assert.deepEqual(stored.items.map(item=>item.url).sort(), ["https://alpha.test/","https://beta.test/"]);
  });
}

const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");

test("1.30.2 Settings refresh-domain regression uses the production key definition", () => {
  const match = newtab.match(/const SETTINGS_REFRESH_KEYS = Object\.freeze\(\{[\s\S]*?\n  \}\);/);
  assert.ok(match, "production SETTINGS_REFRESH_KEYS definition missing");
  const ctx = { SPACE_IDS:["personal","work"] };
  vm.createContext(ctx);
  vm.runInContext(`${match[0].replace("const SETTINGS_REFRESH_KEYS", "globalThis.SETTINGS_REFRESH_KEYS")}\n${extract(newtab,"synchronizedFrequentlyVisitedSettings")}\n${extract(newtab,"settingsKeysChanged")}\n${extract(newtab,"spacesSettingsChanged")}\n${extract(newtab,"settingsRefreshDomains")}`, ctx);
  const base = () => ({
    activeSpaceId:"personal",
    settings:{
      columns:8,rows:4,tileSize:76,theme:"system",backgroundColor:"#fff",
      backgroundColorCustomized:false,backgroundPreset:"default",backgroundSourceKind:"none",
      backgroundSourceUrl:"",backgroundImage:"",backgroundDim:0,themeWallpapersEnabled:false,
      lightBackgroundPreset:"default",darkBackgroundPreset:"default",lightBackgroundDim:0,darkBackgroundDim:0,
      autoSiteIcons:true,frequentlyVisitedEnabled:false,frequentlyVisitedCount:5
    },
    spaces:{personal:{settings:{}},work:{settings:{}}}
  });
  for (const key of ["backgroundColorCustomized","backgroundSourceKind","backgroundSourceUrl"]) {
    const before=base(), after=structuredClone(before);
    after.settings[key] = key === "backgroundColorCustomized" ? true : "changed";
    assert.deepEqual([...ctx.settingsRefreshDomains(before,after)], ["background"], `${key} must belong to Background domain`);
  }
  assert.equal(ctx.SETTINGS_REFRESH_KEYS.background.includes("backgroundSource"), false, "obsolete fake test-only key must not return");
});

test("1.30.2 older installations with no quality ledger reopen automatic favicons for the one-time audit", () => {
  for (const browser of ["firefox","chrome"]) {
    const src=readBackgroundSource(browser);
    const ctx={URL,Date,FAVICON_QUALITY_AUDIT_MAX_ENTRIES:256,FAVICON_QUALITY_AUDIT_POLICY_VERSION:1,FAVICON_QUALITY_AUDIT_TTL_MS:30*24*60*60*1000};
    vm.createContext(ctx);
    vm.runInContext(`${extract(src,"normalizeFaviconQualityAuditLedger")}\n${extract(src,"faviconQualityAuditNeeded")}\n${extract(src,"automaticFaviconArtwork")}`,ctx);
    const ledger=ctx.normalizeFaviconQualityAuditLedger(null);
    const shortcut={image:"data:image/png;base64,old",imageSyncKind:"device",imageSourceKind:"favicon",url:"https://legacy.test/"};
    assert.equal(ctx.automaticFaviconArtwork(shortcut),true);
    assert.equal(ctx.faviconQualityAuditNeeded(ledger,shortcut.url,Date.now()),true);
  }
});

test("1.30.2 cancelled detected-favicon chooser rechecks generation and URL after prompt-marker persistence", () => {
  const start = newtab.indexOf('chooseDetectedFavicon?.addEventListener("click"');
  const end = newtab.indexOf('shortcutUrl.addEventListener("input"', start);
  assert.ok(start >= 0 && end > start);
  const handler = newtab.slice(start, end);
  const saveAt = handler.indexOf('await saveState({ localCacheOnly: true });');
  const sendAt = handler.indexOf('mosaicsync:discover-favicon-choices');
  assert.ok(saveAt >= 0 && sendAt > saveAt);
  const between = handler.slice(saveAt, sendAt);
  assert.match(between, /generation !== detectedFaviconGeneration/);
  assert.match(between, /sourceUrl !== detectedFaviconPickerUrl/);
});

test("1.30.2 render-manifest seeded with the current snapshot does not rewrite identical localStorage", async () => {
  const previousLocalStorage = globalThis.localStorage;
  const values = new Map();
  let writes = 0;
  globalThis.localStorage = {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>{writes+=1; values.set(key,String(value));},
    removeItem:key=>values.delete(key)
  };
  try {
    const state={
      activeSpaceId:"personal",updatedAt:11,settingsModifiedAt:7,shortcuts:[],
      settings:{columns:8,rows:4,tileSize:76,brandVisible:true}
    };
    const meta={onboardingCompleted:true};
    const url=pathToFileURL(resolve("src/shared/newtab/render-manifest.js")).href;
    const first=await import(`${url}?mosaicsync-1302-a=${Date.now()}`);
    assert.equal(first.persistRenderManifest(state,meta,null,null),true);
    assert.equal(writes,1);
    const key=[...values.keys()][0];
    const seeded=JSON.parse(values.get(key));
    const second=await import(`${url}?mosaicsync-1302-b=${Date.now()}`);
    second.seedRenderManifest(seeded);
    assert.equal(second.persistRenderManifest(state,meta,null,null),true);
    assert.equal(writes,1,"identical seeded snapshot must not be written again");
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});
