import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir = resolve("src/shared/core/i18n-locales");
const localeFiles = (await readdir(sourceDir)).filter(name => name.endsWith(".js")).sort();
const load = async file => (await import(`../src/shared/core/i18n-locales/${file}?integrity13212=${Date.now()}-${file}`)).MESSAGES;
const english = await load("en.js");

const CRITICAL_TRANSLATED_KEYS = Object.freeze([
  "mosaicBrand", "syncStorage", "manageRecoveryCopies",
  "recoveryCopiesIntro", "recoveryCopiesSummary", "recoveryCopiesUnmanaged",
  "recoverySafeCleanupTitle", "recoverySafeCleanupDetail", "recoveryFreeSafely",
  "recoveryDeviceLabel", "recoveryLatestCopy", "recoveryPreviousCopy", "recoveryProtected",
  "recoveryDeletePrevious", "recoveryRemoveDeviceCopies", "recoveryNoCompleteCopies",
  "recoveryManagerFootnote", "recoveryConfirmSafeCleanup", "recoveryConfirmGeneration",
  "recoveryConfirmDevice", "recoveryCleanupComplete", "recoveryCopiesChanged",
  "customBranding", "customBrandingIdentity", "customBrandingIntro", "brandingDeviceLocalOnly",
  "brandingDeviceLocalNote", "brandingShow", "brandingNoLogo", "brandingChooseLogo",
  "brandingRemoveLogo", "brandingLogoHelp", "brandingCustomText", "brandingTextPlaceholder",
  "brandingTextHelp", "brandingRestoreDefault", "brandingSave", "brandingSaved",
  "brandingSaveFailed", "brandingLogoInvalid"
]);

const REVIEWED_EXACT_ENGLISH = new Set([
  // French "source" is the same word and grammar here.
  "fr.js:syncSourceId",
  // Maltese Firefox UI already uses the borrowed technical term "bookmarks" throughout the catalog.
  "mt.js:bookmarksCount"
]);

const hasMultipleWords = value => String(value).trim().split(/\s+/u).length >= 2;

const UNIVERSAL_INVARIANT_KEYS = new Set([
  "firefox", "url", "hex", "github"
]);

// Every remaining exact-English spelling below was reviewed in context. These are
// genuine cognates, established technical loans, product terminology, or words
// whose standard local spelling is identical to English. Keeping this list
// explicit means a future untranslated single-word label cannot silently pass.
const REVIEWED_SAME_SPELLING = new Set([
  "ca.js:personal",
  "cs.js:builtinIconFinance", "cs.js:builtinIconVideo", "cs.js:builtinIconCloud", "cs.js:brandingLogo",
  "da.js:system", "da.js:support", "da.js:builtinIconMail", "da.js:builtinIconShopping", "da.js:builtinIconVideo", "da.js:shortcutColorOrange", "da.js:shortcutColorViolet", "da.js:shortcutColorPink", "da.js:brandingLogo",
  "de.js:name", "de.js:system", "de.js:website", "de.js:support", "de.js:builtinIconVideo", "de.js:builtinIconCode", "de.js:builtinIconCloud", "de.js:shortcutColorOrange", "de.js:brandingLogo",
  "el.js:sync", "el.js:builtinIconCloud",
  "es.js:personal",
  "et.js:sync", "et.js:builtinIconVideo", "et.js:brandingLogo",
  "fi.js:builtinIconVideo", "fi.js:brandingLogo",
  "fr.js:graphiteColor", "fr.js:syncSourceId", "fr.js:builtinIconCode", "fr.js:builtinIconCloud", "fr.js:shortcutColorOrange", "fr.js:shortcutColorViolet", "fr.js:brandingLogo",
  "hr.js:builtinIconVideo",
  "hu.js:sync", "hu.js:brandingLogo",
  "it.js:privacy", "it.js:builtinIconHome", "it.js:builtinIconVideo", "it.js:builtinIconCloud", "it.js:brandingLogo",
  "lt.js:sync",
  "lv.js:sync", "lv.js:builtinIconVideo",
  "mt.js:bookmarks", "mt.js:bookmarksCount", "mt.js:shortcuts", "mt.js:shortcut", "mt.js:sync", "mt.js:brandingLogo",
  "nap.js:privacy", "nap.js:builtinIconVideo", "nap.js:brandingLogo",
  "nb.js:system", "nb.js:builtinIconShopping", "nb.js:builtinIconVideo", "nb.js:brandingLogo",
  "nl.js:privacy", "nl.js:website", "nl.js:builtinIconVideo", "nl.js:builtinIconCode", "nl.js:builtinIconCloud", "nl.js:shortcutColorAmber", "nl.js:shortcutColorViolet", "nl.js:brandingLogo",
  "pl.js:system", "pl.js:folder", "pl.js:brandingLogo",
  "ro.js:personal", "ro.js:builtinIconVideo", "ro.js:builtinIconCloud", "ro.js:shortcutColorViolet", "ro.js:brandingLogo",
  "sk.js:builtinIconVideo", "sk.js:builtinIconCloud", "sk.js:brandingLogo",
  "sl.js:sync", "sl.js:builtinIconFinance", "sl.js:builtinIconVideo",
  "sv.js:system", "sv.js:support", "sv.js:builtinIconShopping", "sv.js:builtinIconVideo", "sv.js:shortcutColorOrange", "sv.js:brandingLogo"
]);


test("1.32.1.3 every non-English locale translates the Recovery and Custom Branding surfaces", async () => {
  for (const file of localeFiles) {
    if (file === "en.js") continue;
    const messages = await load(file);
    for (const key of CRITICAL_TRANSLATED_KEYS) {
      assert.notEqual(messages[key], english[key], `${file}:${key} must not fall back to English`);
    }
  }
});


test("1.32.1.3 every exact-English non-English catalog cell is explicitly reviewed", async () => {
  for (const file of localeFiles) {
    if (file === "en.js") continue;
    const messages = await load(file);
    for (const [key, value] of Object.entries(messages)) {
      if (value !== english[key]) continue;
      assert.ok(
        UNIVERSAL_INVARIANT_KEYS.has(key) || REVIEWED_SAME_SPELLING.has(`${file}:${key}`),
        `${file}:${key} exactly matches English without an explicit linguistic/technical review: ${value}`
      );
    }
  }
});

test("1.32.1.3 non-English catalogs reject unreviewed exact-English multi-word fallbacks", async () => {
  for (const file of localeFiles) {
    if (file === "en.js") continue;
    const messages = await load(file);
    for (const [key, value] of Object.entries(messages)) {
      if (value !== english[key] || !hasMultipleWords(value)) continue;
      assert.ok(REVIEWED_EXACT_ENGLISH.has(`${file}:${key}`), `${file}:${key} is an unreviewed exact-English fallback: ${value}`);
    }
  }
});

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

const REVIEWED_STATIC_HTML = new Set([
  "MosaicSync",
  "MPL 2.0",
  "0 KB",
  "0 KB / 100 KB",
  "100 KB",
  "76px",
  "A",
  "×",
  "https://example.com",
  "https://example.com/icon.png",
  // Replaced as one dynamic sentence from two localized status keys once the FV controller initializes.
  "Firefox permission is required to show frequently visited pages. Sites come from this browser only. Show and Count preferences sync; browsing history is never synchronized."
]);

function isVersionEyebrow(value) {
  return /^MosaicSync · \d+(?:\.\d+)+$/u.test(value);
}

test("1.32.1.3 visible New Tab HTML literals are localizable or explicitly invariant", async () => {
  const html = await readFile(resolve("src/shared/newtab/newtab.html"), "utf8");
  const englishValues = new Set(Object.values(english));
  const stripped = html
    .replace(/<!--.*?-->/gs, "")
    .replace(/<(script|style|svg)\b.*?<\/\1>/gis, "");
  const candidates = [];
  for (const match of stripped.matchAll(/>([^<>]+)</g)) {
    const value = decodeHtml(match[1]).trim();
    if (value && /[A-Za-zÀ-ÿ]/u.test(value)) candidates.push(value);
  }
  for (const attribute of ["aria-label", "title", "placeholder"]) {
    const pattern = new RegExp(`\\b${attribute}="([^"]+)"`, "g");
    for (const match of stripped.matchAll(pattern)) {
      const value = decodeHtml(match[1]).trim();
      if (value && /[A-Za-zÀ-ÿ]/u.test(value)) candidates.push(value);
    }
  }
  for (const value of new Set(candidates)) {
    assert.ok(
      englishValues.has(value) || REVIEWED_STATIC_HTML.has(value) || isVersionEyebrow(value),
      `visible New Tab literal bypasses localization: ${value}`
    );
  }
  assert.match(html, /<p class="eyebrow">Sync storage<\/p>/, "Recovery manager eyebrow must remain keyed by the English source catalog");
  assert.equal(english.syncStorage, "Sync storage");
});
