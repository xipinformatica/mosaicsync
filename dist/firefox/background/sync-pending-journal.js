/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/*
 * Durable outbound Normal Sync journal storage ownership.
 *
 * Ownership boundary:
 * - validate/read/enumerate pending cross-Space journal records;
 * - write/advance/clear background-owned cross-Space journal records;
 * - validate/read/clear the cumulative local-mutation journal;
 * - clear both durable retry authorities for authority transitions;
 * - construct durable cross-Space journal keys.
 *
 * This module intentionally does not create the initial local mutation or
 * cross-Space intent records. core/storage.js commits those records atomically
 * with authoritative local state. It also owns no storage.sync publication,
 * retry scheduling, reconciliation, Recovery generation work, or browser events.
 */
import {
  LOCAL_ASSET_WRITE_LOCK_NAME,
  LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX,
  LOCAL_PENDING_SYNC_MUTATION_KEY,
  PRODUCT_NAME
} from "../core/constants.js";

export const CROSS_SPACE_SYNC_TRANSACTION_VERSION = 1;

async function withPersistenceWriteLock(callback) {
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(LOCAL_ASSET_WRITE_LOCK_NAME, callback);
  }
  // Keep the same compatibility fallback as core/storage.js. Supported current
  // browser floors expose Web Locks; older/limited runtimes retain functional
  // behavior but cannot provide the same cross-context race guarantee.
  return callback();
}

async function readPendingCrossSpaceSyncState(spaceIdsForSync) {
  try {
    const stored = await browser.storage.local.get(null);
    const entries = [];
    for (const [key, value] of Object.entries(stored || {})) {
      if (!key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) continue;
      if (!value || value.schemaVersion !== CROSS_SPACE_SYNC_TRANSACTION_VERSION) continue;
      if (!spaceIdsForSync.has(value.fromSpaceId) || !spaceIdsForSync.has(value.toSpaceId) || value.fromSpaceId === value.toSpaceId) continue;
      if (value.kind === "intent") {
        if (!value.destination || !value.source) continue;
      } else if (value.kind !== "transaction" || !value.destination?.writes || !value.source?.writes) {
        continue;
      }
      entries.push({ key, value });
    }
    entries.sort((a, b) => {
      const timeDiff = (Number(a.value?.createdAt) || 0) - (Number(b.value?.createdAt) || 0);
      return timeDiff || (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0));
    });
    return { stored: stored || {}, entries };
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read pending cross-Space Sync transactions`, error);
    // This journal is durable transaction authority. A failed read is not
    // evidence that no transaction exists: fail closed so a second Sync
    // publication cannot start while earlier cross-Space work is unknown.
    throw error;
  }
}

export async function readPendingCrossSpaceSyncEntries(spaceIdsForSync) {
  return (await readPendingCrossSpaceSyncState(spaceIdsForSync)).entries;
}

export async function writePendingCrossSpaceSync(key, transaction) {
  if (typeof key !== "string" || !key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) {
    throw new Error("Invalid pending cross-Space Sync transaction key.");
  }
  return withPersistenceWriteLock(async () => {
    await browser.storage.local.set({ [key]: transaction });
    return transaction;
  });
}

export async function clearPendingCrossSpaceSync(key) {
  if (typeof key !== "string" || !key.startsWith(LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX)) return;
  await withPersistenceWriteLock(() => browser.storage.local.remove(key));
}

export async function readPendingLocalSyncMutation() {
  try {
    const stored = await browser.storage.local.get(LOCAL_PENDING_SYNC_MUTATION_KEY);
    const value = stored?.[LOCAL_PENDING_SYNC_MUTATION_KEY];
    if (!value || value.schemaVersion !== 1 || typeof value.journalId !== "string" || !value.journalId) return null;
    if (!value.before || typeof value.before !== "object" || !value.after || typeof value.after !== "object") return null;
    return value;
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not read pending local Sync mutation`, error);
    // null means a successful read proved there is no pending mutation.
    // Storage failure must remain distinguishable so callers cannot bypass
    // the durable cumulative-before-state journal with a direct publication.
    throw error;
  }
}

export async function clearPendingLocalSyncMutation(journalId = "") {
  try {
    return await withPersistenceWriteLock(async () => {
      if (journalId) {
        const current = await readPendingLocalSyncMutation();
        if (!current || current.journalId !== journalId) return false;
      }
      await browser.storage.local.remove(LOCAL_PENDING_SYNC_MUTATION_KEY);
      return true;
    });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not clear pending local Sync mutation`, error);
    // Cleanup failure must abort authority-changing operations such as Sync
    // disable/reset. Returning false here would make an uncleared durable
    // journal indistinguishable from a benign journal-id mismatch.
    throw error;
  }
}

export async function clearAllPendingSyncRecoveryState(spaceIdsForSync, afterClear = null) {
  try {
    return await withPersistenceWriteLock(async () => {
      const { stored, entries } = await readPendingCrossSpaceSyncState(spaceIdsForSync);
      // Keep both durable authority classes behind one storage mutation. If the
      // browser rejects this remove, neither class is intentionally discarded.
      // Holding the persistence lock from enumeration through the optional
      // authority callback also prevents a New Tab state+journal writer from
      // creating fresh retry intent inside the transition.
      const keys = [
        ...entries.map(entry => entry.key),
        LOCAL_PENDING_SYNC_MUTATION_KEY
      ];
      const rollback = {};
      for (const entry of entries) rollback[entry.key] = stored[entry.key];
      if (Object.hasOwn(stored, LOCAL_PENDING_SYNC_MUTATION_KEY)) {
        rollback[LOCAL_PENDING_SYNC_MUTATION_KEY] = stored[LOCAL_PENDING_SYNC_MUTATION_KEY];
      }

      await browser.storage.local.remove(keys);
      if (typeof afterClear !== "function") return undefined;
      try {
        return await afterClear();
      } catch (error) {
        // Cleanup succeeded but the authority metadata commit failed. Restore the
        // exact retry authority snapshot before releasing the lock so the caller
        // cannot remain Sync-enabled after durable unsent work was discarded. The
        // compensating write occurs only on this failure path.
        try {
          if (Object.keys(rollback).length) await browser.storage.local.set(rollback);
        } catch (rollbackError) {
          console.warn(`${PRODUCT_NAME}: could not restore pending Sync recovery state after authority transition failure`, rollbackError);
          throw new AggregateError([error, rollbackError], "Pending Sync authority transition and rollback both failed.");
        }
        throw error;
      }
    });
  } catch (error) {
    console.warn(`${PRODUCT_NAME}: could not clear pending Sync recovery state`, error);
    throw error;
  }
}

export function pendingCrossSpaceSyncKey(transaction) {
  const id = typeof transaction?.intentId === "string" && transaction.intentId
    ? transaction.intentId
    : (typeof transaction?.transactionId === "string" ? transaction.transactionId : "");
  if (!id) return "";
  return `${LOCAL_PENDING_CROSS_SPACE_SYNC_PREFIX}${id}`;
}
