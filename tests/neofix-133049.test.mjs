// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

function extractFunction(source, name) {
  const begin = source.indexOf(`function ${name}(`);
  assert.ok(begin > 0, `missing ${name}`);
  let depth = 0, started = false;
  for (let cursor = source.indexOf('{', begin); cursor < source.length; cursor++) {
    if (source[cursor] === '{') { depth++; started = true; }
    if (source[cursor] === '}') { depth--; if (started && depth === 0) return source.slice(begin, cursor + 1); }
  }
  throw new Error(`unclosed ${name}`);
}
function candidate(image, side, sourceKind, declared = true, height = side) {
  return { image, width: side, height, qualitySide: Math.min(side,height), sourceKind, declared };
}

for (const browser of ['chrome', 'firefox']) {
  test(`1.33.0.49 ${browser}: declared 180px touch icon outranks declared 48px link without size-only manifest regression`, async () => {
    const src = await readFile(`dist/${browser}/background/background-core.js`,'utf8');
    const context = createContext({ Math, Number, String });
    for (const name of ['faviconQualitySide','faviconCandidateSuitability','faviconCandidatePreference','betterFaviconCandidate']) runInContext(extractFunction(src,name),context);
    const legacy48 = candidate('legacy48',48,'link');
    const touch180 = candidate('touch180',180,'touch');
    assert.ok(context.faviconCandidateSuitability(touch180) > context.faviconCandidateSuitability(legacy48));
    assert.equal(context.betterFaviconCandidate(legacy48,touch180).image,'touch180');
    assert.equal(context.betterFaviconCandidate(touch180,legacy48).image,'touch180', 'never downgrade');
    const favicon32 = candidate('favicon32',32,'favicon',false);
    const manifest512 = candidate('manifest512',512,'manifest');
    assert.equal(context.betterFaviconCandidate(favicon32,manifest512).image,'favicon32','avoid larger generic PWA icon by size alone');
    const tiny16 = candidate('tiny',16,'favicon',false);
    assert.equal(context.betterFaviconCandidate(tiny16,touch180).image,'touch180');
    assert.equal(context.betterFaviconCandidate(candidate('square',64,'link'),candidate('wide',256,'link',true,48)).image,'square');
    assert.equal(context.betterFaviconCandidate(touch180,{...legacy48,image:''}).image,'touch180');
  });
  test(`1.33.0.49 ${browser}: strong 64px declared artwork still satisfies fast early-stop but huge generic manifest doesn't`, async () => {
    const src = await readFile(`dist/${browser}/background/background-core.js`,'utf8');
    const context = createContext({Math,Number,String,FAVICON_AUTHORITATIVE_SUITABILITY:375});
    for(const name of ['faviconQualitySide','faviconCandidateSuitability','faviconCandidateIsAuthoritativelyGoodEnough']) runInContext(extractFunction(src,name),context);
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough(candidate('link64',64,'link')),true);
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough(candidate('manifest512',512,'manifest')),false);
    assert.equal(context.faviconCandidateIsAuthoritativelyGoodEnough(candidate('touch180',180,'touch')),true);
  });
}

test('1.33.0.49 Ukrainian locale includes all 480 translations with intact tokens, selectors and manifest metadata', async () => {
  const { MESSAGES: en } = await import('../src/shared/core/i18n-locales/en.js');
  const { MESSAGES: uk } = await import('../src/shared/core/i18n-locales/uk.js');
  assert.deepEqual(Object.keys(uk).sort(),Object.keys(en).sort());
  assert.equal(Object.keys(uk).length,484);
  const tokens = text => [...String(text).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(x=>x[1]).sort();
  for(const [key,val] of Object.entries(en)) {
    assert.ok(String(uk[key]).trim(),`${key}: empty`);
    assert.deepEqual(tokens(uk[key]), tokens(val),`${key}: missing tokens`);
    if (!['github','firefox','url'].includes(key)) assert.ok(uk[key] !== val, `${key}: untranslated`);
  }
  const { SUPPORTED_LOCALES } = await import('../src/shared/core/i18n.js');
  assert.equal(SUPPORTED_LOCALES.filter(l=>l.id==='uk').length,1);
  assert.equal(SUPPORTED_LOCALES.find(l=>l.id==='uk').label,'Українська');
  for(const browser of ['firefox','chrome']) {
    const manifest = JSON.parse(await readFile(`dist/${browser}/_locales/uk/messages.json`,'utf8'));
    assert.match(manifest.extensionDescription.message,/MosaicSync/);
    assert.match(manifest.extensionDescription.message,new RegExp(browser === 'firefox' ? 'Firefox' : 'Chrome'));
    assert.doesNotMatch(manifest.extensionDescription.message, new RegExp(browser === 'firefox' ? 'Chrome' : 'Firefox'));
  }
});

for(const browserName of ['firefox','chrome']) {
  test(`1.33.0.49 ${browserName}: Ukrainian browser-language auto-detection and explicit language selection`, async()=>{
    const previousBrowser=globalThis.browser;
    const previousLocalStorage=globalThis.localStorage;
    const values=new Map();
    try {
      globalThis.browser={i18n:{getUILanguage:()=> 'uk-UA'}};
      globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
      const {getEffectiveLocale,setLocalePreference,t}=await import(`../dist/${browserName}/core/i18n.js?uk-smoke=${Date.now()}-${Math.random()}`);
      assert.equal(getEffectiveLocale(),'uk');
      await setLocalePreference('uk');
      assert.equal(t('addShortcut'),'Додати ярлик');
      assert.equal(t('chooseDetectedFavicon'),'Вибрати знайдену піктограму сайту');
      assert.match(t('profileImportStorageFull'),/резервну копію/);
      await setLocalePreference('en');
      assert.equal(t('addShortcut'),'Add shortcut');
    } finally {
      if(previousBrowser===undefined) delete globalThis.browser; else globalThis.browser=previousBrowser;
      if(previousLocalStorage===undefined) delete globalThis.localStorage; else globalThis.localStorage=previousLocalStorage;
    }
  });
}

test('1.33.0.49 Ukrainian Chrome platform adapter removes Firefox and Mozilla branding from rendered catalog', async()=>{
  const {MESSAGES}=await import('../dist/chrome/core/i18n-locales/uk.js');
  const {platformizeUiText}=await import('../dist/chrome/core/i18n-platform.js');
  for (const [key,value] of Object.entries(MESSAGES)) {
    const chromeText=platformizeUiText(value,'uk',key);
    assert.doesNotMatch(chromeText,/Firefox|Mozilla/,`Chrome ukrainian ${key} must use Chrome/Google wording`);
  }
  assert.equal(platformizeUiText(MESSAGES.firefoxSync,'uk','firefoxSync'),'Chrome Sync');
});

// Exercise the real resolver, not just a synthetic score comparison. Redirects
// may expose another site's (e.g. a login provider's) otherwise larger icon.
function extractResolverFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`) >= 0
    ? source.indexOf(`async function ${name}(`) : source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}: missing production function`);
  const begin = source.indexOf('{\n', start);
  assert.ok(begin >= 0, `${name}: missing body`);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let i = begin; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name}: unterminated function`);
}

for (const browser of ['chrome', 'firefox']) {
  test(`1.33.0.49 ${browser}: cross-origin redirect and legacy tile art cannot win from size alone`, async () => {
    const source = await readFile(`dist/${browser}/background/background-core.js`, 'utf8');
    const methods = [
      'faviconQualitySide', 'faviconCandidateSuitability', 'faviconCandidatePreference',
      'faviconCandidateIsAuthoritativelyGoodEnough', 'betterFaviconCandidate',
      'parentHostFaviconUrl', 'probeConventionalFaviconFallbacks',
      'probeConventionalFaviconQualityUpgrade', 'probeOriginalOriginDeclaredIcons',
      'resolveFaviconForUrl'
    ];
    const makeImage = (name, side, url) => ({
      image: `data:image/png;base64,${name}`, sourceUrl: url, reason: '',
      width: side, height: side, qualitySide: side
    });
    const scenarios = [
      {
        label: 'redirect',
        url: 'https://intranet.example.test/app/inbox',
        fetch: {
          'https://intranet.example.test/favicon.ico': makeImage('OWN_16', 16, 'https://intranet.example.test/favicon.ico'),
          'https://login.provider.test/favicon.ico': makeImage('LOGIN_128', 128, 'https://login.provider.test/favicon.ico')
        },
        discover: {
          'https://intranet.example.test/app/inbox': { candidates: [], finalPageUrl: 'https://login.provider.test/signin', reason: '' },
          'https://intranet.example.test/': { candidates: [], finalPageUrl: 'https://login.provider.test/signin', reason: '' }
        },
        winner: 'OWN_16', kind: 'favicon'
      },
      {
        label: 'tile',
        url: 'https://legacy.example.test/',
        fetch: {
          'https://legacy.example.test/favicon.ico': makeImage('OWN_16', 16, 'https://legacy.example.test/favicon.ico'),
          'https://legacy.example.test/mstile-144.png': makeImage('TILE_144', 144, 'https://legacy.example.test/mstile-144.png')
        },
        discover: {
          'https://legacy.example.test/': {
            candidates: [{ url: 'https://legacy.example.test/mstile-144.png', score: 900, sideHint: 270, order: 0, source: 'tile' }],
            finalPageUrl: 'https://legacy.example.test/', reason: ''
          }
        },
        winner: 'OWN_16', kind: 'favicon'
      },
      {
        label: 'touch',
        url: 'https://news.example.test/',
        fetch: {
          'https://news.example.test/favicon.ico': makeImage('ICO_32', 32, 'https://news.example.test/favicon.ico'),
          'https://news.example.test/icon-48.png': makeImage('LINK_48', 48, 'https://news.example.test/icon-48.png'),
          'https://news.example.test/apple-touch-icon.png': makeImage('TOUCH_180', 180, 'https://news.example.test/apple-touch-icon.png')
        },
        discover: {
          'https://news.example.test/': {
            candidates: [
              { url: 'https://news.example.test/apple-touch-icon.png', score: 960, sideHint: 180, order: 0, source: 'touch' },
              { url: 'https://news.example.test/icon-48.png', score: 748, sideHint: 48, order: 1, source: 'link' }
            ], finalPageUrl: 'https://news.example.test/', reason: ''
          }
        },
        winner: 'TOUCH_180', kind: 'touch'
      }
    ];
    const methodsSource = methods.map(name => extractResolverFunction(source, name)).join('\n');
    for (const scenario of scenarios) {
      const context = createContext({
        console, URL, Date, ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
        FAVICON_AUTHORITATIVE_SUITABILITY: 375,
        isProtectedFaviconUrl: () => false,
        platformHasPermissionFreeFaviconSource: () => false,
        hasWebAccess: async () => true,
        resolveBrowserCachedFavicon: async () => null,
        fetchImageDataUrlDetailed: async (url, options = {}) => {
          const result = scenario.fetch[url];
          return result
            ? { ...result, declared: options.declared === true, sourceKind: options.sourceKind || '' }
            : { image: '', reason: 'http-404', width: 0, height: 0, qualitySide: 0 };
        },
        discoverPageIconInfo: async url => scenario.discover[url] || { candidates: [], finalPageUrl: url, reason: 'http-404' }
      });
      runInContext(methodsSource, context);
      const result = await context.resolveFaviconForUrl(scenario.url, { preferQuality: true });
      assert.equal(result.image.split(',')[1], scenario.winner, `${scenario.label}: wrong winner`);
      assert.equal(result.sourceKind, scenario.kind, `${scenario.label}: wrong source`);
      assert.equal(result.qualityComplete, true, `${scenario.label}: audit completeness changed`);
    }
  });
}

test('1.33.0.49 Ukrainian: transfers occur through an account, and Chrome Sync is never described as a Chrome account', async () => {
  const { MESSAGES: uk } = await import('../src/shared/core/i18n-locales/uk.js');
  assert.match(uk.changesPublishAuto, /передачі через обліковий запис/);
  assert.doesNotMatch(uk.changesPublishAuto, /між обліковими записами/);
  const { MESSAGES: chromeMessages } = await import('../dist/chrome/core/i18n-locales/uk.js');
  const { platformizeUiText } = await import('../dist/chrome/core/i18n-platform.js');
  for (const key of ['syncTurnedOffDevice', 'syncRemainsEnabled']) {
    const converted = platformizeUiText(chromeMessages[key], 'uk', key);
    assert.match(converted, /Chrome Sync/, `${key}: Chrome product branding`);
    assert.doesNotMatch(converted, /облікового запису Chrome/, `${key}: invented Chrome account`);
  }
  const registry = JSON.parse(await readFile('src/shared/manifest-locales.json', 'utf8'));
  assert.ok([...registry.uk.chromeDescription].length <= 132, 'Ukrainian Chrome description must fit manifest limit');
});
