// @kind behavioral
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = p => fs.readFileSync(p,'utf8');
const icons = read('src/shared/newtab/builtin-icons.js');
const html = read('src/shared/newtab/newtab.html');
const css = read('src/shared/newtab/newtab-secondary.css');
const welcome = read('src/shared/welcome/welcome.html');
const welcomeCss = read('src/shared/welcome/welcome.css');
class Element {
  constructor(tag){this.tag=tag;this.attrs={};this.children=[];this.classList={add:(v)=>this.attrs.class=v};}
  setAttribute(k,v){this.attrs[k]=String(v)}
  append(e){this.children.push(e)}
}
function icon(key){
  const document={createElementNS:(ns,tag)=>new Element(tag)};
  const context={document};context.globalThis=context;
  vm.runInNewContext(icons,context);
  const el=new Element('div');
  assert.equal(context.__mosaicsyncBuiltinIcons.append(el,key),true);
  return el.children[0];
}
test('Neofix 3 draws game controls with isolated filled buttons and raised controller body',()=>{
 const e=icon('game');const [outline,...dots]=e.children;
 assert.match(outline.attrs.d,/M6\.5 6\.5/);
 assert.equal(dots.length,2);
 assert.ok(dots.every(d=>d.tag==='circle'&&d.attrs.fill==='currentColor'&&d.attrs.stroke==='none'));
});
test('Neofix 3 simplifies finance into roof, three pillars and a single base',()=>{
 const e=icon('finance');assert.equal(e.children.length,2);
 const d=e.children.map(c=>c.attrs.d).join(' ');
 assert.match(d,/M6\.5 12v5M12 12v5M17\.5 12v5/);
 assert.equal((d.match(/M3\.5 20h17/g)||[]).length,1);
});
test('Neofix 3 improves code spacing and uses filled shopping wheels',()=>{
 const code=icon('code').children[0].attrs.d;
 assert.match(code,/M8 7l-5 5 5 5/);
 const shop=icon('shopping');assert.equal(shop.children.length,3);
 assert.ok(shop.children.slice(1).every(d=>d.attrs.fill==='currentColor'&&d.attrs.stroke==='none'));
});
test('Neofix 3 creates filled music noteheads and declutters the newspaper',()=>{
 const music=icon('music');assert.equal(music.children.filter(n=>n.tag==='ellipse').length,2);
 assert.ok(music.children.filter(n=>n.tag==='ellipse').every(n=>n.attrs.fill==='currentColor'));
 const news=icon('news');assert.ok(news.children.some(n=>n.tag==='rect'&&n.attrs.rx==='0.5'));
});
test('Neofix 3 replaces theme text glyphs with aligned accessible SVG art',()=>{
 const segment=html.match(/<div id="themeToggle"[\s\S]*?<\/div>/)?.[0];assert.ok(segment);
 assert.equal((segment.match(/class="theme-icon-choice"/g)||[]).length,3);
 assert.equal((segment.match(/<svg[^>]*aria-hidden="true"/g)||[]).length,3);
 assert.doesNotMatch(segment,/[☾☀▣]/);
});
test('Neofix 3 styles wallpaper darkness controls with theme accent',()=>{
 assert.match(css,/\.theme-wallpaper-dim-row input\[type="range"\][^{]*\{[^}]*accent-color:\s*var\(--accent\)/);
 assert.match(css,/#settingsBackgroundDim\s*\{[^}]*accent-color:\s*var\(--accent\)/);
});
test('Neofix 3 puts Background ahead of Backup and gives branding its own section',()=>{
 assert.ok(html.indexOf('compact-background-section')<html.indexOf('backup-transfer-section'));
 assert.match(html,/class="settings-section branding-settings-section"/);
 assert.ok(html.indexOf('branding-settings-section')<html.indexOf('backup-transfer-section'));
});
test('Neofix 3 shows setup status near controls, with readable warnings in both color schemes',()=>{
 assert.ok(welcome.indexOf('id="status"')<welcome.indexOf('class="development-support"'));
 const lightMedia = welcomeCss.indexOf('@media (prefers-color-scheme: light)');
 assert.ok(lightMedia > 0);
 const darkRules = welcomeCss.slice(0, lightMedia);
 const lightRules = welcomeCss.slice(lightMedia, welcomeCss.indexOf('@media (prefers-color-scheme: light)',lightMedia+1));
 assert.match(darkRules,/\.status\.error\s*\{\s*color:\s*#ff9aa8\s*;/);
 assert.match(darkRules,/\.status\.warning\s*\{\s*color:\s*#f7c56c\s*;/);
 assert.match(lightRules,/\.status\.error\s*\{\s*color:\s*#b42339\s*;/);
 assert.match(lightRules,/\.status\.warning\s*\{\s*color:\s*#805300\s*;/);
});
