import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  let brace = source.indexOf(") {", start);
  if (brace >= 0) brace += 2;
  else brace = source.indexOf("{\n", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = ""; continue; }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

class FakeElement {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.hidden = false; this.textContent = ""; this.className = ""; this.title = ""; this.childElementCount = 0; }
  append(...children) { this.children.push(...children); this.childElementCount = this.children.length; }
  replaceChildren(...children) { this.children = [...children]; this.childElementCount = this.children.length; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  querySelectorAll(selector) { return selector === ".detected-favicon-choice" ? this.children.filter(child => child.className === "detected-favicon-choice") : []; }
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.7 ${browser} does not suppress local-state artwork changes by unchanged updatedAt`, () => {
    const source = fs.readFileSync(`src/shared/newtab/newtab.js`, "utf8");
    assert.doesNotMatch(source, /lastLocalWriteUpdatedAt/);
    assert.doesNotMatch(source, /stateChange\.newValue[\s\S]{0,250}updatedAt[\s\S]{0,150}return|updatedAt[\s\S]{0,150}lastLocalWrite/);
    assert.match(source, /tryApplyDeviceArtworkOnlyChange\(incoming, state\)/, "device-artwork fast path must remain in use");
  });

  test(`1.27.7 ${browser} device-artwork fast path mutates the live shortcut and requests a visible tile patch`, () => {
    const source = fs.readFileSync(`src/shared/newtab/newtab.js`, "utf8");
    const code = [
      "workspaceBackgroundVisualSignature", "sameBackgroundVisuals", "collectWorkspaceShortcutRecords",
      "sameShortcutCoreShape", "copyDeviceArtwork", "tryApplyDeviceArtworkOnlyChange"
    ].map(name => extractFunction(source, name)).join("\n");
    const shortcut = {
      type: "shortcut", id: "mosaic", title: "MosaicSync", url: "https://xipinformatica.cat/mosaicsync",
      position: 0, createdAt: 1, modifiedAt: 2, image: "", localImageAssetId: "", imageSyncData: "",
      imageAssetId: "", imageSyncKind: "none", imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false,
      imageStyle: "contain", source: "manual", builtinIcon: "", colorTag: "", spaceMoveAt: 0
    };
    const workspace = shortcuts => ({ settings: {}, shortcuts });
    const context = {
      SPACE_IDS: ["personal", "work"],
      state: { activeSpaceId: "personal", spaces: { personal: workspace([shortcut]), work: workspace([]) } },
      localStateSyncClockSignature: () => "same-clock",
      localStateSyncRawSignature: () => "same-core",
      patchLog: []
    };
    const incomingShortcut = structuredClone(shortcut);
    incomingShortcut.image = "data:image/png;base64,LEARNED";
    incomingShortcut.localImageAssetId = "asset-learned";
    incomingShortcut.imageSourceKind = "favicon";
    incomingShortcut.imageSourceUrl = "https://xipinformatica.cat/favicon.png";
    const incoming = { activeSpaceId: "personal", spaces: { personal: workspace([incomingShortcut]), work: workspace([]) } };
    context.patchVisibleShortcutArtwork = (shortcutIds, folderIds) => context.patchLog.push({ shortcutIds: [...shortcutIds], folderIds: [...folderIds] });
    vm.createContext(context);
    vm.runInContext(`${code}; this.applyFast=tryApplyDeviceArtworkOnlyChange;`, context);
    assert.equal(context.applyFast(incoming, context.state), true);
    assert.equal(shortcut.image, "data:image/png;base64,LEARNED");
    assert.equal(shortcut.imageSourceKind, "favicon");
    assert.deepEqual(context.patchLog, [{ shortcutIds: ["mosaic"], folderIds: [] }]);
  });

  test(`1.27.7 ${browser} manual chooser distinguishes page inspection failure`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const discover = extractFunction(source, "discoverFaviconChoicesForUrl");
    const helpers = ["faviconChoiceResultChars", "cloneFaviconChoiceResult", "readCachedFaviconChoices", "rememberFaviconChoices"]
      .map(name => extractFunction(source, name)).join("\n");
    const context = {
      URL, Date,
      FAVICON_CHOICE_CACHE_TTL_MS: 30_000,
      FAVICON_CHOICE_CACHE_MAX_ENTRIES: 4,
      FAVICON_CHOICE_CACHE_MAX_RESULT_CHARS: 400_000,
      FAVICON_CHOICE_CACHE_MAX_TOTAL_CHARS: 800_000,
      faviconChoiceCache: new Map(),
      hasWebAccess: async () => true,
      faviconQualitySide: candidate => Math.min(Number(candidate?.width)||0, Number(candidate?.height)||0),
      resolveBrowserCachedFavicon: async () => null,
      parentHostFaviconUrl: () => "",
      fetchImageDataUrlDetailed: async () => ({ image: "" }),
      discoverPageIconInfo: async () => ({ candidates: [], finalPageUrl: "https://site.example/", reason: "network" })
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}\n${discover}; this.discover=discoverFaviconChoicesForUrl;`, context);
    const result = await context.discover("https://site.example/");
    assert.equal(result.ok, false);
    assert.equal(result.error, "discovery-failed");
    assert.equal(result.reason, "network");
  });

  test(`1.27.7 ${browser} production page-icon scanner detects MosaicSync-style inline SVG and PNG declarations`, async () => {
    const source = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const html = fs.readFileSync("fixtures/mosaicsync-inline-favicons.html", "utf8");
    const code = [extractFunction(source, "htmlAttribute"), extractFunction(source, "discoverPageIconInfo")].join("\n");
    const context = {
      console, Date, URL,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      fetchHtmlHead: async pageUrl => ({ ok: true, reason: "", finalPageUrl: pageUrl, text: html }),
      discoverManifestIconCandidates: async () => []
    };
    vm.createContext(context);
    vm.runInContext(`${code}; this.discover=discoverPageIconInfo;`, context);
    const result = await context.discover("https://xipinformatica.cat/mosaicsync");
    assert.equal(result.reason, "");
    assert.equal(result.candidates.length, 2);
    assert.ok(result.candidates.some(candidate => candidate.url.startsWith("data:image/svg+xml;base64,")));
    const png = result.candidates.find(candidate => candidate.url.startsWith("data:image/png;base64,"));
    assert.ok(png);
    assert.equal(png.sideHint, 32);
  });

  test(`1.27.7 ${browser} exposes only already-learned automatic artwork as an existing detected choice`, () => {
    const source = fs.readFileSync(`src/shared/newtab/newtab.js`, "utf8");
    const renderFn = extractFunction(source, "renderDetectedFaviconChoices");
    const makeContext = sourceKind => {
      const choices = new FakeElement();
      const picker = new FakeElement();
      const status = new FakeElement();
      const chooseButton = new FakeElement("button");
      const context = {
        document: { createElement: tag => new FakeElement(tag) },
        detectedFaviconChoices: choices, detectedFaviconPicker: picker, detectedFaviconStatus: status, chooseDetectedFavicon: chooseButton,
        pendingShortcutImage: "data:image/png;base64,KNOWN", pendingShortcutImageSourceKind: sourceKind,
        pendingShortcutImageSourceUrl: "https://site.example/favicon.png", detectedFaviconPickerUrl: "https://site.example/",
        shortcutUrl: { value: "https://site.example/" },
        t: key => ({ detectedFavicons: "Detected favicons", firefox: "Browser", website: "Website", noDetectedFavicons: "None" }[key] || key),
        normalizeShortcutUrl: value => value, resetDetectedFaviconPicker() {}, showToast() {}, shortcutSyncPrepareGeneration: 0,
        pendingShortcutBuiltinIcon: "", pendingShortcutSyncData: "", pendingShortcutImageKind: "device", pendingShortcutImageIsFallback: false,
        shortcutImageStyle: { value: "contain" }, shortcutImageUrl: { value: "" }, shortcutSyncImage: { checked: false }, shortcutArtworkEdited: false,
        updateBuiltinShortcutIconSelection() {}, updateImagePreview() {}
      };
      vm.createContext(context);
      vm.runInContext(`${renderFn}; this.render=renderDetectedFaviconChoices;`, context);
      return { context, choices };
    };
    let run = makeContext("favicon");
    run.context.render([{ image: "data:image/png;base64,KNOWN", source: "site" }], "https://site.example/");
    assert.equal(run.choices.childElementCount, 1, "existing learned pixels must deduplicate against fresh discovery");
    run = makeContext("firefox");
    run.context.render([], "https://site.example/");
    assert.equal(run.choices.childElementCount, 1, "browser-native learned artwork should be exposed as a current detected choice");
    run = makeContext("upload");
    run.context.render([], "https://site.example/");
    assert.equal(run.choices.childElementCount, 0, "user uploads must never be relabeled as detected favicons");
    run = makeContext("builtin");
    run.context.render([], "https://site.example/");
    assert.equal(run.choices.childElementCount, 0, "built-in artwork must never be relabeled as detected favicons");
  });
}

test("1.27.7 MosaicSync-style inline favicon fixture contains both declared SVG and PNG metadata", () => {
  const html = fs.readFileSync("fixtures/mosaicsync-inline-favicons.html", "utf8");
  assert.match(html, /data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+[^>]*rel="icon"/);
  assert.match(html, /data:image\/png;base64,[A-Za-z0-9+/=]+[^>]*sizes="32x32"[^>]*rel="icon"|data:image\/png;base64,[A-Za-z0-9+/=]+[^>]*rel="icon"[^>]*sizes="32x32"/);
});

test("1.27.7 source locales include the favicon inspection failure key in every catalog", async () => {
  const files = fs.readdirSync("src/shared/core/i18n-locales").filter(name => name.endsWith(".js"));
  assert.equal(files.length, 33);
  for (const file of files) {
    const mod = await import(`../src/shared/core/i18n-locales/${file}?1277=${Date.now()}-${file}`);
    assert.equal(typeof mod.MESSAGES.faviconDiscoveryFailed, "string", file);
    assert.ok(mod.MESSAGES.faviconDiscoveryFailed.trim().length > 5, file);
  }
});
