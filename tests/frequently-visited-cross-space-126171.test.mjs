import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const browser of ["firefox", "chrome"]) {
  test(`1.26.17.1 ${browser} Frequently Visited excludes shortcut hosts across every Space and folder`, async () => {
    const mod = await import(`../dist/${browser}/newtab/ui-utils.js?cross-space-${browser}-${Date.now()}`);
    const state = {
      activeSpaceId: "work",
      shortcuts: [
        { type: "shortcut", url: "https://work-only.example/" }
      ],
      spaces: {
        personal: {
          shortcuts: [
            { type: "shortcut", url: "https://www.youtube.com/watch?v=abc" },
            {
              type: "folder",
              items: [
                { type: "shortcut", url: "https://mail.google.com/mail/u/0/" }
              ]
            }
          ]
        },
        work: {
          shortcuts: [
            { type: "shortcut", url: "https://github.com/xipinformatica/mosaicsync" }
          ]
        },
        future: {
          shortcuts: [
            { type: "shortcut", url: "https://docs.example.test/path" }
          ]
        }
      }
    };

    const hosts = mod.shortcutHostsAcrossSpaces(state);
    assert.deepEqual(
      [...hosts].sort(),
      ["docs.example.test", "github.com", "mail.google.com", "youtube.com"].sort(),
      "the compatibility active-space alias must not limit or duplicate the global Space scan"
    );
  });

  test(`1.26.17.1 ${browser} Frequently Visited refresh uses the global Space host set`, () => {
    const source = fs.readFileSync(`dist/${browser}/newtab/newtab.js`, "utf8");
    assert.match(source, /const explicitHosts = shortcutHostsAcrossSpaces\(state\);/);
    assert.doesNotMatch(source, /function activeShortcutHosts\(/);
  });
}

test("1.26.17.1 global shortcut host helper keeps a pre-Spaces fallback", async () => {
  const mod = await import(`../dist/firefox/newtab/ui-utils.js?legacy-${Date.now()}`);
  const hosts = mod.shortcutHostsAcrossSpaces({
    shortcuts: [
      { type: "shortcut", url: "https://www.example.com/path" },
      { type: "folder", items: [{ type: "shortcut", url: "https://inside.example.net/" }] }
    ]
  });
  assert.deepEqual([...hosts].sort(), ["example.com", "inside.example.net"].sort());
});
