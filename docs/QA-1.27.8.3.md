> **INTERNAL CANDIDATE — not a public MosaicSync release.** Superseded by public 1.27.8.8.

# MosaicSync 1.27.8.3 QA / New Tab critical-path performance checklist

## Release identity

- [x] Firefox manifest version = `1.27.8.3`.
- [x] Chrome manifest version + `version_name` = `1.27.8.3`.
- [x] Shared `VERSION`, visible Settings label, README, CHANGELOG, current release tests and build manifest = `1.27.8.3`.
- [x] No state, Sync, device-snapshot or profile schema version changed.

## Critical CSS / CSP

- [x] `newtab-critical.css` contains the first-frame launcher/Space/grid/folder/Frequently Visited/empty/sync-shell styles.
- [x] The blocking critical CSS source is ~43 KB versus ~128 KB for the complete stylesheet (about two-thirds less CSS on the blocking first-frame path).
- [x] The complete `newtab.css` is loaded only by packaged external `secondary-style-bootstrap.js` after two animation-frame callbacks.
- [x] No inline `onload`, inline script, remote stylesheet or CSP relaxation was introduced.
- [x] Firefox and Chrome use the same critical stylesheet.

## Early authoritative state I/O

- [x] `readLocalStorageRaw()` begins immediately after the New Tab core module graph evaluates, before localization/secondary UI wiring.
- [x] Heavy normalization/materialization still waits until after the lightweight boot/session projection has had a paint opportunity.
- [x] The same authoritative `storage.local` result is consumed; no alternate state source or precedence rule was added.

## Cold bootstrap DOM adoption

- [x] Cold adoption requires exact active-Space/state/settings clocks.
- [x] Rows, columns, tile size, brand visibility and current ordering must match.
- [x] Shortcut IDs/types/titles and safe navigation URLs must match.
- [x] Folder mosaic child count and first-four child IDs must match.
- [x] Bootstrap folder mosaic cells expose only the minimum child ID needed for the structural check.
- [x] Adopted slots receive the same shortcut/folder interaction, edit, drag and accessibility wiring used by freshly-rendered slots.
- [x] Empty slots, which contain no useful decoded artwork, are upgraded through the existing authoritative empty-slot constructor.
- [x] Any mismatch or uncertainty falls back to the established full `render()` path.

## Closed-folder artwork

- [x] Startup with a 12-child folder reads exactly four child artwork assets in one batch.
- [x] All 12 child records remain present; deferred children retain URL, ID, position and `localImageAssetId`.
- [x] Deferred post-PCP hydration reads exactly the remaining eight assets and does not reread the first four.
- [x] Opening a folder before idle hydration triggers immediate folder-specific artwork hydration.
- [x] Active-Space compatibility aliases are re-selected after deferred hydration so the UI sees the new pixels immediately.

## Concurrency baseline

- [x] Normal current-schema startup clones the exact persisted compact state as `compactBaseline`.
- [x] Read-only startup no longer calls the image-heavy `createWriteBaseline(loaded.state, ...)` path.
- [x] Legacy/migration startup still constructs a full canonical write baseline.
- [x] Existing optimistic-rebase/concurrent-write regression tests remain passing.

## Startup timing

- [x] Timing state lives only in `globalThis.__mosaicsyncStartupTiming` for the current New Tab context.
- [x] Critical-CSS, boot-grid, module/local-read, authoritative-state/adoption and deferred-folder phases are represented.
- [x] No timing data is written to `storage.local`, `storage.sync`, `storage.session`, sent by runtime messaging or sent over the network.

## Performance evidence

- [x] Permanent 200-artwork benchmark still confirms validated-asset memo reuse materially reduces image-heavy normalization.
- [x] Current build-host benchmark: compact persisted baseline clone is roughly 0.5 ms versus roughly 31 ms for constructing a memo-assisted full write baseline in the same synthetic 200-artwork fixture (comparative build-host measurement only).
- [x] Folder-heavy operation-count fixture: 5×30 closed-folder children reduces first-frame artwork IDs from 150 to 20 while preserving all records.
- [x] Critical CSS is less than 45% of complete CSS source bytes; current source is about one-third.

## Regression / parity

- [x] Dedicated 1.27.8.3 performance tests: 11/11 passing.
- [x] Full final source-tree suite: 441/441 passing before packaging.
- [x] Existing Sync distributed harness remains passing for Firefox and Chrome.
- [x] Existing security/import/image/SVG/concurrency/profile tests remain passing.
- [x] Firefox/Chrome New Tab JavaScript performance logic is kept in parity.
- [x] No new user-facing strings were introduced, so locale catalogs require no new keys.
- [x] No new permissions, host permissions, telemetry, remote code or image-quality reduction.
