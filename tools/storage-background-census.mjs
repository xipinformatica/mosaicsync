#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src/shared");
const constantsSource = await readFile(resolve(sourceRoot, "core/constants.js"), "utf8");
const version = constantsSource.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1] || "unknown";

async function walk(dir, out = []) {
  for (const name of (await readdir(dir)).sort()) {
    const path = resolve(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

function nearestOwner(lines, index) {
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/
  ];
  for (let i = index; i >= Math.max(0, index - 160); i -= 1) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match) return match[1];
    }
  }
  return "module";
}

function semanticClass({ file, owner, area }) {
  const text = `${file} ${owner}`.toLowerCase();
  if (area === "session") return "ephemeral-session-coordination";
  if (file.endsWith("sync-pending-journal.js") || /pending.*sync|durable.*signature|continuity/.test(text)) {
    return "durable-concurrency-authority";
  }
  if (/catastrophic|reconcile|bootstrap|remote.*core|sync.*snapshot|core.*sources/.test(text)) {
    return "sync-freshness-reconciliation";
  }
  if (/recovery|reset|quota|device.*snapshot|garbage.*collect.*snapshot|cleanup.*copies/.test(text)) {
    return "recovery-reset-quota";
  }
  if (file.endsWith("core/storage.js") && /ensure|startup|materialize|repair|persist|write.*state|asset/.test(text)) {
    return "startup-local-authority";
  }
  if (/favicon|icon|asset/.test(text)) return "asset-favicon-lifecycle";
  if (file.endsWith("custom-branding.js")) return "device-local-branding";
  if (/diagnostic|maintenance/.test(text)) return "diagnostics-maintenance";
  if (area === "sync") return "sync-storage-orchestration";
  if (area === "local") return "local-storage-orchestration";
  return "other";
}

async function collectCallSites() {
  const files = (await walk(sourceRoot)).filter(path => path.endsWith(".js"));
  const pattern = /\bbrowser\.storage\.(local|sync|session)\.(getBytesInUse|get|set|remove)\s*\(([^\n]*)/g;
  const sites = [];
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(lines[index]))) {
        const area = match[1];
        const operation = match[2];
        const argumentPrefix = match[3].trim();
        const owner = nearestOwner(lines, index);
        const file = relative(root, path).replaceAll("\\", "/");
        sites.push({
          file,
          line: index + 1,
          area,
          operation,
          owner,
          fullAreaRead: operation === "get" && /^null\s*\)/.test(argumentPrefix),
          semanticClass: semanticClass({ file, owner, area })
        });
      }
    }
  }
  const countBy = selector => Object.fromEntries([...sites.reduce((map, site) => {
    const key = selector(site);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)));
  return {
    total: sites.length,
    byOperation: countBy(site => `${site.area}.${site.operation}`),
    byFile: countBy(site => site.file),
    bySemanticClass: countBy(site => site.semanticClass),
    fullAreaReads: sites.filter(site => site.fullAreaRead),
    sites
  };
}

async function collectWakeTopology() {
  const source = await readFile(resolve(sourceRoot, "background/background-core.js"), "utf8");
  const listeners = [];
  const pattern = /browser\.([\w?.]+)\.addListener(?:\?\.)?\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    listeners.push({ event: `browser.${match[1]}`, line });
  }
  return { totalListeners: listeners.length, listeners };
}

function runScenario(browser, scenario) {
  const result = spawnSync(process.execPath, ["tests/harness/background-runtime-scenario.mjs", browser, scenario], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`${browser}/${scenario} failed:\n${result.stderr || result.stdout}`);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

const scenarios = [
  "snow-step5a-startup-sync-off",
  "snow-step5a-startup-sync-on",
  "snow-step5a-sync-watch-alarm"
];
const runtime = {};
for (const browser of ["firefox", "chrome"]) {
  runtime[browser] = Object.fromEntries(scenarios.map(scenario => [scenario, runScenario(browser, scenario)]));
}

const callSites = await collectCallSites();
const wakeTopology = await collectWakeTopology();
const report = {
  schemaVersion: 1,
  version,
  purpose: "Snow Leopard II Step 5A local-only storage/background census; no product telemetry",
  directStorageCallSites: callSites,
  backgroundWakeTopology: wakeTopology,
  runtimeCensus: runtime,
  interpretationBoundaries: {
    fullSyncReadsAreNotAssumedRedundant: true,
    reasons: [
      "catastrophic-loss detection intentionally performs freshness reads before normal reconciliation",
      "pending durable Sync journals and delivered-core repair can mutate authority between reads",
      "device-snapshot garbage collection performs its own fresh pre-delete revalidation",
      "session storage is disposable coordination/cache state and is not durable profile authority"
    ],
    nextAction: "Use this census to choose a separately proven optimization; do not eliminate storage reads from count similarity alone."
  }
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
