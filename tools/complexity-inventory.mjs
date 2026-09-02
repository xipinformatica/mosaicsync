import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = resolve(root, "src");
const sharedRoot = resolve(srcRoot, "shared");

async function walk(base, dir = base, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(base, path, out);
    else out.push(relative(base, path).replaceAll("\\", "/"));
  }
  return out;
}

async function treeStats(path) {
  const files = await walk(path);
  let bytes = 0;
  for (const rel of files) bytes += (await stat(join(path, rel))).size;
  return { files: files.length, bytes };
}

function isCodeConcentrationCandidate(rel) {
  if (!/\.(?:js|css|html)$/.test(rel)) return false;
  if (rel.includes("/i18n-locales/")) return false;
  if (rel.includes("/assets/")) return false;
  return true;
}

async function sha256Tree(path) {
  const hash = createHash("sha256");
  for (const rel of await walk(path)) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(join(path, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function browserOverlay(browser) {
  const browserRoot = resolve(srcRoot, browser);
  const files = await walk(browserRoot);
  const shadowsShared = files.filter(rel => rel !== "manifest.json" && rel !== "background/background-adapter.js" && rel !== "core/browser-shim.js" &&
    // Check actual source ownership below; this filter affects neither discovery nor output ordering.
    false);
  void shadowsShared;
  const actualShadows = [];
  for (const rel of files) {
    try {
      const info = await stat(join(sharedRoot, rel));
      if (info.isFile()) actualShadows.push(rel);
    } catch {}
  }
  return {
    files,
    shadowsShared: actualShadows.sort(),
    hasBrowserSpecificNewTabSource: files.some(rel => rel.startsWith("newtab/"))
  };
}

export async function collectComplexityInventory() {
  const [shared, firefox, chrome, sharedNewTab, firefoxOverlay, chromeOverlay] = await Promise.all([
    treeStats(resolve(srcRoot, "shared")),
    treeStats(resolve(srcRoot, "firefox")),
    treeStats(resolve(srcRoot, "chrome")),
    treeStats(resolve(sharedRoot, "newtab")),
    browserOverlay("firefox"),
    browserOverlay("chrome")
  ]);

  const concentration = [];
  for (const rel of await walk(srcRoot)) {
    if (!isCodeConcentrationCandidate(rel)) continue;
    const path = join(srcRoot, rel);
    const bytes = (await stat(path)).size;
    const text = await readFile(path, "utf8");
    const lines = text.length ? text.split("\n").length : 0;
    concentration.push({ path: `src/${rel}`, bytes, lines });
  }
  concentration.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));

  return {
    schemaVersion: 1,
    sourceTreeSha256: await sha256Tree(srcRoot),
    sourceOwnership: {
      shared,
      firefox,
      chrome,
      sharedNewTab,
      browserNewTabCopies: {
        firefox: firefoxOverlay.hasBrowserSpecificNewTabSource,
        chrome: chromeOverlay.hasBrowserSpecificNewTabSource
      },
      overlays: {
        firefox: firefoxOverlay,
        chrome: chromeOverlay
      }
    },
    concentrationCandidates: concentration.slice(0, 12)
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = await collectComplexityInventory();
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}
