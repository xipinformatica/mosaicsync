import { createRecoveryGenerationLifecycle } from "../../src/shared/background/recovery-generation-lifecycle.js";

export function createTestRecoveryLifecycle({
  compareDeviceSnapshotGenerationRecency = () => 0,
  deviceRootDescriptor = () => null,
  deviceSnapshotKeysForRoot = (all, rootKey) => Object.keys(all || {})
    .filter(key => key === rootKey || key.startsWith(`${rootKey}.chunk.`)),
  isDeviceSnapshotChunkKey = key => String(key).includes(".chunk."),
  compareStableText = (left, right) => {
    const a = String(left ?? ""), b = String(right ?? "");
    return a < b ? -1 : a > b ? 1 : 0;
  },
  syncEntryBytes = () => 1,
  policy = {}
} = {}) {
  return createRecoveryGenerationLifecycle({
    format: {
      compareDeviceSnapshotGenerationRecency,
      deviceRootDescriptor,
      deviceSnapshotKeysForRoot,
      isDeviceSnapshotChunkKey
    },
    compareStableText,
    syncEntryBytes,
    policy
  });
}
