import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  let depth = 0, quote = "", esc = false, lineComment = false, blockComment = false;
  for (let i = brace; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i++; } continue; }
    if (quote) { if (esc) { esc = false; continue; } if (c === "\\") { esc = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { lineComment = true; i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: 1.24.14h tab favicon networking is outside the serialized state queue`, async () => {
    const src = readBackgroundSource(browser);
    const fn = extract(src, "learnFaviconFromTab");

    let queue = Promise.resolve();
    const enqueue = task => {
      const run = queue.then(task);
      queue = run.catch(() => {});
      return run.catch(error => ({ ok: false, error: error?.message || String(error) }));
    };

    let networkResolve;
    let networkStartedResolve;
    const networkStarted = new Promise(resolve => { networkStartedResolve = resolve; });
    const pendingNetwork = new Promise(resolve => { networkResolve = resolve; });
    const ctx = {
      console,
      enqueue,
      prepareFaviconLearning: async () => true,
      resolveTabNativeFavicon: async () => { networkStartedResolve(); return pendingNetwork; },
      applyLearnedFaviconForTab: async () => true,
      resolveFaviconForUrl: async () => null,
      isProtectedChromeStoreUrl: () => false
    };
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);

    const learning = ctx.learnFaviconFromTab({ url: "https://example.test/", favIconUrl: "" }, "shortcut-1");
    await networkStarted;

    let unrelatedStateTaskRan = false;
    await enqueue(() => { unrelatedStateTaskRan = true; });
    assert.equal(unrelatedStateTaskRan, true, "a slow favicon fetch must not monopolize the Sync/state queue");

    networkResolve(null);
    assert.equal(await learning, false);
  });

  test(`${browser}: 1.24.14h favicon commits re-read current state and skip deleted/stale targets`, async () => {
    const src = readBackgroundSource(browser);
    const fn = extract(src, "applyLearnedFaviconForTab");
    let currentState = { deleted: true, settings: { autoSiteIcons: true } };
    let applyCalls = 0;
    const ctx = {
      ensureLocalStorage: async () => ({ state: currentState }),
      hasWebAccess: async () => true,
      findFaviconLearningTargets: state => state.deleted ? [] : [{ id: "shortcut-1" }],
      applyLearnedFavicon: async () => { applyCalls++; return true; }
    };
    vm.createContext(ctx);
    vm.runInContext(fn, ctx);

    const candidate = { image: "data:image/png;base64,AA==", sourceKind: "favicon", sourceUrl: "https://example.test/favicon.ico" };
    assert.equal(await ctx.applyLearnedFaviconForTab("https://example.test/", "shortcut-1", candidate), false);
    assert.equal(applyCalls, 0, "a target removed while networking was in flight must not be recreated");

    currentState = { deleted: false, settings: { autoSiteIcons: true } };
    assert.equal(await ctx.applyLearnedFaviconForTab("https://example.test/", "shortcut-1", candidate), true);
    assert.equal(applyCalls, 1);
  });

  test(`${browser}: 1.24.14i clicked-tab favicon scheduler behavior is bounded and coalesces repeated tab updates`, async () => {
    const src = readBackgroundSource(browser);
    const pump = extract(src, "pumpTabFaviconLearningQueue");
    const schedule = extract(src, "scheduleTabFaviconLearning");
    const starts = [];
    const releases = [];
    const ctx = {
      console,
      TAB_FAVICON_LEARN_CONCURRENCY: 3,
      PENDING_NAVIGATION_MAX_ENTRIES: 8,
      runTabFaviconLearningJob: async (tabId, job) => {
        const request = job.latest;
        job.latest = null;
        starts.push({ tabId, url: request?.tab?.url || "" });
        await new Promise(resolve => releases.push(resolve));
      }
    };
    vm.createContext(ctx);
    vm.runInContext(`
      const tabFaviconLearningJobs = new Map();
      const tabFaviconLearningQueue = [];
      let activeTabFaviconLearningJobs = 0;
      ${pump}
      ${schedule}
    `, ctx);

    ctx.scheduleTabFaviconLearning(1, { url: "https://one.example/" }, "s1");
    ctx.scheduleTabFaviconLearning(2, { url: "https://two.example/" }, "s2");
    ctx.scheduleTabFaviconLearning(3, { url: "https://three.example/" }, "s3");
    ctx.scheduleTabFaviconLearning(4, { url: "https://four.example/" }, "s4");
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(starts.map(item => item.tabId), [1, 2, 3], "only three network jobs may run at once");

    ctx.scheduleTabFaviconLearning(1, { url: "https://one.example/new" }, "s1");
    assert.equal(starts.length, 3, "a repeated update for a running tab must be coalesced, not duplicated immediately");

    releases.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts[3]?.tabId, 4, "the oldest queued tab starts when one slot opens");

    releases.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts[4]?.tabId, 1, "the coalesced tab reruns only after its current job finishes");
    assert.equal(starts[4]?.url, "https://one.example/new", "the rerun uses the newest tab snapshot");

    while (releases.length) releases.shift()();
    await new Promise(resolve => setImmediate(resolve));

    // Keep one small wiring canary: the browser listener must hand work to the
    // scheduler, not place the full network learner back inside enqueue().
    const onUpdatedStart = src.indexOf("browser.tabs?.onUpdated?.addListener");
    const onUpdatedEnd = src.indexOf("browser.runtime.onMessage.addListener", onUpdatedStart);
    const block = src.slice(onUpdatedStart, onUpdatedEnd);
    assert.match(block, /scheduleTabFaviconLearning\(tabId, tabSnapshot, pending\.shortcutId\);/);
    assert.doesNotMatch(block, /enqueue\(async \(\) =>[\s\S]*learnFaviconFromTab/);
  });
}
