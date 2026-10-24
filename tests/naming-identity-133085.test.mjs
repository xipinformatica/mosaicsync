// @kind behavioral
// Automatic shortcut naming: website identity, path independence, page titles for specific
// pages, tracking-link home pages and no post-save rename after an accepted suggestion.
// Proposed by the independent Claude naming audit of 1.33.0.84.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import * as ui from "../src/shared/newtab/ui-utils.js";

const newtab = readFileSync(new URL("../src/shared/newtab/newtab.js", import.meta.url), "utf8");
// Audit-only bridge: on unmodified 1.33.0.84 the same expectations run against its two
// existing call sites, so every behavioural assertion below is red before the correction.
const legacy = (result, current) => result?.ok
  ? (ui.cleanShortcutPageTitle(result.siteName, current, result.finalPageUrl) || ui.cleanShortcutPageTitle(result.title, current, result.finalPageUrl))
  : "";
const choose = typeof ui.chooseShortcutPageName === "function" ? ui.chooseShortcutPageName : legacy;
const meta = (url, title, siteName = "") => ({ ok: true, title, siteName, finalPageUrl: url });
// Editor lookup (fallback = offline name), then the post-save lookup against the saved name.
function nameAfterSave(url, result) {
  const offline = ui.friendlyShortcutName(url);
  const editor = choose(result, offline, url) || offline;
  return choose(result, editor, url) || editor;
}

test("naming: both call sites use the single URL-based chooser", () => {
  assert.equal(typeof ui.chooseShortcutPageName, "function");
  assert.match(newtab, /const title = chooseShortcutPageName\(result, fallback, url\);/);
  assert.match(newtab, /const title = chooseShortcutPageName\(result, saved\.title, saved\.url\);/);
  assert.doesNotMatch(newtab, /cleanShortcutPageTitle\(result\.(?:siteName|title), saved\.title/);
});

test("naming: homepage keeps the brand instead of a marketing title (Tesla)", () => {
  const title = "Electric Cars, Solar & Clean Energy | Tesla";
  assert.equal(nameAfterSave("https://tesla.com/", meta("https://tesla.com/", title, "Tesla")), "Tesla");
  assert.equal(nameAfterSave("https://tesla.com/", meta("https://tesla.com/", title)), "Tesla");
  for (const [url, page, site, want] of [
    ["https://notion.com/", "The AI workspace that works for you. | Notion", "Notion", "Notion"],
    ["https://slack.com/", "AI work management & productivity tools | Slack", "Slack", "Slack"],
    ["https://mozilla.org/", "Internet for people, not profit — Mozilla Global", "Mozilla", "Mozilla"],
    ["https://figma.com/", "Figma: The Collaborative Interface Design Tool", "", "Figma"],
    ["https://wise.com/", "Wise, the international account", "", "Wise"],
    ["https://x.com/", "X. It’s what’s happening / X", "X (formerly Twitter)", "X"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: redundant domain suffix is removed only from a multi-word name (Le Monde)", () => {
  const title = "Le Monde.fr - Actualités et Infos en France et dans le monde";
  assert.equal(nameAfterSave("https://lemonde.fr/", meta("https://lemonde.fr/", title, "LeMonde.fr")), "Le Monde");
  assert.equal(nameAfterSave("https://lemonde.fr/", meta("https://lemonde.fr/", title)), "Le Monde");
  for (const [url, page, site, want] of [
    ["https://booking.com/", "Booking.com | Official site | The best hotels", "Booking.com", "Booking.com"],
    ["https://hotels.com/", "Hotels.com - Deals & Discounts", "Hotels.com", "Hotels.com"],
    ["https://last.fm/", "Last.fm | Play music, find songs, and discover artists", "Last.fm", "Last.fm"],
    ["https://www.gov.uk/", "Welcome to GOV.UK", "GOV.UK", "GOV.UK"],
    ["https://amazon.com/", "Amazon.com. Spend less. Smile more.", "", "Amazon.com"],
    ["https://gencat.cat/", "Generalitat de Catalunya | gencat.cat", "", "Generalitat de Catalunya"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: the saved name never depends on whether the user waited before saving", () => {
  const cases = [
    ["https://elpais.com/", "EL PAÍS: el periódico global", "El País"],
    ["https://ebay.co.uk/", "Electronics, Cars, Fashion, Collectibles & More | eBay", "eBay"],
    ["https://store.steampowered.com/", "Welcome to Steam", "Steam"],
    ["https://www.gov.uk/", "Welcome to GOV.UK", "GOV.UK"],
    ["https://docs.google.com/document/d/abc/edit", "Quarterly plan - Google Docs", "Google Docs"],
    ["https://tesla.com/model3", "Model 3 | Tesla", "Tesla"]
  ];
  for (const [url, page, site] of cases) {
    const result = meta(url, page, site);
    const offline = ui.friendlyShortcutName(url);
    const enterThenSave = choose(result, offline, url) || offline;   // Enter: post-save lookup only
    assert.equal(nameAfterSave(url, result), enterThenSave, url);     // waited for the editor lookup
    assert.equal(choose(result, enterThenSave, url), "", `${url}: second lookup must not rename`);
  }
});

test("naming: deep links keep the page's own title", () => {
  assert.equal(nameAfterSave("https://tesla.com/model3", meta("https://tesla.com/model3", "Model 3 | Tesla", "Tesla")), "Model 3");
  const doc = "https://docs.google.com/document/d/abc/edit";
  assert.equal(nameAfterSave(doc, meta(doc, "Quarterly plan - Google Docs", "Google Docs")), "Quarterly plan");
  const article = "https://lemonde.fr/economie/article/2026/10/01/x.html";
  assert.equal(nameAfterSave(article, meta(article, "Le budget 2027 en cinq questions", "Le Monde.fr")), "Le budget 2027 en cinq questions");
});

test("naming: brands that differ from the domain and non-Latin names are preserved", () => {
  for (const [url, page, site, want] of [
    ["https://nytimes.com/", "The New York Times - Breaking News", "The New York Times", "The New York Times"],
    ["https://yandex.ru/", "Яндекс — быстрый поиск в интернете", "Яндекс", "Яндекс"],
    ["https://aljazeera.net/", "الجزيرة نت: آخر أخبار اليوم حول العالم", "الجزيرة نت", "الجزيرة نت"],
    ["https://yahoo.co.jp/", "Yahoo! JAPAN", "Yahoo! JAPAN", "Yahoo! JAPAN"],
    ["https://bit.ly/", "Bitly | URL Shortener, QR Codes, and Link-in-bio", "", "Bitly"],
    ["https://xn--mnchen-3ya.de/", "München – Offizielles Stadtportal", "", "München"],
    ["https://alice.github.io/", "Alice Chen – Portfolio", "GitHub", "Alice Chen"],
    ["https://blog.acme.dev/", "Acme Engineering – Medium", "Medium", "Acme Engineering"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: generic names are ignored in several languages", () => {
  assert.equal(nameAfterSave("https://example-shop.com/", meta("https://example-shop.com/", "Home", "Website")), "Example shop");
  for (const [url, page, want] of [
    ["https://acmebakery.com/", "Home | Acme Bakery", "Acme Bakery"],
    ["https://stadt-koeln.de/", "Startseite - Stadt Köln", "Stadt Köln"],
    ["https://madrid.es/", "Inicio - Ayuntamiento de Madrid", "Ayuntamiento de Madrid"],
    ["https://service-public.fr/", "Accueil | Service-Public.fr", "Service-Public.fr"]
  ]) assert.equal(nameAfterSave(url, meta(url, page)), want, url);
});

test("naming: untrusted, transient and failed results keep the offline name", () => {
  const url = "https://acme-portal.com/";
  for (const result of [
    meta(url, "Sign in – Acme"), meta(url, "Just a moment..."), meta(url, "404 Not Found"), meta(url, "Access Denied"),
    meta(url, "", "Pay\u202Elap"), meta(url, "A".repeat(600)), meta("https://acme-portal.com/login?return_to=/", "Acme Portal"),
    { ok: false, title: "" }, null
  ]) assert.equal(nameAfterSave(url, result), "Acme portal", JSON.stringify(result));
  assert.equal(choose(meta(url, "Acme"), "Acme portal", "not a url"), "");
});

test("naming: real Firefox and Chrome backgrounds feed the chooser end to end", () => {
  for (const browser of ["firefox", "chrome"]) {
    const child = spawnSync(process.execPath, ["tests/harness/background-runtime-scenario.mjs", browser, "naming-identity"], { encoding: "utf8", timeout: 30000 });
    assert.equal(child.status, 0, child.stderr.slice(-800));
    const results = JSON.parse(child.stdout.trim().split("\n").at(-1));
    const want = { "https://tesla.com/": "Tesla", "https://lemonde.fr/": "Le Monde", "https://tesla.com/model3": "Model 3", "https://booking.com/": "Booking.com" };
    for (const [url, name] of Object.entries(want)) assert.equal(nameAfterSave(url, results[url]), name, `${browser} ${url}`);
  }
});

test("naming: tracking, share and language links to a home page still get the brand", () => {
  for (const [url, page, site, want] of [
    ["https://tesla.com/?utm_source=email", "Electric Cars, Solar & Clean Energy | Tesla", "Tesla", "Tesla"],
    ["https://lemonde.fr/?utm_medium=referral", "Le Monde.fr - Actualités et Infos en France et dans le monde", "LeMonde.fr", "Le Monde"],
    ["https://figma.com/?ref=partner", "Figma: The Collaborative Interface Design Tool", "Figma", "Figma"],
    ["https://notion.com/?fbclid=IwAR0abc", "The AI workspace that works for you. | Notion", "Notion", "Notion"],
    ["https://slack.com/#features", "AI work management & productivity tools | Slack", "Slack", "Slack"],
    ["https://tesla.com/es_es", "Coches eléctricos, energía solar y limpia | Tesla España", "Tesla", "Tesla"],
    ["https://booking.com/?aid=304142", "Booking.com | Official site | The best hotels", "Booking.com", "Booking.com"],
    ["https://apple.com/tv", "Apple TV - Apple", "Apple", "Apple TV"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: a query that selects the content keeps that page's own title", () => {
  for (const [url, page, site, want] of [
    ["https://google.com/?q=weather", "weather - Google Search", "", "weather"],
    ["https://exampleblog.net/?p=123", "My first post – Example Blog", "Example Blog", "My first post"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: articles keep their own title, not the publisher or the hosting platform", () => {
  for (const [url, page, site, want] of [
    ["https://www.nytimes.com/2026/10/24/world/news", "The President Addresses the Nation - The New York Times", "The New York Times", "The President Addresses the Nation"],
    ["https://blog.acme.dev/article/hello", "How we built the future – Acme Engineering", "Medium", "How we built the future"],
    ["https://theguardian.com/world/2026/oct/24/story", "Headline about the world | World news | The Guardian", "the Guardian", "Headline about the world"],
    ["https://github.com/torvalds/linux", "GitHub - torvalds/linux: Linux kernel source tree", "GitHub", "GitHub"]
  ]) assert.equal(nameAfterSave(url, meta(url, page, site)), want, url);
});

test("naming: a website answer shown in the editor is final; saving it starts no second lookup", () => {
  assert.match(newtab, /shortcutNameSuggestion = \{ url, name: shortcutTitle\.value \};/);
  assert.match(newtab, /function invalidateShortcutNameSuggestion\(\) \{\s*shortcutNameSuggestionGeneration \+= 1;\s*shortcutNameSuggestion = null;/);
  const submit = newtab.slice(newtab.indexOf('shortcutForm.addEventListener("submit"'));
  assert.ok(submit.indexOf("const editorSuggestion = shortcutNameSuggestion;") >= 0 &&
    submit.indexOf("const editorSuggestion = shortcutNameSuggestion;") < submit.indexOf("invalidateShortcutNameSuggestion(); // Save abandons"),
    "the accepted answer must be read before the save invalidates the editor lookup");
  assert.match(submit, /const acceptedSuggestion = editorSuggestion\?\.url === url && editorSuggestion\.name === title;/);
  assert.match(submit, /const mayEnrichAfterSave = !record && !id && shortcutAutomaticName\.checked && webAccessGranted && !acceptedSuggestion;/);
});

// Runs the REAL New Tab save handler in isolation (same technique as corrective-133030).
function submitHandler() {
  const marker = 'shortcutForm.addEventListener("submit", async event => {';
  const start = newtab.indexOf(marker);
  assert.ok(start >= 0, "missing shortcut submit handler");
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = newtab.indexOf("{", start); i < newtab.length; i += 1) {
    const c = newtab[i], n = newtab[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    if (c === "}" && --depth === 0) return `async function submitShortcutForTest(event) ${newtab.slice(newtab.indexOf("{", start), i + 1)}`;
  }
  throw new Error("unterminated submit handler");
}
async function saveWithSuggestion(suggestion, { url = "https://tesla.com/", title = "Tesla" } = {}) {
  const state = { settings: { autoSiteIcons: false }, activeSpaceId: "personal", shortcuts: [], updatedAt: 0,
    spaces: { personal: { shortcuts: [], settings: {} }, work: { shortcuts: [], settings: {} } } };
  const lookups = [];
  const context = {
    state, pendingShortcutImage: "", pendingShortcutSyncData: "", pendingShortcutImageKind: "", pendingShortcutImageSourceKind: "",
    pendingShortcutImageSourceUrl: "", pendingShortcutImageIsFallback: false, pendingShortcutBuiltinIcon: "", pendingShortcutColorTag: "",
    pendingShortcutFaviconPreference: "", shortcutArtworkEdited: false, webAccessGranted: true,
    normalizeShortcutUrl: value => new URL(value).href, hostLabel: value => new URL(value).hostname,
    shortcutNameSuggestion: suggestion, invalidateShortcutNameSuggestion() { context.shortcutNameSuggestion = null; },
    shortcutUrl: { value: url }, shortcutAutomaticName: { checked: true }, shortcutTitle: { value: title }, shortcutId: { value: "" },
    editingNewShortcutId: "shortcut-1", shortcutSyncImage: { checked: false }, shortcutImageStyle: { value: "contain" },
    findShortcutRecord: id => { const item = context.state.shortcuts.find(entry => entry.id === id); return item ? { item } : null; },
    isMultipleSpacesEnabled: () => false, SPACE_IDS: ["personal", "work"], editingDestinationSpaceId: "personal", editingSourceSpaceId: "personal",
    editingParentFolderId: null, editingPreferredPosition: 0, firstEmptyTopLevelPosition: () => 0, uid: () => "shortcut-1", now: () => 100,
    saveState: async () => {}, render() {}, closeDialog() {}, shortcutDialog: {}, shortcutSyncPrepareGeneration: 0, requestMissingSiteIcons() {},
    runPostSaveShortcutNameEnrichment: saved => { lookups.push(saved.title); }, showToast() {}, t: key => key, console
  };
  vm.createContext(context);
  vm.runInContext(`let shortcutSavePending = false; ${submitHandler()}; this.submitShortcutForTest = submitShortcutForTest;`, context);
  await context.submitShortcutForTest({ preventDefault() {} });
  assert.equal(context.state.shortcuts.length, 1, "the shortcut must be saved in every case");
  return lookups;
}

test("naming: saving the name the website already gave starts no second lookup (real save handler)", async () => {
  assert.deepEqual(await saveWithSuggestion({ url: "https://tesla.com/", name: "Tesla" }), [], "accepted answer: no post-save lookup");
  assert.deepEqual(await saveWithSuggestion(null), ["Tesla"], "no answer yet (Enter / fast Save): one post-save lookup");
  assert.deepEqual(await saveWithSuggestion({ url: "https://lemonde.fr/", name: "Le Monde" }), ["Tesla"], "answer for another URL is ignored");
  assert.deepEqual(await saveWithSuggestion({ url: "https://tesla.com/", name: "Electric Cars" }), ["Tesla"], "answer not the saved name: lookup still runs");
});
