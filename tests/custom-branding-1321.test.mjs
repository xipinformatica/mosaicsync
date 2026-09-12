import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { TINY_PNG, TINY_WEBP, TINY_GIF } from "./harness/raster-fixtures.mjs";

globalThis.crypto ||= webcrypto;

class Area {
  constructor() { this.data = {}; this.getCalls = []; this.setCalls = []; this.removeCalls = []; }
  async get(keys) {
    this.getCalls.push(structuredClone(keys));
    if (keys == null) return structuredClone(this.data);
    if (typeof keys === "string") return Object.hasOwn(this.data, keys) ? { [keys]: structuredClone(this.data[keys]) } : {};
    return {};
  }
  async set(items) { this.setCalls.push(structuredClone(items)); Object.assign(this.data, structuredClone(items)); }
  async remove(keys) { this.removeCalls.push(structuredClone(keys)); for (const key of (Array.isArray(keys) ? keys : [keys])) delete this.data[key]; }
}
const local = new Area();
const sync = new Area();
globalThis.browser = { storage: { local, sync, session: new Area() } };

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const branding = await import("../dist/firefox/core/custom-branding.js");
const profile = await import("../dist/firefox/core/profile.js");

const png = TINY_PNG;
const webp = TINY_WEBP;
const gif = TINY_GIF;
const unicodeText = "XIP Informàtica · 日本 · Καλημέρα";

async function recomputeIntegrity(pkg) {
  const { integrity, ...body } = pkg;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(model.stableStringify(body))));
  pkg.integrity = { algorithm: "SHA-256", value: [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("") };
  return pkg;
}

test("1.32.1.1 Custom Branding is a separate versioned storage.local domain", () => {
  assert.equal(constants.VERSION, "1.33.0.14");
  assert.equal(constants.LOCAL_CUSTOM_BRANDING_KEY, "mosaicsync.custom-branding.v1");
  assert.equal(branding.CUSTOM_BRANDING_SCHEMA_VERSION, 1);
  assert.deepEqual(branding.DEFAULT_CUSTOM_BRANDING, { schemaVersion: 1, enabled: false, text: "", logo: "" });
});

test("1.32.1.1 Custom Branding preserves exact Unicode text and canonical raster logo data", () => {
  const normalized = branding.normalizeCustomBranding({ schemaVersion: 1, enabled: true, text: unicodeText, logo: png }, { strict: true });
  assert.equal(normalized.text, unicodeText);
  assert.equal(normalized.logo, png);
  assert.equal(branding.customBrandingIsVisible(normalized), true);
});

test("1.32.1.1 Custom Branding rejects unsupported or over-budget logo data", () => {
  assert.throws(() => branding.normalizeCustomBrandingLogo(gif, { strict: true }));
  assert.equal(branding.normalizeCustomBrandingLogo(gif), "");
  const payload = Buffer.alloc(branding.CUSTOM_BRANDING_LOGO_MAX_BYTES + 1, 7).toString("base64");
  assert.throws(() => branding.normalizeCustomBrandingLogo(`data:image/png;base64,${payload}`, { strict: true }));
  assert.equal(branding.normalizeCustomBrandingLogo(webp, { strict: true }), webp);
});

test("1.32.1.1 Custom Branding persistence touches storage.local and never storage.sync", async () => {
  local.data = {}; local.getCalls = []; local.setCalls = []; sync.getCalls = []; sync.setCalls = [];
  const saved = await branding.writeCustomBranding({ enabled: true, text: unicodeText, logo: png });
  const loaded = await branding.readCustomBranding();
  assert.deepEqual(loaded, saved);
  assert.equal(local.setCalls.length, 1);
  assert.equal(sync.setCalls.length, 0);
  assert.equal(sync.getCalls.length, 0);
  const originalGet = local.get.bind(local);
  local.get = async () => { throw new Error("LOCAL_READ_FAILED"); };
  assert.deepEqual(await branding.readCustomBranding(), branding.DEFAULT_CUSTOM_BRANDING, "startup read may degrade safely");
  await assert.rejects(() => branding.readCustomBranding({ failClosed: true }), /LOCAL_READ_FAILED/, "export/import authority must fail closed");
  local.get = originalGet;
});

test("1.32.1.1 profile v3 embeds and round-trips branding bytes/text exactly", async () => {
  const input = { schemaVersion: 1, enabled: true, text: unicodeText, logo: png };
  const pkg = await profile.createProfilePackage(constants.DEFAULT_STATE, { uiLocale: "ca" }, input);
  assert.equal(pkg.formatVersion, 3);
  assert.deepEqual(pkg.profile.branding, input);
  const parsed = await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  assert.deepEqual(parsed.branding, input);
  assert.equal(parsed.preferences.uiLocale, "ca");
});

test("1.32.1.1 profile v3 preserves disabled branding with retained logo/text", async () => {
  const input = { schemaVersion: 1, enabled: false, text: unicodeText, logo: png };
  const pkg = await profile.createProfilePackage(constants.DEFAULT_STATE, {}, input);
  const parsed = await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  assert.deepEqual(parsed.branding, input);
  assert.equal(branding.customBrandingIsVisible(parsed.branding), false);
});

test("1.32.1.1 remains backward-compatible with v2 profiles and restores no custom branding", async () => {
  const pkg = await profile.createProfilePackage(constants.DEFAULT_STATE, { uiLocale: "it" }, { enabled: true, text: unicodeText, logo: png });
  pkg.formatVersion = 2;
  delete pkg.profile.branding;
  await recomputeIntegrity(pkg);
  const parsed = await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  assert.equal(parsed.formatVersion, 2);
  assert.deepEqual(parsed.branding, branding.DEFAULT_CUSTOM_BRANDING);
});

test("1.32.1.1 checksum-valid malformed v3 branding fails safely", async () => {
  const pkg = await profile.createProfilePackage(constants.DEFAULT_STATE, {}, { enabled: true, text: unicodeText, logo: png });
  pkg.profile.branding.logo = gif;
  await recomputeIntegrity(pkg);
  await assert.rejects(() => profile.parseProfilePackage(profile.serializeProfilePackage(pkg)), error => error?.code === "PROFILE_DAMAGED");
});

test("1.32.1.1 branding UI stays post-paint and uses the existing launcher identity slot", () => {
  const html = fs.readFileSync("src/shared/newtab/newtab.html", "utf8");
  const js = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const critical = fs.readFileSync("src/shared/newtab/newtab-critical.css", "utf8");
  const secondary = fs.readFileSync("src/shared/newtab/newtab-secondary.css", "utf8");
  assert.match(html, /id="brandMark"[^>]*src="\.\.\/assets\/icon\.svg"/);
  assert.match(html, /id="brandName"[^>]*>MosaicSync<\/span>/);
  assert.equal(html.includes('id="customBrandingDisplay"'), false, "branding must not create a second centered launcher surface");
  assert.match(html, /id="customBrandingDialog"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.equal(critical.includes("custom-branding-active"), false);
  assert.equal(critical.includes("custom-branding-dialog"), false);
  assert.equal(secondary.includes("custom-branding-display"), false);
  assert.equal(secondary.includes("custom-branding-active"), true);
  assert.equal(secondary.includes("custom-branding-dialog"), true);
  assert.match(js, /brandMark\.src = branding\.logo/);
  assert.match(js, /brandName\.textContent = branding\.text \|\| ""/);
  const interaction = js.indexOf('startupPhase("interactionReady")');
  const maintenanceCall = js.indexOf("schedulePostPaintMaintenance();", interaction);
  assert.ok(interaction >= 0 && maintenanceCall > interaction, "branding maintenance must only be scheduled after interactionReady");
  assert.match(js, /scheduleIdleWork\(\(\) => refreshBrandIdentity\(\)\.catch\(\(\) => \{\}\), 80\)/);
});

test("1.32.1.1 source ownership keeps branding outside Sync/Recovery and transactional across profile selection", () => {
  const newtab = fs.readFileSync("src/shared/newtab/newtab.js", "utf8");
  const welcome = fs.readFileSync("src/shared/welcome/welcome.js", "utf8");
  const backgroundFiles = fs.readdirSync("src/shared/background").filter(name => name.endsWith(".js"));
  const backgroundSource = backgroundFiles.map(name => fs.readFileSync(`src/shared/background/${name}`, "utf8")).join("\n");
  assert.equal(backgroundSource.includes("LOCAL_CUSTOM_BRANDING_KEY"), false, "Sync/Recovery background must not own the branding key");
  assert.equal(backgroundSource.includes("custom-branding.js"), false, "Sync/Recovery background must not import branding");
  assert.match(newtab, /beginCustomBrandingImport\(parsed\.branding\)/);
  assert.match(newtab, /could not roll back imported Custom Branding/);
  assert.match(welcome, /stageStartingSourceCandidate\("profile", importedState, parsed\.preferences, parsed\.branding\)/);
  assert.match(welcome, /branding: source === "profile"/);
  assert.match(welcome, /rollbackCustomBrandingImport\(brandingTransaction\)/);
  assert.match(welcome, /function discardPendingSourceCandidate\(\) \{\s*pendingSourceCandidate = null;/);
});
