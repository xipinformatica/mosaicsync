import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";
import { readBackgroundSource } from "./harness/background-source.mjs";

const root = resolve(import.meta.dirname, "..");

test("1.30.18.44 Clear Sync copy preserves the user's Sync-enabled preference while awaiting a new source", () => {
  for (const browser of ["firefox", "chrome"]) {
    const source = readBackgroundSource(browser, { built: false });
    const start = source.indexOf("async function clearSyncData()");
    const end = source.indexOf("async function readSyncSnapshot", start);
    const block = source.slice(start, end);
    assert.doesNotMatch(block, /syncEnabled:\s*false/, `${browser}: explicit clear must not silently turn Sync off`);
    assert.match(block, /syncEnabled:\s*meta\.syncEnabled/, `${browser}: clear must preserve the existing Sync preference`);
    assert.match(block, /syncBootstrapMode:\s*meta\.syncEnabled\s*\?\s*["']await-remote["']\s*:\s*["']none["']/, `${browser}: enabled reset must wait safely for a deliberate new source`);
    assert.match(block, /syncStatus:\s*meta\.syncEnabled\s*\?\s*["']waiting["']\s*:\s*["']off["']/, `${browser}: enabled reset must remain visibly enrolled but uninitialized`);
  }
});

test("1.30.18.44 New Tab critical CSS owns a thin theme-aware scrollbar with a transparent track", () => {
  const css = fs.readFileSync(resolve(root, "src/shared/newtab/newtab-critical.css"), "utf8");
  assert.match(css, /--scrollbar-thumb:/);
  assert.match(css, /:root\[data-effective-theme=["']light["']\][^{]*\{[^}]*--scrollbar-thumb:/s);
  assert.match(css, /\.page\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:\s*var\(--scrollbar-thumb\)\s+transparent;/s);
  assert.match(css, /\.page::?-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent;/s);
  assert.match(css, /\.page::?-webkit-scrollbar-thumb\s*\{[^}]*background(?:-color)?:\s*var\(--scrollbar-thumb\)/s);
});
