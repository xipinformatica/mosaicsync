// @kind integration
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

for (const browser of ['chrome','firefox']) {
  test(`.45 ${browser} runtime replies via legacy callback without losing setup or sender protections`, () => {
    const text = execFileSync(process.execPath, ['tests/harness/background-runtime-scenario.mjs', browser, 'neofix-133045-legacy-message-callback'], {
      encoding:'utf8', timeout:25000, maxBuffer:1024*1024
    });
    const report = JSON.parse(text.trim().split('\n').at(-1));
    assert.equal(report.ok, true);
    assert.equal(report.oldChromiumCallback, true);
  });
}

test('.45 profile import storage guidance describes browser quota and preserves existing layouts', async () => {
  const files=readdirSync('src/shared/core/i18n-locales').filter(name=>name.endsWith('.js'));
  assert.equal(files.length,34);
  const english=(await import('../src/shared/core/i18n-locales/en.js')).MESSAGES.profileImportStorageFull;
  assert.match(english,/browser/i);
  assert.match(english,/backup/i);
  assert.match(english,/images/i);
  assert.doesNotMatch(english,/device storage is full|free some space/i);
  for (const f of files) {
    const {MESSAGES}=await import(`../src/shared/core/i18n-locales/${f}`);
    assert.ok(MESSAGES.profileImportStorageFull?.length>65, `${f}: needs actionable quota guidance`);
  }
});
