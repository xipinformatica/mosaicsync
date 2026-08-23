import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < src.length; index += 1) {
    const char = src[index], next = src[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return src.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

test("1.26.17 SVG geometry ignores a decoy root inside XML prolog comments", async () => {
  const url = pathToFileURL(resolve(root, "dist/firefox/core/svg-safety.js"));
  const mod = await import(`${url.href}?v=${Date.now()}`);
  const source = `<?xml version="1.0"?>\n<!-- <svg width="16" height="16"> -->\n<svg xmlns="http://www.w3.org/2000/svg" width="16000" height="16000"><rect width="1" height="1"/></svg>`;
  const dims = mod.svgRasterDimensionsFromText(source);
  assert.equal(dims.valid, true);
  assert.equal(dims.width, 16000);
  assert.equal(dims.height, 16000);
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17 ${browser} remote SVG decode is always bounded`, () => {
    const src = fs.readFileSync(resolve(root, `dist/${browser}/background/background.js`), "utf8");
    const fn = extract(src, "rasterizeSafeSvg");
    assert.doesNotMatch(fn, /createImageBitmap\(svgBlob\)\s*;/);
    assert.match(fn, /resizeWidth:\s*targetWidth/);
    assert.match(fn, /resizeHeight:\s*targetHeight/);
    assert.match(fn, /FAVICON_LOCAL_MAX_SIDE/);
  });

  test(`1.26.17 ${browser} same-marker semantic Sync divergence forces reconciliation`, async () => {
    const src = fs.readFileSync(resolve(root, `dist/${browser}/background/background.js`), "utf8");
    const code = extract(src, "reconcileIfNewCommit");
    let reconciles = 0;
    const remoteRecords = new Map([["remote", { id: "remote", kind: "shortcut", url: "https://remote.test/" }]]);
    const localRecords = new Map([["local", { id: "local", kind: "shortcut", url: "https://local.test/" }]]);
    const settings = { kind: "settings", modifiedAt: 1 };
    const ctx = {
      readLocalMeta: async () => ({
        syncEnabled: true, syncInitialized: true, deviceId: "dev",
        lastAppliedSyncRevision: "commit:same", lastAppliedDeviceSnapshotRevision: "device:same", lastAppliedWorkSyncRevision: "commit:work"
      }),
      retryPendingLocalSyncMutation: async meta => meta,
      browser: { storage: { sync: { get: async () => ({}) } } },
      readCoreSources: async () => ({ shared: { dataset: { commitId: "same" } }, device: { revision: "device:same" } }),
      datasetRevision: dataset => dataset?.commitId ? `commit:${dataset.commitId}` : "",
      readSyncSnapshot: async () => ({ dataset: { commitId: "work" }, records: new Map(), settings }),
      combinedRemoteCore: () => ({ records: remoteRecords, settings }),
      remoteCoreUsable: () => true,
      ensureLocalStorage: async () => ({ state: { spaces: { personal: {}, work: {} } } }),
      workspaceStateNormalized: (_state, id) => ({ id }),
      flattenStateNormalized: workspace => workspace.id === "personal" ? localRecords : new Map(),
      makeSettingsRecordNormalized: () => settings,
      recordFingerprint: records => [...records.keys()].sort().join("|"),
      settingsRecordEqual: () => true,
      isSnapshotUsable: () => true,
      PERSONAL_SPACE_ID: "personal",
      WORK_SPACE_ID: "work",
      reconcile: async () => { reconciles += 1; return { ok: true }; }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.reconcileIfNewCommit();
    assert.equal(reconciles, 1);
    assert.equal(result.ok, true);
  });

  test(`1.26.17 ${browser} periodic Sync watchdog runs the strong semantic verifier`, () => {
    const src = fs.readFileSync(resolve(root, `dist/${browser}/background/background.js`), "utf8");
    const alarmAt = src.indexOf("browser.alarms?.onAlarm?.addListener");
    const permissionAt = src.indexOf("browser.permissions?.onAdded", alarmAt);
    const block = src.slice(alarmAt, permissionAt);
    assert.match(block, /if \(alarm\?\.name !== SYNC_WATCH_ALARM\) return;/);
    assert.match(block, /await reconcileIfNewCommit\(\);/);
  });
}

test("1.26.17 Chrome native favicon helper rejects the browser placeholder signature", async () => {
  const previousBrowser = globalThis.browser;
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  try {
    globalThis.browser = undefined;
    globalThis.chrome = {
      runtime: {
        id: "test-extension",
        getURL: path => `chrome-extension://test-extension/${path}`
      },
      topSites: { get: async () => [] }
    };
    const placeholderBytes = new Uint8Array([9, 8, 7, 6]);
    const realBytes = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = async url => {
      const text = String(url);
      const placeholder = text.includes("mosaicsync-placeholder-test-extension.invalid");
      const missing = text.includes(encodeURIComponent("https://missing.test/"));
      const bytes = placeholder || missing ? placeholderBytes : realBytes;
      return {
        ok: true,
        blob: async () => ({
          size: bytes.length,
          type: "image/png",
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        })
      };
    };
    const url = pathToFileURL(resolve(root, "dist/chrome/core/platform.js"));
    const mod = await import(`${url.href}?placeholder=${Date.now()}`);
    const real = await mod.readNativeFaviconDataUrl("https://real.test/", 128);
    const missing = await mod.readNativeFaviconDataUrl("https://missing.test/", 128);
    assert.match(real, /^data:image\/png;base64,/);
    assert.equal(missing, "");
  } finally {
    globalThis.browser = previousBrowser;
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test("1.26.17 synchronous Frequently Visited bootstrap filters hidden domains before paint", () => {
  const src = fs.readFileSync(resolve(root, "dist/firefox/newtab/render-bootstrap.js"), "utf8");
  assert.match(src, /HIDDEN_FREQUENT_KEY/);
  assert.match(src, /frequentUrlHidden\(rawSite\.url, hidden\)/);
  assert.match(src, /host\.endsWith\(`\.\$\{domain\}`\)/);
});

test("1.26.17 Chrome placeholder sentinel failures fail closed and are retryable", async () => {
  const previousBrowser = globalThis.browser;
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  try {
    const api = {
      runtime: { id: "retry-extension", getURL: path => `chrome-extension://retry-extension/${path}` },
      topSites: { get: async () => [] }
    };
    // browser-shim.js may already be module-cached by another test in this Node
    // process, so bind both names explicitly instead of relying on the shim to
    // re-run for this isolated platform-module import.
    globalThis.browser = api;
    globalThis.chrome = api;
    const globe = new Uint8Array([9, 9, 9, 9]);
    let sentinelAttempts = 0;
    const optionsSeen = [];
    globalThis.fetch = async (url, options = {}) => {
      optionsSeen.push({ url: String(url), cache: options.cache });
      if (String(url).includes("mosaicsync-placeholder-retry-extension.invalid")) {
        sentinelAttempts += 1;
        if (sentinelAttempts === 1) throw new Error("temporary private endpoint failure");
      }
      return {
        ok: true,
        blob: async () => ({
          size: globe.length,
          type: "image/png",
          arrayBuffer: async () => globe.buffer.slice(globe.byteOffset, globe.byteOffset + globe.byteLength)
        })
      };
    };
    const url = pathToFileURL(resolve(root, "dist/chrome/core/platform.js"));
    const mod = await import(`${url.href}?retry=${Date.now()}`);
    const first = await mod.readNativeFaviconDataUrl("https://missing.test/", 128);
    const second = await mod.readNativeFaviconDataUrl("https://missing.test/", 128);
    assert.equal(first, "", "unknown placeholder identity must fail closed");
    assert.equal(second, "", "learned generic globe must still be rejected");
    assert.equal(sentinelAttempts, 2, "failed sentinel probe must not be cached for the worker lifetime");
    assert.ok(optionsSeen.every(entry => entry.cache === "no-store"));
    assert.ok(optionsSeen.every(entry => /scaleFactor=1x/.test(entry.url)));
  } finally {
    globalThis.browser = previousBrowser;
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

test("1.26.17 synchronous Frequently Visited snapshot fails closed when hidden-domain storage is corrupt", () => {
  const src = fs.readFileSync(resolve(root, "dist/firefox/newtab/render-bootstrap.js"), "utf8");
  const hiddenCode = extract(src, "hiddenFrequentDomains");
  const paintCode = extract(src, "paintFrequentSnapshot");
  let replaceCalls = 0;
  const ctx = {
    console,
    URL,
    HIDDEN_FREQUENT_KEY: "hidden",
    localStorage: { getItem: () => "{ definitely not json" },
    frequentSection: {},
    frequentList: { replaceChildren: () => { replaceCalls += 1; } },
    document: { createDocumentFragment: () => ({ append() {} }) },
    validUrl: value => /^https?:/.test(value),
    frequentUrlHidden: () => false,
    validPreview: () => false,
    frequentCard: site => site,
    root: { dataset: {} }
  };
  vm.createContext(ctx);
  vm.runInContext(hiddenCode, ctx);
  vm.runInContext(paintCode, ctx);
  ctx.paintFrequentSnapshot({ enabled: true, count: 5, sites: [{ title: "Hidden", host: "hidden.test", url: "https://hidden.test/" }] });
  assert.equal(replaceCalls, 0, "corrupt hide state must skip the disposable cached first frame");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17 ${browser} suppresses shared-ledger repair while that ledger is visibly partial`, () => {
    const src = fs.readFileSync(resolve(root, `dist/${browser}/background/background.js`), "utf8");
    const fn = extract(src, "reconcilePersonal");
    const guard = fn.indexOf("const sharedLedgerPartial = hasSnapshotData(snapshot) && !isSnapshotUsable(snapshot)");
    const firstRepair = fn.indexOf("const syncWrites = {}");
    assert.ok(guard >= 0 && firstRepair > guard, "partial-ledger guard must run before any compatibility-ledger repair writes");
    assert.match(fn.slice(guard, firstRepair), /return \{ ok: true, meta: refreshed, sharedLedgerPending: true \}/);
  });
}
