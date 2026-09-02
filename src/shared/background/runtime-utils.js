/* Pure background-runtime helpers kept separate for testing and reuse. */
export function syncNamespaceFor(spaceId, { personalSpaceId, syncPrefix, syncSettingsKey, syncDatasetKey, syncItemPrefix, syncAssetPrefix, syncSpacePrefix }) {
  if (spaceId === personalSpaceId) return { spaceId, prefix: syncPrefix, settingsKey: syncSettingsKey, datasetKey: syncDatasetKey, itemPrefix: syncItemPrefix, assetPrefix: syncAssetPrefix };
  const prefix = `${syncSpacePrefix}${spaceId}.`;
  return { spaceId, prefix, settingsKey: `${prefix}settings`, datasetKey: `${prefix}dataset`, itemPrefix: `${prefix}item.`, assetPrefix: `${prefix}asset.` };
}
export function pruneExpectationMap(map, { now = Date.now(), max = 256 } = {}) {
  for (const [key, value] of map) {
    const expiresAt = typeof value === "object" ? value.expiresAt : value;
    if (!Number.isFinite(expiresAt) || expiresAt < now) map.delete(key);
  }
  while (map.size > max) map.delete(map.keys().next().value);
}
export function compactSignature(signature, removedSentinel = null) {
  if (removedSentinel !== null && signature === removedSentinel) return "removed";
  const text = String(signature ?? "");
  let hashA = 2166136261, hashB = 2246822507;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hashA ^= code; hashA = Math.imul(hashA, 16777619);
    hashB ^= code + index; hashB = Math.imul(hashB, 3266489909);
  }
  return `${text.length}:${(hashA >>> 0).toString(16)}:${(hashB >>> 0).toString(16)}:${text.slice(0, 24)}:${text.slice(-24)}`;
}
export function pruneSessionEntries(entries, { now = Date.now(), max = 256 } = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(entries || {})) {
    const expiresAt = typeof value === "object" ? value.expiresAt : value;
    if (Number.isFinite(expiresAt) && expiresAt >= now) clean[key] = value;
  }
  const keys = Object.keys(clean);
  for (let index = 0; index < Math.max(0, keys.length - max); index += 1) delete clean[keys[index]];
  return clean;
}

export function hasOwnEnumerable(value) {
  if (!value || typeof value !== "object") return false;
  for (const _key in value) {
    if (Object.prototype.hasOwnProperty.call(value, _key)) return true;
  }
  return false;
}

export function countOwnEnumerable(value) {
  if (!value || typeof value !== "object") return 0;
  let count = 0;
  for (const key in value) if (Object.prototype.hasOwnProperty.call(value, key)) count += 1;
  return count;
}
