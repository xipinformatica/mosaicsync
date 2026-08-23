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

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.7 ${browser} Frequently Visited missing permission keeps intent ON and exposes recovery action`, async () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const button = { hidden: true, textContent: "" };
    const statuses = [];
    const rendered = [];
    const ctx = {
      frequentlyVisitedPermissionButton: button,
      frequentlyVisitedStatus: { textContent: "" },
      frequentlyVisitedStatusKey: "",
      frequentlyVisitedEnabled: true,
      frequentRefreshGeneration: 0,
      hasTopSitesPermission: async () => false,
      renderFrequentlyVisited: sites => rendered.push(sites),
      updateFrequentRenderSnapshot: () => {},
      t: key => key,
      console
    };
    vm.createContext(ctx);
    vm.runInContext(`
      ${extract(src, "setFrequentlyVisitedStatus")}
      ${extract(src, "setFrequentlyVisitedPermissionActionVisible")}
      ${extract(src, "refreshFrequentlyVisited")}
    `, ctx);
    await ctx.refreshFrequentlyVisited();
    assert.equal(ctx.frequentlyVisitedEnabled, true, "refresh must never silently turn the remembered preference off");
    assert.equal(button.hidden, false, "missing permission must reveal direct recovery action");
    assert.equal(button.textContent, "grantFrequentlyVisitedPermission");
    assert.equal(ctx.frequentlyVisitedStatus.textContent, "frequentPermissionRequired");
    assert.equal(rendered.length, 1);
    assert.equal(Array.isArray(rendered[0]), true);
    assert.equal(rendered[0].length, 0);
  });

  test(`1.26.17.7 ${browser} Frequently Visited automatically hides recovery action once permission is available`, async () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const button = { hidden: false, textContent: "" };
    const ctx = {
      frequentlyVisitedPermissionButton: button,
      frequentlyVisitedStatus: { textContent: "" },
      frequentlyVisitedStatusKey: "",
      frequentlyVisitedEnabled: true,
      frequentRefreshGeneration: 0,
      hasTopSitesPermission: async () => true,
      state: { spaces: { personal: { shortcuts: [] }, work: { shortcuts: [] } } },
      stateMutationGeneration: 1,
      frequentExplicitHostsForState: () => new Set(),
      frequentCandidates: async () => [],
      canonicalSiteHost: () => "",
      isFrequentHostHidden: () => false,
      frequentlyVisitedCount: 5,
      renderFrequentlyVisited: () => {},
      updateFrequentRenderSnapshot: () => {},
      frequentRenderSnapshot: null,
      t: key => key,
      console
    };
    vm.createContext(ctx);
    vm.runInContext(`
      ${extract(src, "setFrequentlyVisitedStatus")}
      ${extract(src, "setFrequentlyVisitedPermissionActionVisible")}
      ${extract(src, "refreshFrequentlyVisited")}
    `, ctx);
    await ctx.refreshFrequentlyVisited();
    assert.equal(button.hidden, true);
    assert.equal(ctx.frequentlyVisitedStatus.textContent, "frequentDeviceLocalStatus");
  });

  test(`1.26.17.7 ${browser} permission recovery is user-gesture driven and permission events self-heal the feature`, () => {
    const src = fs.readFileSync(`src/${browser}/newtab/newtab.js`, "utf8");
    const html = fs.readFileSync(`src/${browser}/newtab/newtab.html`, "utf8");
    assert.match(html, /id="frequentlyVisitedPermissionButton"[^>]*type="button"[^>]*hidden/);
    assert.match(src, /frequentlyVisitedPermissionButton\?\.addEventListener\("click", \(\) => \{[\s\S]*?const permissionPromise = requestTopSitesPermissionFromGesture\(\);[\s\S]*?void \(async \(\) => \{/);
    assert.match(src, /writeFrequentlyVisitedPreference\(true\);[\s\S]*?requestTopSitesPermissionFromGesture\(\)/, "turning the feature on must remember intent before permission result");
    assert.match(src, /scheduleFrequentlyVisitedPermissionReconciliation\(\);/);
    assert.match(src, /browser\.permissions\?\.onRemoved[\s\S]*?if \(frequentlyVisitedEnabled\) scheduleFrequentlyVisitedRefresh\(0\);/);
    assert.match(src, /browser\.permissions\?\.onAdded[\s\S]*?scheduleFrequentlyVisitedRefresh\(0\);/);
    assert.match(src, /writeFrequentlyVisitedPreference\(parsed\.preferences\.frequentlyVisitedEnabled\);/);
    assert.doesNotMatch(src, /writeFrequentlyVisitedPreference\(parsed\.preferences\.frequentlyVisitedEnabled\s*&&\s*hasTopSites\)/);
  });
}

test("1.26.17.7 first-run profile import preserves Frequently Visited intent independently of Top Sites permission", () => {
  const src = fs.readFileSync("src/shared/welcome/welcome.js", "utf8");
  assert.match(src, /parsed\.preferences\.frequentlyVisitedEnabled \? "1" : "0"/);
  assert.doesNotMatch(src, /frequentlyVisitedEnabled\s*&&\s*hasTopSites/);
});
