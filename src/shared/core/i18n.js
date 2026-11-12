/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { MESSAGES as EN_MESSAGES } from "./i18n-locales/en.js";
import { LOADED_LOCALE_CATALOG_MAX, UI_LOCALE_STORAGE_KEY } from "./constants.js";
import { platformizeUiText } from "./i18n-platform.js";

export { UI_LOCALE_STORAGE_KEY };

export const SUPPORTED_LOCALES = Object.freeze([
  { id: "bg", label: "Български" },
  { id: "ca", label: "Català" },
  { id: "cs", label: "Čeština" },
  { id: "da", label: "Dansk" },
  { id: "de", label: "Deutsch" },
  { id: "et", label: "Eesti" },
  { id: "el", label: "Ελληνικά" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "eu", label: "Euskara" },
  { id: "fr", label: "Français" },
  { id: "ga", label: "Gaeilge" },
  { id: "gl", label: "Galego" },
  { id: "hr", label: "Hrvatski" },
  { id: "it", label: "Italiano" },
  { id: "lv", label: "Latviešu" },
  { id: "lt", label: "Lietuvių" },
  { id: "hu", label: "Magyar" },
  { id: "mt", label: "Malti" },
  { id: "nap", label: "Napulitano" },
  { id: "nl", label: "Nederlands" },
  { id: "nb", label: "Norsk bokmål" },
  { id: "pl", label: "Polski" },
  { id: "pt", label: "Português" },
  { id: "ro", label: "Română" },
  { id: "sk", label: "Slovenčina" },
  { id: "sl", label: "Slovenščina" },
  { id: "fi", label: "Suomi" },
  { id: "sv", label: "Svenska" },
  { id: "uk", label: "Українська" },
  { id: "ja", label: "日本語" },
  { id: "zh-CN", label: "简体中文" },
  { id: "zh-TW", label: "繁體中文" },
  { id: "ko", label: "한국어" }
]);

const SUPPORTED_IDS = new Set(SUPPORTED_LOCALES.map(locale => locale.id));
const LOCALE_LOADERS = Object.freeze({
  "ca": () => import("./i18n-locales/ca.js"),
  "it": () => import("./i18n-locales/it.js"),
  "es": () => import("./i18n-locales/es.js"),
  "fr": () => import("./i18n-locales/fr.js"),
  "de": () => import("./i18n-locales/de.js"),
  "nl": () => import("./i18n-locales/nl.js"),
  "ga": () => import("./i18n-locales/ga.js"),
  "gl": () => import("./i18n-locales/gl.js"),
  "da": () => import("./i18n-locales/da.js"),
  "fi": () => import("./i18n-locales/fi.js"),
  "nb": () => import("./i18n-locales/nb.js"),
  "sv": () => import("./i18n-locales/sv.js"),
  "ko": () => import("./i18n-locales/ko.js"),
  "ja": () => import("./i18n-locales/ja.js"),
  "pt": () => import("./i18n-locales/pt.js"),
  "nap": () => import("./i18n-locales/nap.js"),
  "pl": () => import("./i18n-locales/pl.js"),
  "cs": () => import("./i18n-locales/cs.js"),
  "zh-CN": () => import("./i18n-locales/zh-CN.js"),
  "zh-TW": () => import("./i18n-locales/zh-TW.js"),
  "eu": () => import("./i18n-locales/eu.js"),
  "bg": () => import("./i18n-locales/bg.js"),
  "hr": () => import("./i18n-locales/hr.js"),
  "et": () => import("./i18n-locales/et.js"),
  "el": () => import("./i18n-locales/el.js"),
  "hu": () => import("./i18n-locales/hu.js"),
  "lv": () => import("./i18n-locales/lv.js"),
  "lt": () => import("./i18n-locales/lt.js"),
  "mt": () => import("./i18n-locales/mt.js"),
  "ro": () => import("./i18n-locales/ro.js"),
  "sk": () => import("./i18n-locales/sk.js"),
  "sl": () => import("./i18n-locales/sl.js"),
  "uk": () => import("./i18n-locales/uk.js"),
});
const SOURCE_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(EN_MESSAGES).map(([key, value]) => [value, key])
));
const loadedMessages = new Map([["en", EN_MESSAGES]]);

function rememberLoadedMessages(locale, catalog) {
  if (locale === "en") return;
  // Map insertion order doubles as a tiny LRU. Keep English plus only a few
  // recently selected catalogs; switching through every language in one tab
  // must not retain all 34 dictionaries indefinitely.
  loadedMessages.delete(locale);
  loadedMessages.set(locale, catalog);
  while (loadedMessages.size > LOADED_LOCALE_CATALOG_MAX) {
    const oldest = loadedMessages.keys().next().value;
    if (oldest === "en") {
      const english = loadedMessages.get("en");
      loadedMessages.delete("en");
      loadedMessages.set("en", english);
      continue;
    }
    loadedMessages.delete(oldest);
  }
}

let cachedLocalePreference = null;
let cachedEffectiveLocale = null;
let activeLocale = "en";
let activeMessages = EN_MESSAGES;
let localeActivationGeneration = 0;

function normalizeBrowserLocale(value) {
  const raw = String(value || "").replace(/_/g, "-");
  const lower = raw.toLowerCase();
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower.startsWith("zh-hant")) return "zh-TW";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("pt")) return "pt";
  if (lower.startsWith("nb") || lower.startsWith("no")) return "nb";
  const primary = lower.split("-")[0];
  return SUPPORTED_IDS.has(primary) ? primary : "en";
}

export function getLocalePreference() {
  if (cachedLocalePreference !== null) return cachedLocalePreference;
  try {
    const value = localStorage.getItem(UI_LOCALE_STORAGE_KEY) || "auto";
    cachedLocalePreference = value === "auto" || SUPPORTED_IDS.has(value) ? value : "auto";
  } catch {
    cachedLocalePreference = "auto";
  }
  return cachedLocalePreference;
}

// Neapolitan has no dedicated Intl locale in the supported browsers.
// Italian is the nearest formatting fallback; the visible UI remains Neapolitan.
export function getIntlFormattingLocale(locale = getEffectiveLocale()) {
  return locale === "nap" ? "it" : locale;
}

export function getEffectiveLocale() {
  if (cachedEffectiveLocale !== null) return cachedEffectiveLocale;
  const preference = getLocalePreference();
  if (preference !== "auto") {
    cachedEffectiveLocale = preference;
    return cachedEffectiveLocale;
  }
  try {
    cachedEffectiveLocale = normalizeBrowserLocale(browser.i18n?.getUILanguage?.() || globalThis.navigator?.language || "en");
  } catch {
    cachedEffectiveLocale = normalizeBrowserLocale(globalThis.navigator?.language || "en");
  }
  return cachedEffectiveLocale;
}

async function loadLocaleMessages(locale) {
  const normalized = SUPPORTED_IDS.has(locale) ? locale : "en";
  if (loadedMessages.has(normalized)) return loadedMessages.get(normalized);
  const loadLocale = LOCALE_LOADERS[normalized];
  if (!loadLocale) return EN_MESSAGES;
  try {
    // Every dynamic import target is a literal bundled module. This keeps lazy
    // locale loading while remaining statically auditable by extension validators.
    const module = await loadLocale();
    const catalog = module.MESSAGES && typeof module.MESSAGES === "object" ? module.MESSAGES : EN_MESSAGES;
    rememberLoadedMessages(normalized, catalog);
    return catalog;
  } catch (error) {
    console.warn(`MosaicSync: could not load locale ${normalized}`, error);
    return EN_MESSAGES;
  }
}

async function activateEffectiveLocale() {
  const generation = ++localeActivationGeneration;
  const locale = getEffectiveLocale();
  const catalog = await loadLocaleMessages(locale);
  if (generation !== localeActivationGeneration) return getEffectiveLocale();
  activeMessages = catalog;
  activeLocale = locale;
  return locale;
}

// The initial page waits only for English plus the one active locale. This
// replaces the old 21-language monolithic catalog on every New Tab.
await activateEffectiveLocale();

export async function setLocalePreference(value) {
  const normalized = value === "auto" || SUPPORTED_IDS.has(value) ? value : "auto";
  try { localStorage.setItem(UI_LOCALE_STORAGE_KEY, normalized); } catch {}
  cachedLocalePreference = normalized;
  cachedEffectiveLocale = null;
  await activateEffectiveLocale();
  return normalized;
}


function formatPlaceholders(value, replacements) {
  if (!replacements || typeof replacements !== "object") return value;
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match
  );
}

export function t(key, replacements = null, locale = getEffectiveLocale()) {
  const english = EN_MESSAGES[key] ?? key;
  const catalog = locale === activeLocale ? activeMessages : (loadedMessages.get(locale) || EN_MESSAGES);
  const translated = catalog?.[key] ?? english;
  return formatPlaceholders(platformizeUiText(translated, locale, key), replacements);
}

// Errors retain their original message and code for diagnostics and control flow.
// Only the display boundary translates them. The background's wording can
// already have been adapted to Chrome before it reaches this function.
const PRESENTATION_ERROR_KEYS = Object.freeze({
  "Enter a URL.": "shortcutUrlRequired",
  "MosaicSync supports http:// and https:// shortcuts.": "shortcutUrlHttpOnly",
  "Choose a PNG, JPEG, WebP, GIF, or ICO image.": "imageChooseSupportedFormat",
  "That image is empty.": "imageEmpty",
  "Profile changed on this device during import. Please retry the import.": "profileImportChangedRetry",
  "Firefox Account Sync permission is not enabled on this device.": "syncPermissionNotGranted",
  "Firefox Sync storage is full. MosaicSync kept your local data unchanged.": "syncStorageFull",
  "Firefox Sync is still delivering MosaicSync data. Retry Clear Sync copy after synchronization finishes.": "syncClearStillDelivering",
  "Invalid custom branding logo.": "brandingLogoInvalid",
  "PROFILE_SYNC_PUBLISH_FAILED": "couldNotPublish",
  "BOOKMARK_MODULE_NOT_READY": "bookmarksLoadError"
});

// Error codes are more reliable than browser- or locale-specific messages.
const PRESENTATION_ERROR_CODE_KEYS = Object.freeze({
  STORAGE_LOCAL_QUOTA_EXCEEDED: "localStorageFullUnsaved",
  STORAGE_LOCAL_WRITE_FAILED: "localSaveFailedUnsaved"
});

export function localizePresentationError(error, fallbackKey = "operationFailed") {
  const message = typeof error === "string" ? error : String(error?.message || "");
  const code = error && typeof error === "object" ? error.code : null;
  const codeKey = code && Object.prototype.hasOwnProperty.call(PRESENTATION_ERROR_CODE_KEYS, code)
    ? PRESENTATION_ERROR_CODE_KEYS[code] : null;
  if (codeKey) return t(codeKey);

  const locale = getEffectiveLocale();
  if (!message) {
    console.warn("MosaicSync: no message for presentation error", error);
    return t(fallbackKey);
  }
  // Mapped errors must use the translated catalog even in English. This also
  // prevents the retired 'Firefox Account Sync' internal text from surfacing.
  const directKey = Object.prototype.hasOwnProperty.call(PRESENTATION_ERROR_KEYS, message)
    ? PRESENTATION_ERROR_KEYS[message]
    : (Object.prototype.hasOwnProperty.call(SOURCE_KEYS, message) ? SOURCE_KEYS[message] : null);
  if (directKey) return t(directKey);

  // Chrome's background adapter may already have changed 'Firefox' to 'Chrome'.
  // Check the adapted *source* against the message, without changing the error.
  for (const [source, key] of Object.entries(PRESENTATION_ERROR_KEYS)) {
    if (platformizeUiText(source, locale) === message) return t(key);
  }
  for (const [source, key] of Object.entries(SOURCE_KEYS)) {
    if (platformizeUiText(source, locale, key) === message) return t(key);
  }

  const limit = /^That image is too large\. Try (?:one|a file) under (\d+) MB\.$/.exec(message);
  if (limit) return t("imageTooLarge", { maxMB: limit[1] });
  if (/^(?:Unsupported local image\.|Remote image is too large\.|That image has invalid dimensions\.|That image is too large to process safely\.|Couldn't (?:read|decode|encode|optimize) (?:the |an? )?image|Image worker |The image worker |Worker image optimization |This Firefox build couldn't create an image canvas)/.test(message)) {
    return t("imageProcessingFailed");
  }
  // Preserve messages already localized by the caller, including Chrome's
  // platformized translation. A known translated message is not an unknown error.
  for (const [key, value] of Object.entries(activeMessages)) {
    if (value === message || platformizeUiText(value, locale, key) === message) return message;
  }
  if (locale === "en") return message; // Raw English only for truly unmatched errors.
  console.warn("MosaicSync: unrecognized presentation error", error);
  return t(fallbackKey);
}

export function translateText(source, replacements = null, locale = getEffectiveLocale()) {
  const key = SOURCE_KEYS[source];
  return key ? t(key, replacements, locale) : formatPlaceholders(platformizeUiText(String(source ?? ""), locale), replacements);
}

export function setDocumentLocale(root = document) {
  const locale = getEffectiveLocale();
  const doc = root?.nodeType === 9 ? root : (root?.ownerDocument || globalThis.document);
  doc?.documentElement?.setAttribute("lang", locale);
  doc?.documentElement?.setAttribute("dir", "ltr");
  return locale;
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "SVG", "PATH", "TITLE"]);
const TEXT_NODE_KEYS = new WeakMap();
const ATTRIBUTE_KEYS = new WeakMap();

function translationKeyForTextNode(node, trimmed) {
  const remembered = TEXT_NODE_KEYS.get(node);
  if (remembered && remembered.lastValue === trimmed) return remembered.key;
  const key = SOURCE_KEYS[trimmed];
  if (key) TEXT_NODE_KEYS.set(node, { key, lastValue: trimmed });
  else if (remembered) TEXT_NODE_KEYS.delete(node);
  return key || "";
}

function rememberRenderedText(node, key, value) {
  if (key) TEXT_NODE_KEYS.set(node, { key, lastValue: value });
}

function translationKeyForAttribute(element, attribute, value) {
  let remembered = ATTRIBUTE_KEYS.get(element);
  if (!remembered) {
    remembered = new Map();
    ATTRIBUTE_KEYS.set(element, remembered);
  }
  const cached = remembered.get(attribute);
  if (cached && cached.lastValue === value) return cached.key;
  const key = SOURCE_KEYS[value];
  if (key) remembered.set(attribute, { key, lastValue: value });
  else if (cached) remembered.delete(attribute);
  return key || "";
}

function rememberRenderedAttribute(element, attribute, key, value) {
  if (!key) return;
  let remembered = ATTRIBUTE_KEYS.get(element);
  if (!remembered) {
    remembered = new Map();
    ATTRIBUTE_KEYS.set(element, remembered);
  }
  remembered.set(attribute, { key, lastValue: value });
}

export function localizeDocument(root = document) {
  const locale = setDocumentLocale(root);
  const doc = root?.nodeType === 9 ? root : (root?.ownerDocument || globalThis.document);
  const base = root?.nodeType === 9 ? (root.body || root.documentElement) : root;
  if (!doc?.createTreeWalker || !base) return locale;
  const walker = doc.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest("[data-i18n-skip]")) continue;
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = translationKeyForTextNode(node, trimmed);
    if (!key) continue;
    const translated = t(key, null, locale);
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${translated}${trailing}`;
    rememberRenderedText(node, key, translated);
  }
  const localizeAttributes = element => {
    if (!element || element.closest?.("[data-i18n-skip]")) return;
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      const value = element.getAttribute?.(attribute);
      if (!value) continue;
      const key = translationKeyForAttribute(element, attribute, value);
      if (key) {
        const translated = t(key, null, locale);
        element.setAttribute(attribute, translated);
        rememberRenderedAttribute(element, attribute, key, translated);
      }
    }
  };
  if (root?.nodeType === 1 && root.matches?.("[aria-label], [title], [placeholder]")) localizeAttributes(root);
  for (const element of root.querySelectorAll?.("[aria-label], [title], [placeholder]") || []) localizeAttributes(element);
  return locale;
}

export function populateLanguageSelect(select) {
  if (!select) return;
  const preference = getLocalePreference();
  select.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = t("languageAuto");
  select.append(auto);
  for (const locale of SUPPORTED_LOCALES) {
    const option = document.createElement("option");
    option.value = locale.id;
    option.textContent = locale.label;
    select.append(option);
  }
  select.value = preference;
}
