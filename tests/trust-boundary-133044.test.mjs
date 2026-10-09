import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ERROR_CODES, localStorageWriteError } from '../src/shared/core/errors.js';

const newtab = fs.readFileSync('src/shared/newtab/newtab.js', 'utf8');
const welcome = fs.readFileSync('src/shared/welcome/welcome.js', 'utf8');
const quota = () => localStorageWriteError(Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' }));
const writeFailure = () => localStorageWriteError(new Error('I/O problem'));
const nextTick = () => new Promise(resolve => setImmediate(resolve));
const extract = (source, from, until) => {
  const start = source.indexOf(from);
  const end = source.indexOf(until, start + from.length);
  assert.ok(start >= 0 && end > start, `must find live listener: ${from}`);
  return source.slice(start, end);
};

async function frequencyCount(error) {
  let handler;
  const messages = [];
  const control = {value:'8', addEventListener: (event, fn) => { if (event === 'change') handler = fn; }};
  const ctx = vm.createContext({
    settingsFrequentlyVisitedCount: control,
    frequentlyVisitedCount: 5,
    persistFrequentlyVisitedPreference: async () => {throw error;},
    presentLocalPersistenceError: err => { err.message = err.code === ERROR_CODES.STORAGE_LOCAL_QUOTA_EXCEEDED ? 'Localized storage-full advice' : 'Localized save-failure advice'; return err; },
    showToast: message => messages.push(message),
    t: key => `Fallback:${key}`,
    scheduleFrequentlyVisitedRefresh() {}
  });
  vm.runInContext(extract(newtab, '  settingsFrequentlyVisitedCount?.addEventListener("change"', '  settingsThemeWallpapers?.addEventListener'), ctx);
  handler();
  await nextTick();
  return {messages, control, ctx};
}

test('.44 Frequently Visited count quota error shows localized advice and restores control value', async () => {
  const {messages, control} = await frequencyCount(quota());
  assert.deepEqual(messages, ['Localized storage-full advice']);
  assert.equal(control.value, '5');
});

test('.44 Frequently Visited count non-quota write failure also uses the localized diagnostic', async () => {
  const {messages, control} = await frequencyCount(writeFailure());
  assert.deepEqual(messages, ['Localized save-failure advice']);
  assert.equal(control.value, '5');
});

async function frequencySwitch(error, wantsEnabled) {
  let handler;
  const messages = [];
  const checkbox = {checked: wantsEnabled, addEventListener: (event, fn) => { if (event === 'change') handler = fn; }};
  const ctx = vm.createContext({
    settingsFrequentlyVisited: checkbox, state: {}, frequentlyVisitedEnabled: !wantsEnabled,
    markFrequentlyVisitedPermissionPrompted() {}, clearFrequentlyVisitedPermissionPrompted() {},
    requestTopSitesPermissionFromGesture: () => Promise.resolve(true),
    persistFrequentlyVisitedPreference: async () => {throw error;},
    presentLocalPersistenceError: err => { err.message = err.code === ERROR_CODES.STORAGE_LOCAL_QUOTA_EXCEEDED ? 'Localized storage-full advice' : 'Localized save-failure advice'; return err; },
    syncFrequentlyVisitedLocalsFromState() {},
    setFrequentlyVisitedOptionsVisibility() {}, setFrequentlyVisitedPermissionActionVisible() {},
    updateFrequentRenderSnapshot() {}, setFrequentlyVisitedStatus() {},
    showToast: message => messages.push(message), t: key => `Fallback:${key}`
  });
  vm.runInContext(extract(newtab, '  settingsFrequentlyVisited?.addEventListener("change"', '  function requestFrequentlyVisitedPermissionRecoveryFromGesture'), ctx);
  handler();
  await nextTick();
  return {messages, checkbox};
}

test('.44 Frequently Visited on/off failures are localized in both directions', async () => {
  for (const wantsEnabled of [true, false]) {
    const {messages, checkbox} = await frequencySwitch(quota(), wantsEnabled);
    assert.deepEqual(messages, ['Localized storage-full advice']);
    assert.equal(checkbox.checked, !wantsEnabled);
  }
});

test('.44 Frequently Visited on/off non-quota write failure does not leak a raw browser error', async () => {
  const {messages} = await frequencySwitch(writeFailure(), true);
  assert.deepEqual(messages, ['Localized save-failure advice']);
});

// Execute the original New Tab error branch from its real import event handler.
// This lets us exercise the error precedence without mirroring the business logic.
async function newtabImportMessage(error) {
  const listener = extract(newtab, '  importProfileFile?.addEventListener("change"', '  settingsRunSetup?.addEventListener');
  const from = listener.lastIndexOf('    } catch (error) {');
  assert.ok(from >= 0);
  const section = listener.slice(from, listener.lastIndexOf('  });')).replace(/^\s*} catch/, "catch");
  const messages = [];
  const ctx = vm.createContext({
    error, console: {error() {}}, showToast: value => messages.push(value),
    t: key => `Localized:${key}`,
    ERROR_CODES, isQuotaExceededError: err => /quota/i.test(err?.message || ''),
  });
  vm.runInContext(`async function exercise(){try{throw error;} ${section}}`, ctx);
  await ctx.exercise();
  return messages;
}

test('.44 New Tab import quota gives dedicated localized retry advice, not generic import failure', async () => {
  assert.deepEqual(await newtabImportMessage(quota()), ['Localized:profileImportStorageFull']);
  assert.deepEqual(await newtabImportMessage(Object.assign(new Error('quota exceeded'), {name:'QuotaExceededError'})), ['Localized:profileImportStorageFull']);
});

test('.44 New Tab import preserves specific precedence for stale baseline, oversize and publish failure', async () => {
  assert.deepEqual(await newtabImportMessage(Object.assign(Error('conflict'), {code:'PROFILE_IMPORT_STALE_BASELINE'})), ['Localized:profileImportChangedRetry']);
  assert.deepEqual(await newtabImportMessage(Object.assign(Error('oversize'), {code:'PROFILE_TOO_LARGE'})), ['Localized:profileImportTooLarge']);
  assert.deepEqual(await newtabImportMessage(Error('PROFILE_SYNC_PUBLISH_FAILED')), ['Localized:profilePublishFailed']);
  assert.deepEqual(await newtabImportMessage(writeFailure()), ['Localized:profileImportFailed']);
});

test('.44 Welcome import rejects storage-full errors with the same specific advice, while retaining validation errors', async () => {
  const listener = extract(welcome, 'welcomeProfileFile?.addEventListener("change"', 'chooseLocalButton.addEventListener');
  const from = listener.indexOf('    } catch (error) {');
  const till = listener.indexOf('\n    try {', from);
  assert.ok(from >= 0 && till > from);
  const catchBranch = listener.slice(from, till).replace(/^\s*} catch/, "catch");
  const run = async error => {
    const statuses = [];
    const ctx = vm.createContext({ error, console: {error() {}}, sourceFinishButton: {disabled:true},
      t: key => `Localized:${key}`, setStatus: (...args) => statuses.push(args),
      ERROR_CODES, isQuotaExceededError: err => /quota/i.test(err?.message || ''),
    });
    vm.runInContext(`async function exercise(){try{throw error;} ${catchBranch}}`, ctx);
    await ctx.exercise();
    assert.equal(ctx.sourceFinishButton.disabled, false);
    return statuses;
  };
  assert.deepEqual(await run(quota()), [['Localized:profileImportStorageFull', 'error']]);
  assert.deepEqual(await run(Object.assign(Error('oversize'), {code:'PROFILE_TOO_LARGE'})), [['Localized:profileImportTooLarge', 'error']]);
  assert.deepEqual(await run(Error('broken profile')), [['Localized:profileImportFailed', 'error']]);
});

test('.44 every supported UI locale has a non-placeholder storage-full import message', async () => {
  const files = fs.readdirSync('src/shared/core/i18n-locales').filter(name => name.endsWith('.js'));
  assert.equal(files.length, 33);
  for (const file of files) {
    const { MESSAGES } = await import(`../src/shared/core/i18n-locales/${file}`);
    const value = MESSAGES.profileImportStorageFull;
    assert.ok(typeof value === 'string' && value.length > 28, `${file}: missing localized advice`);
    assert.doesNotMatch(value, /\{\w+\}/);
  }
});

test('.44 Welcome committed profile import and Sync-source resolution also surface storage-full advice', () => {
  const initial = extract(welcome, 'welcomeProfileFile?.addEventListener("change"', 'chooseLocalButton.addEventListener');
  const begin = initial.lastIndexOf('    } catch (error) {');
  const finish = initial.indexOf('  })();', begin);
  const branch = initial.slice(begin, finish).replace(/^\s*} catch/, 'catch');
  const statuses = [];
  const ctx = vm.createContext({
    error:quota(), console: {error() {}}, sourceFinishButton: {disabled:true},
    t:key => `Localized:${key}`, setStatus:(...args) => statuses.push(args),
    ERROR_CODES, isQuotaExceededError: e => /quota/i.test(e?.message || ''),
  });
  vm.runInContext(`async function exercise(){try{throw error;} ${branch}}`,ctx);
  return ctx.exercise().then(() => assert.deepEqual(statuses, [['Localized:profileImportStorageFull','error']]));
});

test('.44 Welcome source-resolution quota is localized only for staged profile imports', async () => {
  const branch = extract(welcome, 'chooseLocalButton.addEventListener("click"', 'chooseCloudButton.addEventListener');
  const messages = [];
  const ctx = vm.createContext({
    chooseLocalButton:{addEventListener(type, fn){this.handler=fn;},disabled:false},
    chooseCloudButton:{disabled:false},
    pendingSourceCandidate:{source:'profile'}, error:quota(),
    commitPendingSourceCandidate:async () => {throw ctx.error;},
    discardPendingSourceCandidate() {}, configureSourceStep() {}, latestSyncStatus:null,
    setStatus: (...args) => messages.push(args),
    t:key => `Localized:${key}`, ERROR_CODES,
    isQuotaExceededError:e => /quota/i.test(e?.message || ''),
  });
  vm.runInContext(branch,ctx);
  await ctx.chooseLocalButton.handler();
  assert.deepEqual(messages.at(-1), ['Localized:profileImportStorageFull', 'error']);
  assert.equal(ctx.chooseLocalButton.disabled,false);
  ctx.pendingSourceCandidate.source='cloud';
  messages.length=0;
  await ctx.chooseLocalButton.handler();
  assert.equal(messages.at(-1)[0], 'Local storage quota exceeded.', 'other setup choices must keep their existing error semantics');
});
