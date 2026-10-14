// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(join(root, 'src/shared/newtab/newtab.js'), 'utf8');
const background = readFileSync(join(root, 'src/shared/background/background-core.js'), 'utf8');
const uiStart = source.indexOf('  function updateSyncUi(');
const uiEnd = source.indexOf('  async function refreshSyncStatus()', uiStart);
assert.ok(uiStart >= 0 && uiEnd > uiStart);
const uiFunction = source.slice(uiStart, uiEnd);

function renderStatus({syncStatus = 'waiting', syncInitialized = true, lastSyncWarning = ''} = {}) {
  const headline = {textContent: ''};
  const detail = {textContent: ''};
  const dot = {classes: [], classList: {remove(){}, add(value){dot.classes.push(value);}}};
  const EN = {syncWaitingForPeer: 'Waiting for another device', syncWaitingForPeerDetail: 'Waiting for changes from another device before safely completing Sync.', syncReady: 'Sync is ready', changesPublishAuto: 'Changes publish automatically.'};
  const ctx = {
    meta: {}, lastSyncStatus: null,
    normalizeMeta: x => x,
    syncStoragePressure: () => 'normal', syncLimitationKinds: () => ({artwork:false,recovery:false}),
    isSyncQuotaErrorText: () => false,
    syncWarningDescription: m => m.lastSyncWarning || '',
    t: key => EN[key] || key,
    formatBytes: x => String(x),
    SYNC_QUOTA_BYTES: 102400,
    syncStatusText: headline, syncStatusDetail: detail, syncStatusDot: dot,
    syncQuotaText: {textContent:'', title:''},
    sendToSyncButton: {}, restoreSyncButton: {}, clearSyncButton: {},
    settingsDeviceNameText: null, syncSourceText: null, syncSourceDetail: null,
    settingsSyncEnabled: null, syncSetupCard: null, syncSetupDetail: null,
    useSyncedCopyButton: null, useThisDeviceButton: null,
    syncUsageCore: null, syncUsageRecovery: null, recoveryCopiesManageButton: null,
    syncUsageShortcuts: null, syncUsageOverhead: null, syncUsageFree: null,
    syncStorageBreakdown: null, syncRevisionText: null,
    syncReadyHeadlineKey: () => 'syncReady',
  };
  runInNewContext(uiFunction + '\nglobalThis.render=updateSyncUi;', ctx);
  ctx.render({syncEnabled:true, syncInitialized, syncStatus, syncBootstrapMode:'none', lastSyncWarning, syncBytesInUse:0});
  return {headline: headline.textContent, detail: detail.textContent, classes:dot.classes};
}

test('Stage 2E: initialized waiting status never says Sync ready, even with an empty warning', () => {
  const rendered = renderStatus();
  assert.equal(rendered.headline, 'Waiting for another device');
  assert.equal(rendered.detail, 'Waiting for changes from another device before safely completing Sync.');
  assert.ok(rendered.classes.includes('waiting'));
});

test('Stage 2E: waiting retains specific explanation; ready remains ready', () => {
  const waiting = renderStatus({lastSyncWarning:'Still delivering the remote layout.'});
  assert.equal(waiting.headline, 'Waiting for another device');
  assert.equal(waiting.detail, 'Still delivering the remote layout.');
  const ready = renderStatus({syncStatus:'ready'});
  assert.equal(ready.headline, 'Sync is ready');
});

test('Stage 2E: final per-Space pending write restores waiting warning after healthy Space clears it', () => {
  const start = background.indexOf('      if (anySpacePending) {');
  const end = background.indexOf('      return work?.ok ?', start);
  assert.ok(start > 0 && end > start);
  const branch = background.slice(start, end);
  assert.match(branch, /syncStatus: "waiting"/);
  assert.match(branch, /lastSyncWarning: "Waiting for changes from another device before safely completing Sync\."/);
  assert.match(branch, /personal\.pending \? \(personal\.reason/);
  assert.match(branch, /workLedgerPending: Boolean\(work\.sharedLedgerPending\)/);
});

test('Stage 2E: both waiting strings have localized catalog entries in all 34 supported languages', async () => {
  const files = readdirSync(join(root, 'src/shared/core/i18n-locales')).filter(f => f.endsWith('.js'));
  assert.equal(files.length, 34);
  const en = (await import('../src/shared/core/i18n-locales/en.js')).MESSAGES;
  assert.equal(en.syncWaitingForPeerDetail, 'Waiting for changes from another device before safely completing Sync.');
  const translated = new Set();
  for (const file of files) {
    const {MESSAGES} = await import(`../src/shared/core/i18n-locales/${file}`);
    for (const key of ['syncWaitingForPeer', 'syncWaitingForPeerDetail']) {
      assert.ok(typeof MESSAGES[key] === 'string' && [...MESSAGES[key].trim()].length >= 4, `${file}:${key}`);
      if (file !== 'en.js') assert.notEqual(MESSAGES[key], en[key], `${file}:${key} must be localized`);
    }
    translated.add(MESSAGES.syncWaitingForPeer);
  }
  assert.ok(translated.size >= 30);
});

test('Stage 2E: persisted English waiting warning is translated for Catalan, Spanish and Italian', async () => {
  const {setLocalePreference, translateText} = await import('../src/shared/core/i18n.js');
  const previousStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v)};
  try {
    const sourceText = 'Waiting for changes from another device before safely completing Sync.';
    for (const locale of ['ca','es','it']) {
      await setLocalePreference(locale);
      const {MESSAGES} = await import(`../src/shared/core/i18n-locales/${locale}.js`);
      assert.equal(translateText(sourceText), MESSAGES.syncWaitingForPeerDetail);
      assert.notEqual(translateText(sourceText), sourceText);
    }
  } finally {
    await setLocalePreference('en');
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('Stage 2E: retired Personal author retains waiting explanation while healthy Work converges', {timeout: 90000}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'mosaicsync65-status-'));
  try {
    const out = join(dir, 'status.jsonl');
    const run = spawnSync(process.execPath, ['tests/s2d-64-cross-space-scenarios.mjs', 'firefox', 'server-wins', 'RETP', '64,64,64'], {
      cwd:root, env:{...process.env, R64:root, OUT:out}, encoding:'utf8', timeout:75000
    });
    assert.equal(run.status, 0, run.stderr + '\n' + run.stdout);
    const results = JSON.parse(readFileSync(out, 'utf8').trim()).out;
    const pending = results.find(x => x.tag === 'Personal blocked by retired device');
    const healthy = results.find(x => x.tag === 'Work must converge while Personal waits');
    assert.ok(pending && healthy, run.stdout);
    assert.equal(pending.ledger.coherent, false);
    assert.equal(healthy.ledger.coherent, true);
    for (const view of Object.values(healthy.views)) {
      assert.equal(view.status, 'waiting');
      assert.equal(view.warn, 'Waiting for changes from another device before safely completing Sync.');
      assert.ok(view.items.some(x => x.startsWith('x-b')), 'healthy Work must converge');
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
