#!/usr/bin/env node
// File-level classification, not code coverage or assertion-level proof.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const valid = new Set(["behavioral", "integration", "static", "browser"]);
export async function inventoryTests(rootDir = root) {
  const names = (await readdir(join(rootDir, "tests"))).filter(n => n.endsWith(".test.mjs")).sort();
  const files = [];
  for (const filename of names) {
    const source = await readFile(join(rootDir, "tests", filename), "utf8");
    const matches = [...source.matchAll(/^\/\/ @kind (\S+)\s*$/gm)];
    if (matches.length !== 1 || !valid.has(matches[0][1])) {
      throw new Error(`tests/${filename}: expected exactly one valid // @kind label`);
    }
    const kind = matches[0][1];
    files.push({ file: `tests/${filename}`, kind });
  }
  const counts = Object.fromEntries([...valid].map(kind => [kind, files.filter(f => f.kind === kind).length]));
  return { schemaVersion: 1, scope: "primary-file-classification", note: "One primary kind per test file. Some files contain several assertion kinds; this is NOT a code-coverage or assertion-level estimate.", totalFiles: files.length, counts, files };
}
const cli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (cli) {
  const inventory = await inventoryTests();
  const expectedPath = join(root, "tests", "INVENTORY.json");
  const content = JSON.stringify(inventory, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const actual = await readFile(expectedPath, "utf8");
    if (actual !== content) throw new Error("tests/INVENTORY.json is stale; run npm run test:inventory:update");
    console.log(`Inventory PASS: ${inventory.totalFiles} labeled files`, inventory.counts);
  } else if (process.argv.includes("--write")) {
    await writeFile(expectedPath, content);
    console.log(`Updated tests/INVENTORY.json (${inventory.totalFiles} files)`);
  } else console.log(content);
}
