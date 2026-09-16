import { performance } from "node:perf_hooks";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeWorstCaseProfile } from "../fixtures/worst-case-profile.mjs";

globalThis.crypto ||= webcrypto;

const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const quickMode = args.has("--quick");
const sourceConstants = await readFile(new URL("../src/shared/core/constants.js", import.meta.url), "utf8");
const version = sourceConstants.match(/export const VERSION\s*=\s*"([^"]+)"/)?.[1] || "unknown";
const model = await import("../dist/firefox/core/model.js");
const assets = await import("../dist/firefox/core/local-assets.js");
const storage = await import("../dist/firefox/core/storage.js");
const raw = makeWorstCaseProfile({ count: 200 });
const normalized = model.normalizeState(raw);
const projected = assets.projectStateToLocalAssets(normalized);
const hydratedStartup = assets.hydrateStateLocalAssets(projected.state, projected.assets, { spaceIds: ["personal"] });
const validatedAssetMemo = new Map([...projected.assets].map(([assetId, dataUrl]) => [dataUrl, assetId]));
const personal = model.workspaceStateNormalized(normalized, "personal");
const records = [...model.flattenStateNormalized(personal, "bench-device").values()];
const recordA = records[0];
const recordB = { ...recordA, deviceId: "other-device" };
const projectedAssetIds = [];
for (const item of projected.state.spaces.personal.shortcuts) {
  if (item.type === "folder") for (const child of item.items || []) { if (child.localImageAssetId) projectedAssetIds.push(child.localImageAssetId); }
  else if (item.localImageAssetId) projectedAssetIds.push(item.localImageAssetId);
}
const folderHeavyIds = projectedAssetIds.slice(0, 150);
const folderHeavyCompact = { spaces: { personal: { shortcuts: Array.from({ length: 5 }, (_, folderIndex) => ({
  type: "folder", id: `bench-large-folder-${folderIndex}`,
  items: folderHeavyIds.slice(folderIndex * 30, (folderIndex + 1) * 30).map((id, index) => ({ type: "shortcut", localImageAssetId: id, position: index }))
})) } } };
const allFolderAssets = assets.collectStateLocalAssetIds(folderHeavyCompact, { spaceIds: ["personal"], includeBackground: false });
const visibleFolderAssets = assets.collectStateLocalAssetIds(folderHeavyCompact, { spaceIds: ["personal"], includeBackground: false, folderChildLimit: 4 });
const crossSpaceShortcutId = normalized.spaces.personal.shortcuts.find(item => item.type === "shortcut")?.id ||
  normalized.spaces.personal.shortcuts.find(item => item.type === "folder")?.items?.[0]?.id || "";
const trustedPersonal = normalized.spaces.personal;
const trustedWorkspaceMutation = {
  ...trustedPersonal,
  settings: { ...trustedPersonal.settings, spaceName: "Benchmark" },
  settingsModifiedAt: 123456,
  updatedAt: Math.max(Number(trustedPersonal.updatedAt) || 0, 123456)
};

const specs = [
  ["normalizeState(200)", () => model.normalizeState(raw), 20, 2],
  ["stableStringify(200)", () => model.stableStringify(normalized), 20, 3],
  ["projectStateToLocalAssets(200)", () => assets.projectStateToLocalAssets(normalized), 20, 2],
  ["createWriteBaseline(200)", () => storage.createWriteBaseline(normalized), 20, 2],
  ["hydrate active Space", () => assets.hydrateStateLocalAssets(projected.state, projected.assets, { spaceIds: ["personal"] }), 30, 20],
  ["startup normalize without validated memo", () => model.normalizeState(hydratedStartup), 20, 2],
  ["startup normalize with validated memo", () => model.normalizeState(hydratedStartup, new Map(validatedAssetMemo)), 20, 2],
  ["startup baseline without validated memo", () => storage.createWriteBaseline(hydratedStartup), 20, 2],
  ["startup baseline with validated memo", () => storage.createWriteBaseline(hydratedStartup, new Map(validatedAssetMemo)), 20, 2],
  ["flattenState trust-boundary", () => model.flattenState(personal, "bench-device"), 30, 2],
  ["flattenState normalized fast path", () => model.flattenStateNormalized(personal, "bench-device"), 30, 20],
  ["settings record trust-boundary", () => model.makeSettingsRecord(personal, "bench-device"), 50, 2],
  ["settings record normalized fast path", () => model.makeSettingsRecordNormalized(personal, "bench-device"), 50, 200],
  ["settings-clock stamping defensive(200)", () => model.stampSettingsMutationClocks(projected.state, normalized), 10, 1],
  ["settings-clock stamping normalized intended(200)", () => model.stampSettingsMutationClocksTrustedNormalized(model.normalizeState(projected.state), normalized), 20, 2],
  ["syncRecordEqual allocation-light", () => model.syncRecordEqual(recordA, recordB), 10000, 2000],
  ["syncRecordEqual legacy stringify equivalent", () => model.stableStringify((({ deviceId, ...rest }) => rest)(recordA)) === model.stableStringify((({ deviceId, ...rest }) => rest)(recordB)), 1000, 50],
  ["persisted compact baseline clone(200)", () => storage.createPersistedWriteBaseline(projected.state), 20, 4],
  ...(crossSpaceShortcutId ? [["cross-Space normalized move+intent(200)", () => {
    const moved = model.moveShortcutBetweenSpacesNormalized(normalized, {
      shortcutId: crossSpaceShortcutId, fromSpaceId: "personal", toSpaceId: "work"
    });
    model.createCrossSpaceSyncIntentNormalized(normalized, moved, {
      fromSpaceId: "personal", toSpaceId: "work", shortcutIds: [crossSpaceShortcutId],
      deviceId: "bench-device", timestamp: 123
    });
  }, 20, 4]] : []),
  ["workspace setting legacy defensive chain(200)", () => {
    const revalidated = model.normalizeState(normalized);
    model.replaceWorkspace(revalidated, "personal", trustedWorkspaceMutation);
  }, 5, 1],
  ["workspace setting trusted replacement(200)", () => {
    model.replaceWorkspaceTrustedNormalized(normalized, "personal", trustedWorkspaceMutation);
  }, 1000, 500]
];

function singleAverage(fn, iterations, warmup = 5) {
  for (let i = 0; i < warmup; i += 1) fn();
  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return (performance.now() - started) / iterations;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function distribution(fn, normalIterations, quickIterations) {
  const samples = quickMode ? 3 : 5;
  const iterations = quickMode ? Math.max(1, quickIterations) : Math.max(1, quickIterations * 2);
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) values.push(singleAverage(fn, iterations, sample === 0 ? Math.min(3, iterations) : 0));
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples,
    iterationsPerSample: iterations,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: percentile(values, 0.95),
    minMs: sorted[0],
    maxMs: sorted.at(-1)
  };
}

if (jsonMode) {
  const benchmarks = {};
  for (const [name, fn, iterations, quickIterations] of specs) benchmarks[name] = distribution(fn, iterations, quickIterations);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    version,
    mode: quickMode ? "quick" : "standard",
    benchmarks,
    structural: {
      coreJsonBytes: Buffer.byteLength(JSON.stringify(projected.state)),
      deduplicatedAssets: projected.assets.size,
      closedFolderArtworkIdsFull: allFolderAssets.size,
      closedFolderArtworkIdsFirstFrame: visibleFolderAssets.size
    }
  }, null, 2)}\n`);
} else {
  for (const [name, fn, iterations] of specs) {
    const ms = singleAverage(fn, iterations);
    console.log(`${name}: ${ms.toFixed(3)} ms avg (${iterations} iterations)`);
  }
  console.log(`core JSON bytes: ${Buffer.byteLength(JSON.stringify(projected.state))}`);
  console.log(`deduplicated assets: ${projected.assets.size}`);
  console.log(`closed-folder startup artwork IDs: ${allFolderAssets.size} full -> ${visibleFolderAssets.size} first-frame visible`);
}
