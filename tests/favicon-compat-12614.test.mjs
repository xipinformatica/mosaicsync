import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function extract(src, name) {
  let start = src.indexOf(`async function ${name}`);
  if (start < 0) start = src.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const brace = src.indexOf("{\n", start);
  let depth = 0, quote = "", escaped = false, lineComment = false, blockComment = false;
  for (let index = brace; index < src.length; index += 1) {
    const char = src[index], next = src[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return src.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function pngHeader(width = 32, height = 32) {
  const bytes = new Uint8Array(32);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
  bytes.set([0,0,0,13,0x49,0x48,0x44,0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.14 ${browser} trusts favicon bytes over a wrong HTTP MIME label`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = [
      extract(src, "sniffImageMime"),
      extract(src, "imageDimensionsFromBytes"),
      extract(src, "imageDimensionsSafeForRemoteDecode"),
      extract(src, "fetchImageDataUrlDetailed")
    ].join("\n");
    const bytes = pngHeader();
    let optimizedType = "";
    const ctx = {
      console,
      Date,
      TextDecoder,
      textDecoder: new TextDecoder(),
      REMOTE_IMAGE_TYPES: new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]),
      REMOTE_IMAGE_MAX_BYTES: 250_000,
      REMOTE_IMAGE_MAX_DECODE_DIMENSION: 4096,
      REMOTE_IMAGE_MAX_DECODED_PIXELS: 8_000_000,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      decodeInlineFaviconResource: () => { throw new Error("not inline"); },
      fetchBoundedResource: async () => ({ ok: true, reason: "", url: "https://example.test/favicon.ico", type: "image/x-icon", bytes }),
      rasterizeSafeSvg: async () => { throw new Error("not svg"); },
      optimizedFaviconFromBytes: async (_bytes, type) => { optimizedType = type; return null; },
      bytesToBase64: data => Buffer.from(data).toString("base64")
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.fetchImageDataUrlDetailed("https://example.test/favicon.ico", { declared: true });
    assert.ok(result.image.startsWith("data:image/png;base64,"));
    assert.equal(result.width, 32);
    assert.equal(result.height, 32);
    assert.equal(optimizedType, "image/png", "actual PNG signature must override image/x-icon response headers");
  });

  test(`1.26.14 ${browser} accepts a bounded declared inline PNG favicon`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = [
      extract(src, "sniffImageMime"),
      extract(src, "decodeInlineFaviconResource"),
      extract(src, "imageDimensionsFromBytes"),
      extract(src, "imageDimensionsSafeForRemoteDecode"),
      extract(src, "fetchImageDataUrlDetailed")
    ].join("\n");
    const bytes = pngHeader();
    const inline = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const ctx = {
      console,
      Date,
      TextDecoder,
      TextEncoder,
      atob,
      textDecoder: new TextDecoder(),
      REMOTE_IMAGE_TYPES: new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]),
      REMOTE_IMAGE_MAX_BYTES: 250_000,
      REMOTE_IMAGE_MAX_DECODE_DIMENSION: 4096,
      REMOTE_IMAGE_MAX_DECODED_PIXELS: 8_000_000,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      fetchBoundedResource: async () => { throw new Error("inline favicon must not make a network request"); },
      rasterizeSafeSvg: async () => { throw new Error("not svg"); },
      optimizedFaviconFromBytes: async () => null,
      bytesToBase64: data => Buffer.from(data).toString("base64")
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.fetchImageDataUrlDetailed(inline, { declared: true });
    assert.ok(result.image.startsWith("data:image/png;base64,"));
    assert.equal(result.sourceUrl, "", "inline favicon data must not be duplicated into imageSourceUrl");
    assert.equal(result.width, 32);
    assert.equal(result.height, 32);
  });

  test(`1.26.14 ${browser} HTML icon discovery keeps declared data-image favicons`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = [extract(src, "htmlAttribute"), extract(src, "discoverPageIconInfo")].join("\n");
    const inline = `data:image/png;base64,${Buffer.from(pngHeader()).toString("base64")}`;
    const ctx = {
      console,
      Date,
      URL,
      ICON_RECOVERY_FETCH_TIMEOUT_MS: 8_000,
      fetchHtmlHead: async pageUrl => ({
        ok: true,
        reason: "",
        finalPageUrl: pageUrl,
        text: `<head><link rel="icon" type="image/png" sizes="32x32" href="${inline}"></head>`
      }),
      discoverManifestIconCandidates: async () => []
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    const result = await ctx.discoverPageIconInfo("https://xipinformatica.cat/mosaicsync");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].url, inline);
    assert.equal(result.candidates[0].sideHint, 32);
  });

  test(`1.26.14 ${browser} clicked-tab favicon-learning preflight does not itself request Website Access`, async () => {
    const src = fs.readFileSync(`dist/${browser}/background/background.js`, "utf8");
    const code = extract(src, "prepareFaviconLearning");
    const ctx = {
      console,
      ensureLocalStorage: async () => ({ state: { settings: { autoSiteIcons: true } } }),
      findFaviconLearningTargets: () => [{ id: "shortcut" }],
      hasWebAccess: async () => { throw new Error("native tab fallback must not ask for host permission"); }
    };
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    assert.equal(await ctx.prepareFaviconLearning("https://example.test/", "shortcut"), true);
  });
}
