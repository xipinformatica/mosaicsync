import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = resolve(root, "src");
const sharedRoot = resolve(srcRoot, "shared");

async function walkFiles(base, dir = base, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walkFiles(base, path, out);
    else out.push(relative(base, path).replaceAll("\\", "/"));
  }
  return out;
}

function identifierCount(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (source.match(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "g")) || []).length;
}

function moduleSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

async function sharedModuleReachability(sharedJs, sources) {
  const known = new Set(sharedJs);
  const edges = new Map(sharedJs.map(rel => [rel, new Set()]));
  for (const rel of sharedJs) {
    const owner = resolve(sharedRoot, rel);
    for (const specifier of moduleSpecifiers(sources.get(`shared/${rel}`))) {
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(owner), specifier);
      let targetRel;
      try { targetRel = relative(sharedRoot, target).replaceAll("\\", "/"); }
      catch { continue; }
      if (!targetRel.startsWith("../") && known.has(targetRel)) edges.get(rel).add(targetRel);
    }
  }

  const roots = new Set(["background/background.js"]);
  for (const rel of (await walkFiles(sharedRoot)).filter(value => value.endsWith(".html"))) {
    const html = await readFile(resolve(sharedRoot, rel), "utf8");
    for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
      const target = resolve(dirname(resolve(sharedRoot, rel)), match[1]);
      const targetRel = relative(sharedRoot, target).replaceAll("\\", "/");
      if (known.has(targetRel)) roots.add(targetRel);
    }
  }

  const reachable = new Set();
  const stack = [...roots];
  while (stack.length) {
    const rel = stack.pop();
    if (reachable.has(rel) || !known.has(rel)) continue;
    reachable.add(rel);
    for (const next of edges.get(rel) || []) stack.push(next);
  }
  return {
    roots: [...roots].sort(),
    unreachable: sharedJs.filter(rel => !reachable.has(rel)).sort()
  };
}

function unusedNamedImports(rel, source) {
  const findings = [];
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/gs)) {
    for (const raw of match[1].split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const local = part.split(/\s+as\s+/).at(-1)?.trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(local || "")) continue;
      if (identifierCount(source, local) === 1) findings.push({ path: `src/${rel}`, binding: local });
    }
  }
  return findings;
}

function unreferencedPrivateFunctions(rel, source) {
  const findings = [];
  const pattern = /^\s*(?!export\b)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (identifierCount(source, name) === 1) findings.push({ path: `src/${rel}`, name });
  }
  return findings;
}

function unreferencedExports(rel, source, allSource) {
  const findings = [];
  const pattern = /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (identifierCount(allSource, name) === 1) findings.push({ path: `src/${rel}`, name });
  }
  return findings;
}

export async function collectRuntimeReachabilityAudit() {
  const sourceJs = (await walkFiles(srcRoot)).filter(rel => rel.endsWith(".js"));
  const sources = new Map();
  for (const rel of sourceJs) sources.set(rel, await readFile(resolve(srcRoot, rel), "utf8"));
  const allSource = [...sources.values()].join("\n");
  const sharedJs = sourceJs.filter(rel => rel.startsWith("shared/")).map(rel => rel.slice("shared/".length));
  const moduleGraph = await sharedModuleReachability(sharedJs, sources);

  const unusedImports = [];
  const privateFunctions = [];
  const exports = [];
  for (const rel of sourceJs) {
    const source = sources.get(rel);
    unusedImports.push(...unusedNamedImports(rel, source));
    privateFunctions.push(...unreferencedPrivateFunctions(rel, source));
    exports.push(...unreferencedExports(rel, source, allSource));
  }

  const testHooks = exports.filter(item => item.name.endsWith("ForTests"));
  const reviewOnlyExports = exports.filter(item => !item.name.endsWith("ForTests"));
  return {
    schemaVersion: 1,
    highConfidence: {
      unreachableSharedModules: moduleGraph.unreachable,
      unusedNamedImports: unusedImports,
      unreferencedPrivateFunctions: privateFunctions
    },
    retainedReviewSurfaces: {
      testHooks,
      unreferencedExports: reviewOnlyExports
    },
    runtimeRoots: moduleGraph.roots
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await collectRuntimeReachabilityAudit(), null, 2)}\n`);
}
