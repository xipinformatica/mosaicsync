// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async p=>readFile(p,'utf8');
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');

test('.82 Clear Sync warning is in the existing confirmation BEFORE destructive background action',async()=>{
  const page=await read('src/shared/newtab/newtab.js');
  const start=page.indexOf('clearSyncButton?.addEventListener("click", async () => {');
  assert.ok(start>0);
  const body=page.slice(start,page.indexOf('  // ---------------------------------------------------------------------------',start));
  assert.match(body,/confirmMosaic\(`\$\{t\("deleteSyncTitle"\)\}[\s\S]*\$\{t\("clearSyncPeerWarning"\)\}[\s\S]*\$\{t\("clearSyncWarning"\)\}`, \{ danger: true \}\)/);
  assert.ok(body.indexOf('if (!confirmed) return;')>body.indexOf('confirmMosaic('));
  assert.ok(body.indexOf('mosaicsync:clear-sync-data')>body.indexOf('if (!confirmed) return;'));
  for (const browser of ['chrome','firefox']) {
    const compiled=await read(`dist/${browser}/newtab/newtab.js`);
    assert.match(compiled,/clearSyncPeerWarning/);
    assert.match(compiled,/mosaicsync:clear-sync-data/);
  }
});

test('.82 all 34 UI catalogs contain a distinct translated, actionable warning',async()=>{
  const names=(await readdir('src/shared/core/i18n-locales')).filter(x=>x.endsWith('.js')).sort();
  assert.equal(names.length,34);
  const en=(await import('../src/shared/core/i18n-locales/en.js')).MESSAGES;
  assert.match(en.clearSyncPeerWarning,/online/);
  assert.match(en.clearSyncPeerWarning,/offline/);
  for(const name of names){
    const messages=(await import(`../src/shared/core/i18n-locales/${name}`)).MESSAGES;
    assert.equal(typeof messages.clearSyncPeerWarning,'string',name);
    assert.ok(messages.clearSyncPeerWarning.length>=45,name);
    assert.ok(messages.clearSyncWarning?.length>30,name);
    if(name!=='en.js')assert.notEqual(messages.clearSyncPeerWarning,en.clearSyncPeerWarning,name);
  }
});

test('.82 protects the K1 developer guide and ships no Stage 3B generation engine',async()=>{
  assert.equal(await sha('DEVELOPER-GUIDE.md'),'e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e');
  const bg=await read('src/shared/background/background-core.js');
  assert.doesNotMatch(bg,/sync-generation-(?:reset|completion|fence|lifecycle)/);
  const names=await readdir('src/shared/background');
  assert.equal(names.filter(n=>n.startsWith('sync-generation-')).length,0);
  assert.match(await read('CHANGELOG.md'),/^# Changelog\n\n## 1\.33\.0\.88/m);
});
