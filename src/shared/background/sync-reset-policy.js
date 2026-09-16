/*
 * Pure capacity planning for an intentional Sync reset. The orchestrator owns
 * every browser read/write. A plan may remove old keys only while at least one
 * old value remains, so interruption before reset-intent durability cannot make
 * an established peer mistake the reset for catastrophic cloud loss.
 */
export function planResetIntentCapacity(all, resetKey, resetValue, {
  fits,
  entryBytes,
  compareStableText,
  isLiveCoreKey
} = {}) {
  const values = all && typeof all === "object" && !Array.isArray(all) ? all : {};
  if (typeof resetKey !== "string" || !resetKey || typeof fits !== "function" ||
      typeof entryBytes !== "function" || typeof compareStableText !== "function" ||
      typeof isLiveCoreKey !== "function") {
    throw new TypeError("Invalid Sync reset capacity inputs");
  }
  const resetItems = { [resetKey]: resetValue };
  if (fits(values, resetItems)) return { removeKeys: [], compactKey: "", blocked: false };

  const allCandidates = Object.keys(values).filter(key => key !== resetKey);
  const liveCandidates = allCandidates
    .filter(isLiveCoreKey)
    .sort((left, right) => entryBytes(left, values[left]) - entryBytes(right, values[right]) || compareStableText(left, right));

  // Recovery treats only the live shared ledgers as evidence that the namespace
  // still exists. If none is present, destructive staging could turn an already
  // ambiguous partial namespace into false catastrophic-loss evidence. Fail
  // before mutating instead; the user can retry after Sync finishes delivering.
  if (!liveCandidates.length) return { removeKeys: [], compactKey: "", blocked: true };

  // Preserve the smallest live-core key until reset-intent becomes durable. All
  // other keys remain eligible for capacity removal, largest first. This makes
  // the reset planner and catastrophic-Recovery predicate share one invariant.
  const protectedKey = liveCandidates[0];
  const candidates = allCandidates
    .filter(key => key !== protectedKey)
    .sort((left, right) => entryBytes(right, values[right]) - entryBytes(left, values[left]) || compareStableText(left, right));
  const simulated = { ...values };
  const removeKeys = [];
  while (candidates.length) {
    const key = candidates.shift();
    delete simulated[key];
    removeKeys.push(key);
    if (fits(simulated, resetItems)) return { removeKeys, compactKey: "", blocked: false };
  }

  // If the preserved live item itself is too large to coexist with reset-intent,
  // replace that same live-core key with a tiny staging marker atomically with
  // reset-intent. Its key still satisfies Recovery's live-core predicate until
  // reset authority is durable; there is never a metadata-only interval.
  return { removeKeys, compactKey: protectedKey, blocked: false };
}
