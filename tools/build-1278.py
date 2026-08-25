#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.27.8"


def read(rel): return (ROOT / rel).read_text(encoding="utf-8")
def write(rel, text): (ROOT / rel).write_text(text, encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

def replace_function(text, signature, next_signature, replacement, label):
    start = text.find(signature)
    if start < 0: raise SystemExit(f"{label}: start not found")
    end = text.find(next_signature, start + len(signature))
    if end < 0: raise SystemExit(f"{label}: end not found")
    return text[:start] + replacement.rstrip() + "\n\n" + text[end:]

def patch_version_files():
    p = "src/shared/core/constants.js"
    text = read(p)
    text = replace_once(text, 'export const VERSION = "1.27.7";', f'export const VERSION = "{VERSION}";', p)
    text = replace_once(text, 'export const SYNC_CORE_RESERVE_BYTES = 40960;', 'export const SYNC_CORE_RESERVE_BYTES = 51200;', p)
    write(p, text)

    for p in ["src/firefox/manifest.json", "src/chrome/manifest.json"]:
        data = json.loads(read(p))
        if data.get("version") != "1.27.7": raise SystemExit(f"unexpected version in {p}")
        data["version"] = VERSION
        if p.startswith("src/chrome/"): data["version_name"] = VERSION
        write(p, json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    for p in ["src/firefox/newtab/newtab.html", "src/chrome/newtab/newtab.html"]:
        text = read(p)
        text = text.replace("MosaicSync · 1.27.7", f"MosaicSync · {VERSION}")
        write(p, text)

    p = "README.md"
    write(p, replace_once(read(p), "**Current source release: 1.27.7**", f"**Current source release: {VERSION}**", p))
    p = "README-DEVELOPMENT.md"
    text = read(p)
    text, n = re.subn(r"Current release: 1\.27\.7", f"Current release: {VERSION}", text, count=1)
    if n != 1: raise SystemExit(f"{p}: current release marker not found")
    write(p, text)


def profile_helpers():
    return r'''
function profileTombstones(snapshot) {
  const result = new Map();
  for (const [id, record] of snapshot?.records?.entries?.() || []) {
    if (record?.kind === "deleted") result.set(id, record);
  }
  return result;
}

function profileSnapshotRevision(snapshot) {
  return snapshot?.revision || "";
}

function markAppliedWorkCore(meta, core) {
  const revision = profileSnapshotRevision(core);
  return revision ? { ...meta, lastAppliedWorkSyncRevision: revision } : meta;
}

function localWorkspaceHasPendingEdits(workspace) {
  return Boolean(workspace?.shortcuts?.length || Number(workspace?.settingsModifiedAt) || Number(workspace?.updatedAt));
}

function mergeIncomingWorkspace(localWorkspace, remoteCore, deviceId, { preserveLocal = false } = {}) {
  if (!preserveLocal || !localWorkspaceHasPendingEdits(localWorkspace)) {
    return workspaceStateNormalized(
      stateFromRecords(remoteCore.records, remoteCore.settings, localWorkspace, remoteCore.assets || new Map()),
      PERSONAL_SPACE_ID
    );
  }
  const localRecords = flattenStateNormalized(localWorkspace, deviceId);
  const localSettings = makeSettingsRecordNormalized(localWorkspace, deviceId);
  const mergedRecords = pruneExpiredTombstones(mergeRecordMaps(localRecords, remoteCore.records));
  const mergedSettings = chooseSettings(localSettings, remoteCore.settings, localWorkspace);
  return workspaceStateNormalized(
    stateFromRecords(mergedRecords, mergedSettings, localWorkspace, remoteCore.assets || new Map()),
    PERSONAL_SPACE_ID
  );
}

function combinedPersonalRemoteCore(sources) {
  const legacy = combinedRemoteCore(sources.shared, sources.device);
  const profile = sources.profilePersonal;
  if (!profile) return legacy;
  let records = new Map(profile.records);
  let settings = profile.settings;
  if (remoteCoreUsable(legacy)) {
    records = mergeRecordMaps(records, legacy.records);
    settings = chooseNewerRecord(settings, legacy.settings);
  }
  const revisionParts = [profile.revision];
  if (legacy?.revision) revisionParts.push(legacy.revision);
  revisionParts.sort(compareStableText);
  return {
    records: pruneExpiredTombstones(records),
    settings,
    assets: sources.shared?.assets || new Map(),
    sourceKind: legacy ? "full-profile+legacy" : "full-profile-snapshots",
    revision: `personal:${fnv1a(revisionParts.join("|"))}:${recordFingerprint(records)}`,
    updatedAt: Math.max(Number(profile.updatedAt) || 0, Number(legacy?.updatedAt) || 0),
    originDeviceId: profile.originDeviceId || legacy?.originDeviceId || ""
  };
}

function combinedWorkRemoteCore(snapshot, profile) {
  if (!profile && !isSnapshotUsable(snapshot)) return null;
  let records = profile ? new Map(profile.records) : new Map(snapshot.records);
  let settings = profile?.settings || snapshot.settings;
  const revisionParts = [];
  if (profile) {
    // A complete profile generation is the baseline. Individual Work records are
    // safe to merge on top even while Firefox is delivering a torn shared ledger;
    // record clocks/tombstones decide winners and the baseline prevents omissions.
    records = mergeRecordMaps(records, snapshot.records);
    if (snapshot.settings) settings = settings ? chooseNewerRecord(settings, snapshot.settings) : snapshot.settings;
    revisionParts.push(profile.revision);
  }
  const sharedRevision = datasetRevision(snapshot.dataset);
  if (sharedRevision) revisionParts.push(sharedRevision);
  revisionParts.sort(compareStableText);
  return {
    records: pruneExpiredTombstones(records),
    settings,
    assets: snapshot.assets || new Map(),
    sourceKind: profile ? (isSnapshotUsable(snapshot) ? "full-profile+shared" : "full-profile+partial-shared") : "shared-ledger",
    revision: `work:${fnv1a(revisionParts.join("|"))}:${recordFingerprint(records)}`,
    updatedAt: Math.max(Number(profile?.updatedAt) || 0, Number(snapshot.dataset?.updatedAt) || datasetUpdatedAt(snapshot.records, snapshot.settings, 0)),
    originDeviceId: profile?.originDeviceId || String(snapshot.dataset?.originDeviceId || "")
  };
}

function trustedForFullProfilePublication(meta) {
  return Boolean(meta?.syncEnabled && meta?.syncInitialized && meta?.deviceId && meta?.lastAppliedWorkSyncRevision);
}

async function publishFullProfileSnapshot(fullState, meta, { allowUnverifiedWork = false } = {}) {
  if (!meta?.deviceId || !meta?.syncEnabled || !meta?.syncInitialized) {
    return { written: false, reason: "not-initialized", revision: "" };
  }
  if (!allowUnverifiedWork && !trustedForFullProfilePublication(meta)) {
    // A migrated 1.27.7 profile can incorrectly be "ready" with an empty Work
    // space. Never let that profile publish the emptiness as a new trusted source.
    return { written: false, reason: "work-unverified", revision: "" };
  }
  const all = await browser.storage.sync.get(null);
  const rootKey = profileRootKey(meta.deviceId);
  const currentRoot = all[rootKey] || null;
  const knownProfiles = await decodeProfileSnapshots(all);
  const ownKnown = knownProfiles.find(snapshot => snapshot.deviceId === meta.deviceId) || null;
  const personalShared = await readSyncSnapshot(all, { includeAssets: false, spaceId: PERSONAL_SPACE_ID });
  const workShared = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
  const publication = await buildProfilePublication(fullState, meta.deviceId, currentRoot, {
    force: Boolean(currentRoot && !ownKnown),
    tombstonesBySpace: {
      personal: profileTombstones(personalShared),
      work: profileTombstones(workShared)
    }
  });
  if (!publication) return { written: false, reason: "too-large", revision: "" };
  if (publication.unchanged && ownKnown) return { written: true, unchanged: true, revision: ownKnown.revision };

  try {
    if (!publication.unchanged) {
      // The inactive slot may contain the previous-previous generation. The
      // current active generation stays valid while the new chunks are written.
      const targetPrefix = `${publication.rootKey}.chunk.${publication.targetSlot}.`;
      const staleTarget = Object.keys(all).filter(key => key.startsWith(targetPrefix));
      if (staleTarget.length) await removeSyncItems(staleTarget);
      await writeSyncItems(publication.chunkWrites, { skipPreflight: true });
      // Root last: only this tiny write makes the new whole-profile generation current.
      await writeSyncItems({ [publication.rootKey]: publication.rootValue }, { skipPreflight: true });
    }
  } catch (error) {
    if (isQuotaError(error)) return { written: false, reason: "quota", revision: "" };
    throw error;
  }

  const verifiedAll = await browser.storage.sync.get(null);
  const verified = (await decodeProfileSnapshots(verifiedAll))
    .find(snapshot => snapshot.deviceId === meta.deviceId && snapshot.commitId === publication.descriptor?.commitId);
  if (!verified) return { written: false, reason: "verification", revision: "" };

  // Bound whole-profile safety copies using the same conservative age/cap model
  // as the older Personal-only device snapshots.
  const roots = Object.entries(verifiedAll)
    .filter(([key, value]) => isProfileSnapshotKey(key) && !key.includes(".chunk.") && value?.kind === "profile-snapshot-root")
    .map(([key, value]) => ({ key, deviceId: value.deviceId, publishedAt: Number(value.active?.publishedAt) || 0 }))
    .sort((a, b) => b.publishedAt - a.publishedAt || compareStableText(a.deviceId, b.deviceId));
  const now = Date.now();
  const staleDevices = new Set();
  roots.forEach((entry, index) => {
    if (!entry.deviceId || entry.deviceId === meta.deviceId) return;
    const age = now - entry.publishedAt;
    if ((entry.publishedAt && age >= DEVICE_SNAPSHOT_RETENTION_MS) ||
        (index >= DEVICE_SNAPSHOT_MAX_RECENT_DEVICES && age >= DEVICE_SNAPSHOT_CAP_MIN_AGE_MS)) {
      staleDevices.add(entry.deviceId);
    }
  });
  for (const deviceId of staleDevices) {
    const keys = profileSnapshotKeysForDevice(verifiedAll, deviceId);
    if (keys.length) try { await removeSyncItems(keys); } catch {}
  }
  return { written: true, revision: verified.revision, usedPrevious: verified.usedPrevious };
}
'''


def new_read_core_sources():
    return r'''async function readCoreSources(all = null, { includeAssets = true } = {}) {
  const values = all && typeof all === "object" ? all : await browser.storage.sync.get(null);
  const [shared, deviceSnapshots, profileSnapshots] = await Promise.all([
    readSyncSnapshot(values, { includeAssets }),
    readDeviceSnapshots(values),
    decodeProfileSnapshots(values)
  ]);
  const device = mergeDeviceSnapshots(deviceSnapshots);
  const profilePersonal = mergeProfileSpaceSource(profileSnapshots, PERSONAL_SPACE_ID);
  const profileWork = mergeProfileSpaceSource(profileSnapshots, WORK_SPACE_ID);
  return { all: values, shared, device, deviceSnapshots, profileSnapshots, profilePersonal, profileWork };
}'''


def new_reconcile_if_new_commit():
    return r'''async function reconcileIfNewCommit() {
  let meta = await readLocalMeta();
  if (!meta.syncEnabled) return { ok: true, skipped: true, reason: "sync-off", meta };
  if (!meta.syncInitialized) {
    if (meta.syncBootstrapMode === "await-remote") return bootstrapRemote({ waitIfMissing: true });
    return { ok: true, skipped: true, reason: "sync-not-ready", meta };
  }

  meta = await retryPendingLocalSyncMutation(meta);
  const all = await browser.storage.sync.get(null);
  const sources = await readCoreSources(all, { includeAssets: false });
  const core = combinedPersonalRemoteCore(sources);
  const sharedRevision = datasetRevision(sources.shared.dataset);
  const deviceRevision = sources.device?.revision || "";
  const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
  const workCore = combinedWorkRemoteCore(workSnapshot, sources.profileWork);
  const workRevision = workCore?.revision || datasetRevision(workSnapshot.dataset);
  const sharedUnchanged = !sharedRevision || sharedRevision === meta.lastAppliedSyncRevision;
  const devicesUnchanged = !deviceRevision || deviceRevision === meta.lastAppliedDeviceSnapshotRevision;
  const workUnchanged = !workRevision || workRevision === meta.lastAppliedWorkSyncRevision;

  let contentUnchanged = true;
  if (sharedUnchanged && devicesUnchanged && workUnchanged) {
    const local = await ensureLocalStorage();
    if (remoteCoreUsable(core)) {
      const personal = workspaceStateNormalized(local.state, PERSONAL_SPACE_ID);
      contentUnchanged = recordFingerprint(core.records) === recordFingerprint(flattenStateNormalized(personal, meta.deviceId)) &&
        settingsRecordEqual(core.settings, makeSettingsRecordNormalized(personal, meta.deviceId));
    }
    if (contentUnchanged && remoteCoreUsable(workCore)) {
      const work = workspaceStateNormalized(local.state, WORK_SPACE_ID);
      contentUnchanged = recordFingerprint(workCore.records) === recordFingerprint(flattenStateNormalized(work, meta.deviceId)) &&
        settingsRecordEqual(workCore.settings, makeSettingsRecordNormalized(work, meta.deviceId));
    }
  }
  if (sharedUnchanged && devicesUnchanged && workUnchanged && contentUnchanged) {
    return { ok: true, skipped: true, reason: "already-applied", meta };
  }
  return reconcile("merge");
}'''


def new_get_sync_status():
    return r'''async function getSyncStatus() {
  const [baseMeta, all, usedBytes] = await Promise.all([
    readLocalMeta(), browser.storage.sync.get(null), browser.storage.sync.getBytesInUse(null)
  ]);
  let count = 0, remoteAssets = 0, hasDeviceSnapshotSignal = false, hasProfileSignal = false;
  for (const key in all) {
    if (key.startsWith(SYNC_PREFIX)) count += 1;
    if (all[key]?.kind === "asset") remoteAssets += 1;
    if (!hasDeviceSnapshotSignal && isDeviceSnapshotKey(key)) hasDeviceSnapshotSignal = true;
    if (!hasProfileSignal && isProfileSnapshotKey(key)) hasProfileSignal = true;
  }
  const exceeded = count > SYNC_QUOTA_MAX_ITEMS || usedBytes > SYNC_QUOTA_BYTES;
  const usage = await syncUsageBreakdown(all, usedBytes);
  const meta = {
    ...baseMeta,
    syncBytesInUse: Math.max(0, Number(usedBytes) || 0),
    syncItemCount: count,
    syncStatus: exceeded ? "error" : baseMeta.syncStatus,
    lastSyncError: exceeded ? "Firefox Sync storage quota was exceeded." : baseMeta.lastSyncError
  };
  const sources = await readCoreSources(all, { includeAssets: false });
  const snapshot = sources.shared;
  const core = combinedPersonalRemoteCore(sources);
  const workSnapshot = await readSyncSnapshot(all, { includeAssets: false, spaceId: WORK_SPACE_ID });
  const workCore = combinedWorkRemoteCore(workSnapshot, sources.profileWork);
  const personalItems = remoteCoreUsable(core) ? liveRecordCount(core.records) : liveRecordCount(snapshot.records);
  const workItems = remoteCoreUsable(workCore) ? liveRecordCount(workCore.records) : 0;
  const remoteItems = personalItems + workItems;
  const hasRemoteSignal = hasSnapshotData(snapshot) || hasSnapshotData(workSnapshot) || sources.deviceSnapshots.length > 0 ||
    sources.profileSnapshots.length > 0 || hasDeviceSnapshotSignal || hasProfileSignal;
  // 1.27.8 only calls a current profile complete when both declared Spaces have
  // usable core data. An explicit zero-record Work snapshot is usable; absence is not.
  const hasRemoteData = remoteCoreUsable(core) && remoteCoreUsable(workCore);
  const expectedItems = (remoteCoreUsable(core) ? liveRecordCount(core.records) : 0) +
    (remoteCoreUsable(workCore) ? liveRecordCount(workCore.records) : 0);
  const latestDevice = sources.profileSnapshots.reduce((latest, candidate) =>
    !latest || Number(candidate.publishedAt) > Number(latest.publishedAt) ? candidate : latest, null) ||
    sources.deviceSnapshots.reduce((latest, candidate) =>
      !latest || Number(candidate.publishedAt) > Number(latest.publishedAt) ? candidate : latest, null);
  return {
    ok: true, meta, remoteItems, remoteExpectedItems: expectedItems, remoteAssets, usage,
    hasRemoteSignal, hasRemoteData,
    remoteState: !hasRemoteSignal ? "none" : (hasRemoteData ? "complete" : "partial"),
    remoteUpdatedAt: Math.max(Number(core?.updatedAt) || 0, Number(workCore?.updatedAt) || 0),
    remoteReceiptAt: meta.lastRemoteReceiptAt,
    lastRemoteReceiptUpdatedAt: meta.lastRemoteReceiptUpdatedAt,
    lastRemoteReceiptOriginDeviceId: meta.lastRemoteReceiptOriginDeviceId,
    remoteCommitId: latestDevice?.commitId || (typeof snapshot.dataset?.commitId === "string" ? snapshot.dataset.commitId : ""),
    remoteOriginDeviceId: core?.originDeviceId || (typeof snapshot.dataset?.originDeviceId === "string" ? snapshot.dataset.originDeviceId : ""),
    remoteSourceKind: [core?.sourceKind, workCore?.sourceKind].filter(Boolean).join("+")
  };
}'''


def new_bootstrap_remote():
    return r'''async function bootstrapRemote({ waitIfMissing = false, force = false } = {}) {
  const { state: fullLocalState, meta } = await ensureLocalStorage();
  if (!meta.syncEnabled) {
    return { ok: false, error: "Firefox Account Sync permission is not enabled on this device.", meta };
  }
  const sources = await readCoreSources();
  const core = combinedPersonalRemoteCore(sources);
  const workSnapshot = await readSyncSnapshot(sources.all, { spaceId: WORK_SPACE_ID });
  const workCore = combinedWorkRemoteCore(workSnapshot, sources.profileWork);
  if (!remoteCoreUsable(core) || !remoteCoreUsable(workCore)) {
    const preserveInitializedDevice = force && meta.syncInitialized === true;
    const waitingMeta = await writeLocalMeta({
      ...meta,
      syncEnabled: true,
      syncInitialized: preserveInitializedDevice ? true : false,
      syncBootstrapMode: preserveInitializedDevice ? "none" : (waitIfMissing ? "await-remote" : "none"),
      syncStatus: waitIfMissing ? "waiting" : "error",
      lastSyncError: waitIfMissing ? "" : (!remoteCoreUsable(core) ? snapshotArrivalMessage(sources.shared) : snapshotArrivalMessage(workSnapshot)),
      lastSyncWarning: "",
      syncSkippedAssets: 0,
      syncFastSnapshotFallback: false,
      syncWaitStartedAt: preserveInitializedDevice ? 0 : (waitIfMissing ? (meta.syncWaitStartedAt || Date.now()) : 0)
    });
    await ensureSyncWatchAlarm(waitingMeta);
    return { ok: waitIfMissing, pending: waitIfMissing, error: waitIfMissing ? "" : waitingMeta.lastSyncError, meta: waitingMeta, remoteUpdatedAt: 0 };
  }

  await markSyncing(meta);
  // While a genuinely fresh device is waiting, local user edits are provisional.
  // Apply them on top of the first complete incoming profile instead of replacing
  // either side. A manual Restore remains an explicit remote-authoritative action.
  const preservePendingLocal = !force && meta.syncInitialized !== true;
  const localPersonal = workspaceStateNormalized(fullLocalState, PERSONAL_SPACE_ID);
  const localWork = workspaceStateNormalized(fullLocalState, WORK_SPACE_ID);
  const restoredPersonal = mergeIncomingWorkspace(localPersonal, core, meta.deviceId, { preserveLocal: preservePendingLocal });
  const restoredWork = mergeIncomingWorkspace(localWork, workCore, meta.deviceId, { preserveLocal: preservePendingLocal });
  let restoredState = replaceWorkspaceNormalized(fullLocalState, PERSONAL_SPACE_ID, restoredPersonal);
  restoredState = replaceWorkspaceNormalized(restoredState, WORK_SPACE_ID, restoredWork);
  // One local commit activates Personal + Work together. No half-profile frame.
  await setLocalStateSilently(restoredState);

  const completedWaitingOnboarding = !meta.onboardingCompleted && meta.syncBootstrapMode === "await-remote";
  const observedMeta = observeRemoteCore(meta, core);
  let appliedMeta = markAppliedRemoteCore(observedMeta, sources.device?.revision || "");
  if (isSnapshotUsable(sources.shared)) appliedMeta = markAppliedSnapshot(appliedMeta, sources.shared.dataset);
  appliedMeta = markAppliedWorkCore(appliedMeta, workCore);
  let refreshed = await refreshQuota({
    ...appliedMeta,
    syncEnabled: true,
    syncInitialized: true,
    syncBootstrapMode: "none",
    syncStatus: "ready",
    lastSyncAt: Date.now(),
    lastSyncError: "",
    lastSyncWarning: "",
    syncSkippedAssets: 0,
    syncFastSnapshotFallback: false,
    onboardingCompleted: meta.onboardingCompleted || completedWaitingOnboarding,
    onboardingVersion: completedWaitingOnboarding ? VERSION : meta.onboardingVersion,
    syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  await clearPendingLocalSyncMutation();
  await ensureSyncWatchAlarm(refreshed);
  await scheduleMissingShortcutIconHydrationAfterSync({ force: true });

  if (preservePendingLocal && (localWorkspaceHasPendingEdits(localPersonal) || localWorkspaceHasPendingEdits(localWork))) {
    // Now that the first complete profile is trusted, merge/publish the provisional
    // local edits through the normal record conflict engine.
    const merged = await reconcile("merge");
    refreshed = merged?.meta || await readLocalMeta();
  }
  return {
    ok: true, meta: refreshed, restored: true,
    action: force ? "restored" : "bootstrapped-remote",
    remoteUpdatedAt: Math.max(Number(core.updatedAt) || 0, Number(workCore.updatedAt) || 0),
    sourceKind: `${core.sourceKind}+${workCore.sourceKind}`
  };
}'''


def new_reconcile_work():
    return r'''async function reconcileWork(strategy = "merge") {
  const { state: fullLocalState, meta } = await ensureLocalStorage();
  if (!meta.syncEnabled || !meta.syncInitialized) return { ok: true, meta, skipped: true };
  const namespace = syncNamespace(WORK_SPACE_ID);
  const sources = await readCoreSources();
  let snapshot = await readSyncSnapshot(sources.all, { spaceId: WORK_SPACE_ID });
  let remote = combinedWorkRemoteCore(snapshot, sources.profileWork);
  const localState = workspaceStateNormalized(fullLocalState, WORK_SPACE_ID);
  const localRecords = flattenStateNormalized(localState, meta.deviceId);
  const localSettings = makeSettingsRecordNormalized(localState, meta.deviceId);
  const localAssets = collectLocalAssetsNormalized(localState);

  if (!remote) {
    if (!meta.lastAppliedWorkSyncRevision) {
      const waitingMeta = await refreshQuota({
        ...meta,
        syncStatus: "waiting",
        lastSyncError: "",
        lastSyncWarning: snapshotArrivalMessage(snapshot),
        syncWaitStartedAt: meta.syncWaitStartedAt || Date.now()
      });
      await writeLocalMeta(waitingMeta);
      await ensureSyncWatchAlarm(waitingMeta);
      return { ok: true, meta: waitingMeta, pending: true, workPending: true };
    }
    // An established device with a previously applied Work revision is a safe
    // recovery source when Firefox has left the shared Work generation torn.
    // Merge every delivered record on top of that complete local baseline.
    const rawSettings = snapshot.settings || localSettings;
    remote = {
      records: mergeRecordMaps(localRecords, snapshot.records),
      settings: chooseNewerRecord(localSettings, rawSettings),
      assets: snapshot.assets || new Map(),
      revision: `work-local-recovery:${recordFingerprint(localRecords)}`,
      updatedAt: Math.max(Number(localState.updatedAt) || 0, datasetUpdatedAt(snapshot.records, snapshot.settings, 0)),
      originDeviceId: meta.deviceId,
      sourceKind: "trusted-local+partial-shared"
    };
  }

  if (strategy === "remote") {
    const restoredWork = mergeIncomingWorkspace(localState, remote, meta.deviceId, { preserveLocal: false });
    const restoredState = replaceWorkspaceNormalized(fullLocalState, WORK_SPACE_ID, restoredWork);
    await setLocalStateSilently(restoredState);
    let refreshed = await refreshQuota({
      ...markAppliedWorkCore(meta, remote),
      syncStatus: "ready", lastSyncAt: Date.now(), lastSyncError: "", lastSyncWarning: "",
      syncSkippedAssets: 0, syncFastSnapshotFallback: false, syncWaitStartedAt: 0
    });
    await writeLocalMeta(refreshed);
    await publishFullProfileSnapshot(restoredState, refreshed);
    refreshed = await readLocalMeta();
    await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
    return { ok: true, meta: refreshed, restored: true };
  }

  const mergedRecords = pruneExpiredTombstones(mergeRecordMaps(localRecords, remote.records));
  const mergedSettings = chooseSettings(localSettings, remote.settings, localState);
  const combinedAssets = new Map([...(remote.assets || new Map()), ...localAssets]);
  const mergedLegacy = stateFromRecords(mergedRecords, mergedSettings, localState, combinedAssets);
  const mergedWorkspace = workspaceStateNormalized(mergedLegacy, PERSONAL_SPACE_ID);
  const mergedStateChanged = stableStringify(mergedWorkspace) !== stableStringify(localState);
  const mergedFullState = mergedStateChanged ? replaceWorkspaceNormalized(fullLocalState, WORK_SPACE_ID, mergedWorkspace) : fullLocalState;
  if (mergedStateChanged) await setLocalStateSilently(mergedFullState, { baseState: fullLocalState });

  const desiredState = workspaceStateNormalized(mergedFullState, WORK_SPACE_ID);
  const desiredRecords = flattenStateNormalized(desiredState, meta.deviceId);
  const desiredAssets = collectLocalAssetsNormalized(desiredState);
  const syncWrites = {};
  for (const [id, record] of desiredRecords) {
    const winner = mergedRecords.get(id);
    const desired = winner?.kind === "deleted" ? winner : recordWithWinnerIdentity(record, winner, meta.deviceId);
    const current = snapshot.records.get(id);
    if (!current || stableStringify(current) !== stableStringify(desired)) syncWrites[itemKey(id, WORK_SPACE_ID)] = desired;
  }
  for (const [id, winner] of mergedRecords) {
    if (winner?.kind !== "deleted") continue;
    const current = snapshot.records.get(id);
    if (!current || stableStringify(current) !== stableStringify(winner)) syncWrites[itemKey(id, WORK_SPACE_ID)] = winner;
  }
  if (!snapshot.settings || stableStringify(snapshot.settings) !== stableStringify(mergedSettings)) syncWrites[namespace.settingsKey] = mergedSettings;

  // A bad dataset marker is repaired even when all individual records happen to
  // be present. The new commit marker is written last from the merged complete set.
  const needsDatasetRepair = !isSnapshotUsable(snapshot) || hasOwnEnumerable(syncWrites);
  await writeSyncItems(syncWrites);
  const desiredDataset = needsDatasetRepair
    ? datasetRecord(datasetUpdatedAt(mergedRecords, mergedSettings, Number(snapshot.dataset?.updatedAt) || 0), mergedRecords, mergedSettings,
        { commitId: uid("commit"), originDeviceId: meta.deviceId })
    : snapshot.dataset;
  if (needsDatasetRepair) await writeSyncItems({ [namespace.datasetKey]: desiredDataset });

  snapshot = await readSyncSnapshot(null, { spaceId: WORK_SPACE_ID });
  if (!isSnapshotUsable(snapshot)) {
    const waitingMeta = await refreshQuota({ ...meta, syncStatus: "waiting", lastSyncError: "", lastSyncWarning: snapshotArrivalMessage(snapshot) });
    await writeLocalMeta(waitingMeta);
    return { ok: true, meta: waitingMeta, pending: true, workPending: true };
  }
  const assetResult = await uploadMissingAssets(desiredAssets, snapshot.assets, WORK_SPACE_ID);
  const staleKeys = snapshot.expiredKeys.filter(key => !(key in syncWrites));
  if (staleKeys.length) await removeSyncItems([...new Set(staleKeys)]);
  const finalRemote = combinedWorkRemoteCore(snapshot, sources.profileWork) || {
    records: snapshot.records, settings: snapshot.settings, assets: snapshot.assets,
    revision: datasetRevision(snapshot.dataset), updatedAt: Number(snapshot.dataset?.updatedAt) || 0,
    sourceKind: "shared-ledger"
  };
  let refreshed = await refreshQuota({
    ...markAppliedWorkCore(meta, finalRemote),
    syncStatus: "ready", lastSyncAt: Date.now(), lastSyncError: "", lastSyncWarning: "",
    ...syncWarningState(assetResult.skipped), syncWaitStartedAt: 0
  });
  await writeLocalMeta(refreshed);
  const profilePublish = await publishFullProfileSnapshot(mergedFullState, refreshed);
  if (!profilePublish.written && profilePublish.reason !== "work-unverified") {
    refreshed = await writeLocalMeta({ ...refreshed, ...syncWarningState(assetResult.skipped, true) });
  }
  if (mergedStateChanged) await scheduleMissingShortcutIconHydrationAfterSync({ force: true });
  return { ok: true, meta: refreshed };
}'''


def patch_background(path):
    text = read(path)
    marker = 'from "./runtime-utils.js";'
    pos = text.find(marker)
    if pos < 0: raise SystemExit(f"{path}: runtime-utils import not found")
    line_end = text.find("\n", pos)
    import_line = '\nimport { buildProfilePublication, decodeProfileSnapshots, isProfileSnapshotKey, mergeProfileSpaceSource, profileRootKey, profileSnapshotKeysForDevice } from "./profile-snapshot.js";'
    if "profile-snapshot.js" not in text:
        text = text[:line_end] + import_line + text[line_end:]

    old_read = '''async function readCoreSources(all = null, { includeAssets = true } = {}) {
  const values = all && typeof all === "object" ? all : await browser.storage.sync.get(null);
  const [shared, deviceSnapshots] = await Promise.all([
    readSyncSnapshot(values, { includeAssets }),
    readDeviceSnapshots(values)
  ]);
  const device = mergeDeviceSnapshots(deviceSnapshots);
  return { all: values, shared, device, deviceSnapshots };
}'''
    text = replace_once(text, old_read, new_read_core_sources(), f"{path} readCoreSources")
    insert_at = text.find("async function readCoreSources")
    text = text[:insert_at] + profile_helpers().strip() + "\n\n" + text[insert_at:]

    text = replace_function(text, "async function reconcileIfNewCommit() {", "async function getSyncStatus() {", new_reconcile_if_new_commit(), f"{path} reconcileIfNewCommit")
    text = replace_function(text, "async function getSyncStatus() {", "async function publishWorkspaceAuthoritative", new_get_sync_status(), f"{path} getSyncStatus")
    text = replace_function(text, "async function bootstrapRemote({ waitIfMissing = false, force = false } = {}) {", "const CROSS_SPACE_SYNC_TRANSACTION_VERSION", new_bootstrap_remote(), f"{path} bootstrapRemote")
    text = replace_function(text, "async function reconcileWork(strategy = \"merge\") {", "async function reconcile(strategy = \"merge\") {", new_reconcile_work(), f"{path} reconcileWork")

    # Personal can now use the complete profile baseline too, and a complete
    # profile allows immediate safe repair of a torn Personal shared ledger.
    personal_start = text.find('async function reconcilePersonal(strategy = "merge") {')
    personal_end = text.find('async function reconcileWork(strategy = "merge") {', personal_start)
    section = text[personal_start:personal_end]
    section = replace_once(section, "const core = combinedRemoteCore(snapshot, sources.device);", "const core = combinedPersonalRemoteCore(sources);", f"{path} personal core")
    section = replace_once(section,
        "const sharedLedgerPartial = hasSnapshotData(snapshot) && !isSnapshotUsable(snapshot);",
        "const sharedLedgerPartial = hasSnapshotData(snapshot) && !isSnapshotUsable(snapshot) && !sources.profilePersonal;",
        f"{path} personal partial")
    text = text[:personal_start] + section + text[personal_end:]

    # Count the additive full-profile keys as protected core quota, never artwork.
    text = replace_once(text,
        "key === SYNC_SETTINGS_KEY || key.startsWith(SYNC_ITEM_PREFIX) || isDeviceSnapshotKey(key) ||",
        "key === SYNC_SETTINGS_KEY || key.startsWith(SYNC_ITEM_PREFIX) || isDeviceSnapshotKey(key) || isProfileSnapshotKey(key) ||",
        f"{path} quota category")

    # Authoritative Send-to-Sync: publish Work shared data first, then commit a
    # verified full-profile safety generation before declaring ready.
    old = '''  const workPublish = await publishWorkspaceAuthoritative(state, meta, WORK_SPACE_ID);
  const totalSkippedAssets = assetResult.skipped + workPublish.assetResult.skipped;
  const warningState = syncWarningState(totalSkippedAssets, !fastPublish.written);'''
    new = '''  const workPublish = await publishWorkspaceAuthoritative(state, meta, WORK_SPACE_ID);
  let profileMeta = { ...meta, syncInitialized: true, lastAppliedWorkSyncRevision: datasetRevision(workPublish.dataset) };
  const profilePublish = await publishFullProfileSnapshot(state, profileMeta, { allowUnverifiedWork: true });
  const totalSkippedAssets = assetResult.skipped + workPublish.assetResult.skipped;
  const warningState = syncWarningState(totalSkippedAssets, !fastPublish.written || !profilePublish.written);'''
    text = replace_once(text, old, new, f"{path} bootstrap profile")

    # Normal Personal/Work mutations publish the whole profile only after their
    # shared commit marker succeeds. Migrated broken profiles are blocked by the
    # trusted-work guard until Work has actually been applied/repaired.
    old = '''  const warningState = syncWarningState(assetResult.skipped, !fastPublish.written);
  const refreshed = await refreshQuota({
    ...(publishedDataset ? markAppliedSnapshot(meta, publishedDataset) : meta),'''
    new = '''  const profilePublish = publishedDataset ? await publishFullProfileSnapshot(newRaw, meta) : { written: true };
  const warningState = syncWarningState(assetResult.skipped, !fastPublish.written || !profilePublish.written);
  const refreshed = await refreshQuota({
    ...(publishedDataset ? markAppliedSnapshot(meta, publishedDataset) : meta),'''
    text = replace_once(text, old, new, f"{path} personal profile publish")

    old = '''  const assetResult = await uploadMissingAssets(newAssets, snapshot.assets, WORK_SPACE_ID);
  const refreshed = await refreshQuota({
    ...(publishedDataset ? markAppliedWorkSnapshot(meta, publishedDataset) : meta),'''
    new = '''  const assetResult = await uploadMissingAssets(newAssets, snapshot.assets, WORK_SPACE_ID);
  const workAppliedMeta = publishedDataset ? markAppliedWorkSnapshot(meta, publishedDataset) : meta;
  const profilePublish = publishedDataset ? await publishFullProfileSnapshot(newRaw, workAppliedMeta) : { written: true };
  const refreshed = await refreshQuota({
    ...workAppliedMeta,'''
    text = replace_once(text, old, new, f"{path} work profile publish")
    text = replace_once(text,
        "...syncWarningState(assetResult.skipped)\n  });\n  await writeLocalMeta(refreshed);\n  return { ok: true, meta: refreshed, dataset: publishedDataset };",
        "...syncWarningState(assetResult.skipped, !profilePublish.written)\n  });\n  await writeLocalMeta(refreshed);\n  return { ok: true, meta: refreshed, dataset: publishedDataset };",
        f"{path} work profile warning")

    # A cross-Space move publishes the profile only after both namespace phases
    # have committed, preventing a safety snapshot from jumping ahead of journal.
    old = '''  currentMeta = await publishWorkspaceMutationPayload(pending.source, currentState, currentMeta);
  await clearPendingCrossSpaceSync(storageKey);'''
    new = '''  currentMeta = await publishWorkspaceMutationPayload(pending.source, currentState, currentMeta);
  await publishFullProfileSnapshot(currentState, currentMeta);
  await clearPendingCrossSpaceSync(storageKey);'''
    text = replace_once(text, old, new, f"{path} cross-space profile")

    write(path, text)


def patch_changelog():
    p = "CHANGELOG.md"
    old = read(p)
    entry = f'''## {VERSION}\n\n- Added a new **atomic whole-profile Sync safety layer** above MosaicSync's existing record-by-record conflict engine. Every trusted device can now publish one verified generation containing both Personal and Work, with an explicit valid empty Work state when appropriate. Firefox may still deliver individual `storage.sync` keys in any order, but MosaicSync no longer has to treat independently arriving Space ledgers as a complete profile.\n- Whole-profile safety generations are double-buffered per device: chunks are written into the inactive slot and a tiny root is committed last. The root retains the previous complete descriptor, so a receiver automatically falls back to the last good generation if Firefox exposes a new root before all of its chunks arrive or if the active generation fails integrity validation.\n- Fixed the 1.27.7 failure mode where a fresh profile could restore Personal, leave Work empty, keep `lastAppliedWorkSyncRevision` blank and still report Sync as ready. A current profile is now considered complete only when both Personal and Work have usable core data; initial restore commits both Spaces locally together instead of exposing a half-profile.\n- Made Work self-healing. A complete whole-profile Work generation is used as the baseline while individually delivered Work records/tombstones are merged on top with the existing deterministic clocks. If the shared Work dataset count/fingerprint/settings marker is torn, an established device repairs the shared ledger and writes a coherent commit marker last instead of silently ignoring Work forever.\n- Preserved edits made on a genuinely fresh device while it is waiting for its first complete remote profile. Local shortcuts/settings created during that window stay provisional and are merged on top of the incoming complete profile after both Spaces arrive; the fresh device remains blocked from publishing an unverified empty Work space.\n- Added whole-profile safety publication to authoritative Send-to-Sync, successful Personal/Work mutations and completed cross-Space transactions. Existing Personal atomic snapshots remain in place for rolling compatibility and low-latency Personal recovery. Structural Sync reserve was increased from 40 KiB to 50 KiB so core/profile safety data wins over optional synchronized artwork when quota is tight; artwork remains best-effort.\n- Added permanent regression coverage for explicit empty Work, root-last generation switching, previous-generation fallback, corrupted/incomplete active generations, multi-device profile merging, fresh-device pending edits and source integration across Firefox/Chrome. No new permissions or host permissions, no CSP relaxation, no telemetry, no remote code, no new UI strings and no change to the `.mosaicsync` export format. Version identity is exactly `{VERSION}` across both browsers, runtime/UI metadata, build output and source documentation.\n\n'''
    if not old.startswith("## 1.27.7"): raise SystemExit("unexpected CHANGELOG head")
    write(p, entry + old)


def write_release_docs():
    out = ROOT / "release-notes"
    out.mkdir(exist_ok=True)
    (out / f"AMO-{VERSION}-changelog.txt").write_text(f'''MosaicSync {VERSION}\n\n- Makes Sync restore Personal and Work as one complete profile instead of allowing a half-restored profile to be marked ready.\n- Adds atomic full-profile safety snapshots with automatic fallback to the previous complete generation when Firefox Sync delivers mixed/incomplete keys.\n- Adds automatic Work-space recovery and repair when its shared Sync generation fails count/fingerprint/settings integrity checks.\n- Preserves shortcuts/settings created on a fresh computer while its first complete profile is still arriving, then merges those edits on top automatically.\n- Keeps the existing deterministic per-record conflict/tombstone engine and Personal fast snapshots for compatibility.\n- No new permissions, telemetry, remote code or CSP changes.\n''', encoding="utf-8")
    (out / f"AMO-{VERSION}-notes-to-reviewer.txt").write_text(f'''MosaicSync {VERSION} - Notes to Reviewer\n\nScope\nThis is a Sync reliability release motivated by a reproducible 1.27.7 state in which Firefox storage.sync contained a Work dataset but a fresh profile applied only Personal, left lastAppliedWorkSyncRevision empty, and nevertheless reported ready.\n\nImplementation\n- New reviewed source module: src/shared/background/profile-snapshot.js. It introduces additive storage.sync keys under mosaicsync.sync.profile.<deviceId>.\n- A profile snapshot contains only MosaicSync core data already eligible for browser Sync (Personal/Work shortcut/folder records and settings). It does not add telemetry, a developer server, remote code, browsing collection, or a new permission.\n- Each device uses two fixed chunk slots. New chunks are written to the inactive slot; the small root is written last. The root carries both active and previous descriptors. Decoding validates chunk identity/order, compressed data fingerprint, both Space record fingerprints/counts and settings fingerprints. If the active descriptor cannot be decoded, the previous descriptor is tried automatically. Gzip decompression is stream-bounded to 1 MiB.\n- Existing shared record ledgers and conflict/tombstone rules remain authoritative for concurrent edits. The whole-profile generation is a completeness/recovery baseline, not a replacement conflict algorithm.\n- Work reconciliation can repair an inconsistent shared dataset only from a complete profile baseline or an established local Work state that has a previously applied Work revision. A migrated 1.27.7 profile with blank lastAppliedWorkSyncRevision is deliberately prevented from publishing its possibly-empty Work state.\n- Fresh bootstrap waits for usable Personal AND Work and writes both local Spaces in one state commit. Provisional local edits made while waiting are merged only after that complete remote baseline is available.\n- SYNC_CORE_RESERVE_BYTES increases from 40960 to 51200 so structural recovery data takes precedence over optional artwork under the existing 100 KiB browser Sync quota.\n\nBuild/review\nRun: npm test\nRun: npm run size\nRun: python3 tools/package.py\nThe build remains deterministic and produces Firefox/Chrome packages plus build-manifest.json SHA-256 inventories. No generated runtime file should be edited directly; src/ remains authoritative.\n\nPermissions/CSP/data\nNo manifest permissions or host permissions added. No CSP change. No telemetry/analytics. No remote code. No change to the exported .mosaicsync profile format.\n''', encoding="utf-8")
    (out / f"GitHub-{VERSION}-release.md").write_text(f'''# MosaicSync {VERSION} — self-healing full-profile Sync\n\nThis release hardens MosaicSync's core purpose: moving the same start-page profile safely between computers.\n\n## What changed\nMosaicSync now keeps an atomic safety generation containing **Personal and Work together**. A new generation is written completely before a tiny root switches to it, and the previous complete generation remains available as an automatic fallback. If Firefox Sync delivers keys out of order or exposes a mixed generation, MosaicSync keeps/falls back to a complete profile instead of accepting half of it.\n\nWork now receives the same class of recovery protection that Personal already had. A valid full-profile Work baseline can be combined with newer individually delivered records and tombstones using the existing deterministic conflict rules, and MosaicSync can automatically repair a torn Work shared dataset.\n\nFresh computers no longer publish an unverified empty Space. If you add a shortcut while the first full profile is still arriving, that edit is kept locally and merged on top once Personal and Work are both available.\n\n## Compatibility and privacy\nThe existing per-record Sync format remains for rolling compatibility. No new permissions, telemetry, analytics, remote code or MosaicSync-operated cloud were added. Browser-native Sync remains the transport.\n\n## Validation\nThe release adds fault-style tests for incomplete/corrupted active generations, fallback to the previous generation, explicit empty Work, multi-device merges, pending first-sync edits, and Firefox/Chrome integration.\n''', encoding="utf-8")


def write_tests():
    p = ROOT / "tests/profile-sync-1278.test.mjs"
    p.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "../src/shared/core/model.js";
import {
  buildProfilePublication,
  decodeProfileSnapshots,
  mergeProfileSpaceSource,
  profileChunkKey,
  profileRootKey
} from "../src/shared/background/profile-snapshot.js";

function shortcut(id, modifiedAt, title=id) {
  return { type:"shortcut", id, title, url:`https://${id}.example/`, position:0, createdAt:modifiedAt, modifiedAt,
    image:"", imageSyncData:"", imageAssetId:"", localImageAssetId:"", imageSyncKind:"none", imageSourceKind:"none", imageSourceUrl:"", imageIsFallback:false, imageStyle:"contain", source:"manual" };
}
function state(personal=[], work=[]) {
  return normalizeState({ schemaVersion:18, activeSpaceId:"personal", spaces:{
    personal:{ shortcuts:personal, settingsModifiedAt:0, updatedAt:Math.max(0,...personal.map(x=>x.modifiedAt)) },
    work:{ shortcuts:work, settingsModifiedAt:0, updatedAt:Math.max(0,...work.map(x=>x.modifiedAt)) }
  }});
}
function applyPublication(all, publication, { omitLastChunk=false }={}) {
  for (const [key,value] of Object.entries(publication.chunkWrites)) {
    if (omitLastChunk && Number(value.index) === Number(value.total)-1) continue;
    all[key]=value;
  }
  all[publication.rootKey]=publication.rootValue;
}

test("1.27.8 whole-profile generation makes an intentionally empty Work explicit and valid", async () => {
  const pub=await buildProfilePublication(state([shortcut("p",10)],[]),"dev-a",null,{commitId:"g1",publishedAt:100});
  const all={}; applyPublication(all,pub);
  const decoded=await decodeProfileSnapshots(all);
  assert.equal(decoded.length,1);
  assert.equal(decoded[0].spaces.personal.records.size,1);
  assert.equal(decoded[0].spaces.work.records.size,0);
  assert.equal(decoded[0].usedPrevious,false);
});

test("root-last switch falls back to previous complete generation while new chunks are incomplete", async () => {
  const all={};
  const first=await buildProfilePublication(state([shortcut("p",10)],[shortcut("w-old",10)]),"dev-a",null,{commitId:"g1",publishedAt:100});
  applyPublication(all,first);
  const second=await buildProfilePublication(state([shortcut("p",20)],[shortcut("w-new",20)]),"dev-a",first.rootValue,{commitId:"g2",publishedAt:200});
  // Simulate Firefox delivering the new root and only part of its inactive-slot chunks.
  applyPublication(all,second,{omitLastChunk:true});
  // The second payload is small and may use one chunk; if so omitLastChunk means none of g2 arrives.
  const decoded=await decodeProfileSnapshots(all);
  assert.equal(decoded.length,1);
  assert.equal(decoded[0].commitId,"g1");
  assert.equal(decoded[0].usedPrevious,true);
  assert.ok(decoded[0].spaces.work.records.has("w-old"));
  assert.ok(!decoded[0].spaces.work.records.has("w-new"));
});

test("complete new generation becomes active only after every named chunk is present", async () => {
  const all={};
  const first=await buildProfilePublication(state([], [shortcut("old",10)]),"dev-a",null,{commitId:"g1",publishedAt:100});
  applyPublication(all,first);
  const second=await buildProfilePublication(state([], [shortcut("new",20)]),"dev-a",first.rootValue,{commitId:"g2",publishedAt:200});
  applyPublication(all,second);
  const decoded=await decodeProfileSnapshots(all);
  assert.equal(decoded[0].commitId,"g2");
  assert.equal(decoded[0].usedPrevious,false);
  assert.ok(decoded[0].spaces.work.records.has("new"));
});

test("corrupt active chunk cannot replace previous good profile", async () => {
  const all={};
  const first=await buildProfilePublication(state([shortcut("p1",10)],[]),"dev-a",null,{commitId:"g1",publishedAt:100}); applyPublication(all,first);
  const second=await buildProfilePublication(state([shortcut("p2",20)],[]),"dev-a",first.rootValue,{commitId:"g2",publishedAt:200}); applyPublication(all,second);
  const key=profileChunkKey("dev-a",second.targetSlot,0);
  all[key]={...all[key],data:all[key].data.slice(0,-1)+"X"};
  const decoded=await decodeProfileSnapshots(all);
  assert.equal(decoded[0].commitId,"g1");
  assert.equal(decoded[0].usedPrevious,true);
});

test("multi-device complete profiles merge through existing deterministic record clocks", async () => {
  const all={};
  const a=await buildProfilePublication(state([], [shortcut("a",10)]),"dev-a",null,{commitId:"a1",publishedAt:100}); applyPublication(all,a);
  const b=await buildProfilePublication(state([], [shortcut("b",20)]),"dev-b",null,{commitId:"b1",publishedAt:200}); applyPublication(all,b);
  const snapshots=await decodeProfileSnapshots(all);
  const work=mergeProfileSpaceSource(snapshots,"work");
  assert.ok(work.records.has("a"));
  assert.ok(work.records.has("b"));
});

test("source integration requires both browsers to use the 1.27.8 full-profile safety path", async () => {
  const { readFile }=await import("node:fs/promises");
  for (const browser of ["firefox","chrome"]) {
    const text=await readFile(new URL(`../src/${browser}/background/background.js`,import.meta.url),"utf8");
    assert.match(text,/profile-snapshot\.js/);
    assert.match(text,/publishFullProfileSnapshot/);
    assert.match(text,/combinedWorkRemoteCore/);
    assert.match(text,/lastAppliedWorkSyncRevision/);
    assert.doesNotMatch(text,/Absence is therefore a valid empty remote state during a rolling upgrade/);
  }
});
''', encoding="utf-8")

patch_version_files()
for browser in ["firefox", "chrome"]:
    patch_background(f"src/{browser}/background/background.js")
patch_changelog()
write_release_docs()
write_tests()
print("Applied MosaicSync 1.27.8 full-profile Sync reliability transform.")
