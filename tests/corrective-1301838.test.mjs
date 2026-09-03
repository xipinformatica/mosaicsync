import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const harness = path.join(root, "tests/harness/newtab-runtime-smoke.mjs");

function extractFunction(source, name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function runGeneratedSmoke(browserName) {
  const run = spawnSync(process.execPath, [harness, root, browserName], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000
  });
  const lines = String(run.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  return { run, result: lines.length ? JSON.parse(lines.at(-1)) : null };
}

test("1.30.18.38 native-cache hydration stays behind the browser Top Sites adapter", async () => {
  const source = await fs.readFile(path.join(root, "src/shared/newtab/newtab.js"), "utf8");
  const body = extractFunction(source, "hydrateDeviceFavicons");
  assert.match(body, /await getNativeTopSites\(\{\s*limit:\s*100\s*\}\)/,
    "shared New Tab must obtain native Top Sites through the platform adapter");
  assert.doesNotMatch(body, /browser\.topSites\.get\s*\(/,
    "Firefox-only Top Sites arguments must never leak from shared New Tab into Chromium");
});

test("1.30.18.38 generated Chrome New Tab rejects Firefox-style topSites arguments while Firefox preserves them", () => {
  const chrome = runGeneratedSmoke("chrome");
  assert.equal(chrome.run.status, 0, `Chrome strict-schema smoke failed:\n${chrome.run.stdout}\n${chrome.run.stderr}`);
  assert.equal(chrome.result?.topSitesOptionCalls, 0, "Chrome must never receive topSites.get(options)");
  assert.ok(chrome.result?.topSitesZeroArgCalls > 0, "Chrome adapter must still execute native Top Sites reads");

  const firefox = runGeneratedSmoke("firefox");
  assert.equal(firefox.run.status, 0, `Firefox preservation smoke failed:\n${firefox.run.stdout}\n${firefox.run.stderr}`);
  assert.ok(firefox.result?.topSitesOptionCalls > 0, "Firefox must preserve its richer Top Sites options path");
});

test("1.30.18.38 browser smoke refuses known branded Chrome command-line extension targets", async () => {
  const moduleUrl = `${pathToFileURL(path.join(root, "tools/browser-smoke.mjs")).href}?m38=${Date.now()}`;
  const smoke = await import(moduleUrl);
  assert.equal(typeof smoke.isKnownBrandedChromeBinary, "function");
  assert.equal(smoke.isKnownBrandedChromeBinary("/usr/bin/google-chrome"), true);
  assert.equal(smoke.isKnownBrandedChromeBinary("/usr/bin/google-chrome-stable"), true);
  assert.equal(smoke.isKnownBrandedChromeBinary("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"), true);
  assert.equal(smoke.isKnownBrandedChromeBinary("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), true);
  assert.equal(smoke.isKnownBrandedChromeBinary("/usr/bin/chromium"), false);
  assert.equal(smoke.isKnownBrandedChromeBinary("/opt/chrome-for-testing/chrome"), false);
  assert.throws(() => smoke.browserCapabilities("chrome", {
    browserBinary: "/usr/bin/google-chrome",
    chromeExtensionPath: "/work/dist/chrome"
  }), /Chrome for Testing|Chromium/);
});

test("1.30.18.38 maintenance ESM resolves file URLs with fileURLToPath rather than URL.pathname", async () => {
  const browserSmoke = await fs.readFile(path.join(root, "tools/browser-smoke.mjs"), "utf8");
  const certificationTest = await fs.readFile(path.join(root, "tests/maintenance-certification-1301834.test.mjs"), "utf8");
  assert.match(browserSmoke, /fileURLToPath\(import\.meta\.url\)/);
  assert.doesNotMatch(browserSmoke, /new URL\(import\.meta\.url\)\.pathname/);
  assert.match(certificationTest, /fileURLToPath\(new URL\("\.\.\/", import\.meta\.url\)\)/);
  assert.doesNotMatch(certificationTest, /new URL\("\.\.\/?", import\.meta\.url\)\.pathname/);
});
