#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shared = resolve(root, "src/shared");
const jsonOnly = process.argv.includes("--json");

const constantsSource = await readFile(resolve(shared, "core/constants.js"), "utf8");
const version = constantsSource.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1] || "unknown";

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function byteLength(text) { return Buffer.byteLength(text); }

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function parseHtmlStructure(source) {
  const voidTags = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  const stack = [];
  const ids = new Map();
  let elementCount = 0;
  let secondaryElementCount = 0;
  let settingsElementCount = 0;
  let dialogElementCount = 0;
  let idCount = 0;
  let dialogCount = 0;
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
    const parent = stack.at(-1) || { secondary: false, settings: false, dialog: false };
    const settings = parent.settings || id === "settingsDialog";
    const dialog = parent.dialog || tag === "dialog";
    const secondary = parent.secondary || settings || dialog;
    elementCount += 1;
    if (secondary) secondaryElementCount += 1;
    if (settings) settingsElementCount += 1;
    if (dialog) dialogElementCount += 1;
    if (tag === "dialog") dialogCount += 1;
    if (id) {
      idCount += 1;
      ids.set(id, { secondary, settings, dialog, tag });
    }
    const selfClosing = /\/\s*$/.test(attrs) || voidTags.has(tag);
    if (!selfClosing) stack.push({ tag, secondary, settings, dialog });
  }
  return {
    budget: {
      rawBytes: byteLength(source),
      elementCount,
      idCount,
      dialogCount,
      primaryElementCount: elementCount - secondaryElementCount,
      secondaryElementCount,
      settingsElementCount,
      dialogElementCount
    },
    ids
  };
}

function staticImports(source) {
  const specs = [];
  const patterns = [
    /\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/g
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) specs.push(specs.length && false ? "" : match[1]);
  return specs;
}

function dynamicImports(source) {
  return [...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1]);
}

function resolveModule(fromAbs, spec) {
  if (!spec.startsWith(".")) return null;
  let target = resolve(dirname(fromAbs), spec);
  if (!extname(target)) target += ".js";
  return target;
}

async function collectModuleClosure(entryAbs, excluded = new Set()) {
  const visited = new Set();
  const stack = [entryAbs];
  let rawBytes = 0;
  const modules = [];
  while (stack.length) {
    const abs = stack.pop();
    if (!abs || visited.has(abs) || excluded.has(abs) || !(await exists(abs))) continue;
    visited.add(abs);
    const source = await readFile(abs, "utf8");
    const bytes = byteLength(source);
    rawBytes += bytes;
    modules.push({ path: relative(shared, abs).replaceAll("\\", "/"), rawBytes: bytes });
    for (const spec of staticImports(source)) {
      const target = resolveModule(abs, spec);
      if (target && target.startsWith(shared)) stack.push(target);
    }
  }
  modules.sort((a, b) => b.rawBytes - a.rawBytes || a.path.localeCompare(b.path));
  return { moduleCount: visited.size, rawBytes, modules, absolute: visited };
}

async function collectStaticAndDeferredModules(entryRel) {
  const entryAbs = resolve(shared, entryRel);
  const staticGraph = await collectModuleClosure(entryAbs);
  const dynamicRoots = new Map();
  for (const abs of staticGraph.absolute) {
    const source = await readFile(abs, "utf8");
    for (const spec of dynamicImports(source)) {
      const target = resolveModule(abs, spec);
      if (target && target.startsWith(shared) && await exists(target)) {
        dynamicRoots.set(relative(shared, target).replaceAll("\\", "/"), target);
      }
    }
  }
  const deferredSeen = new Set(staticGraph.absolute);
  const deferredModules = [];
  let deferredBytes = 0;
  for (const [rootRel, rootAbs] of [...dynamicRoots.entries()].sort()) {
    const closure = await collectModuleClosure(rootAbs, deferredSeen);
    for (const abs of closure.absolute) deferredSeen.add(abs);
    deferredBytes += closure.rawBytes;
    deferredModules.push({ root: rootRel, moduleCount: closure.moduleCount, rawBytes: closure.rawBytes, modules: closure.modules });
  }
  return {
    staticGraph: { moduleCount: staticGraph.moduleCount, rawBytes: staticGraph.rawBytes, modules: staticGraph.modules },
    deferred: {
      rootCount: dynamicRoots.size,
      moduleCount: deferredSeen.size - staticGraph.absolute.size,
      rawBytes: deferredBytes,
      roots: deferredModules
    }
  };
}

async function collectParserPath(htmlSource) {
  const headEnd = htmlSource.indexOf("</head>");
  const scripts = [];
  for (const match of htmlSource.matchAll(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)><\/script>/gi)) {
    const attrs = `${match[1] || ""} ${match[3] || ""}`;
    const src = match[2];
    const sourceAbs = resolve(shared, "newtab", src);
    const builtAbs = resolve(root, "dist/chrome/newtab", src);
    const abs = await exists(sourceAbs) ? sourceAbs : builtAbs;
    const source = await exists(abs) ? await readFile(abs, "utf8") : "";
    const type = /\btype\s*=\s*["']module["']/i.test(attrs) ? "module" : "classic";
    const asyncAttr = /\basync\b/i.test(attrs);
    const deferAttr = /\bdefer\b/i.test(attrs);
    scripts.push({
      src,
      line: lineNumber(htmlSource, match.index),
      location: match.index < headEnd ? "head" : "body",
      type,
      parserBlocking: type === "classic" && !asyncAttr && !deferAttr,
      rawBytes: source ? byteLength(source) : null,
      generated: !(await exists(sourceAbs))
    });
  }
  const criticalCssMatch = htmlSource.match(/<link\b[^>]*href=["']([^"']*newtab-critical\.css)["'][^>]*>/i);
  let criticalCss = null;
  if (criticalCssMatch) {
    const css = await readFile(resolve(shared, "newtab", criticalCssMatch[1]), "utf8");
    criticalCss = { href: criticalCssMatch[1], rawBytes: byteLength(css) };
  }
  return {
    criticalCss,
    scripts,
    parserBlockingClassicBytes: scripts.filter(x => x.parserBlocking).reduce((sum, x) => sum + (x.rawBytes || 0), 0),
    parserBlockingClassicCount: scripts.filter(x => x.parserBlocking).length
  };
}

function collectEagerDomBindings(source, idMap) {
  const records = [];
  let genericQueries = 0;
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idMatch = line.match(/^  const\s+[\w$]+\s*=\s*document\.getElementById\(["']([^"']+)["']\)/);
    if (idMatch) {
      const id = idMatch[1];
      const meta = idMap.get(id) || { secondary: false, settings: false, dialog: false };
      records.push({ id, line: i + 1, ...meta });
      continue;
    }
    if (/^  const\s+[\w$]+\s*=\s*document\.querySelector\(/.test(line)) genericQueries += 1;
  }
  const primary = records.filter(x => !x.secondary).length;
  const secondary = records.filter(x => x.secondary).length;
  return {
    total: records.length,
    primary,
    secondary,
    settings: records.filter(x => x.settings).length,
    dialog: records.filter(x => x.dialog).length,
    genericQueries,
    records
  };
}

function collectStartupMarkers(source) {
  const markers = [];
  for (const match of source.matchAll(/startupPhase\(["']([^"']+)["']/g)) {
    markers.push({ name: match[1], line: lineNumber(source, match.index) });
  }
  return markers;
}

let step0 = null;
try {
  step0 = JSON.parse(await readFile(resolve(root, "docs/SNOW-LEOPARD-II-BASELINE-1.33.0.1.json"), "utf8"));
} catch {}

const htmlSource = await readFile(resolve(shared, "newtab/newtab.html"), "utf8");
const newtabSource = await readFile(resolve(shared, "newtab/newtab.js"), "utf8");
const html = parseHtmlStructure(htmlSource);
const parserCriticalPath = await collectParserPath(htmlSource);
const modules = await collectStaticAndDeferredModules("newtab/newtab.js");
const eagerDomBindings = collectEagerDomBindings(newtabSource, html.ids);
const startupMarkers = collectStartupMarkers(newtabSource);

const synthetic = step0?.syntheticBenchmarks?.benchmarks || {};
const medianOf = key => synthetic[key]?.medianMs ?? null;
const rankings = [
  {
    rank: 1,
    target: "secondary Settings/dialog DOM and eager wiring",
    evidenceType: "deterministic structural census",
    evidence: `${html.budget.secondaryElementCount}/${html.budget.elementCount} initial elements are secondary; ${eagerDomBindings.secondary}/${eagerDomBindings.total} eager ID bindings target secondary UI`,
    action: "Step 3 candidate: measure lazy construction/wiring by natural UI boundary; do not remove behavior"
  },
  {
    rank: 2,
    target: "state trust-boundary normalization and baseline computation",
    evidenceType: "Step-0 synthetic benchmark",
    evidence: `normalizeState(200) median ${medianOf("normalizeState(200)") ?? "n/a"} ms; createWriteBaseline(200) median ${medianOf("createWriteBaseline(200)") ?? "n/a"} ms; normalized flatten fast path ${medianOf("flattenState normalized fast path") ?? "n/a"} ms`,
    action: "Step 2 target: prove where already-trusted internal state re-enters defensive normalization"
  },
  {
    rank: 3,
    target: "static New Tab ES-module evaluation closure",
    evidenceType: "deterministic structural census",
    evidence: `${modules.staticGraph.moduleCount} statically evaluated modules / ${modules.staticGraph.rawBytes} raw source bytes before newtab.js body runs`,
    action: "Later loading step: move only interaction-only responsibilities out of the static closure when browser traces prove value"
  },
  {
    rank: 4,
    target: "authoritative/session storage wait and state materialization",
    evidenceType: "instrumented but browser measurement unavailable in this environment",
    evidence: "startup markers now separate sessionCacheReady, localRawReady and localStateMaterialized; real-browser timing requires a compatible driver pair",
    action: "Preserve overlap and authority semantics; measure before considering any I/O reuse"
  },
  {
    rank: 5,
    target: "parser-time bootstrap work",
    evidenceType: "deterministic byte census",
    evidence: `${parserCriticalPath.parserBlockingClassicCount} parser-blocking classic scripts / ${parserCriticalPath.parserBlockingClassicBytes} raw bytes plus critical CSS`,
    action: "Keep early storage/paint bootstraps unless browser traces show a bootstrap whose cost exceeds its overlap benefit"
  },
  {
    rank: 6,
    target: "already-deferred interaction-only modules",
    evidenceType: "deterministic module census",
    evidence: `${modules.deferred.moduleCount} modules / ${modules.deferred.rawBytes} raw bytes already outside the static startup closure`,
    action: "Negative optimization control: do not pull these modules back into startup or count them as first-paint cost"
  }
];

const report = {
  schemaVersion: 1,
  version,
  purpose: "Snow Leopard II New Tab critical-path census",
  initialDom: html.budget,
  parserCriticalPath,
  moduleEvaluation: { staticGraph: modules.staticGraph },
  deferredModules: modules.deferred,
  eagerDomBindings,
  startupMarkers,
  browserTimingStatus: step0?.browserStartup?.status || "unknown",
  rankings
};

if (jsonOnly) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  console.log(`MosaicSync ${version} — Snow Leopard II New Tab critical-path census`);
  console.log(`Initial DOM: ${html.budget.elementCount} elements (${html.budget.secondaryElementCount} secondary)`);
  console.log(`Eager ID bindings: ${eagerDomBindings.total} (${eagerDomBindings.secondary} secondary)`);
  console.log(`Static module closure: ${modules.staticGraph.moduleCount} modules / ${modules.staticGraph.rawBytes} bytes`);
  console.log(`Deferred module closure: ${modules.deferred.moduleCount} modules / ${modules.deferred.rawBytes} bytes`);
  console.log(`Parser-blocking classic scripts: ${parserCriticalPath.parserBlockingClassicCount} / ${parserCriticalPath.parserBlockingClassicBytes} bytes`);
  for (const item of rankings) console.log(`${item.rank}. ${item.target} — ${item.evidence}`);
}
