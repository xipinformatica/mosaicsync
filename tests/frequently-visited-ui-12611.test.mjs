import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let opened = false;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') { depth += 1; opened = true; }
    if (source[i] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

for (const browser of ['firefox', 'chrome']) {
  test(`1.26.11 ${browser} groups Frequently visited dependent controls behind one hidden container`, () => {
    const html = fs.readFileSync(`src/${browser}/newtab/newtab.html`, 'utf8');
    const wrapperStart = html.indexOf('<div id="frequentOptions" class="frequent-options" hidden>');
    const wrapperEnd = html.indexOf('</div>', wrapperStart);
    assert.ok(wrapperStart >= 0, 'dependent options wrapper must exist and start hidden');
    const block = html.slice(wrapperStart, wrapperEnd);
    assert.match(block, /id="frequentCountRow"/);
    assert.match(block, /id="frequentlyVisitedStatus"/);
  });

  test(`1.26.11 ${browser} Frequently visited visibility helper hides and restores all dependent controls together`, () => {
    const source = fs.readFileSync(`src/shared/newtab/newtab.js`, 'utf8');
    const fn = extractFunction(source, 'setFrequentlyVisitedOptionsVisibility');
    const frequentOptions = { hidden: false };
    const frequentCountRow = { hidden: false };
    const context = { frequentOptions, frequentCountRow };
    vm.createContext(context);
    vm.runInContext(`${fn}; this.setFrequentlyVisitedOptionsVisibility = setFrequentlyVisitedOptionsVisibility;`, context);

    context.setFrequentlyVisitedOptionsVisibility(false);
    assert.equal(frequentOptions.hidden, true);
    assert.equal(frequentCountRow.hidden, true);

    context.setFrequentlyVisitedOptionsVisibility(true);
    assert.equal(frequentOptions.hidden, false);
    assert.equal(frequentCountRow.hidden, false);

    assert.match(source, /setFrequentlyVisitedOptionsVisibility\(frequentlyVisitedEnabled\)/, 'opening/Sync refresh must reflect the synchronized toggle state');
    assert.match(source, /setFrequentlyVisitedOptionsVisibility\(wantsEnabled\)/, 'toggle changes must reveal or hide dependent controls from synchronized intent');
    assert.match(source, /setFrequentlyVisitedOptionsVisibility\(true\)/, 'permission recovery must reveal dependent controls while synchronized intent stays on');
  });
}
