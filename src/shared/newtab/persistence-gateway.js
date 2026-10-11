/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * New Tab persistence gateway. Only the actual storage write crosses this
 * boundary. The caller remains owner of mutation clocks, pending intentions,
 * UI reconciliation, branding rollback and durable-baseline adoption.
 *
 * No implicit serialization, retry, error presentation or extra reads.
 */
export function createNewTabPersistenceGateway(writeLocalStateWithBaseline) {
  if (typeof writeLocalStateWithBaseline !== "function") throw new TypeError("Missing local-state writer");
  return Object.freeze({
    commitWithBaseline(nextState, baseState, extraOptions) {
      return writeLocalStateWithBaseline(nextState, {
        baseState,
        baseStateIsCompact: Boolean(baseState),
        ...extraOptions
      });
    },
    commitImportedProfile(importedState, requiredCompactBaseline) {
      return writeLocalStateWithBaseline(importedState, {
        recordSyncMutation: true,
        requireUnchangedCompactState: requiredCompactBaseline
      });
    }
  });
}
