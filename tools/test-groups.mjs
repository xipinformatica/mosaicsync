import fs from "node:fs";
import path from "node:path";

const TEST_DIR = "tests";

const GROUPS = Object.freeze({
  startup: {
    description: "Startup, first-paint, generated New Tab readiness and appearance lifecycle",
    patterns: [
      /startup/i,
      /appearance-lifecycle/i,
      /secondary-styles/i,
      /test-architecture/i,
      /newtab-appearance-color/i,
      /browser-smoke/i,
      /corrective-13018(?:1[0489]?|9)?\.test\.mjs$/i,
      /corrective-130181[0148]\.test\.mjs$/i,
      /corrective-1301841\.test\.mjs$/i
    ]
  },
  newtab: {
    description: "New Tab UI, Settings, Spaces, folders, Frequently Visited and presentation",
    patterns: [
      /accessibility/i,
      /appearance/i,
      /features/i,
      /folder/i,
      /frequent/i,
      /hardcoded-ui/i,
      /improvements/i,
      /legal-links/i,
      /localization/i,
      /newtab/i,
      /settings-footer/i,
      /theme-wallpaper/i,
      /ui-polish/i,
      /snow-leopard/i,
      /stabilization/i,
      /corrective-12789/i,
      /corrective-130(?:1|2|4|5|18|181|1810|1811|1812|1813|1814|1818|1819)\.test\.mjs$/i,
      /corrective-13018(?:39|4[01])\.test\.mjs$/i
    ]
  },
  sync: {
    description: "Normal Sync, concurrent writes, profile state, distributed merge and journals",
    patterns: [
      /concurrent-writes/i,
      /model-sync/i,
      /profile-assets/i,
      /sync-/i,
      /production-background-e2e/i,
      /corrective-130(?:6|7|8|9|13|14|15)\.test\.mjs$/i,
      /corrective-1301842\.test\.mjs$/i
    ]
  },
  recovery: {
    description: "Catastrophic Recovery, immutable generations, retention, restart and failure behavior",
    patterns: [
      /recovery-/i,
      /corrective-13013\.test\.mjs$/i,
      /corrective-1301819\.test\.mjs$/i,
      /corrective-1301842\.test\.mjs$/i
    ]
  },
  security: {
    description: "Import validation, URL safety, hardening, hostile input and corruption handling",
    patterns: [
      /hardening/i,
      /security/i,
      /imports/i,
      /profile-security/i,
      /upgrade-corruption/i,
      /property-fuzz/i,
      /validator/i,
      /fault-injection/i,
      /cache-bounds/i
    ]
  },
  browser: {
    description: "Generated Firefox/Chromium parity, adapters, permissions and browser-native favicon behavior",
    patterns: [
      /parity/i,
      /browser-smoke/i,
      /production-background-e2e/i,
      /permission-recovery/i,
      /frequent-firefox/i,
      /favicon-/i,
      /corrective-130181[567]\.test\.mjs$/i,
      /corrective-13012\.test\.mjs$/i,
      /corrective-1301838\.test\.mjs$/i,
      /test-architecture/i
    ]
  },
  core: {
    description: "Core state/storage utilities and cross-cutting model invariants",
    patterns: [
      /storage-registry/i,
      /utils\.test/i,
      /cache-bounds/i,
      /corrective-13010\.test\.mjs$/i,
      /corrective-13018[3-8]\.test\.mjs$/i
    ]
  },
  release: {
    description: "Build, packaging, identity, release contracts, certification and maintainability tooling",
    patterns: [
      /build-/i,
      /complexity-inventory/i,
      /dead-code-retirement/i,
      /maintenance-/i,
      /release-/i,
      /optimization-/i,
      /performance-hardening/i,
      /corrective-1303\.test\.mjs$/i,
      /corrective-1301838\.test\.mjs$/i,
      /corrective-13018(?:39|4[01])\.test\.mjs$/i,
      /corrective-1301842\.test\.mjs$/i
    ]
  }
});

export function listTestGroups() {
  return Object.entries(GROUPS).map(([name, value]) => ({ name, description: value.description }));
}

export function discoverTestFiles(root = process.cwd()) {
  const testDir = path.join(root, TEST_DIR);
  return fs.readdirSync(testDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map(entry => `${TEST_DIR}/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
}

export function testFilesForGroup(name, root = process.cwd()) {
  const group = GROUPS[name];
  if (!group) throw new Error(`Unknown test group: ${name}`);
  return discoverTestFiles(root).filter(file => group.patterns.some(pattern => pattern.test(path.basename(file))));
}

export function testGroupCoverage(root = process.cwd()) {
  const files = discoverTestFiles(root);
  const memberships = new Map(files.map(file => [file, []]));
  for (const { name } of listTestGroups()) {
    for (const file of testFilesForGroup(name, root)) memberships.get(file)?.push(name);
  }
  return {
    files,
    memberships,
    ungrouped: files.filter(file => memberships.get(file)?.length === 0)
  };
}
