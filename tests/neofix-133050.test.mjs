// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { friendlyShortcutName, cleanShortcutPageTitle } from '../src/shared/newtab/ui-utils.js';

const newtab = await readFile('src/shared/newtab/newtab.js', 'utf8');
const css = await readFile('src/shared/newtab/newtab-secondary.css', 'utf8');
const html = await readFile('src/shared/newtab/newtab.html', 'utf8');
const background = await readFile('src/shared/background/background-core.js', 'utf8');

function functionText(source, name, async = false) {
  const prefix = `${async ? 'async ' : ''}function ${name}(`;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0, `missing production ${name}`);
  // The two targeted functions contain no unmatched bare braces in regex or comments.
  let braces = 0, begun = false;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') { braces++; begun = true; }
    if (source[i] === '}') { braces--; if (begun && braces === 0) return source.slice(start, i + 1); }
  }
  throw new Error('unclosed '+name);
}

test('50 corrective: offline labels preserve service identities and public suffixes', () => {
  const cases = {
    'https://www.google.com/': 'Google',
    'https://chatgpt.com/': 'ChatGPT',
    'https://github.com/': 'GitHub',
    'https://mail.google.com/': 'Gmail',
    'https://drive.google.com/': 'Google Drive',
    'https://calendar.google.com/': 'Google Calendar',
    'https://docs.google.com/': 'Google Docs',
    'https://alice.github.io/': 'Alice',
    'https://bob.github.io/': 'Bob',
    'https://service-public.gouv.fr/': 'Service public',
    'https://agenciatributaria.gob.es/': 'Agenciatributaria',
    'https://news.bbc.co.uk/': 'News Bbc',
    'http://localhost:3000/': 'localhost',
    'http://192.168.0.5/': '192.168.0.5',
    'https://my-cool-site.org/': 'My cool site'
  };
  for (const [url, expected] of Object.entries(cases)) assert.equal(friendlyShortcutName(url),expected,url);
});

test('50 corrective: title filtering rejects unreadable encoding, login pages, and bot challenges', () => {
  assert.equal(cleanShortcutPageTitle('ChatGPT – OpenAI', 'ChatGPT'),''); // fallback already perfect
  assert.equal(cleanShortcutPageTitle('Steam - Welcome to Steam','Steampowered'),'Steam');
  assert.equal(cleanShortcutPageTitle('Caf\uFFFD del Mar', 'Cafe'),'');
  for (const title of [
    'Sign in to GitHub', 'Log in to Example', 'Login - Example',
    'Just a moment...', 'Checking your browser before accessing Example',
    'Verify you are human', 'Access denied', '403 Forbidden',
    'Attention Required! | Cloudflare', 'Please enable JavaScript to continue',
    'Google - Sign in'
  ]) assert.equal(cleanShortcutPageTitle(title, 'Example'),'',title);
  assert.equal(cleanShortcutPageTitle('   Example   Website  | Latest news '),'Example Website');
  assert.ok(cleanShortcutPageTitle('Very long company name '.repeat(7)).length <= 52);
  assert.equal(cleanShortcutPageTitle('\u0000\u0001'), '');
});

for (const browser of ['firefox','chrome']) {
  test(`50: ${browser} background title lookup reuses bounded fetch, ignores SSO redirect, decodes entities`, async () => {
    const built = await readFile(`dist/${browser}/background/background-core.js`, 'utf8');
    const func = functionText(built,'suggestShortcutPageTitle',true);
    let fetched = [];
    const ctx = {
      URL, Date, String, parseInt, Number,
      httpOriginPattern: value => /^https?:\/\//.test(value) ? 'valid' : '',
      fetchHtmlHead: async (url,options) => { fetched.push({url, options}); return {ok:true,finalPageUrl:'https://www.chatgpt.com/', text:'<head><title>ChatGPT &amp; OpenAI &#8212; Home</title></head>'}; }
    };
    const run = runInNewContext(`${func};suggestShortcutPageTitle`,ctx);
    assert.equal((await run('https://chatgpt.com/')).title,'ChatGPT & OpenAI — Home');
    assert.equal(fetched.length,1);
    assert.ok(fetched[0].options.deadlineAt >= Date.now()-100);
    assert.equal((await run('mailto:test@example.com')).ok,false);
    assert.equal(fetched.length,1);
    ctx.fetchHtmlHead=async()=>({ok:true,finalPageUrl:'https://accounts.google.com/',text:'<title>Google Account</title>'});
    assert.equal((await run('https://chatgpt.com/')).ok,false,'redirect cannot rename site to login provider');
    ctx.fetchHtmlHead=async()=>({ok:false,reason:'permission',text:''});
    assert.equal((await run('https://chatgpt.com/')).ok,false,'no host permission: no title');
    ctx.fetchHtmlHead=async()=>({ok:true,finalPageUrl:'https://chatgpt.com/',text:'<title>'+ 'X'.repeat(600) +'</title>'});
    assert.equal((await run('https://chatgpt.com/')).ok,false,'reject excessive raw title');
    assert.match(built,/case "mosaicsync:suggest-shortcut-title"/);
  });
}

test('50 corrective: typing stays offline; lookup begins on URL blur or Enter', () => {
  assert.match(newtab,/shortcutNameManuallyEdited = true;\s*invalidateShortcutNameSuggestion\(\)/);
  assert.match(newtab,/shortcutUrl\.addEventListener\("input", \(\) => \{\s*shortcutNameLookupAbandoned = false;[^\n]*\n\s*if \(detectedFaviconPickerUrl\) resetDetectedFaviconPicker\(\);\s*suggestShortcutNameFromUrl\(\)/);
  assert.match(newtab,/shortcutUrl\.addEventListener\("blur", event => \{[\s\S]*?suggestShortcutNameFromUrl\(true\)/);
  assert.match(newtab,/shortcutUrl\.addEventListener\("keydown", event =>/);
  assert.match(newtab,/event\.preventDefault\(\);[^\n]*\n\s*shortcutNameLookupAbandoned = true;[^\n]*\n\s*shortcutForm\.requestSubmit\(\)/);
  assert.match(newtab,/if \(!requestTitle \|\| !webAccessGranted\) return/);
  assert.match(newtab,/generation !== shortcutNameSuggestionGeneration \|\| !shortcutDialog\.open \|\| shortcutId\.value \|\| shortcutNameManuallyEdited/);
  assert.match(newtab,/currentUrl !== url \|\| !result\?\.ok/);
  assert.match(newtab,/shortcutDialog\?\.addEventListener\("close", \(\) => \{\s*shortcutSyncPrepareGeneration \+= 1;\s*if \(shortcutWebImageDialog\?\.open\) shortcutWebImageDialog\.close\(\);\s*resetDetectedFaviconPicker\(\);\s*invalidateShortcutNameSuggestion\(\)/);
  assert.match(newtab,/const title = shortcutTitle\.value\.trim\(\) \|\| hostLabel\(url\)/);
  assert.match(newtab,/shortcutNameManuallyEdited = Boolean\(item\)/);
});

test('50 corrective: editor buttons retain mathematical flex centering, no universal OS-dependent offset', () => {
  assert.doesNotMatch(css,/#shortcutDialog \.dialog-actions > button\{padding-top:7px;padding-bottom:9px\}/);
  assert.match(css,/\.danger-button,\s*\.file-button,\s*\.text-button\{min-height: 38px;padding: 8px 13px;border-radius: 8px;display: inline-flex;align-items: center;justify-content: center/);
  assert.match(html,/id="deleteShortcutButton" class="danger-button"/);
  assert.match(html,/<button class="secondary-button" type="button" data-close-dialog="shortcutDialog">Cancel<\/button>/);
  assert.match(html,/<button class="primary-button" type="submit">Save<\/button>/);
});

test('50 corrective: real editor controller is offline on input and guards completed-URL responses', async () => {
  const segment = newtab.slice(newtab.indexOf('  // Typing is strictly offline.'),newtab.indexOf('  async function openShortcutEditor('));
  assert.ok(segment.startsWith('  // Typing is strictly offline.'));
  const pending = [];
  const ctx = {
    URL,
    normalizeShortcutUrl: value => /^https?:\/\//.test(value) ? value : `https://${value}/`,
    friendlyShortcutName, cleanShortcutPageTitle,
    shortcutDialog: { open: true },
    shortcutId: { value: '' },
    shortcutTitle: { value: '' },
    shortcutUrl: { value: 'https://chatgpt.com/' },
    updateImagePreview: () => {},
    webAccessGranted: true,
    browser: { runtime: { sendMessage: args => args.type === "mosaicsync:cancel-shortcut-title" ? Promise.resolve({ok:true}) : new Promise(resolve => pending.push({args, resolve})) } },
  };
  const engine = runInNewContext(`${segment}\n({suggest:suggestShortcutNameFromUrl, invalidate:invalidateShortcutNameSuggestion, manual:(flag)=>{shortcutNameManuallyEdited=flag;}, access:(flag)=>{webAccessGranted=flag;}})`,ctx);
  for (const fragment of ['chat','chatgpt','chatgpt.c','chatgpt.com']) {
    ctx.shortcutUrl.value = fragment;
    engine.suggest();
  }
  assert.equal(ctx.shortcutTitle.value,'ChatGPT');
  assert.equal(pending.length,0,'no request is sent while typing, even after a pause');
  engine.suggest(true);
  assert.equal(pending.length,1,'blur triggers exactly one lookup');
  assert.equal(pending[0].args.pageUrl,'https://chatgpt.com/');
  engine.manual(true);
  ctx.shortcutTitle.value='My private name';
  pending[0].resolve({ok:true,title:'Not my name'});
  await new Promise(r=>setImmediate(r));
  assert.equal(ctx.shortcutTitle.value,'My private name');
  engine.manual(false);
  engine.suggest(true);
  assert.equal(pending.length,1,"unchanged URL does not cause a second lookup");
  ctx.shortcutUrl.value='https://example.com/';
  engine.suggest();
  await new Promise(r=>setImmediate(r));
  assert.equal(ctx.shortcutTitle.value,'Example');
  engine.suggest(true);
  assert.equal(pending.length,2);
  ctx.shortcutDialog.open=false;
  pending[1].resolve({ok:true,title:'Example Website'});
  await new Promise(r=>setImmediate(r));
  assert.equal(ctx.shortcutTitle.value,'Example');
  ctx.shortcutDialog.open=true;
  engine.access(false);
  engine.suggest(true);
  assert.equal(pending.length,2,'without optional permission no network request');
  engine.access(true);
  ctx.shortcutUrl.value='chat';
  engine.suggest(true);
  assert.equal(pending.length,2,'single-label partial hostname is not contacted');
  ctx.shortcutUrl.value='chatgpt.c';
  engine.suggest(true);
  assert.equal(pending.length,2,'one-letter partial TLD is not contacted');
  ctx.shortcutId.value='existing-id';
  ctx.shortcutTitle.value='Saved name';
  engine.suggest(true);
  assert.equal(ctx.shortcutTitle.value,'Saved name','existing shortcut name is never overridden');
});
