// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname,'..');
const [html,source,css] = await Promise.all([
  readFile(resolve(root,'src/shared/newtab/newtab.html'),'utf8'),
  readFile(resolve(root,'src/shared/newtab/newtab.js'),'utf8'),
  readFile(resolve(root,'src/shared/newtab/newtab-secondary.css'),'utf8'),
]);

function nameHarness({url='https://www.wikipedia.org/',auto=true}={}) {
  const sent=[];
  const ctx={
    shortcutAutomaticName:{checked:auto},
    shortcutTitle:{value:'',readOnly:true,setAttribute(k,v){this[k]=v}},
    shortcutUrl:{value:url},shortcutId:{value:''},
    shortcutDialog:{open:true},
    webAccessGranted:false,
    normalizeShortcutUrl:v=>{if (!v.startsWith('https://')) throw Error('bad');return v;},
    friendlyShortcutName:v=>'Wikipedia',
    cleanShortcutPageTitle:v=>v,
    updateImagePreview(){},
    browser:{runtime:{sendMessage:msg=>{sent.push(msg);return Promise.resolve({ok:false})}}},
    URL, Date, Math
  };
  const start=source.indexOf('  let shortcutNameSuggestionGeneration = 0;');
  const end=source.indexOf('  async function openShortcutEditor(',start);
  assert.ok(start!==-1&&end>start);
  runInNewContext(source.slice(start,end)+'\nglobalThis.applyMode=applyShortcutNamingMode;',ctx);
  return {ctx,sent};
}

test('53: URL first; automatic naming is read-only (not disabled) and editable on opt-out',()=>{
  assert.ok(html.indexOf('id="shortcutUrl"') < html.indexOf('id="shortcutAutomaticName"'));
  assert.ok(html.indexOf('id="shortcutAutomaticName"') < html.indexOf('id="shortcutTitle"'));
  assert.match(html, /id="shortcutAutomaticName"[^>]*checked/);
  assert.match(html, /id="shortcutTitle"[^>]*readonly/);
  assert.doesNotMatch(html, /id="shortcutTitle"[^>]*disabled/);
  assert.match(css, /shortcut-name-field input\[readonly\]/);
  const {ctx,sent}=nameHarness();
  ctx.applyMode();
  assert.equal(ctx.shortcutTitle.value,'Wikipedia');
  assert.equal(ctx.shortcutTitle.readOnly,true);
  assert.equal(sent.length,0,'enabling automatic naming must stay offline');
  ctx.shortcutAutomaticName.checked=false;
  ctx.applyMode();
  assert.equal(ctx.shortcutTitle.readOnly,false);
  ctx.shortcutTitle.value='My own name';
  ctx.shortcutAutomaticName.checked=true;
  ctx.applyMode();
  assert.equal(ctx.shortcutTitle.readOnly,true);
  assert.equal(ctx.shortcutTitle.value,'Wikipedia');
});

test('53: Enter from URL submits, without focusing Name or starting the title request',()=>{
  const start=source.indexOf('  shortcutUrl.addEventListener("keydown", event => {');
  const end=source.indexOf('  shortcutUrl.addEventListener("input",',start);
  assert.ok(start>0&&end>start);
  let handler,submits=0,prevented=0;
  const ctx={
    shortcutUrl:{addEventListener:(event,cb)=>{if(event==='keydown')handler=cb}},
    shortcutForm:{requestSubmit(){submits++}},
    shortcutNameLookupAbandoned:false
  };
  runInNewContext(source.slice(start,end),ctx);
  handler({key:'Enter',isComposing:false,preventDefault(){prevented++}});
  assert.equal(submits,1);
  assert.equal(prevented,1);
  assert.equal(ctx.shortcutNameLookupAbandoned,true);
  handler({key:'Enter',isComposing:true,preventDefault(){throw Error('IME composition interrupted')}});
  assert.equal(submits,1);
});

test('53: editing existing shortcuts preserves their names and never opts into automatic renaming implicitly',()=>{
  const editor=source.slice(source.indexOf('  async function openShortcutEditor('),source.indexOf('  function isSettingsOpen()',source.indexOf('  async function openShortcutEditor(')));
  assert.match(editor,/shortcutAutomaticName\.checked = !item/);
  assert.match(editor,/shortcutTitle\.value = item\?\.title \|\| ""/);
  assert.match(editor,/shortcutTitle\.readOnly = !item/);
  assert.match(editor,/item \? shortcutTitle : shortcutUrl/);
});

function confirmHarness() {
  const events=new Map();
  const dialog={open:false,returnValue:'',addEventListener:(name,fn)=>events.set(name,fn),showModal(){this.open=true},close(value){this.returnValue=value;this.open=false;events.get('close')?.()}};
  const make=()=>({textContent:'',classList:{toggle(){}},addEventListener:(name,fn)=>events.set(this?.id||'button-'+name,fn),focus(){}});
  const cancel={...make(),addEventListener:(name,fn)=>events.set('cancel-'+name,fn),focus(){this.focused=true}};
  const accept={...make(),addEventListener:(name,fn)=>events.set('accept-'+name,fn)};
  const nodes={mosaicConfirmDialog:dialog,mosaicConfirmTitle:make(),mosaicConfirmMessage:make(),mosaicConfirmCancel:cancel,mosaicConfirmAccept:accept};
  const ctx={document:{getElementById:id=>nodes[id]},t:key=>({cancel:'Cancel',continue:'Continue',delete:'Delete'}[key]||key),Promise};
  const start=source.indexOf('  // One in-page confirmation surface');
  const end=source.indexOf('  shortcutDialog?.addEventListener("close"',start);
  assert.ok(start!==-1&&end>start);
  runInNewContext(source.slice(start,end)+'\nglobalThis.showConfirmation=confirmMosaic;',ctx);
  return {ctx,nodes,dialog,events};
}

test('53: shared modal is safe by default, escapes cleanly, and does not inject shortcut titles as markup',async()=>{
  const {ctx,nodes,dialog,events}=confirmHarness();
  let result=ctx.showConfirmation('Delete “<img src=x>”?',{danger:true});
  assert.equal(dialog.open,true);
  assert.equal(nodes.mosaicConfirmMessage.textContent,'Delete “<img src=x>”?');
  assert.equal(nodes.mosaicConfirmCancel.focused,true);
  assert.equal(await ctx.showConfirmation('second request'),false,'concurrent request denied');
  events.get('cancel')();
  dialog.close('cancelled');
  assert.equal(await result,false);
  result=ctx.showConfirmation('Remove data?',{danger:true});
  events.get('accept-click')();
  assert.equal(await result,true);
  result=ctx.showConfirmation('Keep going?');
  events.get('cancel-click')();
  assert.equal(await result,false);
});

test('53: no native confirm remains in New Tab and sensitive actions await the in-page decision',()=>{
  assert.doesNotMatch(source,/\b(?:window\.)?confirm\s*\(/);
  assert.equal((source.match(/await confirmMosaic\(/g)||[]).length,10);
  assert.match(source,/if \(shortcutSavePending\) return/);
  assert.match(source,/deleteShortcutButton\.addEventListener\("click", async \(\) => \{[^]*?if \(!await confirmMosaic\(/);
  assert.match(html,/id="mosaicConfirmDialog"/);
  assert.match(html,/id="mosaicConfirmCancel"/);
  assert.match(html,/id="mosaicConfirmAccept"/);
});

test('53: all 34 UI locales include a nonempty automatic naming translation',async()=>{
  const dir=resolve(root,'src/shared/core/i18n-locales');
  const files=(await readdir(dir)).filter(n=>n.endsWith('.js'));
  assert.equal(files.length,34);
  const translations=new Set();
  for(const file of files){
    const {MESSAGES}=await import(pathToFileURL(resolve(dir,file)).href);
    assert.equal(typeof MESSAGES.automaticNaming,'string',file);
    assert.ok(MESSAGES.automaticNaming.trim(),file);
    assert.equal(Object.keys(MESSAGES).length,485,file);
    translations.add(MESSAGES.automaticNaming);
  }
  assert.ok(translations.size>20,'should not silently reuse English for every locale');
});
