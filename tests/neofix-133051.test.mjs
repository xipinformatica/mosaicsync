// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {cleanShortcutPageTitle, friendlyShortcutName} from '../src/shared/newtab/ui-utils.js';

const newtab = await readFile('src/shared/newtab/newtab.js','utf8');

// A rejected result means keep the offline site name, not that the URL fails.
test('51: multilingual login, bot and transient status titles do not replace shortcut identities', () => {
  for (const title of [
    'Iniciar sesión', 'Banco – Iniciar sesión', 'Inicia la sessió',
    'Anmelden', 'Connexion', 'Se connecter', 'Accedi', 'Iniciar sessão',
    'Вхід', 'Войти', 'ログイン', '로그인', '登录',
    '404 Not Found', 'Redirecting...', 'Loading...',
    'Página no encontrada', 'Pàgina no trobada', 'Veuillez patienter...',
    'Checking your browser', 'Sign in to GitHub', 'Cargando...', 'Carregant...', 'Завантаження...' 
  ]) assert.equal(cleanShortcutPageTitle(title, 'Example'), '', title);
  assert.equal(cleanShortcutPageTitle('Ajuntament de Barcelona - Tràmits', 'Ajuntament'), 'Ajuntament de Barcelona');
  assert.equal(cleanShortcutPageTitle('Café del Mar — Música', 'Café'), 'Café del Mar');
  assert.equal(cleanShortcutPageTitle('Example – Welcome', 'Example'), '', 'unchanged fallback is not rewritten');
});

test('51: auth/redirect URLs suppress suggested titles even when title itself appears normal', () => {
  for (const url of [
    'https://example.com/login', 'https://example.com/es/iniciar-sesion',
    'https://example.com/oauth/authorize?client_id=42',
    'https://example.com/?return_to=%2Faccount',
    'https://example.com/?redirect_uri=https%3A%2F%2Fclient.example',
    'https://example.com/connexion',
  ]) assert.equal(cleanShortcutPageTitle('Official Company Portal', 'Example', url), '', url);
  assert.equal(cleanShortcutPageTitle('Official Company Portal', 'Example', 'https://example.com/docs'), 'Official Company Portal');
  assert.equal(cleanShortcutPageTitle('Official Company Portal', 'Example', 'https://example.com/product/login-guide'), 'Official Company Portal');
});

test('51: offline names preserve real service identities and decode valid international hosts', () => {
  for (const [url, expected] of Object.entries({
    'https://en.wikipedia.org/wiki/Mosaic': 'Wikipedia',
    'https://ca.wikipedia.org/': 'Wikipedia',
    'https://fr.wikipedia.org/': 'Wikipedia',
    'https://open.spotify.com/': 'Spotify',
    'https://web.whatsapp.com/': 'WhatsApp',
    'https://mail.google.com/': 'Gmail',
    'https://alice.github.io/': 'Alice',
    'https://münchen.de/': 'München',
    'https://xn--mnchen-3ya.de/': 'München',
    'https://xn--e1afmkfd.xn--p1ai/': 'Пример',
    'https://example.co.uk/': 'Example',
  })) assert.equal(friendlyShortcutName(url), expected, url);
});

test('51: name lookup never starts on Cancel, Escape or backdrop-close gesture', () => {
  assert.match(newtab,/let shortcutNameLookupAbandoned = false/);
  assert.match(newtab,/if \(shortcutNameLookupAbandoned\) return/);
  assert.match(newtab,/shortcutDialog\.addEventListener\("pointerdown",[^]*?shortcutNameLookupAbandoned = true/);
  assert.match(newtab,/shortcutDialog\.addEventListener\("keydown",[^]*?event\.key === "Escape"[^]*?shortcutNameLookupAbandoned = true/);
  assert.match(newtab,/shortcutUrl\.addEventListener\("blur",[^]*?shortcutNameLookupAbandoned[^]*?suggestShortcutNameFromUrl\(true\)/);
  // Exercise the actual registered pointerdown and blur handlers, not just the strings.
  const target = {matches: s => s === '[data-close-dialog="shortcutDialog"]', closest: s => s === '[data-close-dialog="shortcutDialog"]' ? target : null};
  const events = new Map();
  const requests = [];
  const ctx = {
    URL, shortcutDialog: {open:true,addEventListener: (n,fn) => events.set('dialog-'+n,fn)},
    shortcutUrl: {value:'https://example.com/',addEventListener:(n,fn)=>events.set('url-'+n,fn)},
    shortcutId:{value:''},shortcutTitle:{value:''},updateImagePreview:()=>{},webAccessGranted:true,
    normalizeShortcutUrl:value=>value,friendlyShortcutName,cleanShortcutPageTitle,
    browser:{runtime:{sendMessage:args=>{requests.push(args);return Promise.resolve({ok:false});}}}
  };
  const start = newtab.indexOf('  // Typing is strictly offline.');
  const end = newtab.indexOf('  async function openShortcutEditor(',start);
  const controller = newtab.slice(start,end);
  const guardsStart = newtab.indexOf('  shortcutUrl.addEventListener("blur"');
  const guardsEnd = newtab.indexOf('  shortcutUrl.addEventListener("input"',guardsStart);
  const cancelStart = newtab.indexOf('  shortcutDialog.addEventListener("pointerdown"');
  const cancelEnd = newtab.indexOf('  shortcutUrl.addEventListener("blur"',cancelStart);
  assert.ok(cancelStart >= 0 && cancelEnd > cancelStart);
  runInNewContext(`${controller}\n${newtab.slice(cancelStart,cancelEnd)}\n${newtab.slice(guardsStart,guardsEnd)}`,ctx);
  events.get('dialog-pointerdown')({target});
  events.get('url-blur')({relatedTarget:target});
  assert.equal(requests.length,0,'Cancel must never contact abandoned website');
  events.get('dialog-keydown')({key:'Escape'});
  events.get('url-blur')({relatedTarget:null});
  assert.equal(requests.length,0,'Escape must never contact abandoned website');
  // Repeated pointerdown on the backdrop is equally an abandon intention.
  events.get('dialog-pointerdown')({target:ctx.shortcutDialog});
  events.get('url-blur')({relatedTarget:null});
  assert.equal(requests.length,0,'backdrop close must never contact abandoned website');
});

test('51: background result includes final URL for same-origin login-redirect filtering', async () => {
  for (const browser of ['chrome','firefox']) {
    const source = await readFile(`src/shared/background/background-core.js`,'utf8');
    assert.match(source,/title, siteName, finalPageUrl: result\.finalPageUrl/);
    const utils = await readFile('src/shared/newtab/ui-utils.js','utf8');
    assert.match(utils,/cleanShortcutPageTitle\(result\.siteName, "", result\.finalPageUrl\)/);
    assert.match(utils,/: title, "", result\.finalPageUrl\)/);
    assert.match(newtab,/chooseShortcutPageName\(result, fallback, url\)/);
  }
});
