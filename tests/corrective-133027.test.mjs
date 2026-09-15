import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { readBackgroundSource } from "./harness/background-source.mjs";
import { createTestRecoveryLifecycle } from "./harness/recovery-lifecycle.mjs";
import { testFilesForGroup } from "../tools/test-groups.mjs";

function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let brace = source.indexOf("{\n", start);
  if (brace < 0) brace = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i += 1; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i += 1; continue; }
    if (c === "/" && n === "*") { block = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function rootKey(deviceId, commitId) { return `root-${deviceId}-${commitId}`; }
function snapshot(deviceId, commitId, updatedAt, overrides = {}) {
  return { rootKey: rootKey(deviceId, commitId), deviceId, commitId, updatedAt, publishedAt: updatedAt, profileComplete: true, usedPreviousGeneration: false, ...overrides };
}
function addGeneration(all, deviceId, commitId, updatedAt, bytes = 80) {
  const key = rootKey(deviceId, commitId);
  all[key] = { kind: "root", deviceId, commitId, updatedAt, publishedAt: updatedAt, data: "x".repeat(bytes) };
  all[`${key}.chunk.0`] = { data: "x".repeat(bytes) };
  return key;
}
function lifecycle(policy = {}) {
  return createTestRecoveryLifecycle({
    compareDeviceSnapshotGenerationRecency: (a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0),
    deviceRootDescriptor: (key, value) => value?.kind === "root" ? { ...value, key } : null,
    syncEntryBytes: (key, value) => Buffer.byteLength(String(key)) + Buffer.byteLength(JSON.stringify(value)),
    policy: { syncQuotaBytes: 1200, syncQuotaMaxItems: 100, ...policy }
  });
}

test("1.33.0.27 emergency quota planner reclaims at most one independently verified own fallback", () => {
  const owner = lifecycle({ syncQuotaBytes: 2000 });
  assert.equal(typeof owner.planDeviceSnapshotEmergencyQuotaReclaim, "function");
  const all = {};
  const a1 = addGeneration(all, "A", "1", 10, 120);
  const a2 = addGeneration(all, "A", "2", 20, 120);
  const b1 = addGeneration(all, "B", "1", 5, 120);
  const publication = { rootKey: rootKey("A", "3"), rootValue: { data: "z".repeat(80) }, chunkWrites: { [`${rootKey("A", "3")}.chunk.0`]: { data: "z".repeat(80) } } };
  const plan = owner.planDeviceSnapshotEmergencyQuotaReclaim(all, "A", publication, [snapshot("A", "2", 20), snapshot("A", "1", 10), snapshot("B", "1", 5)]);
  assert.deepEqual(plan.rootKeys, [a1]);
  assert.ok(plan.removeKeys.includes(a1));
  assert.ok(plan.removeKeys.every(key => key === a1 || key.startsWith(`${a1}.chunk.`)));
  assert.ok(plan.all[a2]);
  assert.ok(plan.all[b1]);
});

test("1.33.0.27 emergency quota planner never deletes the last own verified generation or trusts a torn survivor", () => {
  const owner = lifecycle({ syncQuotaBytes: 2000 });
  const publication = { rootKey: rootKey("A", "3"), rootValue: { data: "z" }, chunkWrites: { [`${rootKey("A", "3")}.chunk.0`]: { data: "z" } } };
  const single = {};
  addGeneration(single, "A", "2", 20);
  assert.deepEqual(owner.planDeviceSnapshotEmergencyQuotaReclaim(single, "A", publication, [snapshot("A", "2", 20)]).removeKeys, []);

  const torn = {};
  addGeneration(torn, "A", "1", 10);
  addGeneration(torn, "A", "2", 20);
  const plan = owner.planDeviceSnapshotEmergencyQuotaReclaim(torn, "A", publication, [
    snapshot("A", "2", 20, { usedPreviousGeneration: true }),
    snapshot("A", "1", 10)
  ]);
  assert.deepEqual(plan.removeKeys, [], "a torn newest generation cannot authorize retiring its predecessor");
});

test("1.33.0.27 emergency quota planner deletes nothing when one fallback cannot make the prepared publication fit", () => {
  const owner = lifecycle({ syncQuotaBytes: 500 });
  const all = { core: { data: "x".repeat(250) } };
  addGeneration(all, "A", "1", 10, 80);
  addGeneration(all, "A", "2", 20, 80);
  const publication = { rootKey: rootKey("A", "3"), rootValue: { data: "z".repeat(220) }, chunkWrites: { [`${rootKey("A", "3")}.chunk.0`]: { data: "z".repeat(220) } } };
  const plan = owner.planDeviceSnapshotEmergencyQuotaReclaim(all, "A", publication, [snapshot("A", "2", 20), snapshot("A", "1", 10)]);
  assert.deepEqual(plan.removeKeys, []);
  assert.deepEqual(plan.rootKeys, []);
  assert.ok(plan.all[rootKey("A", "1")], "a doomed retry must not destroy a usable fallback");
});

test("1.33.0.27 emergency quota confirmation can only shrink a frozen own-device delete set", () => {
  const owner = lifecycle({ syncQuotaBytes: 2000 });
  assert.equal(typeof owner.confirmedDeviceSnapshotEmergencyQuotaReclaimKeys, "function");
  const all = {};
  const a1 = addGeneration(all, "A", "1", 10);
  addGeneration(all, "A", "2", 20);
  const publication = { rootKey: rootKey("A", "3"), rootValue: { data: "z" }, chunkWrites: { [`${rootKey("A", "3")}.chunk.0`]: { data: "z" } } };
  const snapshots = [snapshot("A", "2", 20), snapshot("A", "1", 10)];
  const plan = owner.planDeviceSnapshotEmergencyQuotaReclaim(all, "A", publication, snapshots);
  const keys = owner.confirmedDeviceSnapshotEmergencyQuotaReclaimKeys(all, snapshots, plan, "A", publication);
  assert.ok(keys.includes(a1));

  const changed = structuredClone(all);
  delete changed[rootKey("A", "2")];
  delete changed[`${rootKey("A", "2")}.chunk.0`];
  const changedSnapshots = [snapshot("A", "1", 10)];
  assert.deepEqual(owner.confirmedDeviceSnapshotEmergencyQuotaReclaimKeys(changed, changedSnapshots, plan, "A", publication), []);
});

function makePublishHarness(browser, { firstError = "quota", retryError = "", deletionFails = false, onlyOne = false, tornNewest = false, invalidateBeforeRevalidation = false } = {}) {
  const src = readBackgroundSource(browser);
  const code = ["prepareDeviceSnapshotEmergencyQuotaRetryCapacity", "publishProfileDeviceSnapshot"]
    .map(name => extractFunction(src, name)).join("\n");
  const store = {};
  if (!onlyOne) addGeneration(store, "A", "1", 10, 60);
  addGeneration(store, "A", "2", 20, 60);
  addGeneration(store, "B", "1", 5, 60);
  const publication = {
    rootKey: rootKey("A", "3"),
    rootValue: { kind: "root", deviceId: "A", commitId: "3", updatedAt: 30, publishedAt: 30 },
    chunkWrites: { [`${rootKey("A", "3")}.chunk.0`]: { data: "payload" } }
  };
  let commitCalls = 0;
  let getCalls = 0;
  const commitValues = [];
  const removed = [];
  const quotaError = () => { const error = new Error("quota exceeded"); error.name = "QuotaExceededError"; return error; };
  const genericError = () => new Error("generic write failure");
  const decoded = values => {
    const result = [];
    if (values[rootKey("A", "2")]) result.push(snapshot("A", "2", 20, { usedPreviousGeneration: tornNewest }));
    if (values[rootKey("A", "1")]) result.push(snapshot("A", "1", 10));
    if (values[rootKey("A", "3")]) result.push(snapshot("A", "3", 30));
    if (values[rootKey("B", "1")]) result.push(snapshot("B", "1", 5));
    return result;
  };
  const owner = lifecycle({ syncQuotaBytes: 100000 });
  const context = {
    console, PRODUCT_NAME: "MosaicSync",
    PERSONAL_SPACE_ID: "personal", WORK_SPACE_ID: "work",
    browser: { storage: { sync: { get: async () => {
      getCalls += 1;
      if (invalidateBeforeRevalidation && getCalls === 3) {
        delete store[rootKey("A", "2")];
        delete store[`${rootKey("A", "2")}.chunk.0`];
      }
      return structuredClone(store);
    } } } },
    readOwnDeviceSnapshot: async () => ({ rootKey: rootKey("A", "2"), root: store[rootKey("A", "2")], decoded: decoded(store).find(s => s.deviceId === "A") || null }),
    readSyncSnapshot: async () => ({ records: new Map(), settings: null, dataset: null, assets: new Map() }),
    buildProfileDeviceSnapshotPublication: async () => publication,
    prepareDeviceSnapshotPublicationCapacity: async all => all,
    readDeviceSnapshots: async values => decoded(values || store),
    planDeviceSnapshotEmergencyQuotaReclaim: owner.planDeviceSnapshotEmergencyQuotaReclaim,
    confirmedDeviceSnapshotEmergencyQuotaReclaimKeys: owner.confirmedDeviceSnapshotEmergencyQuotaReclaimKeys,
    removeSyncItems: async keys => {
      if (deletionFails) throw new Error("delete failed");
      removed.push(...keys);
      for (const key of keys) delete store[key];
    },
    commitProfileDeviceSnapshotPublication: async value => {
      commitCalls += 1;
      commitValues.push(value);
      const mode = commitCalls === 1 ? firstError : retryError;
      if (mode === "quota") throw quotaError();
      if (mode === "generic") throw genericError();
      Object.assign(store, structuredClone(value.chunkWrites), { [value.rootKey]: structuredClone(value.rootValue) });
    },
    verifyProfileDeviceSnapshotPublication: async value => ({ snapshots: decoded(store), committedSnapshot: store[value.rootKey] ? snapshot("A", "3", 30) : null }),
    pruneSupersededDeviceSnapshotGenerations: async () => 0,
    isQuotaError: error => error?.name === "QuotaExceededError",
    profilePublicationTrusted: () => true,
    workspaceStateNormalized: value => value,
    flattenStateNormalized: () => new Map(),
    makeSettingsRecordNormalized: () => null,
    recordFingerprint: value => JSON.stringify(value || null),
    settingsRecordEqual: () => true
  };
  vm.createContext(context);
  vm.runInContext(`${code}; this.publish=publishProfileDeviceSnapshot;`, context);
  return {
    store, publication, removed, commitValues,
    calls: () => commitCalls,
    publish: () => context.publish({ spaces: {} }, { deviceId: "A", syncInitialized: true, lastAppliedProfileSnapshotRevision: "ready" }, { force: true })
  };
}

for (const browser of ["firefox", "chrome"]) {
  test(`1.33.0.27 ${browser} real quota rejection reclaims one own fallback and retries the same publication exactly once`, async () => {
    const harness = makePublishHarness(browser);
    const originalPublication = harness.publication;
    const result = await harness.publish();
    assert.equal(result.written, true);
    assert.equal(harness.calls(), 2);
    assert.equal(harness.publication, originalPublication, "the prepared immutable publication object must remain stable");
    assert.strictEqual(harness.commitValues[0], harness.commitValues[1], "both commit attempts must receive the exact same prepared publication object");
    assert.equal(harness.store[rootKey("A", "1")], undefined);
    assert.ok(harness.store[rootKey("A", "2")]);
    assert.ok(harness.store[rootKey("A", "3")]);
    assert.ok(harness.store[rootKey("B", "1")], "remote Recovery must remain untouched");
    assert.ok(harness.removed.every(key => key.startsWith(rootKey("A", "1"))));
  });

  test(`1.33.0.27 ${browser} failed or unsafe emergency reclaim never starts a retry`, async () => {
    for (const options of [{ onlyOne: true }, { tornNewest: true }, { deletionFails: true }]) {
      const harness = makePublishHarness(browser, options);
      const result = await harness.publish();
      assert.equal(result.written, false);
      assert.equal(result.reason, "quota");
      assert.equal(harness.calls(), 1);
      assert.ok(harness.store[rootKey("A", "2")]);
      assert.ok(harness.store[rootKey("B", "1")]);
    }
  });

  test(`1.33.0.27 ${browser} destructive revalidation can cancel a frozen emergency candidate`, async () => {
    const harness = makePublishHarness(browser, { invalidateBeforeRevalidation: true });
    const result = await harness.publish();
    assert.equal(result.written, false);
    assert.equal(result.reason, "quota");
    assert.equal(harness.calls(), 1, "namespace drift before destruction must cancel the retry");
    assert.ok(harness.store[rootKey("A", "1")], "the frozen candidate must survive when its safety proof disappears");
    assert.ok(harness.store[rootKey("B", "1")], "remote Recovery remains outside emergency authority");
  });

  test(`1.33.0.27 ${browser} retry is bounded to one attempt and preserves retry failure semantics`, async () => {
    const quotaAgain = makePublishHarness(browser, { retryError: "quota" });
    const quotaResult = await quotaAgain.publish();
    assert.equal(quotaResult.written, false);
    assert.equal(quotaResult.reason, "quota");
    assert.equal(quotaAgain.calls(), 2, "initial commit plus one retry only");

    const generic = makePublishHarness(browser, { retryError: "generic" });
    await assert.rejects(() => generic.publish(), /generic write failure/);
    assert.equal(generic.calls(), 2, "generic retry failure must not loop");
  });
}

test("1.33.0.27 per-item Recovery overflow remains pre-excluded and is not promoted into emergency quota retry", () => {
  const storeSource = fs.readFileSync("src/shared/background/recovery-generation-store.js", "utf8");
  const coreSource = fs.readFileSync("src/shared/background/background-core.js", "utf8");
  assert.match(storeSource, /syncEntryBytes\(key, value\) > SYNC_QUOTA_BYTES_PER_ITEM\) return null/);
  assert.match(storeSource, /syncEntryBytes\(rootKey, rootValue\) > SYNC_QUOTA_BYTES_PER_ITEM\) return null/);
  assert.match(coreSource, /A synchronized item is too large for Firefox Sync/);
  assert.match(coreSource, /return name === "QuotaExceededError" \|\| \/quota\|storage\\\.sync\.\*full\|exceeded\/i\.test\(message\)/);
});

test("1.33.0.27 emergency Recovery retry is permanently covered by Sync, Recovery, security, browser and release groups", () => {
  for (const group of ["sync", "recovery", "security", "browser", "release"]) {
    const files = testFilesForGroup(group).map(file => file.replaceAll("\\", "/"));
    assert.ok(files.includes("tests/corrective-133027.test.mjs"), `${group} must include corrective-133027.test.mjs`);
  }
});
