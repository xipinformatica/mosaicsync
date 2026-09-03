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
