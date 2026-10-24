// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const html = fs.readFileSync('src/shared/newtab/newtab.html','utf8');
const js = fs.readFileSync('src/shared/newtab/newtab.js','utf8');
const css = fs.readFileSync('src/shared/newtab/newtab-secondary.css','utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  let braces = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') braces++;
    else if (source[i] === '}' && --braces === 0) return source.slice(start, i + 1);
  }
  assert.fail(`unterminated ${name}`);
}
function cls() {
  const flags = new Set();
  return {toggle(key, enabled) {if (enabled) flags.add(key); else flags.delete(key);}, contains(key) {return flags.has(key);}};
}
function previewHarness() {
  const context = {
    imagePreview: {replaceChildren(){}, classList:cls()},
    shortcutImageStyle: {value:'contain'},
    shortcutTitle: {value:'Example'},
    shortcutAutoDiscover: {checked:false,disabled:false},
    clearShortcutImage: {hidden:false},
    shortcutSyncImage: {checked:false,disabled:false},
    shortcutSyncImageRow: {hidden:false},
    shortcutSyncImageHint: {textContent:''},shortcutImageHint: {textContent:''},
    pendingShortcutImage:'',pendingShortcutImageKind:'none',pendingShortcutImageSourceKind:'none',
    pendingShortcutFaviconPreference:'',pendingShortcutBuiltinIcon:'',pendingShortcutImageIsFallback:false,
    pendingShortcutSyncData:'',state:{settings:{autoSiteIcons:true}},
    dataUrlByteLength:()=>0,formatBytes:()=>'', t:key=>key,appendImageOrFallback:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(js,'updateImagePreview'),context);
  return context;
}

test('1.33.0.88: preview-area Clear sits beneath favicon, all four selection methods form one grid',()=>{
  const field = html.match(/<fieldset class="image-fieldset">([\s\S]*?)<\/fieldset>/)?.[1] || '';
  const previewColumn = field.slice(field.indexOf('<div class="shortcut-preview-column">'), field.indexOf('<div class="image-controls">'));
  assert.match(previewColumn,/id="imagePreview"/);
  assert.match(previewColumn,/id="clearShortcutImage"/);
  const actions = field.match(/<div class="row-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  for (const id of ['shortcutImageFile','chooseDetectedFavicon','chooseBuiltinShortcutIcon','openShortcutWebImage']) {
    assert.match(actions, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(actions,/clearShortcutImage|shortcutImageUrl|shortcutSyncImage/);
  assert.match(field,/id="shortcutAutoDiscover"[^>]*type="checkbox"[^>]*checked disabled/);
  assert.doesNotMatch(field,/id="shortcutImageUrl"|class="web-image-row"/);
  assert.match(css,/#shortcutDialog \.row-actions \.file-button,\s*#shortcutDialog \.row-actions button\{[^}]*display:flex;align-items:center;justify-content:center;/);
  assert.match(css,/#shortcutDialog \.artwork-sync-row\[hidden\]\{display:none!important;\}/);
});

test('1.33.0.88: web URL field exclusively in separate modal with its own form and button',()=>{
  const main = html.slice(html.indexOf('<dialog id="shortcutDialog"'),html.indexOf('<dialog id="shortcutWebImageDialog"'));
  const child = html.slice(html.indexOf('<dialog id="shortcutWebImageDialog"'),html.indexOf('<dialog id="mosaicConfirmDialog"'));
  assert.doesNotMatch(main,/id="shortcutImageUrl"/);
  assert.match(child,/<form id="shortcutWebImageForm"/);
  assert.match(child,/<input id="shortcutImageUrl" type="url"[^>]*required>/);
  assert.match(child,/<button id="useShortcutImageUrl"[^>]*type="submit"/);
  for (const id of ['shortcutWebImageCancel','shortcutWebImageClose']) assert.match(child,new RegExp(`id="${id}"`));
  assert.match(js,/event\.preventDefault\(\); \/\/ Enter applies the web image, never saves the shortcut/);
  assert.match(js,/shortcutWebImageDialog\?\.addEventListener\("close", \(\) => \{\s*shortcutSyncPrepareGeneration \+= 1;/);
  assert.match(js,/if \(shortcutWebImageDialog\?\.open\) shortcutWebImageDialog\.close\(\);/);
});

test('1.33.0.88: automatic preview and local-file-only Sync respect manual choice and global setting',()=>{
  const c=previewHarness();
  c.updateImagePreview();
  assert.equal(c.shortcutAutoDiscover.checked,true);
  assert.equal(c.shortcutAutoDiscover.disabled,true);
  assert.equal(c.imagePreview.classList.contains('is-auto-empty'),true);
  assert.equal(c.clearShortcutImage.hidden,true);
  assert.equal(c.shortcutSyncImageRow.hidden,true);
  c.pendingShortcutImage='data:image/png;base64,AAAA';
  c.pendingShortcutImageSourceKind='favicon';
  c.updateImagePreview();
  assert.equal(c.shortcutAutoDiscover.checked,true);
  assert.equal(c.imagePreview.classList.contains('is-auto-empty'),false);
  assert.equal(c.clearShortcutImage.hidden,true);
  c.pendingShortcutImageSourceKind='upload';
  c.updateImagePreview();
  assert.equal(c.shortcutAutoDiscover.checked,false);
  assert.equal(c.shortcutAutoDiscover.disabled,false);
  assert.equal(c.clearShortcutImage.hidden,false);
  assert.equal(c.shortcutSyncImageRow.hidden,false);
  assert.equal(c.shortcutSyncImage.disabled,false);
  c.pendingShortcutFaviconPreference='chosen-favicon-locator';
  c.shortcutSyncImage.checked=true; // legacy explicitly synced manually chosen favicon
  c.updateImagePreview();
  assert.equal(c.shortcutSyncImageRow.hidden,true);
  assert.equal(c.shortcutSyncImage.checked,true,'hidden legacy sync choice must survive an unedited save');
  c.pendingShortcutImageSourceKind='remote';
  c.pendingShortcutFaviconPreference='';
  c.updateImagePreview();
  assert.equal(c.shortcutSyncImageRow.hidden,true);
  c.pendingShortcutImageSourceKind='builtin';
  c.pendingShortcutBuiltinIcon='home';
  c.pendingShortcutImage='';
  c.updateImagePreview();
  assert.equal(c.shortcutSyncImageRow.hidden,true);
  assert.equal(c.clearShortcutImage.hidden,false);
  c.pendingShortcutBuiltinIcon='';
  c.pendingShortcutImageSourceKind='none';
  c.state.settings.autoSiteIcons=false;
  c.updateImagePreview();
  assert.equal(c.shortcutAutoDiscover.checked,false,'global disabled favicon discovery must not appear checked');
  assert.equal(c.shortcutAutoDiscover.disabled,true);
});

test('1.33.0.88: clearing manual artwork returns to default without modifying stored schema',()=>{
  const c=previewHarness();
  Object.assign(c, {
    shortcutSyncPrepareGeneration:12,shortcutArtworkEdited:false,
    pendingShortcutImage:'data:image/png;base64,AA',pendingShortcutSyncData:'somebytes',
    pendingShortcutImageKind:'sync',pendingShortcutImageSourceKind:'upload',
    pendingShortcutImageSourceUrl:'https://image.test/img.png',
    pendingShortcutFaviconPreference:'manual',pendingShortcutImageIsFallback:true,
    pendingShortcutBuiltinIcon:'home',shortcutImageUrl:{value:'previous'},
    resetDetectedFaviconPicker(){c.resetPicker=true},updateBuiltinShortcutIconSelection(){c.updatedPicker=true}
  });
  vm.runInContext(extractFunction(js,'resetShortcutToAutomaticDiscovery'),c);
  c.resetShortcutToAutomaticDiscovery();
  assert.equal(c.shortcutSyncPrepareGeneration,13);
  assert.equal(c.pendingShortcutImage,'');
  assert.equal(c.pendingShortcutSyncData,'');
  assert.equal(c.pendingShortcutImageKind,'none');
  assert.equal(c.pendingShortcutImageSourceKind,'none');
  assert.equal(c.pendingShortcutImageSourceUrl,'');
  assert.equal(c.pendingShortcutFaviconPreference,'');
  assert.equal(c.pendingShortcutBuiltinIcon,'');
  assert.equal(c.shortcutSyncImage.checked,false);
  assert.equal(c.shortcutAutoDiscover.checked,true);
  assert.equal(c.shortcutArtworkEdited,true);
  assert.equal(c.resetPicker,true);
});

test('1.33.0.88: new discovery label has 34 nonempty locale translations and no omitted keys',async()=>{
  const dir='src/shared/core/i18n-locales/';
  const filenames=fs.readdirSync(dir).filter(x=>x.endsWith('.js'));
  assert.equal(filenames.length,34);
  const en=(await import(pathToFileURL(resolve(dir,'en.js')).href)).MESSAGES;
  assert.equal(en.discoverAutomatically,'Discover automatically');
  for(const filename of filenames){
    const catalog=(await import(pathToFileURL(resolve(dir,filename)).href)).MESSAGES;
    assert.deepEqual(new Set(Object.keys(catalog)),new Set(Object.keys(en)),`key set ${filename}`);
    assert.ok(catalog.discoverAutomatically?.length>2,`nonempty ${filename}`);
  }
});

function remoteHarness({permissionPromise=Promise.resolve(true),url='https://example.test/icon.png'}={}) {
  const handlers = new Map();
  function control() {return {disabled:false,addEventListener(name,cb){handlers.set(this.id+':'+name,cb)}};}
  let fetches=0, changed=0,toast=[];
  const imageDialog={open:true,addEventListener(name,cb){handlers.set('modal:'+name,cb)},close(){this.open=false;handlers.get('modal:close')?.()},showModal(){this.open=true}};
  const trigger={id:'trigger',...control()};
  const form={id:'form',...control()};
  const cancel={id:'cancel',...control()};
  const close={id:'x',...control()};
  const c={
    openShortcutWebImage:trigger,shortcutWebImageDialog:imageDialog,shortcutWebImageForm:form,
    shortcutWebImageCancel:cancel,shortcutWebImageClose:close,shortcutDialog:{open:true},
    shortcutImageUrl:{value:url,focus(){}}, useShortcutImageUrl:{disabled:false},
    shortcutId:{value:'first'},shortcutSyncPrepareGeneration:1,
    requestWebAccessFromGesture:()=>permissionPromise,webAccessGranted:false,
    state:{settings:{webAccessPrompted:true}},saveState:async()=>{},
    fetchBoundedRemoteImageBlob:async()=>{fetches++;return {}} ,
    imageBlobToDataUrl:async()=> 'data:image/png;base64,AAA',
    REMOTE_IMAGE_INPUT_MAX_BYTES:1024,shortcutArtworkEdited:false,
    shortcutSyncImage:{checked:false},pendingShortcutBuiltinIcon:'home',pendingShortcutImage:'previous',
    pendingShortcutImageSourceKind:'upload',pendingShortcutImageSourceUrl:'',pendingShortcutImageKind:'device',
    pendingShortcutSyncData:'',pendingShortcutFaviconPreference:'',pendingShortcutImageIsFallback:false,
    updateBuiltinShortcutIconSelection:()=>{},updateImagePreview:()=>{changed++},
    showToast:v=>toast.push(v),t:key=>key,URL,Promise,
    localizeDocument:()=>{}
  };
  vm.createContext(c);
  const start=js.indexOf('  openShortcutWebImage?.addEventListener("click", () => {');
  const end=js.indexOf('  shortcutSyncImage?.addEventListener("change", () => {',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(js.slice(start,end),c);
  return {c,handlers,sub(){let prevented=false;handlers.get('form:submit')({preventDefault(){prevented=true}});return prevented;},get fetches(){return fetches},get changed(){return changed},get toast(){return toast}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('1.33.0.88: popup valid HTTP image applies, dismisses, and cannot submit main editor',async()=>{
  const h=remoteHarness();
  assert.equal(h.sub(),true);
  await settle();
  assert.equal(h.fetches,1);
  assert.equal(h.c.pendingShortcutImage,'data:image/png;base64,AAA');
  assert.equal(h.c.pendingShortcutImageSourceKind,'remote');
  assert.equal(h.c.shortcutWebImageDialog.open,false);
  assert.equal(h.c.shortcutSyncImage.checked,false);
  assert.equal(h.changed,1);
});
test('1.33.0.88: invalid web URL is rejected before requesting permission or touching icon',async()=>{
  const h=remoteHarness({url:'javascript:alert(1)'});
  assert.equal(h.sub(),true);
  await settle();
  assert.equal(h.fetches,0);
  assert.equal(h.changed,0);
  assert.equal(h.c.pendingShortcutImage,'previous');
  assert.deepEqual(h.toast,['validWebImageAddress']);
});
test('1.33.0.88: closing popup cancels delayed permission without touching existing icon',async()=>{
  let grant;
  const permissionPromise=new Promise(resolve=>grant=resolve);
  const h=remoteHarness({permissionPromise});
  h.sub();
  h.handlers.get('cancel:click')();
  grant(true);
  await settle();
  assert.equal(h.fetches,0);
  assert.equal(h.changed,0);
  assert.equal(h.c.pendingShortcutImage,'previous');
  assert.equal(h.c.shortcutWebImageDialog.open,false);
});
test('1.33.0.88: switching editing owner while permission is pending drops stale remote result',async()=>{
  let grant;
  const h=remoteHarness({permissionPromise:new Promise(resolve=>grant=resolve)});
  h.sub();
  h.c.shortcutId.value='second';
  grant(true);
  await settle();
  assert.equal(h.fetches,0);
  assert.equal(h.changed,0);
});
