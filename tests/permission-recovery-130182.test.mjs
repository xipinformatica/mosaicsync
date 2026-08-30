import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}(`);
  if (start < 0) start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{", start);
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

function classList() {
  const set = new Set();
  return {
    toggle(name, force) { if (force) set.add(name); else set.delete(name); },
    contains(name) { return set.has(name); }
  };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30.18.2 ${browser} missing Top Sites permission exposes launcher recovery without changing synchronized intent`, async () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const recovery = { hidden: true };
    const recoveryText = { textContent: "" };
    const recoveryButton = { textContent: "", disabled: false };
    const settingsButton = { hidden: true, textContent: "" };
    const section = { hidden: true, inert: true };
    const list = { children: [1], replaceChildren() { this.children = []; } };
    const options = { classList: classList() };
    const root = { dataset: { bootFrequent: "true" } };
    const rendered = [];
    const ctx = {
      frequentlyVisitedEnabled: true,
      frequentlyVisitedCount: 5,
      frequentRefreshGeneration: 0,
      frequentlyVisitedStatusKey: "",
      frequentlyVisitedStatus: { textContent: "" },
      frequentlyVisitedPermissionButton: settingsButton,
      frequentPermissionRecovery: recovery,
      frequentPermissionRecoveryText: recoveryText,
      frequentPermissionRecoveryButton: recoveryButton,
      frequentSitesSection: section,
      frequentSitesList: list,
      frequentOptions: options,
      document: { documentElement: root },
      hasTopSitesPermission: async () => false,
      // Deliberately omit requestTopSitesPermissionFromGesture: startup refresh must never prompt automatically.
      renderFrequentlyVisited: sites => { rendered.push(sites); section.hidden = true; section.inert = false; },
      updateFrequentRenderSnapshot: () => {},
      t: key => key,
      console
    };
    vm.createContext(ctx);
    vm.runInContext(`
      ${extract(src, "setFrequentlyVisitedStatus")}
      ${extract(src, "setFrequentlyVisitedPermissionActionVisible")}
      ${extract(src, "setFrequentlyVisitedPermissionRecoveryVisible")}
      ${extract(src, "refreshFrequentlyVisited")}
    `, ctx);
    await ctx.refreshFrequentlyVisited();
    assert.equal(ctx.frequentlyVisitedEnabled, true, "remembered synchronized intent must stay ON");
    assert.equal(settingsButton.hidden, false, "Settings must retain its recovery action");
    assert.equal(recovery.hidden, false, "launcher must expose a visible recovery state");
    assert.equal(recoveryText.textContent, "frequentPermissionRequired");
    assert.equal(recoveryButton.textContent, "grantFrequentlyVisitedPermission");
    assert.equal(section.hidden, false, "Frequently Visited area must remain visible for the recovery state");
    assert.equal(section.inert, false, "the live recovery button must be actionable after permission status is authoritatively known");
    assert.equal(list.children.length, 0, "stale cached frequent cards must be removed");
    assert.equal(root.dataset.bootFrequent, undefined);
    assert.equal(options.classList.contains("permission-required"), true, "Settings should visually emphasize the missing prerequisite");
    assert.equal(rendered.length, 1);
  });

  test(`1.30.18.2 ${browser} available Top Sites permission hides recovery and renders normally`, async () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const recovery = { hidden: false };
    const settingsButton = { hidden: false, textContent: "" };
    const options = { classList: classList() };
    options.classList.toggle("permission-required", true);
    const rendered = [];
    const ctx = {
      frequentlyVisitedEnabled: true,
      frequentlyVisitedCount: 5,
      frequentRefreshGeneration: 0,
      frequentlyVisitedStatusKey: "",
      frequentlyVisitedStatus: { textContent: "" },
      frequentlyVisitedPermissionButton: settingsButton,
      frequentPermissionRecovery: recovery,
      frequentPermissionRecoveryText: { textContent: "" },
      frequentPermissionRecoveryButton: { textContent: "" },
      frequentSitesSection: { hidden: true, inert: false },
      frequentSitesList: { replaceChildren() {} },
      frequentOptions: options,
      document: { documentElement: { dataset: {} } },
      hasTopSitesPermission: async () => true,
      state: { spaces: { personal: { shortcuts: [] }, work: { shortcuts: [] } } },
      stateMutationGeneration: 1,
      frequentExplicitHostsForState: () => new Set(),
      frequentCandidates: async () => [{ title: "Example", url: "https://example.com/" }],
      canonicalSiteHost: url => new URL(url).hostname,
      isFrequentHostHidden: () => false,
      renderFrequentlyVisited: sites => rendered.push(sites),
      updateFrequentRenderSnapshot: () => {},
      frequentRenderSnapshot: null,
      t: key => key,
      URL,
      console
    };
    vm.createContext(ctx);
    vm.runInContext(`
      ${extract(src, "setFrequentlyVisitedStatus")}
      ${extract(src, "setFrequentlyVisitedPermissionActionVisible")}
      ${extract(src, "setFrequentlyVisitedPermissionRecoveryVisible")}
      ${extract(src, "refreshFrequentlyVisited")}
    `, ctx);
    await ctx.refreshFrequentlyVisited();
    assert.equal(recovery.hidden, true);
    assert.equal(settingsButton.hidden, true);
    assert.equal(options.classList.contains("permission-required"), false);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0].length, 1);
    assert.equal(ctx.frequentlyVisitedStatus.textContent, "frequentDeviceLocalStatus");
  });

  test(`1.30.18.2 ${browser} launcher recovery click requests permission synchronously and restores sites without OFF/ON toggle`, async () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    let requestCount = 0;
    let resolvePermission;
    const permission = new Promise(resolve => { resolvePermission = resolve; });
    const button = { disabled: false };
    let refreshCount = 0;
    const ctx = {
      frequentlyVisitedEnabled: true,
      frequentlyVisitedCount: 5,
      settingsFrequentlyVisited: { checked: true },
      frequentCandidateCacheAt: 123,
      frequentCandidateCache: [1],
      requestTopSitesPermissionFromGesture: () => { requestCount += 1; return permission; },
      persistFrequentlyVisitedPreference: async () => { throw new Error("must not rewrite already-ON intent"); },
      setFrequentlyVisitedOptionsVisibility: () => {},
      setFrequentlyVisitedPermissionActionVisible: () => {},
      setFrequentlyVisitedPermissionRecoveryVisible: () => {},
      setFrequentlyVisitedStatus: () => {},
      refreshFrequentlyVisited: async () => { refreshCount += 1; },
      console
    };
    vm.createContext(ctx);
    vm.runInContext(extract(src, "requestFrequentlyVisitedPermissionRecoveryFromGesture"), ctx);
    ctx.requestFrequentlyVisitedPermissionRecoveryFromGesture(button);
    assert.equal(requestCount, 1, "permission request must start in the same user-gesture call stack");
    assert.equal(button.disabled, true);
    resolvePermission(true);
    await permission;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshCount, 1);
    assert.equal(ctx.frequentCandidateCacheAt, 0);
    assert.equal(ctx.frequentCandidateCache.length, 0);
    assert.equal(button.disabled, false);
    assert.equal(ctx.settingsFrequentlyVisited.checked, true);
  });

  test(`1.30.18.2 ${browser} launcher contains localized one-click permission recovery surface`, () => {
    const html = fs.readFileSync(`src/${browser}/newtab/newtab.html`, "utf8");
    const src = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
    assert.match(html, /id="frequentPermissionRecovery"[^>]*hidden/);
    assert.match(html, /id="frequentPermissionRecoveryButton"[^>]*type="button"/);
    assert.match(src, /frequentPermissionRecoveryText\.textContent = t\("frequentPermissionRequired"\)/);
    assert.match(src, /frequentPermissionRecoveryButton\.textContent = t\("grantFrequentlyVisitedPermission"\)/);
  });
}
