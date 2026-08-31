import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const placeholders = value => [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m=>m[1]).sort();

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: every UI locale has the complete catalog and matching placeholders`, async () => {
    const dir = resolve(`dist/${browser}/core/i18n-locales`);
    const files = (await readdir(dir)).filter(name => name.endsWith(".js")).sort();
    const en = (await import(`../dist/${browser}/core/i18n-locales/en.js?${Date.now()}`)).MESSAGES;
    const keys = Object.keys(en).sort();
    assert.equal(keys.length, 418);
    const sourceValues = new Map();
    for (const [key,value] of Object.entries(en)) {
      assert.ok(String(value).trim(), `${key}: empty English value`);
      assert.equal(sourceValues.has(value), false, `duplicate English localization source: ${key} and ${sourceValues.get(value)}`);
      sourceValues.set(value,key);
    }
    for (const file of files) {
      const mod = await import(`../dist/${browser}/core/i18n-locales/${file}?${Date.now()}-${file}`);
      assert.deepEqual(Object.keys(mod.MESSAGES).sort(), keys, file);
      for (const key of keys) {
        assert.ok(String(mod.MESSAGES[key]).trim(), `${file}:${key} empty`);
        assert.deepEqual(placeholders(mod.MESSAGES[key]),placeholders(en[key]),`${file}:${key} placeholder mismatch`);
      }
    }
  });

  test(`${browser}: dynamic New Tab status/toast paths use localization keys`, async () => {
    const src=await readFile(resolve(`dist/${browser}/newtab/newtab.js`),"utf8");
    for (const forbidden of [
      "Automatic site icons enabled.", "Automatic site icons disabled.", "Shortcut updated.", "Shortcut added.",
      "Not synchronized yet", "Firefox is still delivering the synchronized copy", "This device ${thisDevice}",
      "A complete synchronized copy is available${"
    ]) assert.equal(src.includes(forbidden),false,`raw UI English remains: ${forbidden}`);
    for (const key of ["autoSiteIconsEnabled","autoSiteIconsDisabled","notSynchronizedYet","syncPartialRecords","syncAssetQuotaWarningMany","syncRecoveryRestoring","syncRecoveryRestored","syncRecoveryFailed"]) {
      assert.ok(src.includes(`t("${key}"`),`missing localized dynamic key ${key}`);
    }
  });
}

const NEW_EU_LOCALES = Object.freeze(["bg","hr","et","el","hu","lv","lt","mt","ro","sk","sl"]);
const ALL_UI_LOCALES = Object.freeze([
  "bg","ca","cs","da","de","et","el","en","es","eu","fr","ga","gl","hr","it","lv","lt","hu","mt","nap","nl","nb","pl","pt","ro","sk","sl","fi","sv","ja","zh-CN","zh-TW","ko"
]);
const EU_OFFICIAL_LOCALES = Object.freeze([
  "bg","hr","cs","da","nl","en","et","fi","fr","de","el","hu","ga","it","lv","lt","mt","pl","pt","ro","sk","sl","es","sv"
]);

test("1.30 exposes all 33 MosaicSync UI locales and all 24 official EU languages", async () => {
  const mod = await import(`../dist/firefox/core/i18n.js?locale-set-${Date.now()}`);
  const ids = mod.SUPPORTED_LOCALES.map(locale => locale.id);
  assert.equal(ids.length, 33);
  assert.deepEqual(new Set(ids), new Set(ALL_UI_LOCALES));
  for (const id of EU_OFFICIAL_LOCALES) assert.ok(ids.includes(id), `missing EU official language ${id}`);
  assert.equal(new Set(EU_OFFICIAL_LOCALES).size, 24);
  for (const browser of ["firefox", "chrome"]) {
    const uiFiles = (await readdir(resolve(`dist/${browser}/core/i18n-locales`))).filter(name => name.endsWith(".js"));
    const manifestDirs = await readdir(resolve(`dist/${browser}/_locales`), { withFileTypes: true });
    assert.equal(uiFiles.length, 33, `${browser}: UI catalog count`);
    assert.equal(manifestDirs.filter(entry => entry.isDirectory()).length, 33, `${browser}: manifest locale count`);
    for (const id of NEW_EU_LOCALES) {
      assert.ok(uiFiles.includes(`${id}.js`), `${browser}: missing ${id} UI catalog`);
      assert.ok(manifestDirs.some(entry => entry.isDirectory() && entry.name === id), `${browser}: missing ${id} manifest locale`);
    }
  }
});

test("1.30 browser-language auto detection recognizes every supported newly added locale", async () => {
  const samples = Object.freeze({gl:"gl-ES",bg:"bg-BG",hr:"hr-HR",et:"et-EE",el:"el-GR",hu:"hu-HU",lv:"lv-LV",lt:"lt-LT",mt:"mt-MT",ro:"ro-RO",sk:"sk-SK",sl:"sl-SI"});
  const previousBrowser = globalThis.browser;
  try {
    for (const [expected, browserLocale] of Object.entries(samples)) {
      globalThis.browser = { i18n: { getUILanguage: () => browserLocale } };
      const mod = await import(`../dist/firefox/core/i18n.js?autolocale-${expected}-${Date.now()}-${Math.random()}`);
      assert.equal(mod.getEffectiveLocale(), expected, browserLocale);
    }
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test("1.24.14m1 Chrome branding remains grammatical and Firefox-free in every new EU catalog", async () => {
  const { platformizeUiText } = await import(`../dist/chrome/core/i18n-platform.js?branding-${Date.now()}`);
  const knownMalformed = Object.freeze({
    et: [/Chromei\b/g],
    hu: [/Chromeba\b/g,/Chromeon\b/g,/Chromeról\b/g,/Chromenál\b/g,/Chromeot\b/g,/Chromera\b/g],
    sk: [/Chromeu\b/g,/Chromeom\b/g],
    sl: [/Chromeu\b/g,/Chromea\b/g,/Chromeom\b/g]
  });
  for (const locale of NEW_EU_LOCALES) {
    const { MESSAGES } = await import(`../dist/chrome/core/i18n-locales/${locale}.js?branding-${locale}-${Date.now()}`);
    for (const [key,value] of Object.entries(MESSAGES)) {
      const rendered = platformizeUiText(value, locale, key);
      assert.doesNotMatch(rendered, /Firefox|Mozilla|Firefok/i, `${locale}:${key} retained Firefox/Mozilla branding: ${rendered}`);
      for (const bad of knownMalformed[locale] || []) assert.doesNotMatch(rendered, bad, `${locale}:${key} malformed Chrome inflection: ${rendered}`);
    }
    const manifest = JSON.parse(await readFile(resolve(`dist/chrome/_locales/${locale}/messages.json`), "utf8"));
    const description = manifest.extensionDescription?.message || "";
    assert.ok(description.trim(), `${locale}: empty Chrome manifest description`);
    assert.doesNotMatch(description, /Firefox|Mozilla|Firefok/i, `${locale}: Chrome manifest retained Firefox/Mozilla branding`);
    for (const bad of knownMalformed[locale] || []) assert.doesNotMatch(description, bad, `${locale}: malformed Chrome manifest inflection`);
  }
});

for (const browserName of ["firefox", "chrome"]) {
  test(`1.30 ${browserName} live locale switching preserves catalog identity across English → Catalan → Galician → Japanese → English`, async () => {
    const previousBrowser = globalThis.browser;
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();
    globalThis.localStorage = {
      getItem: key => values.get(String(key)) ?? null,
      setItem: (key, value) => values.set(String(key), String(value)),
      removeItem: key => values.delete(String(key))
    };
    globalThis.browser = { i18n: { getUILanguage: () => "en-US" } };
    try {
      const mod = await import(`../dist/${browserName}/core/i18n.js?snow-switch-${Date.now()}-${Math.random()}`);
      assert.equal(mod.t("moveHere"), "Move here");
      await mod.setLocalePreference("ca");
      assert.equal(mod.t("moveHere"), "Mou aquí");
      assert.equal(mod.t("switchPositions"), "Intercanvia les posicions");
      await mod.setLocalePreference("gl");
      assert.equal(mod.t("moveHere"), "Mover aquí");
      assert.equal(mod.t("folder"), "Cartafol");
      await mod.setLocalePreference("ja");
      assert.equal(mod.t("moveHere"), "ここへ移動");
      await mod.setLocalePreference("en");
      assert.equal(mod.t("moveHere"), "Move here");
    } finally {
      if (previousBrowser === undefined) delete globalThis.browser;
      else globalThis.browser = previousBrowser;
      if (previousLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousLocalStorage;
    }
  });
}

test("1.30 Galician Chrome branding is localized and Firefox-free", async () => {
  const { platformizeUiText } = await import(`../dist/chrome/core/i18n-platform.js?branding-gl-${Date.now()}`);
  const { MESSAGES } = await import(`../dist/chrome/core/i18n-locales/gl.js?branding-gl-${Date.now()}`);
  for (const [key, value] of Object.entries(MESSAGES)) {
    const rendered = platformizeUiText(value, "gl", key);
    assert.doesNotMatch(rendered, /Firefox|Mozilla/i, `gl:${key} retained Firefox/Mozilla branding: ${rendered}`);
  }
  const manifest = JSON.parse(await readFile(resolve("dist/chrome/_locales/gl/messages.json"), "utf8"));
  assert.match(manifest.extensionDescription.message, /Chrome/);
  assert.doesNotMatch(manifest.extensionDescription.message, /Firefox|Mozilla/i);
});
