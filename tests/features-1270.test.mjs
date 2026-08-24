import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BUILTIN_SHORTCUT_ICON_KEYS,
  DEFAULT_SETTINGS,
  SHORTCUT_COLOR_TAG_KEYS,
  SHORTCUT_ORDER_PREF_KEY,
  SHORTCUT_USAGE_PREF_KEY,
  STATE_SCHEMA_VERSION,
  SYNC_SCHEMA_VERSION,
  VERSION
} from "../dist/firefox/core/constants.js";
import {
  flattenState,
  normalizeState,
  stateFromRecords
} from "../dist/firefox/core/model.js";
import {
  createProfilePackage,
  parseProfilePackage,
  serializeProfilePackage
} from "../dist/firefox/core/profile.js";
import {
  shortcutLastOpenedAt,
  sortTopLevelByRecent
} from "../dist/firefox/newtab/ui-utils.js";
import {
  createRenderSnapshot
} from "../dist/firefox/core/storage.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const t = 1_800_000_000_000;

function shortcut(id, position, extras = {}) {
  return {
    type: "shortcut", id, title: id, url: `https://${id}.example/`,
    image: "", imageSyncData: "", imageAssetId: "", localImageAssetId: "",
    imageSyncKind: "none", imageSourceKind: "none", imageSourceUrl: "", imageIsFallback: false,
    imageStyle: "contain", position, createdAt: t, modifiedAt: t, source: "manual",
    ...extras
  };
}

function stateWith(items) {
  const personal = {
    shortcuts: items,
    settings: { ...DEFAULT_SETTINGS },
    settingsModifiedAt: t,
    updatedAt: t
  };
  const work = {
    shortcuts: [],
    settings: { ...DEFAULT_SETTINGS, spaceName: "Work" },
    settingsModifiedAt: t,
    updatedAt: t
  };
  return normalizeState({
    schemaVersion: STATE_SCHEMA_VERSION,
    activeSpaceId: "personal",
    spaces: { personal, work },
    shortcuts: personal.shortcuts,
    settings: personal.settings,
    settingsModifiedAt: t,
    updatedAt: t
  });
}

test("1.27.1 release identity and additive shortcut schemas are unified", () => {
  assert.equal(VERSION, "1.27.1");
  assert.equal(STATE_SCHEMA_VERSION, 18);
  assert.equal(SYNC_SCHEMA_VERSION, 10);
  assert.ok(BUILTIN_SHORTCUT_ICON_KEYS.includes("code"));
  assert.ok(SHORTCUT_COLOR_TAG_KEYS.includes("blue"));
});

test("built-in icon and color tag normalize safely, clear stale pixels, and survive Sync reconstruction", () => {
  const original = stateWith([
    shortcut("alpha", 0, {
      builtinIcon: "code",
      colorTag: "blue",
      image: PNG,
      localImageAssetId: "aold-1",
      imageSyncData: PNG,
      imageAssetId: "aold-1",
      imageSyncKind: "sync",
      imageSourceKind: "upload"
    })
  ]);
  const item = original.shortcuts[0];
  assert.equal(item.builtinIcon, "code");
  assert.equal(item.colorTag, "blue");
  assert.equal(item.image, "");
  assert.equal(item.localImageAssetId, "");
  assert.equal(item.imageSyncData, "");
  assert.equal(item.imageAssetId, "");
  assert.equal(item.imageSyncKind, "none");
  assert.equal(item.imageSourceKind, "builtin");

  const records = flattenState(original, "device-a");
  const record = records.get("alpha");
  assert.equal(record.builtinIcon, "code");
  assert.equal(record.colorTag, "blue");
  assert.equal(record.imageKind, "none");
  assert.equal(record.imageAssetId, "");
  assert.equal(record.imageSourceKind, "builtin");

  const rebuilt = stateFromRecords(records, null, original, new Map());
  const restored = rebuilt.shortcuts[0];
  assert.equal(restored.builtinIcon, "code");
  assert.equal(restored.colorTag, "blue");
  assert.equal(restored.image, "");
  assert.equal(restored.imageSyncKind, "none");
  assert.equal(restored.imageSourceKind, "builtin");
});

test("invalid built-in icon/color values fail closed and do not widen background image-source policy", () => {
  const state = stateWith([
    shortcut("alpha", 0, { builtinIcon: "javascript:alert(1)", colorTag: "chartreuse" })
  ]);
  assert.equal(state.shortcuts[0].builtinIcon, "");
  assert.equal(state.shortcuts[0].colorTag, "");

  const withHostileBackgroundKind = normalizeState({
    ...state,
    spaces: {
      ...state.spaces,
      personal: {
        ...state.spaces.personal,
        settings: { ...state.spaces.personal.settings, backgroundSourceKind: "builtin" }
      }
    }
  });
  assert.equal(withHostileBackgroundKind.settings.backgroundSourceKind, "none");
});


test("1.27.0 session render snapshot preserves only validated icon/color presentation metadata", () => {
  const folder = {
    type: "folder", id: "folder", title: "Folder", position: 1, createdAt: t, modifiedAt: t,
    items: [
      shortcut("child", 0, { builtinIcon: "mail", colorTag: "teal" }),
      shortcut("child-two", 1, { builtinIcon: "star", colorTag: "amber" })
    ]
  };
  const original = stateWith([shortcut("alpha", 0, { builtinIcon: "code", colorTag: "blue" }), folder]);
  const snapshot = createRenderSnapshot(original);
  assert.equal(snapshot.shortcuts[0].builtinIcon, "code");
  assert.equal(snapshot.shortcuts[0].colorTag, "blue");
  assert.equal(snapshot.shortcuts[1].items[0].builtinIcon, "mail");
  assert.equal(snapshot.shortcuts[1].items[0].colorTag, "teal");

  const hostile = structuredClone(original);
  hostile.shortcuts[0].builtinIcon = "javascript:alert(1)";
  hostile.shortcuts[0].colorTag = "chartreuse";
  hostile.shortcuts[1].items[0].builtinIcon = "<svg onload=alert(1)>";
  hostile.shortcuts[1].items[0].colorTag = "url(javascript:alert(1))";
  const hostileSnapshot = createRenderSnapshot(hostile);
  assert.equal(hostileSnapshot.shortcuts[0].builtinIcon, "");
  assert.equal(hostileSnapshot.shortcuts[0].colorTag, "");
  assert.equal(hostileSnapshot.shortcuts[1].items[0].builtinIcon, "");
  assert.equal(hostileSnapshot.shortcuts[1].items[0].colorTag, "");
});

test("built-in icon and color tag survive complete profile export/import without image assets", async () => {
  const original = stateWith([shortcut("alpha", 0, { builtinIcon: "star", colorTag: "amber" })]);
  const packaged = await createProfilePackage(original, { uiLocale: "en" });
  const parsed = await parseProfilePackage(serializeProfilePackage(packaged));
  const restored = parsed.state.shortcuts[0];
  assert.equal(restored.builtinIcon, "star");
  assert.equal(restored.colorTag, "amber");
  assert.equal(restored.image, "");
  assert.equal(restored.localImageAssetId, "");
  assert.deepEqual(Object.keys(packaged.profile.assets || {}), []);
});

test("recent ordering is local presentation only, stable, and scores folders by their most-recent child", () => {
  const a = shortcut("a", 0);
  const folder = {
    type: "folder", id: "folder", title: "Folder", position: 1, createdAt: t, modifiedAt: t,
    items: [shortcut("b", 0), shortcut("c", 1)]
  };
  const d = shortcut("d", 2);
  const input = [a, folder, d];
  const usage = { a: 100, b: 500, c: 200, d: 300 };
  assert.equal(shortcutLastOpenedAt(folder, usage), 500);
  const sorted = sortTopLevelByRecent(input, usage);
  assert.deepEqual(sorted.map(item => item.id), ["folder", "d", "a"]);
  assert.deepEqual(input.map(item => [item.id, item.position]), [["a",0],["folder",1],["d",2]], "canonical manual positions must not change");

  const tied = sortTopLevelByRecent(input, {});
  assert.deepEqual(tied.map(item => item.id), ["a", "folder", "d"], "never-opened items fall back to manual order");
  assert.equal(SHORTCUT_ORDER_PREF_KEY, "mosaicsync.shortcut-order.v1");
  assert.equal(SHORTCUT_USAGE_PREF_KEY, "mosaicsync.shortcut-usage.v1");
});

for (const browser of ["firefox", "chrome"]) {
  test(`1.27.0 ${browser} UI wires Open all, close folder anchoring, local recency view, built-in icons and color tags`, async () => {
    const [js, html, css, background, icons] = await Promise.all([
      readFile(`dist/${browser}/newtab/newtab.js`, "utf8"),
      readFile(`dist/${browser}/newtab/newtab.html`, "utf8"),
      readFile(`dist/${browser}/newtab/newtab.css`, "utf8"),
      readFile(`dist/${browser}/background/background.js`, "utf8"),
      readFile(`dist/${browser}/newtab/builtin-icons.js`, "utf8")
    ]);

    assert.match(js, /openAllFolderButton\?\.addEventListener\("click"[\s\S]*?shortcutNavigationUrl\(item\)[\s\S]*?recordShortcutsOpened\(eligible\.map\(item => item\.id\)\)[\s\S]*?openShortcutInNewTab\(item, \{ recordUsage: false \}\)/,
      `${browser}: Open all must reuse the final HTTP(S)-validated background-tab path`);
    assert.match(js, /openShortcutInNewTab[\s\S]*?browser\.tabs\.create\(\{ url, active: false \}\)/,
      `${browser}: folder Open all must keep MosaicSync active`);
    assert.match(js, /const gap = 3;[\s\S]*?anchorBottom = \(labelEl && visibleTextBottom\(labelEl\)\) \|\| tileRect\.bottom/,
      `${browser}: folder popover must anchor close to the actually rendered label text`);
    assert.doesNotMatch(js, /rect\.bottom\s*\+\s*10/, `${browser}: obsolete large folder gap must stay removed`);

    assert.match(js, /slot\.draggable = shortcutOrderMode !== "recent"/, `${browser}: recency view must not rewrite order by drag`);
    assert.match(js, /localStorage\.setItem\(SHORTCUT_ORDER_PREF_KEY/, `${browser}: order mode must be local-only`);
    assert.match(js, /localStorage\.setItem\(SHORTCUT_USAGE_PREF_KEY/, `${browser}: usage metadata must be local-only`);
    assert.match(js, /window\.addEventListener\("storage"[\s\S]*?SHORTCUT_ORDER_PREF_KEY[\s\S]*?SHORTCUT_USAGE_PREF_KEY/, `${browser}: local presentation state should reconcile across already-open MosaicSync tabs`);
    assert.match(background, /shortcut\.builtinIcon[\s\S]*?return false/, `${browser}: built-in icons must not trigger automatic favicon recovery`);

    assert.ok(html.includes('<script src="builtin-icons.js"></script>'), `${browser}: bundled icon helper must be packaged`);
    assert.ok(html.indexOf('<script src="builtin-icons.js"></script>') < html.indexOf('<script src="render-bootstrap.js"></script>'), `${browser}: built-in helper must exist before first paint`);
    assert.match(icons, /Object\.defineProperty\(globalThis, GLOBAL_KEY/);
    assert.doesNotMatch(icons, /innerHTML|insertAdjacentHTML|DOMParser|fetch\(/, `${browser}: bundled icons must remain fixed local DOM primitives`);
    assert.match(css, /\.tile\[data-color-tag\]/, `${browser}: shortcut color accents must render without inline style attributes`);
    assert.match(js, /stateVisualHydrationSignature[\s\S]*?String\(item\.builtinIcon \|\| ""\)[\s\S]*?String\(item\.colorTag \|\| ""\)[\s\S]*?String\(child\.builtinIcon \|\| ""\)[\s\S]*?String\(child\.colorTag \|\| ""\)/,
      `${browser}: authoritative reconciliation must detect icon/color presentation missing from an older/lightweight session snapshot`);
  });
}

test("1.27.0 local recency metadata is not part of synchronized/profile state", async () => {
  const original = stateWith([shortcut("alpha", 0)]);
  const records = flattenState(original, "device-a");
  for (const record of records.values()) {
    assert.equal(Object.hasOwn(record, "lastOpened"), false);
    assert.equal(Object.hasOwn(record, "openCount"), false);
  }
  const packaged = await createProfilePackage(original, { uiLocale: "en" });
  const source = JSON.stringify(packaged);
  assert.equal(source.includes(SHORTCUT_ORDER_PREF_KEY), false);
  assert.equal(source.includes(SHORTCUT_USAGE_PREF_KEY), false);
});
