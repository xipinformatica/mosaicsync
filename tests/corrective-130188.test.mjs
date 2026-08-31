import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.writes = []; }
  async get(keys) {
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    const wanted = Array.isArray(keys) ? keys : Object.keys(keys || {});
    const out = Array.isArray(keys) ? {} : structuredClone(keys || {});
    for (const key of wanted) if (Object.hasOwn(this.data, key)) out[key] = structuredClone(this.data[key]);
    return out;
  }
  async set(items) {
    this.writes.push(structuredClone(items));
    Object.assign(this.data, structuredClone(items));
  }
  async remove(keys) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key];
  }
}

async function modulesFor(browser, suffix) {
  const nonce = `${Date.now()}-${Math.random()}-${suffix}`;
  const constants = await import(`${pathToFileURL(resolve(`dist/${browser}/core/constants.js`)).href}?130188-c=${nonce}`);
  const model = await import(`${pathToFileURL(resolve(`dist/${browser}/core/model.js`)).href}?130188-m=${nonce}`);
  const storage = await import(`${pathToFileURL(resolve(`dist/${browser}/core/storage.js`)).href}?130188-s=${nonce}`);
  return { constants, model, storage };
}

function stateFor(constants, model, { name = "Home", image = "", modifiedAt = 10 } = {}) {
  return model.normalizeState({
    activeSpaceId: "personal",
    spaces: {
      personal: {
        shortcuts: [{
          type: "shortcut", id: "p", title: "Portal", url: "https://portal.example/", position: 0,
          image, imageSourceKind: image ? "favicon" : "none", imageStyle: "contain",
          createdAt: 1, modifiedAt
        }],
        settings: {
          ...constants.DEFAULT_SETTINGS,
          multipleSpacesEnabled: true,
          spaceName: name,
          frequentlyVisitedEnabled: true,
          frequentlyVisitedCount: 5
        },
        settingsModifiedAt: modifiedAt,
        updatedAt: modifiedAt
      },
      work: {
        shortcuts: [],
        settings: { ...constants.DEFAULT_SETTINGS, multipleSpacesEnabled: true, spaceName: "Office", frequentlyVisitedEnabled: true, frequentlyVisitedCount: 5 },
        settingsModifiedAt: 1,
        updatedAt: 1
      }
    }
  });
}

for (const browserName of ["firefox", "chrome"]) {
  test(`1.30.18.8 ${browserName} permission suppression survives a missing session render snapshot`, async () => {
    const previousBrowser = globalThis.browser;
    const session = new Area();
    globalThis.browser = { storage: { local: new Area(), session } };
    try {
      const { constants, storage } = await modulesFor(browserName, "empty-suppress");
      assert.equal(await storage.clearSessionFrequentlyVisitedSnapshot(), true);
      assert.equal(session.data[constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY], true);
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY], undefined);
      assert.deepEqual(session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY], { enabled: true, count: 5, sites: [] });
      const read = await storage.readSessionRenderCache();
      assert.equal(read?.frequentSuppressed, true, "the early session layer must carry the tombstone even without a full render snapshot");
      assert.equal(read?.state, null);
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} generic background state writes preserve an active FV permission tombstone`, async () => {
    const previousBrowser = globalThis.browser;
    const local = new Area();
    const session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browserName, "write-suppress");
      const state = stateFor(constants, model);
      await storage.clearSessionFrequentlyVisitedSnapshot();
      await storage.writeLocalState(state);
      const snap = session.data[constants.SESSION_RENDER_STATE_KEY];
      assert.ok(snap, "background write must still warm a usable structural session projection");
      assert.equal(snap.firstPaint.frequent, null, "structural session state no longer owns FV candidates");
      assert.deepEqual(session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY], { enabled: true, count: 5, sites: [] },
        "an unrelated state write must preserve the separate permission-suppressed FV projection");
      assert.equal(session.data[constants.SESSION_FREQUENTLY_VISITED_SUPPRESSED_KEY], true);
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} shared-session dedup verifies the actual store before skipping`, async () => {
    const previousBrowser = globalThis.browser;
    const local = new Area();
    const session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const a = await modulesFor(browserName, "ctx-a");
      const b = await modulesFor(browserName, "ctx-b");
      const stateA = stateFor(a.constants, a.model, { name: "A", modifiedAt: 10 });
      const stateB = stateFor(b.constants, b.model, { name: "B", modifiedAt: 20 });
      const metaA = { ...a.constants.DEFAULT_META, deviceId: "device-a", onboardingCompleted: true };
      const metaB = { ...b.constants.DEFAULT_META, deviceId: "device-a", onboardingCompleted: true };
      assert.equal(await a.storage.warmSessionRenderCache(stateA, metaA), true);
      assert.equal(await b.storage.warmSessionRenderCache(stateB, metaB), true);
      session.writes.length = 0;
      assert.equal(await a.storage.warmSessionRenderCache(stateA, metaA), true,
        "context A must not skip merely because its private fingerprint still remembers A");
      assert.ok(session.writes.some(write => Object.hasOwn(write, a.constants.SESSION_RENDER_STATE_KEY)));
      assert.equal(session.data[a.constants.SESSION_RENDER_STATE_KEY].firstPaint.spaceNames.personal, "A");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} actual identical shared session bytes still avoid a rewrite`, async () => {
    const previousBrowser = globalThis.browser;
    const local = new Area();
    const session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browserName, "dedupe-real");
      const state = stateFor(constants, model);
      const meta = { ...constants.DEFAULT_META, deviceId: "device-a", onboardingCompleted: true };
      const frequent = { enabled: true, count: 5, sites: [{ title: "Example", host: "example.com", url: "https://example.com/", favicon: "" }] };
      session.data[constants.SESSION_RENDER_STATE_KEY] = storage.createRenderSnapshot(state);
      session.data[constants.SESSION_RENDER_META_KEY] = structuredClone(meta);
      session.data[constants.SESSION_FREQUENTLY_VISITED_PROJECTION_KEY] = structuredClone(frequent);
      assert.ok(await storage.readSessionRenderCache());
      session.writes.length = 0;
      assert.equal(await storage.warmSessionRenderCache(state, meta, { frequentSnapshot: frequent }), false);
      assert.equal(session.writes.length, 0);
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} background-only Space rename reaches the shared session first-paint contract`, async () => {
    const previousBrowser = globalThis.browser;
    const local = new Area();
    const session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browserName, "rename");
      await storage.writeLocalState(stateFor(constants, model, { name: "Home", modifiedAt: 10 }));
      await storage.writeLocalState(stateFor(constants, model, { name: "Private", modifiedAt: 20 }));
      assert.equal(session.data[constants.SESSION_RENDER_STATE_KEY].firstPaint.spaceNames.personal, "Private");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} background favicon learning records artwork existence in the session projection`, async () => {
    const previousBrowser = globalThis.browser;
    const local = new Area();
    const session = new Area();
    globalThis.browser = { storage: { local, session } };
    try {
      const { constants, model, storage } = await modulesFor(browserName, "favicon");
      await storage.writeLocalState(stateFor(constants, model, { modifiedAt: 10 }));
      const image = `data:image/png;base64,${Buffer.from("favicon-pixels".repeat(40)).toString("base64")}`;
      await storage.writeLocalState(stateFor(constants, model, { image, modifiedAt: 20 }));
      const item = session.data[constants.SESSION_RENDER_STATE_KEY].shortcuts[0];
      assert.ok(item.image || item.localImageAssetId || item.imageAssetId,
        "a background-learned favicon must not leave the fast session layer believing the shortcut has no artwork");
      assert.ok(Boolean(item.image) || item.imageDeferred === true,
        "if favicon pixels are not inline, the session projection must explicitly record deferred artwork");
    } finally {
      globalThis.browser = previousBrowser;
    }
  });

  test(`1.30.18.8 ${browserName} permission add/remove lifecycle is wired to the shared session tombstone`, () => {
    const bg = fs.readFileSync(`src/${browserName}/background/background.js`, "utf8");
    const nt = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
    const boot = fs.readFileSync("src/shared/newtab/session-bootstrap.js", "utf8");
    const config = fs.readFileSync(`dist/${browserName}/newtab/bootstrap-config.js`, "utf8");
    assert.match(bg, /permissionChangeAffectsTopSites\(permissions\)[\s\S]{0,160}clearSessionFrequentlyVisitedSuppression\(\)/);
    assert.match(bg, /permissionChangeAffectsTopSites\(change\)[\s\S]{0,160}clearSessionFrequentlyVisitedSnapshot\(\)/);
    assert.match(nt, /sessionCache\?\.frequentSuppressed[\s\S]{0,420}renderFrequentlyVisited\(\[\]/);
    assert.match(boot, /sessionFrequentSuppressedKey/);
    assert.match(config, /mosaicsync\.session\.frequent-suppressed\.v1/);
  });
}

test("1.30.18.8 architecture documents the remaining persistent-manifest ownership boundary for Step 2", () => {
  const doc = fs.readFileSync("docs/ARCHITECTURE.md", "utf8");
  assert.match(doc, /background contexts cannot synchronously rewrite a New Tab page's localStorage render manifest/i);
  assert.match(doc, /SESSION_RENDER_STATE_KEY.*owns structural Space\/grid\/settings\/artwork-existence truth/i);
  assert.match(doc, /page localStorage render manifest remains a synchronous shortcut-grid fallback/i);
  assert.match(doc, /Step 2/i);
});
