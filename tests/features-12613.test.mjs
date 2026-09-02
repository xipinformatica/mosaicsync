import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src, name) {
  let start = src.indexOf(`function ${name}`);
  if (start < 0) start = src.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0, quote = "", escaped = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test("1.26.13b SVG root parsing is quote-aware and exposes huge declared geometry", async () => {
  const { svgRasterDimensionsFromText } = await import(`../dist/firefox/core/svg-safety.js?12613-${Date.now()}`);
  const result = svgRasterDimensionsFromText('<svg id=">" width="99999" height="99999" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>');
  assert.equal(result.valid, true);
  assert.equal(result.width, 99999);
  assert.equal(result.height, 99999);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.13b ${browser} remote image dimensions fail closed when unknown`, () => {
    const src = readBackgroundSource(browser);
    const ctx = { REMOTE_IMAGE_MAX_DECODE_DIMENSION: 4096, REMOTE_IMAGE_MAX_DECODED_PIXELS: 8_000_000 };
    vm.createContext(ctx);
    vm.runInContext(extract(src, "imageDimensionsSafeForRemoteDecode"), ctx);
    assert.equal(ctx.imageDimensionsSafeForRemoteDecode({ width: 0, height: 0 }), false);
    assert.equal(ctx.imageDimensionsSafeForRemoteDecode({ width: 64, height: 64 }), true);
  });

  test(`1.26.13b ${browser} wires stable Frequently Visited first-frame, drag, hide and website-access flows`, () => {
    const js = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const bootstrap = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    const html = fs.readFileSync(`dist/${browser}/newtab/newtab.html`, "utf8");
    assert.match(js, /addFrequentSiteToMosaicSync\(site, \{ position = null \} = \{\}\)/);
    assert.match(js, /frequentDragSite/);
    assert.match(js, /hideFrequentSite/);
    assert.match(js, /isFrequentHostHidden/);
    assert.match(js, /maybeShowWebAccessPrompt/);
    assert.doesNotMatch(bootstrap, /paintFrequentSnapshot|frequentSitesList|frequentSitesSection/,
      "persistent first-frame bootstrap must not own browser-derived Frequently Visited sites");
    assert.match(js, /updateSessionFrequentlyVisitedSnapshot\(frequentRenderSnapshot\)/,
      "device-local Frequently Visited sites should be owned by the session/live layer");
    assert.match(html, /id="webAccessPrompt"[^>]*hidden/);
  });
}

test("1.26.13b registrable-domain hiding follows the bundled Public Suffix List", async () => {
  const source = fs.readFileSync("dist/firefox/core/public_suffix_list.dat", "utf8");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => source });
  try {
    const mod = await import(`../dist/firefox/core/registrable-domain.js?12613-${Date.now()}`);
    assert.equal(await mod.registrableDomainFromHostname("news.example.co.uk"), "example.co.uk");
    assert.equal(await mod.registrableDomainFromHostname("a.foo.blogspot.com"), "foo.blogspot.com");
    assert.equal(mod.hostnameMatchesRegistrableDomain("deep.news.example.co.uk", "example.co.uk"), true);
    assert.equal(mod.hostnameMatchesRegistrableDomain("unrelated.co.uk", "example.co.uk"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("1.26.13b persistent first-frame manifest carries no FV settings or browser-derived site candidates", async () => {
  const data = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
  try {
    const mod = await import(`../dist/firefox/newtab/render-manifest.js?12613-${Date.now()}`);
    const state = {
      activeSpaceId: "personal", updatedAt: 1, settingsModifiedAt: 1, shortcuts: [],
      settings: { columns: 8, rows: 8, tileSize: 76, brandVisible: true, frequentlyVisitedEnabled: true, frequentlyVisitedCount: 10 }
    };
    const meta = { onboardingCompleted: true };
    assert.equal(mod.persistRenderManifest(state, meta), true);
    const manifest = JSON.parse(data.get("mosaicsync.render-manifest.v1"));
    assert.equal(Object.hasOwn(manifest, "firstPaint"), false);
    assert.doesNotMatch(JSON.stringify(manifest), /frequent|s0\.example/i, "browser-history FV state and candidates must not survive in persistent localStorage");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
