/* Pure Sync source-selection policy.
 *
 * Live shared ledgers are the only per-record merge inputs. Immutable device
 * snapshots are coherent safety generations: choose one verified generation as
 * a whole and never synthesize a profile by unioning multiple devices.
 */
export function selectAtomicRecoverySnapshot(snapshots, { compareRecency, requireCompleteProfile = false } = {}) {
  if (!Array.isArray(snapshots) || typeof compareRecency !== "function") return null;
  const eligible = snapshots.filter(snapshot => {
    if (!snapshot || !(snapshot.records instanceof Map) || snapshot.settings?.kind !== "settings") return false;
    if (!requireCompleteProfile) return true;
    return snapshot.profileComplete === true && snapshot.workRecords instanceof Map && snapshot.workSettings?.kind === "settings";
  });
  if (!eligible.length) return null;

  // A directly verified current generation is preferable to a decoder fallback
  // through another manifest's previousProfile descriptor. If only fallback
  // generations are currently complete, they remain valid safety copies.
  const current = eligible.filter(snapshot => snapshot.usedPreviousGeneration !== true);
  const pool = current.length ? current : eligible;
  return [...pool].sort(compareRecency)[0] || null;
}

/*
 * Restore must choose one coherent Personal+Work source. Most divergent live
 * ledgers remain authoritative because their clocks may come from unrelated
 * devices. The only additional safe ordering is a same-publisher atomic profile
 * that is at least as new in both Spaces and strictly newer in one of them.
 */
export function selectCoherentRestoreSource(observation = {}) {
  const atomicAvailable = observation?.atomicAvailable === true;
  const liveComplete = observation?.liveComplete === true;
  if (!atomicAvailable) return "live";
  if (!liveComplete) return "atomic";
  if (observation?.atomicMatchesLive === true) return "atomic";
  if (observation?.atomicModern === true && observation?.liveModern !== true) return "atomic";
  if (observation?.atomicModern !== true || observation?.liveModern !== true) return "live";

  const atomic = observation?.atomic || {};
  const live = observation?.live || {};
  const publisher = typeof atomic.originDeviceId === "string" ? atomic.originDeviceId : "";
  if (!publisher || live.personalOriginDeviceId !== publisher || live.workOriginDeviceId !== publisher) return "live";

  const atomicPersonal = Number(atomic.personalUpdatedAt);
  const atomicWork = Number(atomic.workUpdatedAt);
  const livePersonal = Number(live.personalUpdatedAt);
  const liveWork = Number(live.workUpdatedAt);
  if (![atomicPersonal, atomicWork, livePersonal, liveWork].every(Number.isFinite)) return "live";
  const dominatesBoth = atomicPersonal >= livePersonal && atomicWork >= liveWork;
  const strictlyNewer = atomicPersonal > livePersonal || atomicWork > liveWork;
  return dominatesBoth && strictlyNewer ? "atomic" : "live";
}
