// @kind behavioral
// Slice 8: external Settings refresh decisions are a pure, independently tested module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SETTINGS_REFRESH_KEYS,
  synchronizedFrequentlyVisitedSettings,
  settingsRefreshDomains
} from '../src/shared/newtab/settings-refresh-domains.js';

const base = () => ({
  activeSpaceId: 'personal',
  settings: {
    columns: 8, rows: 4, tileSize: 76, theme: 'system',
    backgroundColor: '#ffffff', backgroundColorCustomized: false,
    backgroundPreset: '', backgroundSourceKind: 'none', backgroundSourceUrl: '',
    backgroundImage: '', backgroundDim: 0, themeWallpapersEnabled: false,
    lightBackgroundPreset: '', darkBackgroundPreset: '', lightBackgroundDim: 0,
    darkBackgroundDim: 0, autoSiteIcons: true,
    frequentlyVisitedEnabled: false, frequentlyVisitedCount: 5
  },
  spaces: {
    personal: { settings: { frequentlyVisitedEnabled: false, frequentlyVisitedCount: 5, spaceName: 'Personal', multipleSpacesEnabled: true } },
    work: { settings: { frequentlyVisitedEnabled: false, frequentlyVisitedCount: 5, spaceName: 'Work', multipleSpacesEnabled: true } }
  }
});
const domains = (before, after) => [...settingsRefreshDomains(before, after)];

test('Slice 8: refresh classification has a single pure production owner and the page only paints returned domains', () => {
  const page = readFileSync('src/shared/newtab/newtab.js', 'utf8');
  const module = readFileSync('src/shared/newtab/settings-refresh-domains.js', 'utf8');
  assert.match(page, /import\s*\{\s*synchronizedFrequentlyVisitedSettings\s*\}\s*from\s*['"]\.\/frequently-visited-preference\.js['"]/);
  assert.match(page, /import\("\.\/settings-refresh-domains\.js"\)/);
  assert.match(page, /await Promise\.all\(\[ensureSecondaryStyles\(\), loadSettingsRefreshDomains\(\)\]\)/);
  assert.doesNotMatch(page, /function\s+(?:settingsKeysChanged|spacesSettingsChanged|settingsRefreshDomains|synchronizedFrequentlyVisitedSettings)\s*\(/);
  assert.match(page, /const domains = settingsRefreshDomainsForOpenPanel\(previousState, state\)/);
  assert.match(page, /if \(!domains\.size\) return domains/);
  assert.match(module, /Object\.is\(/);
});

test('Slice 8: exact own-state echoes and unrelated fields never cause Settings DOM refresh', () => {
  const before = base(), after = structuredClone(before);
  assert.deepEqual(domains(before, after), []);
  after.settings.unrelated = 'different';
  after.updatedAt = 1000;
  assert.deepEqual(domains(before, after), []);
});

test('Slice 8: every Settings domain is independently classified, in original priority order', () => {
  const examples = [
    ['grid', s => { s.settings.tileSize = 84; }],
    ['theme', s => { s.settings.theme = 'dark'; }],
    ['background', s => { s.settings.backgroundSourceUrl = 'https://example.test/art'; }],
    ['autoIcons', s => { s.settings.autoSiteIcons = false; }],
    ['spaces', s => { s.spaces.work.settings.spaceName = 'Office'; }],
    ['frequent', s => { s.spaces.personal.settings.frequentlyVisitedCount = 8; }]
  ];
  for (const [expected, mutate] of examples) {
    const before = base(), after = structuredClone(before);
    mutate(after);
    assert.deepEqual(domains(before, after), [expected], expected);
  }
  const before = base(), after = structuredClone(before);
  for (const [, mutate] of examples) mutate(after);
  assert.deepEqual(domains(before, after), ['grid', 'theme', 'background', 'autoIcons', 'spaces', 'frequent']);
});

test('Slice 8: first state and a Space switch request the complete Settings refresh without retaining shared mutable sets', () => {
  const before = base(), after = structuredClone(before);
  assert.deepEqual(domains(null, after), ['grid', 'theme', 'spaces', 'frequent', 'background', 'autoIcons']);
  assert.deepEqual(domains(before, null), ['grid', 'theme', 'spaces', 'frequent', 'background', 'autoIcons']);
  after.activeSpaceId = 'work';
  const first = settingsRefreshDomains(before, after);
  first.clear();
  assert.equal(settingsRefreshDomains(before, after).size, 6, 'a previous caller must never clear future refresh decisions');
});

test('Slice 8: Frequently Visited retains Personal-space authority, fallback and count bounds', () => {
  const s = base();
  s.settings.frequentlyVisitedEnabled = true;
  s.settings.frequentlyVisitedCount = 10;
  assert.deepEqual(synchronizedFrequentlyVisitedSettings(s), { enabled: false, count: 5 }, 'Personal settings own the value');
  delete s.spaces.personal.settings;
  assert.deepEqual(synchronizedFrequentlyVisitedSettings(s), { enabled: true, count: 10 }, 'flat-state backward compatibility');
  s.settings.frequentlyVisitedCount = 2;
  assert.deepEqual(synchronizedFrequentlyVisitedSettings(s), { enabled: true, count: 5 }, 'invalid count defaults to five');
  assert.deepEqual(synchronizedFrequentlyVisitedSettings(null), { enabled: false, count: 5 }, 'null state uses canonical defaults');
});

test('Slice 8: refreshed property lists are immutable and contain the actual current wallpaper fields', () => {
  assert.ok(Object.isFrozen(SETTINGS_REFRESH_KEYS));
  for (const keys of Object.values(SETTINGS_REFRESH_KEYS)) assert.ok(Object.isFrozen(keys));
  for (const key of ['backgroundColorCustomized', 'backgroundSourceKind', 'backgroundSourceUrl']) {
    assert.ok(SETTINGS_REFRESH_KEYS.background.includes(key));
    const before = base(), after = structuredClone(before);
    after.settings[key] = 'changed';
    assert.deepEqual(domains(before, after), ['background']);
  }
  assert.equal(SETTINGS_REFRESH_KEYS.background.includes('backgroundSource'), false);
});
