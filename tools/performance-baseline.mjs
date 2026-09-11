#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createSizeReport } from "./size-report.mjs";
import { discoverBrowserSmokeEnvironment, runBrowserSmoke } from "./browser-smoke.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));
const quick = argv.has("--quick");
const noBrowser = argv.has("--no-browser");
const sourceConstants = await readFile(resolve(root, "src/shared/core/constants.js"), "utf8");
const version = sourceConstants.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1] || "unknown";

async function walk(dir, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    const path = resolve(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

function parseHtmlBudget(source) {
  const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  const stack = [];
  let elementCount = 0, secondaryElementCount = 0, settingsElementCount = 0, dialogElementCount = 0, idCount = 0, dialogCount = 0;
  for (const match of source.matchAll(/<\s*(\/)?\s*([A-Za-z][\w:-]*)([^>]*)>/g)) {
    const closing = !!match[1];
    const tag = match[2].toLowerCase();
    const attrs = match[3] || "";
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const entry = stack.pop();
        if (entry.tag === tag) break;
      }
      continue;
    }
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (id) idCount += 1;
    const parent = stack.at(-1) || { secondary: false, settings: false, dialog: false };
    const settings = parent.settings || id === "settingsDialog";
    const dialog = parent.dialog || tag === "dialog";
    const secondary = parent.secondary || settings || dialog;
    elementCount += 1;
    if (secondary) secondaryElementCount += 1;
    if (settings) settingsElementCount += 1;
    if (dialog) dialogElementCount += 1;
    if (tag === "dialog") dialogCount += 1;
    const selfClosing = /\/\s*$/.test(attrs) || voidTags.has(tag);
    if (!selfClosing) stack.push({ tag, secondary, settings, dialog });
  }
  return {
    rawBytes: Buffer.byteLength(source), elementCount, idCount, dialogCount,
    primaryElementCount: elementCount - secondaryElementCount,
    secondaryElementCount, settingsElementCount, dialogElementCount
  };
}

function staticImports(source) {
  const specs = [];
  const patterns = [
    /\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/g
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) specs.push(match[1]);
  return specs;
}

async function collectStaticModuleGraph(entryRel) {
  const shared = resolve(root, "src/shared");
  const visited = new Set();
  const stack = [entryRel];
  let rawBytes = 0;
  while (stack.length) {
    const rel = stack.pop();
    if (visited.has(rel)) continue;
    visited.add(rel);
    const abs = resolve(shared, rel);
    const source = await readFile(abs, "utf8");
    rawBytes += Buffer.byteLength(source);
    for (const spec of staticImports(source)) {
      if (!spec.startsWith(".")) continue;
      let target = resolve(dirname(abs), spec);
      if (!extname(target)) target += ".js";
      const targetRel = relative(shared, target).replaceAll("\\", "/");
      if (!targetRel.startsWith("../")) stack.push(targetRel);
    }
  }
  return { entry: entryRel, moduleCount: visited.size, rawBytes, modules: [...visited].sort() };
}

async function collectStorageCallSites() {
  const files = (await walk(resolve(root, "src/shared"))).filter(path => path.endsWith(".js"));
  const byOperation = Object.create(null);
  let total = 0;
  const pattern = /\bbrowser\.storage\.(local|sync|session)\.(getBytesInUse|get|set|remove)\s*\(/g;
  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(pattern)) {
      const key = `${match[1]}.${match[2]}`;
      byOperation[key] = (byOperation[key] || 0) + 1;
      total += 1;
    }
  }
  return { total, byOperation: Object.fromEntries(Object.entries(byOperation).sort(([a],[b]) => a.localeCompare(b))) };
}

function runSyntheticBenchmarks() {
  const args = ["bench/performance.mjs", "--json", ...(quick ? ["--quick"] : [])];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Synthetic benchmark failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

async function collectBrowserStartup() {
  if (noBrowser) return { status: "skipped", reason: "--no-browser" };
  const environment = await discoverBrowserSmokeEnvironment();
  const availability = {
    firefox: !!(environment.firefox && environment.geckodriver),
    chrome: !!(environment.chrome && environment.chromedriver && (process.platform !== "linux" || process.env.DISPLAY || environment.xvfb))
  };
  const targets = Object.entries(availability).filter(([, ok]) => ok).map(([name]) => name);
  if (!targets.length) return { status: "unavailable", availability };
  if (targets.includes("firefox")) {
    const pkg = spawnSync("python3", ["tools/package.py", "--firefox-dev"], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (pkg.status !== 0) throw new Error(`Could not prepare Firefox development package:\n${pkg.stderr || pkg.stdout}`);
  }
  const results = {};
  for (const kind of targets) {
    const result = await runBrowserSmoke(kind, environment, { root });
    results[kind] = {
      startupPhases: result.startup?.startupPhases || {},
      navigationTiming: result.startup?.navigationTiming || null,
      domElementCount: result.startup?.domElementCount ?? null
    };
  }
  return { status: "measured", availability, results };
}

const htmlSource = await readFile(resolve(root, "src/shared/newtab/newtab.html"), "utf8");
const [packageSize, staticModuleGraph, storageCallSites, syntheticBenchmarks, browserStartup] = await Promise.all([
  createSizeReport(),
  collectStaticModuleGraph("newtab/newtab.js"),
  collectStorageCallSites(),
  Promise.resolve().then(runSyntheticBenchmarks),
  collectBrowserStartup()
]);

const report = {
  schemaVersion: 1,
  version,
  purpose: "Snow Leopard II immutable measurement baseline; local tooling only, no product telemetry",
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus()?.length || null },
  packageSize,
  syntheticBenchmarks,
  newTabStatic: { html: parseHtmlBudget(htmlSource), staticModuleGraph },
  storageCallSites,
  browserStartup
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
