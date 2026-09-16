import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectLocalAssets, collectLocalAssetsNormalized,
  flattenState, flattenStateNormalized,
  makeSettingsRecord, makeSettingsRecordNormalized,
  normalizeState, replaceWorkspace, replaceWorkspaceNormalized, settingsRecordEqual, stableStringify, syncRecordEqual
} from '../src/shared/core/model.js';
import { hasOwnEnumerable, countOwnEnumerable } from '../src/shared/background/runtime-utils.js';

function legacyEqual(a, b) {
  const strip = value => {
    if (!value || typeof value !== 'object') return value;
    const { deviceId: _deviceId, ...rest } = value;
    return rest;
  };
  return stableStringify(strip(a)) === stableStringify(strip(b));
}

function randomValue(depth = 0) {
  const roll = Math.random();
  if (depth > 3 || roll < .48) {
    const primitives = [null, true, false, Math.floor(Math.random()*1000), `s${Math.random().toString(36).slice(2)}`];
    return primitives[Math.floor(Math.random()*primitives.length)];
  }
  if (roll < .68) return Array.from({length: Math.floor(Math.random()*5)}, () => randomValue(depth+1));
  const obj = {};
  for (let i=0;i<Math.floor(Math.random()*6);i++) obj[`k${i}`] = randomValue(depth+1);
  if (Math.random() < .5) obj.deviceId = `d${Math.floor(Math.random()*4)}`;
  return obj;
}

test('1.24.9 record equality preserves stable JSON semantics for JSON-safe records', () => {
  for (let i=0;i<5000;i++) {
    const a = { kind: 'shortcut', id: `id${i%17}`, payload: randomValue(), modifiedAt: i%11, deviceId: `d${i%3}` };
    const b = Math.random() < .5 ? structuredClone(a) : { kind: 'shortcut', id: `id${i%17}`, payload: randomValue(), modifiedAt: i%11, deviceId: `d${(i+1)%3}` };
    assert.equal(syncRecordEqual(a,b), legacyEqual(a,b));
    assert.equal(settingsRecordEqual(a,b), legacyEqual(a,b));
  }
});

test('normalized Sync projection helpers are byte-for-byte equivalent to trust-boundary wrappers', () => {
  const state = normalizeState({
    shortcuts: [
      { type:'shortcut', id:'a', title:'A', url:'https://example.com', position:0, createdAt:1, modifiedAt:2 },
      { type:'shortcut', id:'b', title:'B', url:'https://example.org', position:1, createdAt:1, modifiedAt:3 }
    ],
    settings: { columns: 6, rows: 4 }, updatedAt: 3, settingsModifiedAt: 2
  });
  assert.deepEqual([...flattenStateNormalized(state,'dev')], [...flattenState(state,'dev')]);
  assert.deepEqual(makeSettingsRecordNormalized(state,'dev'), makeSettingsRecord(state,'dev'));
  assert.deepEqual([...collectLocalAssetsNormalized(state)], [...collectLocalAssets(state)]);
});

test('allocation-light object presence/count helpers preserve Object.keys behavior', () => {
  for (const value of [{}, {a:1}, Object.assign(Object.create({x:1}), {a:1,b:2}), null]) {
    const count = value && typeof value === 'object' ? Object.keys(value).length : 0;
    assert.equal(countOwnEnumerable(value), count);
    assert.equal(hasOwnEnumerable(value), count > 0);
  }
});

test('replaceWorkspaceNormalized preserves trust-boundary behavior for canonical state', () => {
  const state = normalizeState({ shortcuts:[{type:'shortcut',id:'a',title:'A',url:'https://a.test',position:0,createdAt:1,modifiedAt:1}], updatedAt:1 });
  const workspace = normalizeState({ shortcuts:[{type:'shortcut',id:'b',title:'B',url:'https://b.test',position:0,createdAt:2,modifiedAt:2}], updatedAt:2 });
  assert.deepEqual(
    replaceWorkspaceNormalized(state, 'work', workspace),
    replaceWorkspace(state, 'work', workspace)
  );
});
