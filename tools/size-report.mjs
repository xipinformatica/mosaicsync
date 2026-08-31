import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function sizeCategory(rel) {
  if (rel.startsWith("core/i18n-locales/") || rel === "core/i18n-runtime-catalog.js") return "localization";
  if (rel === "core/public_suffix_list.dat") return "public-suffix-list";
  if (rel.startsWith("assets/backgrounds/")) return "wallpapers";
  if (rel.startsWith("_locales/")) return "manifest-localization";
  if (/^newtab\/.*\.js$/.test(rel)) return "newtab-js";
  if (/^newtab\/.*\.css$/.test(rel)) return "newtab-css";
  if (/^newtab\/.*\.html$/.test(rel)) return "newtab-html";
  if (rel.startsWith("background/")) return "background";
  if (rel.startsWith("core/")) return "shared-core";
  if (rel.startsWith("welcome/")) return "welcome";
  if (rel.startsWith("assets/")) return "assets";
  if (rel === "manifest.json") return "manifest";
  return "other";
}

async function walk(base, dir = base, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(base, path, out);
    else out.push(relative(base, path).replaceAll("\\", "/"));
  }
  return out;
}

export async function measureRuntime(browser) {
  const base = resolve(root, "dist", browser);
  const manifest = JSON.parse(await readFile(join(base, "manifest.json"), "utf8"));
  const categories = Object.create(null);
  const files = [];
  for (const rel of await walk(base)) {
    const bytes = await readFile(join(base, rel));
    const compressedBytes = deflateRawSync(bytes, { level: 9 }).byteLength;
    const category = sizeCategory(rel);
    const entry = categories[category] ||= { files: 0, rawBytes: 0, deflatedBytes: 0 };
    entry.files += 1;
    entry.rawBytes += bytes.byteLength;
    entry.deflatedBytes += compressedBytes;
    files.push({ path: rel, category, rawBytes: bytes.byteLength, deflatedBytes: compressedBytes });
  }
  files.sort((a, b) => b.deflatedBytes - a.deflatedBytes || b.rawBytes - a.rawBytes || a.path.localeCompare(b.path));
  return {
    version: String(manifest.version || ""),
    rawBytes: files.reduce((sum, file) => sum + file.rawBytes, 0),
    deflatedBytes: files.reduce((sum, file) => sum + file.deflatedBytes, 0),
    categories: Object.fromEntries(Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))),
    largestFiles: files.slice(0, 30)
  };
}

export async function createSizeReport() {
  const report = { schemaVersion: 1, browsers: {} };
  for (const browser of ["firefox", "chrome"]) report.browsers[browser] = await measureRuntime(browser);
  return report;
}

function printReport(report) {
  for (const [browser, data] of Object.entries(report.browsers)) {
    console.log(`\n${browser}: ${data.rawBytes} raw bytes; ${data.deflatedBytes} deflated payload bytes`);
    for (const [category, values] of Object.entries(data.categories)) {
      console.log(`${category.padEnd(24)} ${String(values.rawBytes).padStart(9)} raw  ${String(values.deflatedBytes).padStart(9)} deflated  ${values.files} files`);
    }
    console.log("Largest compressed contributors:");
    for (const file of data.largestFiles.slice(0, 15)) {
      console.log(`  ${String(file.deflatedBytes).padStart(8)}  ${file.path}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await createSizeReport();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const writeIndex = process.argv.indexOf("--write");
  if (writeIndex >= 0) {
    const output = process.argv[writeIndex + 1] ? resolve(root, process.argv[writeIndex + 1]) : resolve(root, "package-size-report.json");
    await writeFile(output, json);
    console.log(`Wrote ${relative(root, output)}`);
  }
  printReport(report);
}
