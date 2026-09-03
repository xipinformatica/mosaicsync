import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createSizeReport, sizeCategory } from "../tools/size-report.mjs";
import { meaningfulPslRules, summarizePslRules } from "../tools/runtime-data.mjs";

const PSL_RULESET = Object.freeze({
  count: 10248,
  wildcardCount: 283,
  exceptionCount: 8,
  unicodeCount: 459,
  sha256: "9533a47fdb73b0b9388527abe5550e0921a5a112776815a2ff44c65a8d531dc2"
});

function extractFunction(source, name) {
  const tokens = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const token of tokens) {
    start = source.indexOf(token);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`Function ${name} not found`);
  let paren = source.indexOf("(", start), parenDepth = 0, quote = "", escaped = false;
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
    else if (ch === ")" && --parenDepth === 0) { paren += 1; break; }
  }
  const brace = source.indexOf("{", paren);
  let depth = 0, lineComment = false, blockComment = false;
  quote = ""; escaped = false;
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
    else if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

async function registrableResults(pslText, browser, tag) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => pslText });
  try {
    const mod = await import(`../dist/${browser}/core/registrable-domain.js?1275-${tag}-${Date.now()}-${Math.random()}`);
    const hosts = [
      "news.example.co.uk",
      "a.foo.blogspot.com",
      "a.b.ck",
      "foo.www.ck",
      "foo.city.kawasaki.jp",
      "foo.bar.nom.br",
      "www.公司.cn",
      "127.0.0.1",
      "[2001:db8::1]",
      "localhost",
      "intranet",
      "a.b.kawasaki.jp",
      "a.city.kawasaki.jp"
    ];
    const out = Object.create(null);
    for (const host of hosts) out[host] = await mod.registrableDomainFromHostname(host);
    return out;
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("1.27.8.8 anchors the compact PSL to an independent semantic hash and rule-shape sanity checks", async () => {
  const source = await readFile("src/shared/core/public_suffix_list.dat", "utf8");
  const summary = summarizePslRules(source);
  assert.deepEqual({
    count: summary.count,
    wildcardCount: summary.wildcardCount,
    exceptionCount: summary.exceptionCount,
    unicodeCount: summary.unicodeCount,
    sha256: summary.sha256
  }, PSL_RULESET, "the reviewed upstream PSL semantic baseline changed and must be consciously reviewed");
  assert.equal(summary.duplicates.length, 0);
  assert.equal(summary.whitespaceRules.length, 0);

  const synthetic = [
    "// comment",
    "",
    "  com  ",
    "*.wild.example",
    "!city.wild.example",
    "食狮.公司.cn",
    "   // indented comment",
    ""
  ].join("\n");
  assert.deepEqual(meaningfulPslRules(synthetic), ["com", "*.wild.example", "!city.wild.example", "食狮.公司.cn"]);

  for (const browser of ["firefox", "chrome"]) {
    const runtime = await readFile(`dist/${browser}/core/public_suffix_list.dat`, "utf8");
    assert.deepEqual(meaningfulPslRules(runtime), summary.rules, `${browser}: runtime rule sequence must exactly match the reviewed source`);
    assert.match(runtime, new RegExp(`Rules: ${PSL_RULESET.count}; Wildcards: ${PSL_RULESET.wildcardCount}; Exceptions: ${PSL_RULESET.exceptionCount}; SHA-256: ${PSL_RULESET.sha256}`));
  }
});

test("1.27.8.8 source and compact-runtime PSLs produce identical registrable-domain behavior for exact, private, wildcard, exception and IDN rules", async () => {
  const source = await readFile("src/shared/core/public_suffix_list.dat", "utf8");
  const expected = {
    "news.example.co.uk": "example.co.uk",
    "a.foo.blogspot.com": "foo.blogspot.com",
    "a.b.ck": "a.b.ck",
    "foo.www.ck": "www.ck",
    "foo.city.kawasaki.jp": "city.kawasaki.jp",
    "foo.bar.nom.br": "foo.bar.nom.br",
    "www.公司.cn": "www.xn--55qx5d.cn",
    "127.0.0.1": "127.0.0.1",
    "[2001:db8::1]": "[2001:db8::1]",
    "localhost": "localhost",
    "intranet": "intranet",
    "a.b.kawasaki.jp": "a.b.kawasaki.jp",
    "a.city.kawasaki.jp": "city.kawasaki.jp"
  };
  for (const browser of ["firefox", "chrome"]) {
    const runtime = await readFile(`dist/${browser}/core/public_suffix_list.dat`, "utf8");
    assert.deepEqual({ ...(await registrableResults(source, browser, "source")) }, expected, `${browser}: authoritative source PSL behavior changed`);
    assert.deepEqual({ ...(await registrableResults(runtime, browser, "runtime")) }, expected, `${browser}: compact runtime PSL behavior must match source`);
  }
});

test("1.27.8.8 compact locale helper preserves source key order and hostile/special translation text exactly", async () => {
  const sourceEnglish = (await import(`../src/shared/core/i18n-locales/en.js?1275-source=${Date.now()}`)).MESSAGES;
  const keys = Object.keys(sourceEnglish);
  const specials = [
    'quote " and apostrophe \'',
    "backslash \\\\ path",
    "emoji 🧩🐇✨",
    "line one\nline two\r\nline three",
    "${notATemplate} <b>not markup</b> & text",
    "中文 العربية 한국어 català",
    "{count} — 100% — × — …",
    ""
  ];
  const values = keys.map((key, index) => `${specials[index % specials.length]} :: ${key} :: ${index}`);
  for (const browser of ["firefox", "chrome"]) {
    const helper = await import(`../dist/${browser}/core/i18n-runtime-catalog.js?1275-helper=${Date.now()}-${browser}`);
    const catalog = helper.createLocaleCatalog(values);
    assert.equal(Object.getPrototypeOf(catalog), null);
    assert.equal(Object.isFrozen(catalog), true);
    assert.equal(Object.keys(catalog).length, keys.length);
    for (let index = 0; index < keys.length; index += 1) assert.equal(catalog[keys[index]], values[index]);
  }
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.8.8 ${browser} favicon-choice cache is gated by a live Website Access permission read`, async () => {
    const source = readBackgroundSource(browser);
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    const permissionCalls = [];
    const context = {
      hasWebAccess: async options => { permissionCalls.push(options); return false; }
    };
    vm.createContext(context);
    vm.runInContext(`${discover}; this.discoverFaviconChoicesForUrl=discoverFaviconChoicesForUrl;`, context);
    const result = await context.discoverFaviconChoicesForUrl("https://cached.example/path");
    assert.equal(result.ok, false);
    assert.equal(result.error, "permission");
    assert.equal(permissionCalls.length, 1);
    assert.equal(permissionCalls[0]?.refresh, true, "cache-read gate must bypass any stale permission memo");
  });

  test(`1.27.8.8 ${browser} redirect favicon shares the existing two-wide manual-discovery batch with conventional fallbacks`, async () => {
    const source = readBackgroundSource(browser);
    const helperNames = ["faviconCandidateSuitability", "faviconCandidatePreference", "faviconChoiceResultChars", "cloneFaviconChoiceResult", "readCachedFaviconChoices", "rememberFaviconChoices"];
    const helpers = helperNames.map(name => extractFunction(source, name)).join("\n");
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    const starts = [];
    let active = 0, maxActive = 0;
    const context = {
      URL, Date, Map, Set, Math, Number, String, Promise, setTimeout,
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_TTL_MS: 30_000,
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000,
      hasWebAccess: async () => true,
      faviconQualitySide: candidate => Math.min(Number(candidate?.width) || 0, Number(candidate?.height) || 0),
      resolveBrowserCachedFavicon: async () => null,
      parentHostFaviconUrl: () => "",
      discoverPageIconInfo: async () => ({ finalPageUrl: "https://redirect.example/landing", candidates: [] }),
      fetchImageDataUrlDetailed: async value => {
        starts.push(String(value));
        active += 1; maxActive = Math.max(maxActive, active);
        await new Promise(resolveDelay => setTimeout(resolveDelay, 3));
        active -= 1;
        return { image: `data:image/png;base64,${Buffer.from(String(value)).toString("base64")}`, sourceUrl: String(value), width: 32, height: 32 };
      }
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}\n${discover}; this.discoverFaviconChoicesForUrl=discoverFaviconChoicesForUrl;`, context);
    const result = await context.discoverFaviconChoicesForUrl("https://site.example/page");
    assert.equal(result.ok, true);
    assert.ok(maxActive <= 2);
    const redirectIndex = starts.indexOf("https://redirect.example/favicon.ico");
    assert.ok(redirectIndex >= 0, "redirect fallback must still be discovered");
    assert.equal(starts[redirectIndex + 1], "https://site.example/favicon.svg", "redirect and first conventional fallback should start in the same ordered batch");
  });
}

test("current shortcut artwork keeps a proportional ~70% contain footprint at every tile-size slider value", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const js = await readFile(`dist/${browser}/newtab/newtab.js`, "utf8");
    const css = [(await readFile("src/shared/newtab/newtab-critical.css", "utf8")), (await readFile("src/shared/newtab/newtab-secondary.css", "utf8"))].join("\n");
    assert.match(js, /Math\.round\(tileSize \* 53 \/ 76\)/);
    assert.match(css, /--shortcut-icon-size:\s*53px;/);
    assert.match(css, /\.builtin-shortcut-icon\s*\{[^}]*width:\s*70%;[^}]*height:\s*70%;/s);
    assert.match(css, /\.tile\.cover img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s, "cover mode intentionally remains edge-to-edge");
  }
  const bootstrap = await readFile("dist/firefox/newtab/render-bootstrap.js", "utf8");
  assert.match(bootstrap, /Math\.round\(tileSize \* 53 \/ 76\)/, "first paint must use the same artwork ratio as authoritative render");
  for (const tileSize of [60, 76, 96]) {
    const icon = Math.round(tileSize * 53 / 76);
    const ratio = icon / tileSize;
    assert.ok(ratio >= 0.68 && ratio <= 0.72, `${tileSize}px tile -> ${icon}px artwork ratio ${ratio}`);
  }
});

test("1.27.8.8 New Tab CSS class audit uses class-bearing references instead of arbitrary substrings", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const base = resolve(`dist/${browser}/newtab`);
    const css = [(await readFile(resolve("src/shared/newtab/newtab-critical.css"), "utf8")), (await readFile(resolve("src/shared/newtab/newtab-secondary.css"), "utf8"))].join("\n");
    const classNames = [...new Set([...css.matchAll(/(?<![\\w-])\\.([A-Za-z_][\\w-]*)/g)].map(match => match[1]))].sort();
    const files = (await readdir(base)).filter(name => /\\.(?:js|html)$/.test(name));
    const refs = new Set();
    for (const fileName of files) {
      const text = await readFile(resolve(base, fileName), "utf8");
      if (fileName.endsWith(".html")) {
        for (const match of text.matchAll(/\\bclass\\s*=\\s*["']([^"']*)["']/g)) {
          for (const token of match[1].split(/\\s+/)) if (token) refs.add(token);
        }
      }
      const directClassStrings = [
        /\\.className\\s*=\\s*(["'`])([\\s\\S]*?)\\1/g,
        /\\.classList\\.(?:add|remove|toggle|contains|replace)\\(([\\s\\S]*?)\\)/g,
        /\\.(?:querySelector|querySelectorAll|closest|matches)\\(([\\s\\S]*?)\\)/g,
        /\\.setAttribute\\(\\s*["']class["']\\s*,([\\s\\S]*?)\\)/g
      ];
      for (const pattern of directClassStrings) {
        for (const match of text.matchAll(pattern)) {
          const body = match[2] ?? match[1] ?? "";
          for (const literal of body.matchAll(/(["'`])([\\s\\S]*?)\\1/g)) {
            for (const token of literal[2].match(/[A-Za-z_][\\w-]*/g) || []) refs.add(token);
          }
          if (match[2] !== undefined) {
            for (const token of body.match(/[A-Za-z_][\\w-]*/g) || []) refs.add(token);
          }
          for (const selector of body.matchAll(/\\.([A-Za-z_][\\w-]*)/g)) refs.add(selector[1]);
        }
      }
    }
    const missing = classNames.filter(name => !refs.has(name));
    assert.deepEqual(missing, [], `${browser}: remove only selectors proven dead by class-bearing HTML/JS references`);
  }
});

test("1.27.8.8 size guard detects missing categories and significant individual-file growth while preserving accurate accounting", async () => {
  const baseline = JSON.parse(await readFile("package-size-baseline.json", "utf8"));
  const current = await createSizeReport();
  for (const browser of ["firefox", "chrome"]) {
    const expected = baseline.browsers[browser], actual = current.browsers[browser];
    assert.equal(actual.version, "1.30.18.38");
    assert.equal(expected.version, actual.version, `${browser}: current release needs a conscious size baseline`);
    assert.equal(Object.values(actual.categories).reduce((sum, entry) => sum + entry.rawBytes, 0), actual.rawBytes);
    assert.equal(Object.values(actual.categories).reduce((sum, entry) => sum + entry.deflatedBytes, 0), actual.deflatedBytes);
    assert.deepEqual(Object.keys(actual.categories).sort(), Object.keys(expected.categories).sort(), `${browser}: categories may neither silently disappear nor appear`);

    const baseFiles = new Map(expected.largestFiles.map(file => [file.path, file]));
    for (const file of actual.largestFiles) {
      const base = baseFiles.get(file.path);
      if (!base) {
        assert.ok(file.deflatedBytes <= 8 * 1024, `${browser}: new top file ${file.path} (${file.deflatedBytes} bytes) needs a conscious baseline update`);
        continue;
      }
      const growth = file.deflatedBytes - base.deflatedBytes;
      const ratio = base.deflatedBytes > 0 ? file.deflatedBytes / base.deflatedBytes : Infinity;
      assert.ok(growth <= 16 * 1024, `${browser}/${file.path}: compressed payload grew by >16 KiB without a baseline update`);
      assert.ok(!(growth > 4 * 1024 && ratio > 1.5), `${browser}/${file.path}: compressed payload grew by both >4 KiB and >50% without a baseline update`);
    }
  }
});

test("1.27.8.8 JavaScript and Python package-size category classifiers remain identical", () => {
  const paths = [
    "core/i18n-locales/ca.js", "core/i18n-runtime-catalog.js", "core/public_suffix_list.dat",
    "assets/backgrounds/aether-flow.webp", "_locales/en/messages.json", "newtab/newtab.js",
    "newtab/newtab-secondary.css", "newtab/newtab.html", "background/background.js", "core/model.js",
    "welcome/welcome.js", "assets/icon-128.png", "manifest.json", "misc.bin"
  ];
  const python = `import importlib.util, json\nspec=importlib.util.spec_from_file_location('pkg','tools/package.py')\nm=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\npaths=${JSON.stringify(paths)}\nprint(json.dumps({p:m.size_category(p) for p in paths}))`;
  const result = spawnSync("python3", ["-c", python], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.error?.code, undefined, "Python 3 (`python3`) is required for the package-size JS/Python parity test; install Python 3 and ensure `python3` is on PATH.");
  assert.equal(result.status, 0, result.stderr);
  const py = JSON.parse(result.stdout);
  for (const path of paths) assert.equal(sizeCategory(path), py[path], path);
});
