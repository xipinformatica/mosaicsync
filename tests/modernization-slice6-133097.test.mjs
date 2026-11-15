// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const helperName = 'refreshFrequentlyVisitedAfterPermissionGrant';

function extractHelper() {
  const start = src.indexOf(`function ${helperName}()`);
  assert.ok(start !== -1, 'permission success must have one shared implementation');
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail('unterminated helper');
}

test('Slice 6: granted Top Sites permission clears both prompts and stale candidate cache exactly once', async () => {
  const events = [];
  const context = vm.createContext({
    frequentCandidateCacheAt: 12345,
    frequentCandidateCache: ['stale'],
    setFrequentlyVisitedPermissionActionVisible(value) { events.push(['action', value]); },
    setFrequentlyVisitedPermissionRecoveryVisible(value) { events.push(['recovery', value]); },
    async refreshFrequentlyVisited() { events.push(['refresh']); }
  });
  vm.runInContext(`${extractHelper()}\nglobalThis.granted = ${helperName};`, context);
  await context.granted();
  assert.equal(context.frequentCandidateCacheAt, 0);
  assert.equal(context.frequentCandidateCache.length, 0);
  assert.deepEqual(events, [['action', false], ['recovery', false], ['refresh']]);
});

test('Slice 6: all three granted entry points share the same follow-up, preserving distinct denial paths', () => {
  extractHelper();
  const start = src.indexOf('settingsFrequentlyVisited?.addEventListener("change"');
  const recovery = src.indexOf('function requestFrequentlyVisitedPermissionRecoveryFromGesture');
  const dialog = src.indexOf('frequentSyncPermissionGrant?.addEventListener("click"');
  const end = src.indexOf('frequentSyncPermissionContinue?.addEventListener("click"');
  assert.ok(start >= 0 && start < recovery && recovery < dialog && dialog < end);
  for (const segment of [src.slice(start, recovery), src.slice(recovery, dialog), src.slice(dialog, end)]) {
    assert.match(segment, /await refreshFrequentlyVisitedAfterPermissionGrant\(\);/);
    assert.equal((segment.match(/await refreshFrequentlyVisitedAfterPermissionGrant\(\);/g) || []).length, 1);
    assert.match(segment, /requestTopSitesPermissionFromGesture\(\)/, 'permission request remains in its original gesture handler');
    assert.match(segment, /if \(!granted\)/, 'denied permission retains its separate behavior');
  }
});

test('Slice 6: a refresh failure still rejects to the existing per-handler catch path', async () => {
  const context = vm.createContext({
    frequentCandidateCacheAt: 12,
    frequentCandidateCache: ['old'],
    setFrequentlyVisitedPermissionActionVisible() {},
    setFrequentlyVisitedPermissionRecoveryVisible() {},
    async refreshFrequentlyVisited() { throw new Error('discovery unavailable'); }
  });
  vm.runInContext(`${extractHelper()}\nglobalThis.granted = ${helperName};`, context);
  await assert.rejects(() => context.granted(), /discovery unavailable/);
});

function extractWebsiteHelper() {
  const name = 'scheduleGrantedWebsiteAccessRefresh';
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, 'granted Website Access follow-up must have one shared implementation');
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail('unterminated website helper');
}

test('Slice 6: all Website Access successes schedule the same bounded favicon refresh', async () => {
  const tasks = [], events = [];
  const ctx = vm.createContext({
    state: { settings: { autoSiteIcons: false } },
    scheduleIdleWork(fn, delay) { tasks.push({ fn, delay }); },
    async hydrateRemoteImageSources() { events.push('remote'); },
    async hydrateDeviceFavicons() { events.push('favicon'); },
    requestMissingSiteIcons(ids, flags) { events.push(['missing', ids.length, flags.force]); }
  });
  vm.runInContext(`${extractWebsiteHelper()}\nglobalThis.scheduled = scheduleGrantedWebsiteAccessRefresh;`, ctx);
  ctx.scheduled();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].delay, 100);
  await tasks.shift().fn();
  assert.deepEqual(events, ['remote', 'favicon', ['missing', 0, true]]);
  events.length = 0;
  ctx.scheduled(true); // The Settings button refreshes icons only if automatic icons remain enabled.
  await tasks.shift().fn();
  assert.deepEqual(events, ['remote', 'favicon']);
  events.length = 0;
  ctx.state.settings.autoSiteIcons = true;
  ctx.scheduled(true);
  await tasks.shift().fn();
  assert.deepEqual(events, ['remote', 'favicon', ['missing', 0, true]]);
});

test('Slice 6: Website Access handlers share post-grant work without moving permission requests', () => {
  extractWebsiteHelper();
  const positions = [
    src.indexOf('settingsAutoSiteIcons?.addEventListener("change"'),
    src.indexOf('webAccessPromptAllow?.addEventListener("click"'),
    src.indexOf('settingsWebAccessButton?.addEventListener("click"'),
    src.indexOf('browser.permissions?.onRemoved?.addListener?')
  ];
  assert.ok(positions.every(x => x >= 0) && positions.every((x, i) => i === 0 || x > positions[i - 1]));
  const segments = positions.slice(0, -1).map((start, i) => src.slice(start, positions[i + 1]));
  assert.match(segments[0], /scheduleGrantedWebsiteAccessRefresh\(\)/);
  assert.match(segments[1], /scheduleGrantedWebsiteAccessRefresh\(\)/);
  assert.match(segments[2], /scheduleGrantedWebsiteAccessRefresh\(true\)/);
  for (const segment of segments) {
    assert.doesNotMatch(segment, /scheduleIdleWork\(async \(\) => \{\s*await hydrateRemoteImageSources\(/);
    assert.match(segment, /requestWebAccessFromGesture\(\)/, 'permission request must remain on the click stack');
  }
});
