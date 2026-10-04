/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Browser-neutral Recovery-generation lifecycle boundary.
 *
 * This module owns verified-generation classification, quota-capacity and
 * fallback-retirement planning, superseded-generation retention, and
 * stale/orphan GC eligibility decisions. It deliberately performs no browser
 * reads or writes and has no clock, timer, journal, merge, or catastrophic-loss
 * responsibilities. The background orchestrator supplies explicit observations
 * and applies the returned effects.
 */
import {
  DEVICE_SNAPSHOT_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION,
  DEVICE_SNAPSHOT_RETENTION_MS,
  DEVICE_SNAPSHOT_CAP_MIN_AGE_MS,
  DEVICE_SNAPSHOT_MAX_RECENT_DEVICES,
  DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE,
  DEVICE_SNAPSHOT_GC_INTERVAL_MS,
  DEVICE_SNAPSHOT_ORPHAN_GRACE_MS,
  DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_MAX_ITEMS
} from "../core/constants.js";

const DEFAULT_POLICY = Object.freeze({
  syncQuotaBytes: SYNC_QUOTA_BYTES,
  syncQuotaMaxItems: SYNC_QUOTA_MAX_ITEMS,
  retentionMs: DEVICE_SNAPSHOT_RETENTION_MS,
  capMinAgeMs: DEVICE_SNAPSHOT_CAP_MIN_AGE_MS,
  maxRecentDevices: DEVICE_SNAPSHOT_MAX_RECENT_DEVICES,
  maxGenerationsPerDevice: DEVICE_SNAPSHOT_MAX_GENERATIONS_PER_DEVICE,
  gcIntervalMs: DEVICE_SNAPSHOT_GC_INTERVAL_MS,
  orphanGraceMs: DEVICE_SNAPSHOT_ORPHAN_GRACE_MS,
  orphanMinGcPasses: DEVICE_SNAPSHOT_ORPHAN_MIN_GC_PASSES
});

export function createRecoveryGenerationLifecycle({
  format,
  compareStableText,
  syncEntryBytes,
  policy = {}
} = {}) {
  if (!format || typeof format !== "object") throw new TypeError("Invalid Recovery generation format");
  for (const [name, fn] of Object.entries({
    compareDeviceSnapshotGenerationRecency: format.compareDeviceSnapshotGenerationRecency,
    deviceRootDescriptor: format.deviceRootDescriptor,
    deviceSnapshotKeysForRoot: format.deviceSnapshotKeysForRoot,
    isDeviceSnapshotChunkKey: format.isDeviceSnapshotChunkKey,
    compareStableText,
    syncEntryBytes
  })) {
    if (typeof fn !== "function") throw new TypeError(`Invalid Recovery lifecycle helper: ${name}`);
  }
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new TypeError("Invalid Recovery lifecycle policy");
  }

  const settings = Object.freeze({ ...DEFAULT_POLICY, ...policy });
  const {
    compareDeviceSnapshotGenerationRecency,
    deviceRootDescriptor,
    deviceSnapshotKeysForRoot,
    isDeviceSnapshotChunkKey
  } = format;

  function syncItemsFitInSnapshot(all, items) {
    const current = all && typeof all === "object" ? all : {};
    const nextItems = items && typeof items === "object" ? items : {};
    let bytes = 0;
    let count = 0;
    for (const [key, value] of Object.entries(current)) {
      if (Object.prototype.hasOwnProperty.call(nextItems, key)) continue;
      bytes += syncEntryBytes(key, value);
      count += 1;
    }
    for (const [key, value] of Object.entries(nextItems)) {
      bytes += syncEntryBytes(key, value);
      count += 1;
    }
    return bytes <= settings.syncQuotaBytes && count <= settings.syncQuotaMaxItems;
  }

  function verifiedProfileDeviceSnapshotDescriptors(all, snapshots, deviceId = "") {
    return (Array.isArray(snapshots) ? snapshots : [])
      // A torn root may decode through an embedded previous-generation
      // descriptor. That preserves readability but cannot authorize retirement.
      .filter(snapshot => snapshot?.profileComplete === true && snapshot.usedPreviousGeneration !== true && snapshot.rootKey)
      .map(snapshot => deviceRootDescriptor(snapshot.rootKey, all?.[snapshot.rootKey]))
      .filter(entry => entry && (!deviceId || entry.deviceId === deviceId));
  }

  function currentDeviceSnapshotRootHeader(value) {
    if (!value || Number(value.schemaVersion) !== DEVICE_SNAPSHOT_SCHEMA_VERSION) return false;
    if (value.kind === "device-snapshot") return true;
    return value.kind === "device-snapshot-manifest" &&
      Number(value.chunkSchemaVersion) === DEVICE_SNAPSHOT_CHUNK_SCHEMA_VERSION;
  }

  function planDeviceSnapshotPublicationCapacity(all, deviceId, publication, snapshots) {
    const values = all && typeof all === "object" ? all : {};
    const publicationItems = { ...publication?.chunkWrites, [publication?.rootKey]: publication?.rootValue };
    if (syncItemsFitInSnapshot(values, publicationItems)) return { all: values, removeKeys: [] };

    // Staging may retire only older independently verified complete-profile
    // generations. A torn root decoded through its previous-generation fallback
    // is readable Recovery material, but it cannot authorize retiring that fallback.
    const valid = verifiedProfileDeviceSnapshotDescriptors(values, snapshots, deviceId)
      .sort(compareDeviceSnapshotGenerationRecency);
    if (valid.length < 2) return { all: values, removeKeys: [] };

    const simulated = { ...values };
    const removeKeys = [];
    for (let index = valid.length - 1; index >= 1; index -= 1) {
      const keys = deviceSnapshotKeysForRoot(simulated, valid[index].key);
      if (!keys.length) continue;
      for (const key of keys) {
        delete simulated[key];
        removeKeys.push(key);
      }
      if (syncItemsFitInSnapshot(simulated, publicationItems)) return { all: simulated, removeKeys };
    }
    return { all: values, removeKeys: [] };
  }

  function planDeviceSnapshotEmergencyQuotaReclaim(all, deviceId, publication, snapshots) {
    const values = all && typeof all === "object" ? all : {};
    const publicationItems = { ...publication?.chunkWrites, [publication?.rootKey]: publication?.rootValue };
    const roots = verifiedProfileDeviceSnapshotDescriptors(values, snapshots, deviceId)
      .sort(compareDeviceSnapshotGenerationRecency);
    // Emergency quota recovery may retire at most one older independently
    // verified generation belonging to the acting device. One independently
    // verified fallback must remain before the immutable replacement is retried.
    if (roots.length < 2) return { all: values, rootKeys: [], removeKeys: [] };

    const candidate = roots[roots.length - 1];
    const keys = deviceSnapshotKeysForRoot(values, candidate.key);
    if (!keys.length) return { all: values, rootKeys: [], removeKeys: [] };
    const simulated = { ...values };
    for (const key of keys) delete simulated[key];
    // The local accounting model is only a veto after a browser quota error:
    // never destroy a fallback when even our own optimistic model says the
    // exact prepared publication still cannot fit.
    if (!syncItemsFitInSnapshot(simulated, publicationItems)) {
      return { all: values, rootKeys: [], removeKeys: [] };
    }
    return { all: simulated, rootKeys: [candidate.key], removeKeys: keys };
  }

  function confirmedDeviceSnapshotEmergencyQuotaReclaimKeys(latest, latestSnapshots, plan, deviceId, publication) {
    const requested = new Set(Array.isArray(plan?.rootKeys) ? plan.rootKeys : []);
    if (!requested.size) return [];
    const refreshed = planDeviceSnapshotEmergencyQuotaReclaim(latest, deviceId, publication, latestSnapshots);
    const stillEligible = new Set(refreshed.rootKeys);
    const rootKeys = [...requested].filter(rootKey => stillEligible.has(rootKey));
    return [...new Set(rootKeys.flatMap(rootKey => deviceSnapshotKeysForRoot(latest, rootKey)))];
  }

  function supersededDeviceSnapshotRootKeys(all, snapshots, deviceId, { protectRootKey = "" } = {}) {
    const roots = verifiedProfileDeviceSnapshotDescriptors(all, snapshots, deviceId)
      .sort(compareDeviceSnapshotGenerationRecency);
    if (protectRootKey && !roots.some(entry => entry.key === protectRootKey)) return [];
    if (roots.length <= settings.maxGenerationsPerDevice) return [];

    const keep = [];
    const protectedRoot = protectRootKey ? roots.find(entry => entry.key === protectRootKey) : null;
    if (protectedRoot) keep.push(protectedRoot);
    for (const entry of roots) {
      if (keep.length >= settings.maxGenerationsPerDevice) break;
      if (protectedRoot && entry.key === protectedRoot.key) continue;
      keep.push(entry);
    }
    const keepKeys = new Set(keep.map(entry => entry.key));
    return roots.filter(entry => !keepKeys.has(entry.key)).map(entry => entry.key);
  }

  function confirmedSupersededDeviceSnapshotKeys(latest, latestSnapshots, candidates, deviceId, options = {}) {
    const initiallyStale = new Set(Array.isArray(candidates) ? candidates : []);
    if (!initiallyStale.size) return [];
    const stillStale = new Set(supersededDeviceSnapshotRootKeys(latest, latestSnapshots, deviceId, options));
    const keys = [...initiallyStale]
      .filter(rootKey => stillStale.has(rootKey))
      .flatMap(rootKey => deviceSnapshotKeysForRoot(latest, rootKey));
    return [...new Set(keys)];
  }

  function staleVerifiedRootKeys(values, snapshots, { deviceId, rootSeenPass, gcPass }) {
    const generationsByDevice = new Map();
    for (const root of verifiedProfileDeviceSnapshotDescriptors(values, snapshots)) {
      const list = generationsByDevice.get(root.deviceId) || [];
      list.push(root);
      generationsByDevice.set(root.deviceId, list);
    }
    for (const list of generationsByDevice.values()) list.sort(compareDeviceSnapshotGenerationRecency);

    const newestPerDevice = [...generationsByDevice.entries()]
      .map(([entryDeviceId, list]) => ({
        ...list[0],
        deviceId: entryDeviceId,
        observedPass: Number(rootSeenPass[list[0].key]) || gcPass
      }))
      .sort((a, b) => b.observedPass - a.observedPass || compareStableText(a.deviceId, b.deviceId));
    const keepRecentDevices = new Set(newestPerDevice.slice(0, settings.maxRecentDevices).map(entry => entry.deviceId));
    keepRecentDevices.add(deviceId);

    const retentionPasses = Math.max(1, Math.ceil(settings.retentionMs / settings.gcIntervalMs));
    const capMinAgePasses = Math.max(1, Math.ceil(settings.capMinAgeMs / settings.gcIntervalMs));
    const stale = new Set();
    for (const [entryDeviceId, list] of generationsByDevice) {
      list.slice(settings.maxGenerationsPerDevice).forEach(entry => stale.add(entry.key));
      if (entryDeviceId === deviceId) continue;
      const newest = list[0];
      const observedPass = Number(rootSeenPass[newest.key]) || gcPass;
      const observedAgePasses = Math.max(0, gcPass - observedPass);
      const expired = observedAgePasses >= retentionPasses;
      const rank = newestPerDevice.findIndex(entry => entry.deviceId === entryDeviceId);
      const overCapAndMature = rank >= settings.maxRecentDevices &&
        observedAgePasses >= capMinAgePasses && !keepRecentDevices.has(entryDeviceId);
      if (expired || overCapAndMature) list.forEach(entry => stale.add(entry.key));
    }
    return stale;
  }

  function planDeviceSnapshotGarbageCollection(all, snapshots, meta, now) {
    const values = all && typeof all === "object" ? all : {};
    const decodedSnapshots = Array.isArray(snapshots) ? snapshots : [];
    const state = meta && typeof meta === "object" ? meta : {};
    const observedAt = Number(now) || 0;
    const readableRootKeys = new Set(decodedSnapshots.map(snapshot => snapshot?.rootKey).filter(Boolean));
    const roots = Object.entries(values).map(([key, value]) => deviceRootDescriptor(key, value)).filter(Boolean);
    const verifiedRoots = verifiedProfileDeviceSnapshotDescriptors(values, decodedSnapshots);

    const gcPass = Math.max(0, Math.trunc(Number(state.deviceSnapshotGcPass) || 0)) + 1;
    const rootSeenPass = { ...(state.deviceSnapshotRootSeenPass || {}) };
    const liveRootKeys = new Set(verifiedRoots.map(root => root.key));
    for (const root of verifiedRoots) {
      if (!(Number(rootSeenPass[root.key]) > 0)) rootSeenPass[root.key] = gcPass;
    }
    for (const rootKey of Object.keys(rootSeenPass)) {
      if (!liveRootKeys.has(rootKey)) delete rootSeenPass[rootKey];
    }

    const staleRootKeys = [...staleVerifiedRootKeys(values, decodedSnapshots, {
      deviceId: state.deviceId,
      rootSeenPass,
      gcPass
    })];
    const orphanSeenAt = { ...(state.deviceSnapshotOrphanSeenAt || {}) };
    const orphanSeenPass = { ...(state.deviceSnapshotOrphanSeenPass || {}) };
    const orphanGroups = new Map();

    for (const root of roots) {
      if (readableRootKeys.has(root.key) || !currentDeviceSnapshotRootHeader(values[root.key])) continue;
      orphanGroups.set(root.key, { keys: deviceSnapshotKeysForRoot(values, root.key) });
    }
    for (const [key] of Object.entries(values)) {
      if (!isDeviceSnapshotChunkKey(key)) continue;
      const marker = key.indexOf(".chunk.");
      if (marker <= 0) continue;
      const rootKey = key.slice(0, marker);
      if (Object.prototype.hasOwnProperty.call(values, rootKey)) {
        if (!orphanGroups.has(rootKey)) {
          delete orphanSeenAt[rootKey];
          delete orphanSeenPass[rootKey];
        }
        continue;
      }
      const group = orphanGroups.get(rootKey) || { keys: [] };
      group.keys.push(key);
      orphanGroups.set(rootKey, group);
    }

    const eligibleOrphanRoots = [];
    const liveOrphanRoots = new Set();
    for (const [rootKey, group] of orphanGroups) {
      if (!group.keys.length) continue;
      liveOrphanRoots.add(rootKey);
      let firstSeenAt = Number(orphanSeenAt[rootKey]) || 0;
      let firstSeenPass = Number(orphanSeenPass[rootKey]) || 0;

      if (firstSeenAt > observedAt) {
        firstSeenAt = observedAt;
        firstSeenPass = gcPass;
        orphanSeenAt[rootKey] = observedAt;
        orphanSeenPass[rootKey] = gcPass;
        continue;
      }
      if (!firstSeenAt || !firstSeenPass) {
        orphanSeenAt[rootKey] = observedAt;
        orphanSeenPass[rootKey] = gcPass;
        continue;
      }
      const observedPasses = Math.max(0, gcPass - firstSeenPass);
      const elapsed = Math.max(0, observedAt - firstSeenAt);
      if (observedPasses >= settings.orphanMinGcPasses && elapsed >= settings.orphanGraceMs) {
        eligibleOrphanRoots.push(rootKey);
        delete orphanSeenAt[rootKey];
        delete orphanSeenPass[rootKey];
      }
    }
    for (const rootKey of Object.keys(orphanSeenAt)) {
      if (!liveOrphanRoots.has(rootKey)) delete orphanSeenAt[rootKey];
    }
    for (const rootKey of Object.keys(orphanSeenPass)) {
      if (!liveOrphanRoots.has(rootKey)) delete orphanSeenPass[rootKey];
    }

    const boundedOrphanEntries = Object.entries(orphanSeenAt)
      .sort((a, b) => Number(b[1]) - Number(a[1]) || compareStableText(a[0], b[0]))
      .slice(0, 64);
    const boundedOrphanSeenAt = Object.fromEntries(boundedOrphanEntries);
    const boundedOrphanSeenPass = Object.fromEntries(
      boundedOrphanEntries.map(([rootKey]) => [rootKey, Number(orphanSeenPass[rootKey]) || gcPass])
    );
    const boundedRootSeenPass = Object.fromEntries(
      Object.entries(rootSeenPass)
        .sort((a, b) => Number(b[1]) - Number(a[1]) || compareStableText(a[0], b[0]))
        .slice(0, 256)
    );

    return {
      deviceId: state.deviceId,
      gcPass,
      rootSeenPass,
      staleRootKeys,
      eligibleOrphanRoots,
      deviceSnapshotRootSeenPass: boundedRootSeenPass,
      deviceSnapshotOrphanSeenAt: boundedOrphanSeenAt,
      deviceSnapshotOrphanSeenPass: boundedOrphanSeenPass
    };
  }

  function manualRecoveryGroups(all, snapshots) {
    const groups = new Map();
    for (const root of verifiedProfileDeviceSnapshotDescriptors(all, snapshots)) {
      const list = groups.get(root.deviceId) || [];
      list.push(root);
      groups.set(root.deviceId, list);
    }
    for (const list of groups.values()) list.sort(compareDeviceSnapshotGenerationRecency);
    return groups;
  }

  function planManualRecoveryCleanup(all, snapshots, {
    mode = "", rootKey = "", deviceId = "", currentDeviceId = "",
    rootSeenPass = {}, gcPass = 0
  } = {}) {
    const values = all && typeof all === "object" ? all : {};
    const groups = manualRecoveryGroups(values, snapshots);
    const observedRoots = rootSeenPass && typeof rootSeenPass === "object" ? rootSeenPass : {};
    const observedGcPass = Math.max(0, Math.trunc(Number(gcPass) || 0));
    let rootKeys = [];

    if (mode === "superseded") {
      for (const list of groups.values()) rootKeys.push(...list.slice(1).map(entry => entry.key));
    } else if (mode === "generation") {
      const target = String(rootKey || "");
      if (target) {
        for (const list of groups.values()) {
          const index = list.findIndex(entry => entry.key === target);
          if (index > 0) {
            rootKeys = [target];
            break;
          }
        }
      }
    } else if (mode === "device") {
      const targetDevice = String(deviceId || "");
      const current = String(currentDeviceId || "");
      if (targetDevice && current && targetDevice !== current) {
        const target = groups.get(targetDevice) || [];
        const currentFallbacks = groups.get(current) || [];
        // Whole-device deletion is deliberately stricter than ordinary
        // superseded-generation cleanup. In addition to an independently verified
        // current-device fallback, every target root must already have remained
        // visible across multiple local Recovery-GC observations. A generation
        // that has just appeared (notably the fresh survivor published by another
        // device while it performs its own cleanup) therefore cannot immediately
        // become destructive authority on this device. No new Sync key or Recovery
        // wire field is needed: this reuses the device-local observation journal.
        const targetMature = target.length > 0 && observedGcPass > 0 && target.every(entry => {
          const firstSeenPass = Math.max(0, Math.trunc(Number(observedRoots[entry.key]) || 0));
          return firstSeenPass > 0 && observedGcPass - firstSeenPass >= settings.orphanMinGcPasses;
        });
        if (targetMature && currentFallbacks.length > 0) rootKeys = target.map(entry => entry.key);
      }
    }

    return Object.freeze({
      mode: ["superseded", "generation", "device"].includes(mode) ? mode : "",
      rootKey: String(rootKey || ""),
      deviceId: String(deviceId || ""),
      currentDeviceId: String(currentDeviceId || ""),
      rootSeenPass: Object.freeze({ ...observedRoots }),
      gcPass: observedGcPass,
      rootKeys: [...new Set(rootKeys)]
    });
  }

  function confirmedManualRecoveryCleanupKeys(latest, latestSnapshots, plan) {
    const values = latest && typeof latest === "object" ? latest : {};
    const requested = new Set(Array.isArray(plan?.rootKeys) ? plan.rootKeys : []);
    if (!requested.size) return [];
    const refreshed = planManualRecoveryCleanup(values, latestSnapshots, {
      mode: plan?.mode,
      rootKey: plan?.rootKey,
      deviceId: plan?.deviceId,
      currentDeviceId: plan?.currentDeviceId,
      rootSeenPass: plan?.rootSeenPass || {},
      gcPass: Number(plan?.gcPass) || 0
    });
    const stillEligible = new Set(refreshed.rootKeys);
    const rootKeys = [...requested].filter(rootKey => stillEligible.has(rootKey));
    return [...new Set(rootKeys.flatMap(rootKey => deviceSnapshotKeysForRoot(values, rootKey)))];
  }

  function confirmedDeviceSnapshotGarbageCollectionKeys(latest, latestSnapshots, observation) {
    const values = latest && typeof latest === "object" ? latest : {};
    const snapshots = Array.isArray(latestSnapshots) ? latestSnapshots : [];
    const latestReadableRootKeys = new Set(snapshots.map(snapshot => snapshot?.rootKey).filter(Boolean));
    const stillStale = staleVerifiedRootKeys(values, snapshots, {
      deviceId: observation?.deviceId,
      rootSeenPass: observation?.rootSeenPass || {},
      gcPass: Number(observation?.gcPass) || 0
    });
    const keys = [];
    for (const rootKey of observation?.staleRootKeys || []) {
      if (stillStale.has(rootKey)) keys.push(...deviceSnapshotKeysForRoot(values, rootKey));
    }
    for (const rootKey of observation?.eligibleOrphanRoots || []) {
      if (latestReadableRootKeys.has(rootKey)) continue;
      if (Object.prototype.hasOwnProperty.call(values, rootKey)) {
        const descriptor = deviceRootDescriptor(rootKey, values[rootKey]);
        if (!descriptor || !currentDeviceSnapshotRootHeader(values[rootKey])) continue;
      }
      keys.push(...deviceSnapshotKeysForRoot(values, rootKey));
    }
    return [...new Set(keys)];
  }

  return Object.freeze({
    confirmedDeviceSnapshotEmergencyQuotaReclaimKeys,
    confirmedDeviceSnapshotGarbageCollectionKeys,
    confirmedManualRecoveryCleanupKeys,
    confirmedSupersededDeviceSnapshotKeys,
    currentDeviceSnapshotRootHeader,
    planDeviceSnapshotEmergencyQuotaReclaim,
    planDeviceSnapshotGarbageCollection,
    planDeviceSnapshotPublicationCapacity,
    planManualRecoveryCleanup,
    supersededDeviceSnapshotRootKeys,
    syncItemsFitInSnapshot,
    verifiedProfileDeviceSnapshotDescriptors
  });
}
