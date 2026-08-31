import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeFaviconPreference } from "../src/shared/core/model.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;

function extract(src, name) {
  let start = src.indexOf(`async function ${name}(`);
  if (start < 0) start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
  assert.ok(brace >= 0, `missing body for ${name}`);
  let depth = 0, quote = "", esc = false, lineComment = false, blockComment = false;
  for (let i = brace; i < src.length; i += 1) {
    const c = src[i], n = src[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && n === "/") { lineComment = true; i += 1; continue; }
    if (c === "/" && n === "*") { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function installQueueMutationStub(ctx) {
  if (!ctx.resolveFaviconForUrlWithPreference && ctx.resolveFaviconForUrl) {
    ctx.resolveFaviconForUrlWithPreference = (url, _preference, options) => ctx.resolveFaviconForUrl(url, options);
  }
  if (ctx.mutateIconRecoveryQueue || !ctx.readIconRecoveryQueue || !ctx.writeIconRecoveryQueue) return;
  ctx.mutateIconRecoveryQueue = async mutator => {
    const current = await ctx.readIconRecoveryQueue();
    const next = await mutator(current);
    if (!next || next === current) return current;
    return ctx.writeIconRecoveryQueue(next);
  };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.6 ${browser} favicon recovery single-flights exact URL + quality work without merging distinct pages`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const queue = {
      version: 2,
      items: [
        { id: "same-a", url: "https://same.example/app", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false },
        { id: "same-b", url: "https://same.example/app", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false },
        { id: "same-quality", url: "https://same.example/app", attempts: 0, nextAttemptAt: 0, qualityUpgrade: true },
        { id: "other-page", url: "https://same.example/other", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }
      ]
    };
    const calls = [];
    let finalQueue = null;
    const ctx = { console, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5,
      ICON_RECOVERY_EXHAUSTED_RETRY_MS: 86_400_000,
      ICON_RECOVERY_ALARM: "icon",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readIconRecoveryQueue: async () => structuredClone(queue),
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async value => value,
      scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true,
      platformHasPermissionFreeFaviconSource: () => true,
      resolveFaviconForUrl: async (url, options) => {
        calls.push(`${options.preferQuality ? "quality" : "fast"}|${url}`);
        return { image: "data:image/png;base64,QUJD", sourceUrl: `${url}/favicon.ico`, provisional: false };
      },
      enqueue: async task => task(),
      applyProactiveFaviconResults: async results => ({
        appliedIds: new Set(results.map(result => result.id)),
        unchangedIds: new Set()
      }),
      nextIconRecoveryQualityRetry: item => ({ item }),
      nextIconRecoveryFailure: item => ({ item: { ...item, attempts: item.attempts + 1 }, exhausted: false }),
      iconRecoveryItemStillRelevantInState: () => true,
      writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
      writeIconRecoveryStatus: async () => {},
      scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    vm.runInContext(`
      let iconRecoveryRun = null;
      ${extract(src, "processIconRecoveryQueue")}
    `, ctx);

    const summary = await ctx.processIconRecoveryQueue();
    assert.deepEqual(calls, [
      "fast|https://same.example/app",
      "quality|https://same.example/app",
      "fast|https://same.example/other"
    ]);
    assert.equal(summary.attempted, 4, "four shortcut records are completed by only three resolver jobs");
    assert.equal(summary.hydrated, 4);
    assert.equal(finalQueue.items.length, 0);
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.6 ${browser} a shared favicon failure still advances durable backoff per shortcut record`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const queue = {
      version: 2,
      items: [
        { id: "first", url: "https://fail.example/app", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false },
        { id: "second", url: "https://fail.example/app", attempts: 0, nextAttemptAt: 0, qualityUpgrade: false }
      ]
    };
    let resolverCalls = 0;
    let finalQueue = null;
    const ctx = { console, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3, ICON_RECOVERY_QUEUE_VERSION: 2, ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5, ICON_RECOVERY_EXHAUSTED_RETRY_MS: 86_400_000, ICON_RECOVERY_ALARM: "icon",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readIconRecoveryQueue: async () => structuredClone(queue),
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async value => value, scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true, platformHasPermissionFreeFaviconSource: () => true,
      resolveFaviconForUrl: async () => { resolverCalls += 1; return { image: "", reason: "timeout", provisional: false }; },
      enqueue: async task => task(), applyProactiveFaviconResults: async () => ({ appliedIds: new Set(), unchangedIds: new Set() }),
      nextIconRecoveryQualityRetry: item => ({ item }),
      nextIconRecoveryFailure: item => ({ item: { ...item, attempts: item.attempts + 1, nextAttemptAt: Date.now() + 1000 }, exhausted: false }),
      iconRecoveryItemStillRelevantInState: () => true,
      writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
      writeIconRecoveryStatus: async () => {}, scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    vm.runInContext(`let iconRecoveryRun = null;\n${extract(src, "processIconRecoveryQueue")}`, ctx);
    const summary = await ctx.processIconRecoveryQueue();
    assert.equal(resolverCalls, 1, "the identical failed resolver job must still be single-flighted");
    assert.equal(summary.attempted, 2);
    assert.equal(summary.failed, 2);
    assert.equal(summary.timedOut, 2);
    assert.deepEqual(finalQueue.items.map(item => [item.id, item.attempts]).sort(), [["first", 1], ["second", 1]]);
  });
}


for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.7 ${browser} shared favicon fan-out still applies the real per-ID stale revalidation`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const sharedUrl = "https://shared.example/app";
    const currentState = {
      activeSpaceId: "personal",
      spaces: {
        personal: {
          settings: { autoSiteIcons: true },
          shortcuts: ["stay", "changed", "deleted", "moved"].map(id => ({
            type: "shortcut", id, url: sharedUrl, image: "", imageSyncKind: "none", imageSourceKind: "none"
          }))
        },
        work: { settings: { autoSiteIcons: false }, shortcuts: [] }
      }
    };
    const queue = {
      version: 2,
      items: ["stay", "changed", "deleted", "moved"].map(id => ({
        id, url: sharedUrl, attempts: 0, nextAttemptAt: 0, qualityUpgrade: false
      }))
    };
    let resolverCalls = 0;
    let writeCalls = 0;
    let finalQueue = null;
    const ctx = { console, structuredClone, normalizeFaviconPreference };
    vm.createContext(ctx);
    Object.assign(ctx, {
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_QUEUE_VERSION: 2,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_MAX_ATTEMPTS: 5,
      ICON_RECOVERY_EXHAUSTED_RETRY_MS: 86_400_000,
      ICON_RECOVERY_ALARM: "icon",
      browser: { alarms: { clear: async () => {} } },
      devMark: () => {}, devMeasure: () => {},
      readIconRecoveryQueue: async () => structuredClone(queue),
      ensureLocalStorage: async () => ({ state: currentState }),
      pruneIconRecoveryQueueAgainstState: async value => value,
      scheduleIconRecoveryAlarm: async () => {},
      hasWebAccess: async () => true,
      platformHasPermissionFreeFaviconSource: () => true,
      resolveFaviconForUrl: async () => {
        resolverCalls += 1;
        const personal = currentState.spaces.personal.shortcuts;
        personal.find(item => item.id === "changed").url = "https://changed.example/";
        currentState.spaces.personal.shortcuts = personal.filter(item => item.id !== "deleted" && item.id !== "moved");
        currentState.spaces.work.shortcuts.push({
          type: "shortcut", id: "moved", url: sharedUrl, image: "", imageSyncKind: "none", imageSourceKind: "none"
        });
        return { image: "data:image/png;base64,QUJD", sourceUrl: `${sharedUrl}/favicon.ico`, provisional: false };
      },
      enqueue: async task => task(),
      createWriteBaseline: state => state,
      findShortcutLocationById: (state, id) => {
        for (const [spaceId, workspace] of Object.entries(state.spaces || {})) {
          const shortcut = (workspace.shortcuts || []).find(item => item.id === id);
          if (shortcut) return { spaceId, workspace, shortcut };
        }
        return null;
      },
      workspaceAllowsAutoIcons: (state, id) => {
        const location = ctx.findShortcutLocationById(state, id);
        return Boolean(location?.workspace?.settings?.autoSiteIcons);
      },
      shortcutAllowsFaviconRecovery: (state, id) => {
        const location = ctx.findShortcutLocationById(state, id);
        const pref = normalizeFaviconPreference(location?.shortcut?.faviconPreference);
        const manualPending = Boolean(pref && location?.shortcut?.imageSourceKind === "upload" && location?.shortcut?.imageSyncKind === "device" && (!location?.shortcut?.image || location.shortcut.imageIsFallback === true));
        return manualPending || Boolean(location?.workspace?.settings?.autoSiteIcons);
      },
      shortcutNeedsProactiveFavicon: shortcut => Boolean(shortcut && !shortcut.image),
      writeLocalState: async state => { writeCalls += 1; return state; },
      nextIconRecoveryQualityRetry: item => ({ item }),
      nextIconRecoveryFailure: item => ({ item: { ...item, attempts: item.attempts + 1 }, exhausted: false }),
      iconRecoveryItemStillRelevantInState: (state, item) => {
        const location = ctx.findShortcutLocationById(state, item.id);
        return Boolean(location && location.shortcut.url === item.url && location.workspace.settings.autoSiteIcons && !location.shortcut.image);
      },
      writeIconRecoveryQueue: async value => { finalQueue = structuredClone(value); return value; },
      writeIconRecoveryStatus: async () => {},
      scheduleImmediateIconRecoveryContinuation: () => {}
    });
    installQueueMutationStub(ctx);
    vm.runInContext(`
      let iconRecoveryRun = null;
      ${extract(src, "applyProactiveFaviconResults")}
      ${extract(src, "processIconRecoveryQueue")}
    `, ctx);

    const summary = await ctx.processIconRecoveryQueue();
    assert.equal(resolverCalls, 1, "all four exact-URL records must share one resolver job");
    assert.equal(writeCalls, 1, "only the still-applicable result should cause one batch state write");
    assert.equal(currentState.spaces.personal.shortcuts.find(item => item.id === "stay")?.image, "data:image/png;base64,QUJD");
    assert.equal(currentState.spaces.personal.shortcuts.find(item => item.id === "changed")?.image, "", "URL-changed duplicate must reject stale result");
    assert.equal(currentState.spaces.personal.shortcuts.some(item => item.id === "deleted"), false, "deleted duplicate stays deleted");
    assert.equal(currentState.spaces.work.shortcuts.find(item => item.id === "moved")?.image, "", "move into an auto-icon-disabled Space must reject stale result");
    assert.equal(summary.hydrated, 1);
    assert.equal(finalQueue.items.length, 0, "stale/inapplicable records must not linger in the durable queue");
  });
}

test("1.26.17.6 Frequently Visited explicit-host memo reuses only the same state generation", async () => {
  const ui = await import("../dist/firefox/newtab/ui-utils.js");
  const memo = ui.createShortcutHostsAcrossSpacesMemo();
  const state = {
    spaces: {
      personal: { shortcuts: [{ type: "shortcut", url: "https://one.example/a" }] },
      work: { shortcuts: [{ type: "folder", items: [{ type: "shortcut", url: "https://two.example/b" }] }] }
    }
  };
  const first = memo(state, 10);
  const second = memo(state, 10);
  assert.equal(second, first, "unchanged state generation must reuse the same Set allocation");
  assert.deepEqual([...first].sort(), ["one.example", "two.example"]);

  state.spaces.personal.shortcuts.push({ type: "shortcut", url: "https://three.example/" });
  const changed = memo(state, 11);
  assert.notEqual(changed, first, "a mutation generation change must rebuild the host Set");
  assert.equal(changed.has("three.example"), true);

  const replacement = structuredClone(state);
  replacement.spaces.work.shortcuts.push({ type: "shortcut", url: "https://four.example/" });
  const replacementHosts = memo(replacement, 11);
  assert.notEqual(replacementHosts, changed, "state identity replacement must invalidate even at the same generation");
  assert.equal(replacementHosts.has("four.example"), true);
  for (const browser of ["firefox", "chrome"]) {
    const source = await readFile(resolve(`src/shared/newtab/newtab.js`), "utf8");
    assert.match(source, /const frequentExplicitHostsForState = createShortcutHostsAcrossSpacesMemo\(\);/);
    assert.match(source, /frequentExplicitHostsForState\(state, stateMutationGeneration\)/);
  }
});

test("1.26.17.6 production startup diagnostics are gated behind the existing local dev-metrics flag", async () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = await readFile(resolve(`src/shared/newtab/newtab.js`), "utf8");
    assert.match(source, /import \{ devMark, devMeasure, devMetricsEnabled \} from "\.\.\/core\/perf\.js";/);
    assert.match(source, /if \(pageshowPersisted && devMetricsEnabled\(\)\) \{[\s\S]*?console\.debug\(`\$\{PRODUCT_NAME\} \$\{VERSION\} performance`/);
    assert.match(source, /if \(devMetricsEnabled\(\)\) console\.debug\(`\$\{PRODUCT_NAME\} \$\{VERSION\} performance`/);
    const performanceDebugs = [...source.matchAll(/console\.debug\(`\$\{PRODUCT_NAME\} \$\{VERSION\} performance`/g)];
    assert.equal(performanceDebugs.length, 2, `${browser}: unexpected additional always-on performance console path`);
  }
});

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(key, value) { this.values.set(key, String(value)); }
}
class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = new FakeStyle();
    this.hidden = false;
    this.attributes = {};
    this.className = "";
    this.href = "";
    this.rel = "";
    this.title = "";
    this.textContent = "";
  }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  replaceChildren(...nodes) { this.children = nodes.filter(Boolean); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
function fakeBootstrapContext(manifest, { withHelper = true } = {}) {
  const root = new FakeElement("html");
  const grid = new FakeElement("div");
  const emptyState = new FakeElement("div");
  const frequentSection = new FakeElement("section");
  frequentSection.hidden = true;
  const frequentList = new FakeElement("div");
  const brand = new FakeElement("div");
  const ids = new Map([
    ["shortcutGrid", grid], ["emptyState", emptyState],
    ["frequentSitesSection", frequentSection], ["frequentSitesList", frequentList]
  ]);
  const stored = new Map([["mosaicsync.render-manifest.v1", JSON.stringify(manifest)]]);
  const context = {
    console,
    URL,
    __mosaicsyncBootstrapConfig: { renderManifestKey: "mosaicsync.render-manifest.v1", renderManifestVersion: 4 },
    document: {
      documentElement: root,
      getElementById: id => ids.get(id) || null,
      querySelector: selector => selector === ".brand" ? brand : null,
      createElement: tag => new FakeElement(tag),
      createDocumentFragment: () => new FakeElement("fragment")
    },
    localStorage: { getItem: key => stored.has(key) ? stored.get(key) : null }
  };
  vm.createContext(context);
  return { context, root, grid, emptyState, frequentSection, frequentList, withHelper };
}
function allElements(node) {
  const out = [node];
  for (const child of node?.children || []) out.push(...allElements(child));
  return out;
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.6 ${browser} classic persistent first-paint never creates hostile shortcut anchors or FV anchors`, async () => {
    const manifest = {
      version: 4,
      onboardingCompleted: true,
      activeSpaceId: "personal",
      columns: 6, rows: 2, tileSize: 76, brandVisible: true,
      shortcuts: [
        { type: "shortcut", id: "good", title: "Good", url: "https://good.example/path", position: 0, imageStyle: "contain", preview: "" },
        { type: "shortcut", id: "bad", title: "Bad", url: "javascript:alert(1)", position: 1, imageStyle: "contain", preview: "" },
        { type: "folder", id: "folder", title: "Folder", position: 2, items: [
          { type: "shortcut", id: "child-good", title: "Child", url: "https://child.example/", imageStyle: "contain", preview: "" },
          { type: "shortcut", id: "child-bad", title: "Bad child", url: "data:text/html,bad", imageStyle: "contain", preview: "" }
        ] }
      ],
      firstPaint: { version: 1, activeSpaceId: "personal", multipleSpacesEnabled: true, spaceNames: { personal: "", work: "" }, frequent: { enabled: true, count: 5, sites: [
        { title: "Frequent good", host: "freq.example", url: "https://freq.example/", favicon: "" },
        { title: "Frequent bad", host: "bad.example", url: "javascript:alert(2)", favicon: "" }
      ] } }
    };
    const { context, grid, frequentList } = fakeBootstrapContext(manifest);
    const safety = fs.readFileSync(`dist/${browser}/core/http-url-safety.js`, "utf8");
    const bootstrap = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    vm.runInContext(safety, context);
    vm.runInContext(bootstrap, context);

    const anchors = [...allElements(grid), ...allElements(frequentList)].filter(node => node.tagName === "A");
    assert.deepEqual(anchors.map(anchor => anchor.href).sort(), ["https://good.example/path"]);
    assert.equal(allElements(frequentList).filter(node => node.tagName === "A").length, 0,
      "persistent bootstrap must not create browser-derived Frequently Visited anchors");
    assert.equal(anchors.some(anchor => /^(?:javascript|data|blob|file):/i.test(anchor.href)), false);
    assert.ok(context.__mosaicsyncBootGrid?.manifest, "safe manifest should still complete the disposable first paint");
  });

  test(`1.26.17.6 ${browser} classic first-paint aborts cleanly when the shared URL helper is absent`, async () => {
    const manifest = {
      version: 4, onboardingCompleted: true, activeSpaceId: "personal", columns: 6, rows: 2, tileSize: 76,
      shortcuts: [{ type: "shortcut", id: "good", title: "Good", url: "https://good.example/", position: 0, imageStyle: "contain", preview: "" }]
    };
    const { context, grid } = fakeBootstrapContext(manifest, { withHelper: false });
    const bootstrap = fs.readFileSync(`dist/${browser}/newtab/render-bootstrap.js`, "utf8");
    vm.runInContext(bootstrap, context);
    assert.equal(allElements(grid).filter(node => node.tagName === "A").length, 0);
    assert.equal(context.__mosaicsyncBootGrid, undefined);
  });
}

test("1.26.17.6 normalized profile tree strips hostile own prototype keys at every accepted nested boundary", async () => {
  const constants = await import("../dist/firefox/core/constants.js");
  const model = await import("../dist/firefox/core/model.js");
  const profile = await import("../dist/firefox/core/profile.js");
  const t = 10;
  const baseShortcut = (id, position = 0) => ({
    type: "shortcut", id, title: id, url: `https://${id}.example/`, image: "", imageSyncKind: "none",
    imageSourceKind: "none", imageStyle: "contain", position, createdAt: t, modifiedAt: t, source: "manual"
  });
  const state = model.normalizeState({
    shortcuts: [
      baseShortcut("top", 0),
      { type: "folder", id: "folder", title: "Folder", position: 1, createdAt: t, modifiedAt: t,
        items: [baseShortcut("child", 0), baseShortcut("child-two", 1)] }
    ],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: t, updatedAt: t
  });
  const raw = JSON.parse(profile.serializeProfilePackage(await profile.createProfilePackage(state, {})));
  const targets = [
    raw,
    raw.profile,
    raw.profile.state,
    raw.profile.state.spaces,
    raw.profile.state.spaces.personal,
    raw.profile.state.spaces.personal.settings,
    raw.profile.state.spaces.personal.shortcuts[0],
    raw.profile.state.spaces.personal.shortcuts[1],
    raw.profile.state.spaces.personal.shortcuts[1].items[0]
  ];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    Object.defineProperty(target, "__proto__", { value: { [`polluted${index}`]: true }, enumerable: true, configurable: true });
    target.constructor = { prototype: { [`ctor${index}`]: true } };
    target.prototype = { [`proto${index}`]: true };
  }
  const { integrity, ...body } = raw;
  const bytes = new TextEncoder().encode(model.stableStringify(body));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  raw.integrity.value = [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");

  const parsed = await profile.parseProfilePackage(JSON.stringify(raw));
  const normalizedNodes = [
    parsed,
    parsed.state,
    parsed.state.spaces,
    parsed.state.spaces.personal,
    parsed.state.spaces.personal.settings,
    parsed.state.spaces.personal.shortcuts[0],
    parsed.state.spaces.personal.shortcuts[1],
    parsed.state.spaces.personal.shortcuts[1].items[0]
  ];
  for (const node of normalizedNodes) {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      assert.equal(Object.hasOwn(node, key), false, `${key} survived on a normalized node`);
    }
  }
  for (let index = 0; index < targets.length; index += 1) {
    assert.equal(Object.prototype[`polluted${index}`], undefined);
    assert.equal(Object.prototype[`ctor${index}`], undefined);
    assert.equal(Object.prototype[`proto${index}`], undefined);
  }
});
