/*
 * Pure capacity planning for an intentional Sync reset. The orchestrator owns
 * every browser read/write. A plan may remove old keys only while at least one
 * old value remains, so interruption before reset-intent durability cannot make
 * an established peer mistake the reset for catastrophic cloud loss.
 */
export function planResetIntentCapacity(all, resetKey, resetValue, {
  fits,
  entryBytes,
  compareStableText
} = {}) {
  const values = all && typeof all === "object" && !Array.isArray(all) ? all : {};
  if (typeof resetKey !== "string" || !resetKey || typeof fits !== "function" ||
      typeof entryBytes !== "function" || typeof compareStableText !== "function") {
    throw new TypeError("Invalid Sync reset capacity inputs");
  }
  const resetItems = { [resetKey]: resetValue };
  if (fits(values, resetItems)) return { removeKeys: [], compactKey: "" };

  const candidates = Object.keys(values)
    .filter(key => key !== resetKey)
    .sort((left, right) => entryBytes(right, values[right]) - entryBytes(left, values[left]) || compareStableText(left, right));
  const simulated = { ...values };
  const removeKeys = [];
  while (candidates.length > 1) {
    const key = candidates.shift();
    delete simulated[key];
    removeKeys.push(key);
    if (fits(simulated, resetItems)) return { removeKeys, compactKey: "" };
  }

  // Replacing the final old item with a tiny staging marker in the same browser
  // write as reset-intent avoids a zero-item interval even for malformed legacy
  // namespaces whose last item alone exceeds the modern quota model.
  return { removeKeys, compactKey: candidates[0] || "" };
}
