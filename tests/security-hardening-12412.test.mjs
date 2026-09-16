import { readBackgroundSource } from "./harness/background-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { webcrypto } from "node:crypto";
globalThis.crypto ||= webcrypto;

const root = resolve(import.meta.dirname, "..");

async function walkJs(dir, out = []) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walkJs(path, out);
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

for (const browser of ["firefox", "chrome"]) {
  test(`${browser}: CSP stays strict and executable HTML sinks stay absent`, async () => {
    const dist = resolve(root, "dist", browser);
    const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
    const csp = String(manifest.content_security_policy?.extension_pages || "");
    for (const directive of [
      "default-src 'none'", "script-src 'self'", "style-src 'self'", "style-src-attr 'none'",
      "img-src 'self' data:", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
      "frame-src 'none'", "worker-src 'self'"
    ]) assert.ok(csp.includes(directive), `missing CSP directive: ${directive}`);
    assert.equal(/'unsafe-inline'|'unsafe-eval'|\bdata:\s*;?\s*script-src/i.test(csp), false);

    const forbidden = [
      /\.innerHTML\b/, /\.outerHTML\b/, /\binsertAdjacentHTML\b/, /\bdocument\.write\b/,
      /\beval\s*\(/, /\bnew\s+Function\b/
    ];
    for (const path of await walkJs(dist)) {
      const source = await readFile(path, "utf8");
      for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path} contains ${pattern}`);
    }
  });

  test(`${browser}: privileged runtime message handler asserts same-extension sender`, async () => {
    const source = readBackgroundSource(browser);
    assert.match(source, /sender\?\.id\s*&&\s*sender\.id\s*!==\s*browser\.runtime\.id/);
  });

  test(`${browser}: failed silent local writes roll back durable suppression markers`, async () => {
    const source = readBackgroundSource(browser);
    assert.match(source, /async function forgetDurableLocalSignature\(signature\)/);
    assert.match(source, /ignoredLocalStateSignatures\.delete\(signature\);\s*await forgetDurableLocalSignature\(signature\);/);
  });
}

const { isSafeSelfContainedSvgText } = await import("../dist/firefox/core/svg-safety.js");
test("remote SVG admission allows local vector fragments but rejects active/external content", () => {
  assert.equal(isSafeSelfContainedSvgText(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="p" d="M0 0h10v10H0z"/><use href="#p"/></svg>`), true);
  for (const unsafe of [
    `<svg onload="alert(1)"></svg>`,
    `<svg><script>alert(1)</script></svg>`,
    `<svg><foreignObject><div>html</div></foreignObject></svg>`,
    `<svg><image href="https://example.test/x.png"/></svg>`,
    `<svg><use href="data:image/svg+xml;base64,AAAA"/></svg>`,
    `<svg><use href="file:///tmp/x"/></svg>`,
    `<svg><style>.x{fill:url(data:image/png;base64,AAAA)}</style></svg>`,
    `<!DOCTYPE svg [<!ENTITY x SYSTEM "https://example.test/x">]><svg>&x;</svg>`,
    `<?xml-stylesheet href="https://example.test/x.css"?><svg></svg>`
  ]) assert.equal(isSafeSelfContainedSvgText(unsafe), false, unsafe);
});

const imageData = await import("../dist/firefox/core/image-data.js");
const localAssets = await import("../dist/firefox/core/local-assets.js");
test("image-data and asset identifiers reject oversized/malformed inputs before expensive decoding", () => {
  const oversized = `data:image/png;base64,${"A".repeat(imageData.MAX_IMAGE_DATA_URL_CHARS)}`;
  assert.equal(imageData.parseImageDataUrl(oversized), null);
  assert.equal(localAssets.isLocalAssetId(`a${"a".repeat(70)}-1`), false);
});

const constants = await import("../dist/firefox/core/constants.js");
test("all runtime/cache budgets used by long-lived contexts remain finite", () => {
  const bounded = [
    constants.MAX_EXPECTATIONS,
    constants.PENDING_NAVIGATION_MAX_ENTRIES,
    constants.FREQUENT_TOP_SITES_LIMIT,
    constants.BACKGROUND_PRELOAD_CACHE_MAX,
    constants.LOADED_LOCALE_CATALOG_MAX,
    constants.RENDER_MANIFEST_MAX_CHARS,
    constants.RENDER_PREVIEW_MAX_CHARS,
    constants.ICON_RECOVERY_MAX_ATTEMPTS,
    constants.DEVICE_SNAPSHOT_MAX_RECENT_DEVICES,
    constants.DEVICE_SNAPSHOT_MAX_DECOMPRESSED_BYTES
  ];
  for (const value of bounded) assert.ok(Number.isFinite(value) && value > 0);
  assert.ok(constants.MAX_EXPECTATIONS <= 1024);
  assert.ok(constants.PENDING_NAVIGATION_MAX_ENTRIES <= 1024);
  assert.ok(constants.BACKGROUND_PRELOAD_CACHE_MAX <= 32);
  assert.ok(constants.LOADED_LOCALE_CATALOG_MAX <= 16);
});
