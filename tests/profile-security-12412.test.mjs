import test from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const constants = await import("../dist/firefox/core/constants.js");
const model = await import("../dist/firefox/core/model.js");
const profile = await import("../dist/firefox/core/profile.js");

function sampleState() {
  const t = Date.now();
  const image = `data:image/png;base64,${Buffer.from("profile-secure".repeat(80)).toString("base64")}`;
  return model.normalizeState({
    shortcuts: [{
      type: "shortcut", id: "secure", title: "Secure", url: "https://secure.example/",
      image, imageSyncKind: "device", imageSourceKind: "favicon", imageStyle: "contain",
      position: 0, createdAt: t, modifiedAt: t, source: "manual"
    }],
    settings: { ...constants.DEFAULT_SETTINGS }, settingsModifiedAt: t, updatedAt: t
  });
}

async function recomputeIntegrity(pkg) {
  const { integrity, ...body } = pkg;
  const bytes = new TextEncoder().encode(model.stableStringify(body));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  pkg.integrity = { algorithm: "SHA-256", value: [...digest].map(b => b.toString(16).padStart(2, "0")).join("") };
  return pkg;
}

test("checksum-valid v2 profile cannot smuggle unreferenced assets", async () => {
  const pkg = await profile.createProfilePackage(sampleState(), { uiLocale: "en" });
  const extraData = `data:image/png;base64,${Buffer.from("unused-extra".repeat(60)).toString("base64")}`;
  const extraId = model.assetIdForDataUrl(extraData);
  pkg.profile.assets[extraId] = extraData;
  await recomputeIntegrity(pkg);
  await assert.rejects(
    () => profile.parseProfilePackage(profile.serializeProfilePackage(pkg)),
    error => error?.code === "PROFILE_DAMAGED"
  );
});

test("v2 profile still imports when asset set exactly matches compact references", async () => {
  const pkg = await profile.createProfilePackage(sampleState(), { uiLocale: "it" });
  const parsed = await profile.parseProfilePackage(profile.serializeProfilePackage(pkg));
  assert.equal(parsed.state.shortcuts.length, 1);
  assert.equal(parsed.state.shortcuts[0].title, "Secure");
  assert.ok(parsed.state.shortcuts[0].image.startsWith("data:image/png;base64,"));
});
