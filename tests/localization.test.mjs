// @kind static
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
    assert.equal(keys.length, 495);
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
  "bg","ca","cs","da","de","et","el","en","es","eu","fr","ga","gl","hr","it","lv","lt","hu","mt","nap","nl","nb","pl","pt","ro","sk","sl","fi","sv","ja","zh-CN","zh-TW","ko","uk"
]);
const EU_OFFICIAL_LOCALES = Object.freeze([
  "bg","hr","cs","da","nl","en","et","fi","fr","de","el","hu","ga","it","lv","lt","mt","pl","pt","ro","sk","sl","es","sv"
]);

test("1.30 exposes all 34 MosaicSync UI locales and all 24 official EU languages", async () => {
  const mod = await import(`../dist/firefox/core/i18n.js?locale-set-${Date.now()}`);
  const ids = mod.SUPPORTED_LOCALES.map(locale => locale.id);
  assert.equal(ids.length, 34);
  assert.deepEqual(new Set(ids), new Set(ALL_UI_LOCALES));
  for (const id of EU_OFFICIAL_LOCALES) assert.ok(ids.includes(id), `missing EU official language ${id}`);
  assert.equal(new Set(EU_OFFICIAL_LOCALES).size, 24);
  for (const browser of ["firefox", "chrome"]) {
    const uiFiles = (await readdir(resolve(`dist/${browser}/core/i18n-locales`))).filter(name => name.endsWith(".js"));
    const manifestDirs = await readdir(resolve(`dist/${browser}/_locales`), { withFileTypes: true });
    assert.equal(uiFiles.length, 34, `${browser}: UI catalog count`);
    assert.equal(manifestDirs.filter(entry => entry.isDirectory()).length, 34, `${browser}: manifest locale count`);
    for (const id of NEW_EU_LOCALES) {
      assert.ok(uiFiles.includes(`${id}.js`), `${browser}: missing ${id} UI catalog`);
      assert.ok(manifestDirs.some(entry => entry.isDirectory() && entry.name === id), `${browser}: missing ${id} manifest locale`);
    }
  }
});

test("1.30 browser-language auto detection recognizes every supported newly added locale", async () => {
  const samples = Object.freeze({gl:"gl-ES",bg:"bg-BG",hr:"hr-HR",et:"et-EE",el:"el-GR",hu:"hu-HU",lv:"lv-LV",lt:"lt-LT",mt:"mt-MT",ro:"ro-RO",sk:"sk-SK",sl:"sl-SI",uk:"uk-UA"});
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

test("Phase 2 Chrome UI uses Google Account wording and Korean particles", async () => {
  const { platformizeUiText } = await import(`../dist/chrome/core/i18n-platform.js?phase2-${Date.now()}`);
  const en = (await import("../dist/chrome/core/i18n-locales/en.js")).MESSAGES;
  assert.match(platformizeUiText(en.syncPendingAccountWait, "en", "syncPendingAccountWait"), /Google Account/);
  assert.match(platformizeUiText(en.chooseFirefoxAccount, "en", "chooseFirefoxAccount"), /Google Account/);
  const german = (await import("../dist/chrome/core/i18n-locales/de.js")).MESSAGES;
  const germanChromeAccount = platformizeUiText(german.chooseFirefoxAccount, "de", "chooseFirefoxAccount");
  assert.match(germanChromeAccount, /Google-Konto/);
  assert.doesNotMatch(germanChromeAccount, /Chrome-Konto/);
  for (const locale of ["et", "hu", "ja", "ko", "lt", "lv", "nl", "uk", "zh-CN", "zh-TW"]) {
    const catalog = (await import(`../dist/chrome/core/i18n-locales/${locale}.js`)).MESSAGES;
    const compact = platformizeUiText(catalog.syncServerlessCompact, locale, "syncServerlessCompact");
    assert.match(compact, /Chrome Sync/, `${locale}: must name Chrome Sync`);
    assert.doesNotMatch(compact, /Google Sync|Firefox|Mozilla|Account Sync/, `${locale}: invalid Chrome branding`);
  }
  assert.equal(platformizeUiText("Firefox가 Firefox는 Firefox를 Firefox와 Firefox로", "ko"),
    "Chrome이 Chrome은 Chrome을 Chrome과 Chrome으로");
  for (const locale of ["bg", "el", "lt", "lv", "ro", "hr", "sk", "sl", "uk"]) {
    const messages = (await import(`../dist/chrome/core/i18n-locales/${locale}.js`)).MESSAGES;
    for (const key of ["syncTurnedOffDevice", "syncRemainsEnabled"]) {
      assert.match(platformizeUiText(messages[key], locale, key), /Chrome Sync/);
      assert.doesNotMatch(platformizeUiText(messages[key], locale, key), /Chrome Account Sync|Chrome акаунт|Chrome paskyros|Chrome konta|contului Chrome|λογαριασμού Chrome/);
    }
  }
});

test("Phase 2 count-neutral labels and Chrome Google Account naming cover all 34 locales", async () => {
  const { platformizeUiText } = await import(`../dist/chrome/core/i18n-platform.js?phase2-all-${Date.now()}`);
  for (const lang of ALL_UI_LOCALES) {
    const { MESSAGES: catalog } = await import(`../dist/chrome/core/i18n-locales/${lang}.js`);
    assert.match(catalog.bookmarksCount, /\{count\}/, `${lang}: bookmark count preserved`);
    assert.match(catalog.folderContains, /\{count\}/, `${lang}: item count preserved`);
    assert.doesNotMatch(catalog.bookmarksCount, /^\{count\}\s/, `${lang}: bookmarks use count-neutral presentation`);
    assert.doesNotMatch(catalog.folderContains, /^\{count\}\s/, `${lang}: folder items use count-neutral presentation`);
    const chromeWait = platformizeUiText(catalog.syncPendingAccountWait, lang, "syncPendingAccountWait");
    assert.match(chromeWait, /Google/, `${lang}: account provider must be Google`);
    assert.doesNotMatch(chromeWait, /Firefox|Mozilla|Firefok|Chrome/, `${lang}: obsolete account brand`);
  }
});

// Phase 2B Slice 1: explicit, text-only Recovery vocabulary and unsupported
// Neapolitan Intl formatting. These checks deliberately avoid Sync/storage paths.
test("Phase 2B Recovery headings, item labels and summaries use count-neutral terminology", async () => {
  for (const id of ALL_UI_LOCALES) {
    const { MESSAGES } = await import(`../dist/firefox/core/i18n-locales/${id}.js?phase2b=${Date.now()}`);
    for (const key of ["recoverySafetyCopies", "recoveryLatestCopy", "recoveryPreviousCopy", "recoveryCopiesIntro"]) {
      assert.ok(MESSAGES[key].trim(), `${id}:${key}: visible text required`);
    }
    assert.match(MESSAGES.recoveryCopiesSummary, /\{count\}/, `${id} count placeholder`);
    assert.match(MESSAGES.recoveryCopiesSummary, /\{size\}/, `${id} byte-size placeholder`);
    if (id !== "en") {
      assert.ok(MESSAGES.recoveryCopiesSummary.startsWith(MESSAGES.recoverySafetyCopies),
        `${id}: complete-copy summary must name its Recovery heading`);
    }
  }
});

test("Phase 2B browser-independent English Sync wording and HTML twin remain consistent", async () => {
  const { MESSAGES: en } = await import(`../dist/firefox/core/i18n-locales/en.js?phase2b=${Date.now()}`);
  const html = await readFile(resolve("src/shared/newtab/newtab.html"), "utf8");
  for (const key of ["welcomeSyncDelivery", "syncTimingTitle", "syncWaitAvailable"]) {
    assert.ok(en[key].includes("Firefox Sync transfers"), `${key}: official service name`);
    assert.ok(!en[key].includes("Account Sync transfers"), `${key}: old name absent`);
  }
  assert.ok(html.includes(en.welcomeSyncDelivery), "HTML fallback equals catalog English text");
  assert.ok(!html.includes("Account Sync transfers"), "old fallback literal absent");
});

test("Phase 2B Bulgarian button labels are neutral nouns and Neapolitan Intl maps to Italian", async () => {
  const [{ MESSAGES: bg }, i18n] = await Promise.all([
    import(`../dist/firefox/core/i18n-locales/bg.js?phase2b=${Date.now()}`),
    import(`../dist/firefox/core/i18n.js?phase2b=${Date.now()}`)
  ]);
  assert.equal(bg.save, "Запазване");
  assert.equal(bg.close, "Затваряне");
  assert.equal(bg.delete, "Изтриване");
  assert.equal(bg.continue, "Продължаване");
  assert.equal(i18n.getIntlFormattingLocale("nap"), "it");
  assert.equal(i18n.getIntlFormattingLocale("ca"), "ca");
  assert.equal(i18n.getIntlFormattingLocale("en"), "en");
});

// Audit follow-up: every first-surface Recovery string (including the empty
// state) must use the chosen Recovery-copy term, never the retired backup term.
test("Phase 2B first-surface Recovery strings never fall back to the retired backup term", async () => {
  const retired = {
    bg: /резерв/i, ca: /seguretat/i, cs: /záložn/i, da: /sikkerhedskopi/i, de: /Sicherheitskopie|Sicherungskopie/i,
    el: /ασφαλείας/i, es: /seguridad/i, et: /varukoopia/i, eu: /babeskopia/i, fi: /varmuuskopi/i, fr: /sauvegarde/i,
    ga: /c[úu]ltaca|chúltaca/i, gl: /seguridade/i, hr: /sigurnosn/i, hu: /biztonsági/i, it: /sicurezza/i, ja: /バックアップ/,
    ko: /백업/, lt: /atsargin/i, lv: /dublēj/i, mt: /backup/i, nap: /sicurezza|recùpero/i, nb: /sikkerhetskopi/i,
    nl: /back-up/i, pl: /zapasow/i, pt: /segurança/i, ro: /siguranță/i, sk: /záložn/i, sl: /varnostn/i,
    sv: /säkerhetskopi/i, uk: /резервн/i, "zh-CN": /备份/, "zh-TW": /備份/
  };
  const keys = ["recoverySafetyCopies", "recoveryLatestCopy", "recoveryPreviousCopy", "recoveryCopiesIntro",
    "recoveryCopiesSummary", "recoveryNoCompleteCopies", "syncRecoveryLimitedWarning"];
  for (const id of ALL_UI_LOCALES) {
    if (id === "en") continue;
    const { MESSAGES } = await import(`../dist/firefox/core/i18n-locales/${id}.js?phase2b-retired=${Date.now()}`);
    assert.ok(retired[id], `${id}: retired-term pattern required`);
    for (const key of keys) assert.doesNotMatch(MESSAGES[key], retired[id], `${id}:${key} still uses the retired backup term`);
    // The unmanaged-storage sentence is appended after the summary, so the summary must end a sentence.
    assert.match(MESSAGES.recoveryCopiesSummary, /[.。]$/u, `${id}: summary must end with sentence punctuation`);
    assert.doesNotMatch(MESSAGES.recoveryCopiesSummary, /： /u, `${id}: no space after a full-width colon`);
  }
});

test("language final: common raw URL/image errors are localized at presentation boundary without mutating error codes", async () => {
  const mod = await import(`../dist/firefox/core/i18n.js?language-final-error-${Date.now()}`);
  for (const locale of ["fr", "de", "ja", "bg", "nap", "uk"]) {
    await mod.setLocalePreference(locale);
    const urlError = new Error("Enter a URL.");
    urlError.code = "SHORTCUT_URL_REQUIRED";
    const rendered = mod.localizePresentationError(urlError);
    assert.equal(rendered, mod.t("shortcutUrlRequired"), `${locale}: URL error`);
    assert.equal(urlError.message, "Enter a URL.", `${locale}: raw error mutated`);
    assert.equal(urlError.code, "SHORTCUT_URL_REQUIRED", `${locale}: code mutated`);
    assert.equal(mod.localizePresentationError(new Error("MosaicSync supports http:// and https:// shortcuts.")), mod.t("shortcutUrlHttpOnly"));
    assert.equal(mod.localizePresentationError(new Error("That image is too large. Try one under 7 MB.")), mod.t("imageTooLarge", {maxMB:7}));
    assert.equal(mod.localizePresentationError(new Error("Choose a PNG, JPEG, WebP, GIF, or ICO image.")), mod.t("imageChooseSupportedFormat"));
    assert.equal(mod.localizePresentationError(new Error("That image is empty.")), mod.t("imageEmpty"));
    assert.equal(mod.localizePresentationError(new Error("Unsupported local image.")), mod.t("imageProcessingFailed"));
    assert.equal(mod.localizePresentationError(new Error("UNRECOGNIZED_BROWSER_SPECIFIC_ERROR")), mod.t("operationFailed"));
  }
});

test("language final: every language has grammar-neutral Recovery counts and user-facing error keys", async () => {
  for (const browser of ["firefox", "chrome"]) {
    for (const locale of ALL_UI_LOCALES) {
      const { MESSAGES } = await import(`../dist/${browser}/core/i18n-locales/${locale}.js`);
      for (const key of ["recoverySafeCleanupDetail", "recoveryConfirmSafeCleanup", "recoveryCleanupComplete"]) {
        const text = MESSAGES[key];
        assert.match(text, /\{count\}/, `${browser}/${locale}/${key} count missing`);
        if (key !== "recoveryCleanupComplete") {
          assert.ok(text.includes("({count}") || text.includes("（{count}"), `${browser}/${locale}/${key}: count must be visually detached from grammar`);
        } else {
          assert.ok(/[:：]\s*\{count\}/.test(text), `${browser}/${locale}/${key}: removed copies must use label+count`);
          if (locale === "it") {
            assert.match(text, /Copie di ripristino eliminate:\s*\{count\}/u, `${browser}/it: plural Recovery cleanup label`);
          }
        }
      }
      for (const key of ["shortcutUrlRequired", "shortcutUrlHttpOnly", "imageChooseSupportedFormat", "imageTooLarge", "imageEmpty", "imageProcessingFailed"]) {
        assert.ok(MESSAGES[key].length > 3, `${locale}:${key}`);
      }
    }
  }
});

// Consolidated language corrective: protect the real background messages,
// every catalog, and previously untested destructive-confirmation wording.
test("language corrective: mapped errors handle Chrome wording, English, codes and fallback diagnostics", async () => {
  const syncPermissionSource = "Firefox Account Sync permission is not enabled on this device.";
  const clearSource = "Firefox Sync is still delivering MosaicSync data. Retry Clear Sync copy after synchronization finishes.";
  for (const browser of ["firefox", "chrome"]) {
    const mod = await import(`../dist/${browser}/core/i18n.js?final-corrective=${Date.now()}`);
    const { platformizeUiText } = await import(`../dist/${browser}/core/i18n-platform.js`);
    for (const locale of ["en", "fr", "de"]) {
      await mod.setLocalePreference(locale);
      const permissionText = browser === "chrome" ? platformizeUiText(syncPermissionSource, locale) : syncPermissionSource;
      const permissionError = new Error(permissionText);
      assert.equal(mod.localizePresentationError(permissionError), mod.t("syncPermissionNotGranted"), `${browser}/${locale}: permission mapping`);
      assert.equal(permissionError.message, permissionText, `${browser}/${locale}: raw message preserved`);
      const clearText = browser === "chrome" ? platformizeUiText(clearSource, locale) : clearSource;
      assert.equal(mod.localizePresentationError(new Error(clearText)), mod.t("syncClearStillDelivering"), `${browser}/${locale}: pending Sync delivery`);
      for (const [code, key] of [["STORAGE_LOCAL_QUOTA_EXCEEDED", "localStorageFullUnsaved"], ["STORAGE_LOCAL_WRITE_FAILED", "localSaveFailedUnsaved"]]) {
        const failure = new Error("unmapped storage message");
        failure.code = code;
        assert.equal(mod.localizePresentationError(failure), mod.t(key), `${browser}/${locale}/${code}`);
        assert.equal(failure.code, code, `storage code preserved ${code}`);
      }
      assert.equal(mod.localizePresentationError(new Error("Invalid custom branding logo.")), mod.t("brandingLogoInvalid"));
      assert.equal(mod.localizePresentationError(new Error("toString")), locale === "en" ? "toString" : mod.t("operationFailed"));
      if (locale !== "en") {
        const failure = new Error("UNKNOWN_FROM_BROWSER");
        const previousWarn = console.warn;
        const seen = [];
        console.warn = (...args) => seen.push(args);
        try {
          assert.equal(mod.localizePresentationError(failure), mod.t("operationFailed"));
          assert.ok(seen.some(args => args.includes(failure)), `${browser}/${locale}: raw error must be logged`);
        } finally { console.warn = previousWarn; }
      }
    }
  }
});

test("language corrective: all 34 locales cover every count key and fixed labels avoid inflection", async () => {
  const { MESSAGES: english } = await import('../dist/firefox/core/i18n-locales/en.js');
  const countKeys = Object.keys(english).filter(key => english[key].includes("{count}"));
  assert.deepEqual(countKeys.sort(), ["bookmarksCount", "folderContains", "loadedFirefoxShortcuts", "openedTabsInBackground", "recoveryCleanupComplete", "recoveryConfirmSafeCleanup", "recoveryCopiesSummary", "recoveryDeviceCopyOther", "recoverySafeCleanupDetail", "syncAssetQuotaWarningMany", "syncItemsUsed"].sort());
  for (const locale of ALL_UI_LOCALES) {
    const { MESSAGES } = await import(`../dist/firefox/core/i18n-locales/${locale}.js`);
    assert.equal(Object.keys(MESSAGES).length, 495, `${locale}: complete catalog`);
    assert.deepEqual(Object.keys(MESSAGES).filter(k => MESSAGES[k].includes("{count}")).sort(), countKeys, `${locale}: complete count keys`);
    for (const key of ["bookmarksCount", "folderContains", "openedTabsInBackground", "loadedFirefoxShortcuts", "syncItemsUsed", "recoveryCopiesSummary", "recoveryCleanupComplete", "recoveryDeviceCopyOther"]) {
      assert.match(MESSAGES[key], /\{count\}/, `${locale}/${key}: count missing`);
      // The three corrected user-visible status labels cannot put the count
      // before an inflected noun. Hungarian's Sync noun is count-invariant.
      if (["openedTabsInBackground", "loadedFirefoxShortcuts", "syncItemsUsed"].includes(key) && !["hu", "ja", "zh-CN", "zh-TW"].includes(locale)) {
        assert.doesNotMatch(MESSAGES[key], /\{count\}\s+\p{L}/u, `${locale}/${key}: count-dependent noun`);
      }
    }
  }
});

test("language corrective: all visible Recovery wording, German narrow heading and Bulgarian actions", async () => {
  const retired = {
    bg: /резерв/i, ca: /seguretat/i, cs: /záložn/i, da: /sikkerhedskopi/i, de: /Sicherheitskopie|Sicherungskopie/i,
    el: /ασφαλείας/i, es: /seguridad/i, et: /varukoopia/i, eu: /babeskopia/i, fi: /varmuuskopi/i, fr: /sauvegarde/i,
    ga: /c[úu]ltaca|chúltaca|éigeandála/i, gl: /c[oó]pi(?:a|as) de seguridade/i, hr: /sigurnosn/i, hu: /biztonsági/i, it: /copi(?:a|e) di sicurezza/i,
    ja: /バックアップ/, ko: /백업/, lt: /atsargin/i, lv: /dublēj/i, mt: /backup|għall-emerġenza/i,
    nap: /sicurezza|recùpero/i, nb: /sikkerhetskopi|nødkopiene/i, nl: /back-up/i, pl: /zapasow/i, pt: /c[oó]pias? de seguran[çc]a/i,
    ro: /copi(?:a|i) de siguranță/i, sk: /záložn/i, sl: /varnostn|kopij za nujne primere/i, sv: /säkerhetskopi/i,
    uk: /резервн/i, "zh-CN": /备份/, "zh-TW": /備份/
  };
  for (const locale of ALL_UI_LOCALES) {
    const { MESSAGES } = await import(`../dist/firefox/core/i18n-locales/${locale}.js`);
    if (locale === "en") continue;
    const keys = Object.keys(MESSAGES).filter(key => key.startsWith("recovery") || key.startsWith("syncRecovery") || key === "syncOldDeviceRecoveryHint");
    for (const key of keys) {
      if (key === "recoveryDeviceCopyOne") continue; // Unused legacy key; explicitly optional P3.
      assert.doesNotMatch(MESSAGES[key], retired[locale], `${locale}/${key}: retired Recovery term`);
    }
  }
  const [{ MESSAGES: de }, { MESSAGES: bg }] = await Promise.all([
    import('../dist/firefox/core/i18n-locales/de.js'),
    import('../dist/firefox/core/i18n-locales/bg.js')
  ]);
  assert.ok(de.recoverySafetyCopies.includes("­"), "German Recovery heading needs a soft hyphen at 420px");
  assert.ok(de.recoveryCopiesSummary.includes("­"), "German summary needs a soft hyphen");
  for (const key of ["save", "close", "delete", "continue", "cancel", "reset", "apply", "clear", "recoveryFreeSafely", "recoveryRemoveDeviceCopies"]) {
    assert.doesNotMatch(bg[key], /^(?:Въведи|Избери|Натисни|Продължи|Запази|Изтрий|Премахни|Отвори|Опитай|Изчисти|Приложи|Нулирай)(?:\s|[.!?]|$)/u, `${key}: informal Bulgarian action`);
  }
});
