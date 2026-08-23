import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

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

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.15 ${browser} favicon discovery enumerates both Spaces`, () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const ctx = { PERSONAL_SPACE_ID: "personal", WORK_SPACE_ID: "work" };
    vm.createContext(ctx);
    vm.runInContext(extract(src, "flattenShortcuts"), ctx);
    const result = ctx.flattenShortcuts({
      activeSpaceId: "personal",
      shortcuts: [{ type: "shortcut", id: "active-projection", url: "https://wrong.example/" }],
      spaces: {
        personal: { shortcuts: [{ type: "shortcut", id: "p", url: "https://p.example/" }] },
        work: { shortcuts: [{ type: "folder", id: "f", items: [{ type: "shortcut", id: "w", url: "https://w.example/" }] }] }
      }
    });
    assert.deepEqual(Array.from(result, item => item.id), ["p", "w"]);
  });

  test(`1.26.15 ${browser} shortcut save repairs missing Website Access instead of trusting old prompt state`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(src, /const shouldRequestWebAccess = state\.settings\.autoSiteIcons\s*&&\s*!pendingShortcutImage && !webAccessGranted;/);
    assert.doesNotMatch(src, /const shouldRequestWebAccess =[^;]+webAccessPrompted/s);
    assert.match(src, /requestMissingSiteIcons\(\[savedShortcutId\], \{ force: true \}\)/);
  });

  test(`1.26.15 ${browser} Automatic site icons requests Website Access when enabled`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const start = src.indexOf('settingsAutoSiteIcons?.addEventListener("change"');
    const end = src.indexOf('webAccessPromptAllow?.addEventListener', start);
    assert.ok(start >= 0 && end > start);
    const block = src.slice(start, end);
    assert.match(block, /requestWebAccessFromGesture\(\)/);
    assert.match(block, /enabled = webAccessGranted/);
    assert.match(block, /requestMissingSiteIcons\(\[\], \{ force: true \}\)/);
  });

  test(`1.26.15 ${browser} stale webAccessPrompted cannot suppress the capability warning`, () => {
    const src = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    const fn = extract(src, "maybeShowWebAccessPrompt");
    assert.match(fn, /if \(!webAccessPrompt \|\| state\.settings\.autoSiteIcons === false \|\| !hasShortcutNeedingWebAccess\(\)\)/);
    assert.match(fn, /hasWebAccess\(\)/);
  });

  test(`1.26.15 ${browser} permission-blocked recovery is not burned as a website retry failure`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = extract(src, "processIconRecoveryQueue");
    let queue = { version: 1, items: [{ id: "s", url: "https://example.test/", attempts: 2, nextAttemptAt: 0, qualityUpgrade: false }] };
    let storedQueue = null;
    let status = null;
    let alarmClears = 0;
    let alarmSchedules = 0;
    const ctx = {
      console,
      Date,
      Set,
      Map,
      iconRecoveryRun: null,
      ICON_RECOVERY_CONCURRENCY: 3,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8000,
      ICON_RECOVERY_ALARM: "favicon",
      ICON_RECOVERY_QUEUE_VERSION: 1,
      ICON_RECOVERY_EXHAUSTED_RETRY_MS: 24 * 60 * 60 * 1000,
      devMark: () => {},
      devMeasure: () => {},
      readIconRecoveryQueue: async () => queue,
      ensureLocalStorage: async () => ({ state: {} }),
      pruneIconRecoveryQueueAgainstState: async value => value,
      scheduleIconRecoveryAlarm: async () => { alarmSchedules += 1; },
      hasWebAccess: async () => false,
      platformHasPermissionFreeFaviconSource: () => browser === "chrome",
      resolveFaviconForUrl: async () => ({ image: "", reason: "permission", provisional: false }),
      enqueue: async fn => fn(),
      applyProactiveFaviconResults: async () => ({ appliedIds: new Set(), unchangedIds: new Set() }),
      writeIconRecoveryQueue: async value => {
        storedQueue = value;
        queue = value;
        return value;
      },
      iconRecoveryItemStillRelevantInState: () => true,
      writeIconRecoveryStatus: async value => { status = value; },
      nextIconRecoveryQualityRetry: item => ({ exhausted: false, item }),
      nextIconRecoveryFailure: () => { throw new Error("permission must not consume retry budget"); },
      scheduleImmediateIconRecoveryContinuation: () => { throw new Error("permission-blocked queue must not spin"); },
      browser: { alarms: { clear: async () => { alarmClears += 1; } } }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.processIconRecoveryQueue();
    assert.equal(result.granted, false);
    assert.equal(result.blockedByPermission, 1);
    assert.equal(result.failed, 0);
    assert.equal(storedQueue.items[0].attempts, 2);
    assert.equal(storedQueue.items[0].lastReason, "permission");
    assert.ok(storedQueue.items[0].lastAttemptAt > 0);
    assert.equal(status.blockedByPermission, 1);
    if (browser === "chrome") {
      assert.ok(storedQueue.items[0].nextAttemptAt > Date.now() + 60 * 60 * 1000, "Chrome native retry should be bounded rather than immediately due");
      assert.ok(alarmSchedules >= 1);
      assert.equal(alarmClears, 0);
    } else {
      assert.ok(alarmClears >= 1);
    }
  });
}

test("1.26.15 Chrome resolver reaches local favicon cache before Website Access gate", () => {
  const src = fs.readFileSync("dist/chrome/background/background.js", "utf8");
  const start = src.indexOf("async function resolveFaviconForUrl");
  const end = src.indexOf("function flattenShortcuts", start);
  const block = src.slice(start, end);
  const nativeAt = block.indexOf("const native = await resolveBrowserCachedFavicon(pageUrl)");
  const permissionAt = block.indexOf("const webAccess = await hasWebAccess()");
  assert.ok(nativeAt >= 0 && permissionAt > nativeAt);
  assert.match(block, /if \(!webAccess\) \{/);
});

test("1.26.15 Firefox proactive network resolver still requires Website Access", () => {
  const src = fs.readFileSync("dist/firefox/background/background.js", "utf8");
  const start = src.indexOf("async function resolveFaviconForUrl");
  const end = src.indexOf("function flattenShortcuts", start);
  const block = src.slice(start, end);
  assert.match(block, /if \(!\(await hasWebAccess\(\)\)\) return \{ image: "", sourceUrl: "", reason: "permission"/);
});
