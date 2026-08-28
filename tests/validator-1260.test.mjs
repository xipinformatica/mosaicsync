import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const browser of ["firefox", "chrome"]) {
  test(`1.30 ${browser} locale loader exposes only literal dynamic-import targets`, async () => {
    const source = await readFile(`dist/${browser}/core/i18n.js`, "utf8");
    assert.doesNotMatch(source, /import\s*\(\s*[A-Za-z_$][\w$]*\s*\)/, "runtime must not dynamically import a variable path");
    assert.doesNotMatch(source, /import\s*\(\s*[^\"\'`\s]/, "dynamic imports must begin with a literal string");
    assert.doesNotMatch(source, /LOCALE_MODULES|modulePath/, "retired variable-path locale loader must not return");
    const literalLocaleImports = source.match(/import\("\.\/i18n-locales\/[^"]+\.js"\)/g) || [];
    assert.equal(literalLocaleImports.length, 32, "all 32 non-English locale modules must remain lazy-loaded through literal imports");
  });
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.30 ${browser} public Settings label matches the internal/runtime version`, async () => {
    const constants = await readFile(`dist/${browser}/core/constants.js`, "utf8");
    const versionMatch = constants.match(/export const VERSION = "([^"]+)";/);
    assert.ok(versionMatch, "runtime VERSION constant must be present");
    const runtimeVersion = versionMatch[1];
    assert.equal(runtimeVersion, "1.30.9");

    const manifest = JSON.parse(await readFile(`dist/${browser}/manifest.json`, "utf8"));
    assert.equal(manifest.version, "1.30.9", "technical manifest version must match 1.30");
    if (browser === "chrome") assert.equal(manifest.version_name, runtimeVersion, "Chrome version_name must match public VERSION");
    else assert.equal(Object.hasOwn(manifest, "version_name"), false, "Firefox must not receive Chrome-only version_name");

    const html = await readFile(`dist/${browser}/newtab/newtab.html`, "utf8");
    assert.match(html, new RegExp(`MosaicSync · ${runtimeVersion.replaceAll(".", "\\.")}`), "Settings must display the current runtime version");
    assert.doesNotMatch(html, /MosaicSync · 1\.24\.14l/i, "stale 1.24.14l Settings label must not return");
    assert.doesNotMatch(html, /MosaicSync · 1\.25\.16(?:\.1)?(?:<|\s)/i, "stale 1.25.16.x Settings label must not return");
  });
}

