# MosaicSync 1.33.0.18 publication notes

## Mozilla changelog

Completes Snow Leopard II with the Step-8 final freeze. No further performance optimization is introduced. Two low-severity rapid-open UI races found by independent adversarial audits are corrected: Bookmarks and Wallpaper Gallery now re-check native dialog state immediately before opening after asynchronous setup, preventing a second same-session `showModal()` call. Step 8 also adds runtime execution coverage for the Step-7 built-in-icon ownership contract. Sync, Recovery, pending journals, permissions, schemas, privacy boundaries and browser floors are unchanged.

## Mozilla Notes to Reviewer

1.33.0.18 is a final-freeze corrective, not another optimization release. Production changes are limited to one final `dialog.open` re-check in the lazy Bookmarks open path and one equivalent re-check in the lazy Wallpaper Gallery path, both after asynchronous setup and immediately before presentation. Existing close→reopen generation ownership remains unchanged. `builtin-icons.js` production ownership is unchanged; only runtime regression coverage is added to prove a second evaluation is a no-op. No background authority, Sync/Recovery, storage, permission or destructive-cleanup code changes.

## Chrome Web Store

Final Snow Leopard II freeze: fixes two low-severity rapid-open dialog races in Bookmarks and Wallpaper Gallery and hardens startup ownership tests. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.18`

## GitHub release description

MosaicSync 1.33.0.18 completes **Snow Leopard II — Step 8 final freeze**.

Step 8 accepts no additional performance optimization. It independently reproduces and corrects two inherited LOW same-session dialog reentrancy races: rapid concurrent Bookmarks opens and Wallpaper Gallery opens could both pass their initial closed check, await lazy setup, then call native `showModal()` twice. Both paths now re-check dialog ownership immediately before the final presentation boundary. Existing generation ownership that protects close→reopen across different sessions is preserved.

Step 8 also converts the Step-7 built-in icon ownership assumption into an executable regression: running `builtin-icons.js` twice preserves the exact same working immutable global API.

Final deterministic Snow Leopard II deltas versus Step 0 include:
- initial New Tab DOM: **642 → 598 elements**;
- eager static module closure: **24 → 22 modules**;
- eager static-module source: **653,457 → 640,143 raw bytes**;
- runtime reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**.

Step-5 storage freshness boundaries and Step-6 lifetime ownership protections remain intact. No Sync, Recovery, pending-journal, permission, persisted-schema, profile-format, network, CSP, privacy-boundary or browser-floor change.

**Snow Leopard II is COMPLETE and frozen at 1.33.0.18.**

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.18 — complete Snow Leopard II

**Description:** Final Step-8 freeze: correct rapid Bookmarks/Wallpaper modal reentrancy, runtime-test the Step-7 icon ownership contract, recertify the full journey, and freeze Snow Leopard II.
