import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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

function backgroundHelpers(source) {
  return [
    "faviconCandidateSuitability",
    "faviconCandidatePreference",
    "normalizeFaviconChoiceRequestId",
    "cancelFaviconChoiceRequest",
    "runFaviconChoiceRequest",
    "faviconChoiceResultChars",
    "cloneFaviconChoiceResult",
    "readCachedFaviconChoices",
    "rememberFaviconChoices"
  ].map(name => extractFunction(source, name)).join("\n");
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.7 ${browser} request-id cancellation aborts only the matching manual favicon discovery`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const helpers = backgroundHelpers(source);
    let observedSignal = null;
    const context = {
      Map, String, AbortController,
      faviconChoiceRequests: new Map(),
      discoverFaviconChoicesForUrl: async (_pageUrl, { signal }) => {
        observedSignal = signal;
        if (signal.aborted) return { ok: false, error: "cancelled", candidates: [] };
        return new Promise(resolve => signal.addEventListener("abort", () => resolve({ ok: false, error: "cancelled", candidates: [] }), { once: true }));
      }
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}; this.cancelFaviconChoiceRequest=cancelFaviconChoiceRequest; this.runFaviconChoiceRequest=runFaviconChoiceRequest;`, context);
    const pending = context.runFaviconChoiceRequest("https://site.example/", "req-12345678");
    await Promise.resolve();
    assert.equal(context.faviconChoiceRequests.size, 1);
    assert.equal(observedSignal?.aborted, false);
    assert.equal(context.cancelFaviconChoiceRequest("different-12345678"), false, "an unrelated cancellation must not affect the request");
    assert.equal(observedSignal?.aborted, false);
    assert.equal(context.cancelFaviconChoiceRequest("req-12345678"), true);
    assert.equal(observedSignal?.aborted, true);
    const result = await pending;
    assert.equal(result.error, "cancelled");
    assert.equal(context.faviconChoiceRequests.size, 0);
  });


  test(`1.27.7 ${browser} caller cancellation aborts an in-flight manual favicon network fetch`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const linked = extractFunction(source, "linkedFetchAbortController");
    const bounded = extractFunction(source, "fetchBoundedResource");
    let fetchSignal = null;
    const context = {
      AbortController, setTimeout, clearTimeout,
      canReadOrigin: async () => true,
      readBoundedResponseBytes: async () => ({ ok: false, reason: "unexpected", bytes: null }),
      fetch: async (_url, options) => {
        fetchSignal = options.signal;
        return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => {
          const error = new Error("aborted"); error.name = "AbortError"; reject(error);
        }, { once: true }));
      }
    };
    vm.createContext(context);
    vm.runInContext(`${linked}\n${bounded}; this.fetchBoundedResource=fetchBoundedResource;`, context);
    const controller = new AbortController();
    const pending = context.fetchBoundedResource("https://site.example/favicon.ico", { maxBytes: 250_000, deadlineAt: Date.now() + 10_000, signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(fetchSignal?.aborted, false);
    controller.abort();
    const result = await pending;
    assert.equal(fetchSignal?.aborted, true);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cancelled");
  });
  test(`1.27.7 ${browser} a pre-cancelled manual favicon discovery performs no permission/network work`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    let permissionCalls = 0;
    const controller = new AbortController();
    controller.abort();
    const context = { hasWebAccess: async () => { permissionCalls += 1; return true; } };
    vm.createContext(context);
    vm.runInContext(`${discover}; this.discoverFaviconChoicesForUrl=discoverFaviconChoicesForUrl;`, context);
    const result = await context.discoverFaviconChoicesForUrl("https://site.example/", { signal: controller.signal });
    assert.equal(result.ok, false);
    assert.equal(result.error, "cancelled");
    assert.equal(permissionCalls, 0);
  });

  test(`1.27.7 ${browser} favicon cache cannot be read after live Website Access revocation`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const helpers = backgroundHelpers(source);
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    let permissionCalls = 0;
    let fetchCalls = 0;
    const context = {
      URL, Date, Map, Set, Math, Number, String, Promise,
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_TTL_MS: 30_000,
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000,
      hasWebAccess: async options => {
        assert.equal(options?.refresh, true);
        permissionCalls += 1;
        return permissionCalls <= 2; // initial+admission true, subsequent live read revoked
      },
      faviconQualitySide: candidate => Math.min(Number(candidate?.width) || 0, Number(candidate?.height) || 0),
      resolveBrowserCachedFavicon: async () => null,
      parentHostFaviconUrl: () => "",
      discoverPageIconInfo: async () => ({ finalPageUrl: "https://site.example/", candidates: [] }),
      fetchImageDataUrlDetailed: async value => {
        fetchCalls += 1;
        return { image: `data:image/png;base64,${Buffer.from(String(value)).toString("base64")}`, sourceUrl: String(value), width: 32, height: 32 };
      }
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}\n${discover}; this.discoverFaviconChoicesForUrl=discoverFaviconChoicesForUrl;`, context);
    const first = await context.discoverFaviconChoicesForUrl("https://site.example/path");
    assert.equal(first.ok, true);
    assert.equal(context.faviconChoiceCache.size, 1);
    const beforeRevokedRead = fetchCalls;
    const second = await context.discoverFaviconChoicesForUrl("https://site.example/path");
    assert.equal(second.ok, false);
    assert.equal(second.error, "permission");
    assert.equal(fetchCalls, beforeRevokedRead, "revoked cache access must fail before any new fetch");
  });

  test(`1.27.7 ${browser} favicon cache enforces its aggregate retained-character bound`, () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const helpers = ["faviconChoiceResultChars", "cloneFaviconChoiceResult", "rememberFaviconChoices"].map(name => extractFunction(source, name)).join("\n");
    const context = {
      Map,
      faviconChoiceCache: new Map(),
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}; this.rememberFaviconChoices=rememberFaviconChoices;`, context);
    const result = seed => ({ ok: true, error: "", candidates: [{ image: `data:image/png;base64,${seed.repeat(299_900)}` }] });
    context.rememberFaviconChoices("a", result("a"), 1);
    context.rememberFaviconChoices("b", result("b"), 2);
    context.rememberFaviconChoices("c", result("c"), 3);
    const total = [...context.faviconChoiceCache.values()].reduce((sum, entry) => sum + entry.chars, 0);
    assert.ok(total <= 800_000);
    assert.equal(context.faviconChoiceCache.has("a"), false, "oldest entry must be evicted when aggregate bytes exceed the cap");
    assert.equal(context.faviconChoiceCache.has("b"), true);
    assert.equal(context.faviconChoiceCache.has("c"), true);
  });

  test(`1.27.7 ${browser} New Tab sends cancellable manual favicon requests and cancels them when picker state resets`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(source, /let detectedFaviconRequestId = "";/);
    assert.match(source, /type: "mosaicsync:discover-favicon-choices", pageUrl: sourceUrl, requestId/);
    assert.match(source, /type: "mosaicsync:cancel-favicon-choices", requestId/);
    const reset = extractFunction(source, "resetDetectedFaviconPicker");
    assert.match(reset, /cancelDetectedFaviconRequest\(\)/);
  });
}

test("1.27.7 shortcut contained artwork is about 70% of the tile while Cover remains edge-to-edge", () => {
  for (const tileSize of [60, 76, 96]) {
    const pixels = Math.round(tileSize * 53 / 76);
    const ratio = pixels / tileSize;
    assert.ok(ratio >= 0.68 && ratio <= 0.72, `${tileSize}px tile -> ${pixels}px = ${(ratio * 100).toFixed(1)}%`);
  }
  for (const browser of ["firefox", "chrome"]) {
    const js = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const css = fs.readFileSync(`src/shared/newtab/newtab.css`, "utf8");
    assert.match(js, /Math\.round\(tileSize \* 53 \/ 76\)/);
    assert.match(css, /--shortcut-icon-size:\s*53px;/);
    assert.match(css, /\.builtin-shortcut-icon\s*\{[^}]*width:\s*70%;[^}]*height:\s*70%;/s);
    assert.match(css, /\.tile\.cover img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  }
  const bootstrap = fs.readFileSync("dist/firefox/newtab/render-bootstrap.js", "utf8");
  assert.match(bootstrap, /Math\.round\(tileSize \* 53 \/ 76\)/);
});
