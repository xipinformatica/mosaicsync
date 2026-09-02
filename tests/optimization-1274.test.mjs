import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSizeReport } from "../tools/size-report.mjs";

function extractFunction(source, name) {
  const tokens = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const token of tokens) {
    start = source.indexOf(token);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Function ${name} not found`);

  let paren = source.indexOf("(", start);
  let parenDepth = 0;
  let quote = "";
  let escaped = false;
  for (; paren < source.length; paren += 1) {
    const ch = source[paren];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) { paren += 1; break; }
    }
  }

  const brace = source.indexOf("{", paren);
  let depth = 0;
  quote = "";
  escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1] || "";
    if (lineComment) { if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { if (ch === "*" && next === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i += 1; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function meaningfulPslRules(source) {
  return String(source).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("//"));
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(value, enabled) { enabled ? this.values.add(value) : this.values.delete(value); }
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.title = "";
    this.type = "";
    this.src = "";
    this.alt = "";
  }
  get childElementCount() { return this.children.length; }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll(selector) {
    if (selector === ".detected-favicon-choice") return this.children.filter(child => child.className === "detected-favicon-choice");
    return [];
  }
  async dispatch(type, event = {}) { return await this.listeners.get(type)?.(event); }
}

test("1.27.4 runtime PSL removes non-semantic bulk while preserving every rule exactly", async () => {
  const source = await readFile("src/shared/core/public_suffix_list.dat", "utf8");
  const sourceRules = meaningfulPslRules(source);
  assert.ok(sourceRules.length > 8000, "source PSL should contain the complete rule set");
  for (const browser of ["firefox", "chrome"]) {
    const runtime = await readFile(`dist/${browser}/core/public_suffix_list.dat`, "utf8");
    assert.deepEqual(meaningfulPslRules(runtime), sourceRules, `${browser}: runtime PSL rule sequence must be identical`);
    assert.ok(Buffer.byteLength(runtime) < Buffer.byteLength(source) * 0.5, `${browser}: rules-only runtime should remove at least half the raw PSL bulk`);
    assert.match(runtime, /MPL-2\.0/, `${browser}: compact runtime PSL keeps license provenance`);
  }
});

test("1.27.4 compact runtime locales are bit-for-text equivalent to all 33 reviewed source catalogs", async () => {
  const sourceDir = resolve("src/shared/core/i18n-locales");
  const files = (await readdir(sourceDir)).filter(name => name.endsWith(".js")).sort();
  assert.equal(files.length, 33);
  let sourceBytes = 0;
  for (const file of files) sourceBytes += fs.statSync(resolve(sourceDir, file)).size;

  for (const browser of ["firefox", "chrome"]) {
    let runtimeBytes = fs.statSync(resolve(`dist/${browser}/core/i18n-runtime-catalog.js`)).size;
    for (const file of files) {
      const sourceCatalog = (await import(`../src/shared/core/i18n-locales/${file}?source1274=${Date.now()}-${file}`)).MESSAGES;
      const runtimeCatalog = (await import(`../dist/${browser}/core/i18n-locales/${file}?runtime1274=${Date.now()}-${browser}-${file}`)).MESSAGES;
      assert.deepEqual(Object.entries(runtimeCatalog).sort(([a],[b]) => a.localeCompare(b)), Object.entries(sourceCatalog).sort(([a],[b]) => a.localeCompare(b)), `${browser}/${file}: generated catalog must preserve every exact key/value pair`);
      runtimeBytes += fs.statSync(resolve(`dist/${browser}/core/i18n-locales/${file}`)).size;
    }
    assert.ok(runtimeBytes < sourceBytes * 0.78, `${browser}: generated runtime locales should materially reduce raw package size`);
  }
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.4 ${browser} favicon chooser uses bounded concurrency, short-lived cache and keeps declared data icons`, async () => {
    const source = readBackgroundSource(browser);
    const helperNames = [
      "faviconCandidateSuitability",
      "faviconCandidatePreference",
      "faviconChoiceResultChars",
      "cloneFaviconChoiceResult",
      "readCachedFaviconChoices",
      "rememberFaviconChoices"
    ];
    const helpers = helperNames.map(name => extractFunction(source, name)).join("\n");
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    assert.doesNotMatch(discover, /resolveFaviconForUrl\s*\(/, "manual chooser must remain separate from automatic winner selection");

    let now = 10_000;
    let active = 0;
    let maxActive = 0;
    let fetchCount = 0;
    let pageDiscoveryCount = 0;
    let nativeCount = 0;
    const inline = "data:image/png;base64,INLINE";
    const context = {
      URL,
      Date: { now: () => now },
      Map,
      Set,
      Math,
      Number,
      String,
      Promise,
      setTimeout,
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_TTL_MS: 30_000,
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000,
      hasWebAccess: async () => true,
      faviconQualitySide: candidate => Math.min(Number(candidate?.width) || Number(candidate?.qualitySide) || 0, Number(candidate?.height) || Number(candidate?.qualitySide) || 0),
      resolveBrowserCachedFavicon: async () => { nativeCount += 1; return { image: "data:image/png;base64,NATIVE", width: 16, height: 16 }; },
      parentHostFaviconUrl: () => "https://parent.example/favicon.ico",
      discoverPageIconInfo: async () => {
        pageDiscoveryCount += 1;
        return {
          finalPageUrl: "https://site.example/page",
          candidates: [
            { url: "https://site.example/a.png", sideHint: 256, source: "manifest" },
            { url: "https://site.example/b.png", sideHint: 128, source: "link" },
            { url: inline, sideHint: 64, source: "link" },
            { url: "https://site.example/c.png", sideHint: 32, source: "link" }
          ]
        };
      },
      fetchImageDataUrlDetailed: async (value, options = {}) => {
        fetchCount += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolveDelay => setTimeout(resolveDelay, 3));
        active -= 1;
        const width = value.includes("a.png") ? 256 : value.includes("b.png") ? 128 : value === inline ? 64 : 32;
        return { image: `data:image/png;base64,${Buffer.from(value).toString("base64")}`, sourceUrl: /^https?:/.test(value) ? value : "", width, height: width, declared: options.declared === true };
      }
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}\n${discover}; this.discoverFaviconChoicesForUrl=discoverFaviconChoicesForUrl;`, context);

    const first = await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.equal(first.ok, true);
    assert.ok(maxActive <= 2, `manual discovery must never exceed two concurrent image jobs (saw ${maxActive})`);
    assert.ok(maxActive >= 2, "test should exercise the two-wide path");
    assert.ok(first.candidates.some(candidate => candidate.image.includes(Buffer.from(inline).toString("base64"))), "site-declared inline favicon support must remain available");
    const firstFetches = fetchCount;
    const firstDiscoveries = pageDiscoveryCount;
    const firstNative = nativeCount;

    const second = await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)), "cache must return the same candidate set");
    assert.equal(fetchCount, firstFetches, "immediate repeat should reuse candidate pixels without network/image work");
    assert.equal(pageDiscoveryCount, firstDiscoveries, "immediate repeat should not re-fetch/parse page metadata");
    assert.equal(nativeCount, firstNative, "immediate repeat should not re-query browser-native artwork");

    now += 31_000;
    await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.ok(fetchCount > firstFetches, "cache must expire after its short TTL");
  });

  test(`1.27.4 ${browser} favicon chooser cache is capped by entry count and retained pixel data`, () => {
    const source = readBackgroundSource(browser);
    const helpers = ["faviconChoiceResultChars", "cloneFaviconChoiceResult", "rememberFaviconChoices"].map(name => extractFunction(source, name)).join("\n");
    const context = {
      Map,
      String,
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}; this.rememberFaviconChoices=rememberFaviconChoices;`, context);
    for (let i = 0; i < 5; i += 1) {
      context.rememberFaviconChoices(`https://${i}.example/`, { ok: true, error: "", candidates: [{ image: `data:image/png;base64,${"x".repeat(1000)}` }] }, i);
    }
    assert.equal(context.faviconChoiceCache.size, 4, "LRU entry cap must evict the oldest URL");
    context.rememberFaviconChoices("https://huge.example/", { ok: true, error: "", candidates: [{ image: "x".repeat(400_001) }] }, 99);
    assert.equal(context.faviconChoiceCache.has("https://huge.example/"), false, "oversized candidate sets must not enter the memory cache");
  });

  test(`1.27.4 ${browser} closing the shortcut editor clears detected favicon pixels and invalidates late work`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const reset = extractFunction(source, "resetDetectedFaviconPicker");
    const choices = new FakeElement();
    choices.append(new FakeElement("button"), new FakeElement("button"));
    const picker = new FakeElement();
    picker.hidden = false;
    const status = new FakeElement();
    status.textContent = "loading";
    const button = new FakeElement("button");
    button.disabled = true;
    const context = {
      detectedFaviconGeneration: 7,
      detectedFaviconPickerUrl: "https://site.example/",
      detectedFaviconChoices: choices,
      detectedFaviconStatus: status,
      detectedFaviconPicker: picker,
      chooseDetectedFavicon: button,
      cancelDetectedFaviconRequest() {},
      t: key => key
    };
    vm.createContext(context);
    vm.runInContext(`${reset}; this.resetDetectedFaviconPicker=resetDetectedFaviconPicker;`, context);
    context.resetDetectedFaviconPicker();
    assert.equal(context.detectedFaviconGeneration, 8, "generation bump invalidates in-flight results");
    assert.equal(context.detectedFaviconPickerUrl, "");
    assert.equal(choices.childElementCount, 0, "candidate data URLs must be released with the dialog");
    assert.equal(picker.hidden, true);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.match(source, /shortcutDialog\?\.addEventListener\("close", \(\) => \{[\s\S]*?shortcutSyncPrepareGeneration \+= 1;[\s\S]*?resetDetectedFaviconPicker\(\);[\s\S]*?\}\);/, "dialog close must invalidate artwork work and invoke the reset path");
    assert.match(source, /shortcutUrl\.addEventListener\("input", \(\) => \{\s*if \(detectedFaviconPickerUrl\) resetDetectedFaviconPicker\(\)/, "URL edits must invalidate old candidate results");
  });

  test(`1.27.4 ${browser} detected favicon choices expose localized browser/site source plus dimensions`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const render = extractFunction(source, "renderDetectedFaviconChoices");
    const choices = new FakeElement();
    const picker = new FakeElement();
    const status = new FakeElement();
    const chooseButton = new FakeElement("button");
    const context = {
      detectedFaviconChoices: choices,
      detectedFaviconPicker: picker,
      detectedFaviconStatus: status,
      chooseDetectedFavicon: chooseButton,
      detectedFaviconPickerUrl: "https://site.example/",
      document: { createElement: tag => new FakeElement(tag) },
      t: key => ({ detectedFavicons: "Detected favicons", firefox: "Browser", website: "Website", noDetectedFavicons: "None" }[key] || key),
      normalizeShortcutUrl: value => value,
      shortcutUrl: { value: "https://site.example/" },
      resetDetectedFaviconPicker() {}, showToast() {}, shortcutSyncPrepareGeneration: 0,
      pendingShortcutBuiltinIcon: "", pendingShortcutImage: "", pendingShortcutSyncData: "",
      pendingShortcutImageKind: "none", pendingShortcutImageSourceKind: "none", pendingShortcutImageSourceUrl: "", pendingShortcutImageIsFallback: false,
      shortcutImageStyle: { value: "contain" }, shortcutImageUrl: { value: "" }, shortcutSyncImage: { checked: false }, shortcutArtworkEdited: false,
      updateBuiltinShortcutIconSelection() {}, updateImagePreview() {}
    };
    vm.createContext(context);
    vm.runInContext(`${render}; this.renderDetectedFaviconChoices=renderDetectedFaviconChoices;`, context);
    context.renderDetectedFaviconChoices([{ image: "data:image/png;base64,X", width: 192, height: 128, source: "browser" }], "https://site.example/");
    assert.equal(choices.childElementCount, 1);
    const choice = choices.children[0];
    assert.equal(choice.getAttribute("aria-label"), "Detected favicons 1 — 192 × 128 — Browser");
    assert.equal(choice.title, "Detected favicons 1 — 192 × 128 — Browser");
  });
}

test("1.27.4 removes the confirmed obsolete shortcut-editor CSS selectors", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    assert.doesNotMatch(css, /\.stack-actions\b/);
    assert.doesNotMatch(css, /\.full-button\b/);
  }
});

test("1.27.4 package-size baseline catches accidental category growth without banning intentional features", async () => {
  const baseline = JSON.parse(await readFile("package-size-baseline.json", "utf8"));
  const current = await createSizeReport();
  for (const browser of ["firefox", "chrome"]) {
    const expected = baseline.browsers[browser];
    const actual = current.browsers[browser];
    assert.ok(expected && actual);
    assert.equal(actual.version, expected.version, `${browser}: baseline must be consciously updated for the current release`);
    const totalLimit = Math.ceil(expected.deflatedBytes * 1.15) + 1024;
    assert.ok(actual.deflatedBytes <= totalLimit, `${browser}: total compressed payload grew >15% without a baseline update`);
    for (const [category, values] of Object.entries(actual.categories)) {
      const base = expected.categories[category];
      assert.ok(base, `${browser}: new package category ${category} requires an explicit baseline update`);
      const limit = Math.ceil(base.deflatedBytes * 1.15) + 1024;
      assert.ok(values.deflatedBytes <= limit, `${browser}/${category}: compressed payload grew >15% without a baseline update`);
    }
  }
});
