// @kind static
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css = readFileSync('src/shared/newtab/newtab-secondary.css','utf8');
const blocks = {
  desktop: css.match(/^@media \(min-width: 621px\)\{\n([\s\S]*?)\n\}/m)?.[1] || '',
  laptop: css.match(/^@media \(min-width: 621px\) and \(max-height: 760px\)\{\n([\s\S]*?)\n\}/m)?.[1] || '',
  narrow: css.match(/^@media \(max-width: 620px\)\{\n([\s\S]*?)\n\}/m)?.[1] || ''
};
const rules = (block,selector) => block.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'))?.[1] || '';
for (const [name,layout] of Object.entries(blocks)) {
 test(`.87 ${name}: all four shortcut-artwork actions stretch to matching dimensions`,()=>{
  const row=rules(layout,'#shortcutDialog .row-actions');
  assert.match(row,/display:grid/);
  assert.match(row,/align-items:stretch/);
  const controls=rules(layout,'#shortcutDialog .row-actions button');
  assert.match(controls,/width:100%/);
  assert.match(controls,/min-height:calc\(2\.4em \+ 12px\)/);
  assert.match(controls,/white-space:normal/);
 });
}
test('.87 narrow: rows share height and no translation needs truncation',()=>{
 const row=rules(blocks.narrow,'#shortcutDialog .row-actions');
 assert.match(row,/grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(row,/grid-auto-rows:1fr/);
 const items=rules(blocks.narrow,'#shortcutDialog .row-actions button');
 assert.match(items,/overflow-wrap:anywhere/);
 assert.doesNotMatch(items,/text-overflow:ellipsis|white-space:nowrap/);
});
