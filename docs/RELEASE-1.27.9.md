# MosaicSync 1.27.9 publication notes

## Mozilla Developer Hub — concise changelog

Snow Leopard maintenance release with no new features. Hardens Settings against cross-tab/storage races so pending edits cannot overwrite or be overwritten by newer external state; completes favicon quality discovery so large manifest icons cannot stop the search before a better conventional favicon is considered; consolidates the identical Firefox/Chrome New Tab runtime into one canonical build-time source; removes the unused monolithic New Tab stylesheet from runtime packages; and strengthens behavioral, localization, packaging and reduced-motion regression coverage. No new permissions or schema changes.

## Mozilla — Notes to Reviewer

MosaicSync 1.27.9 is a zero-feature maintenance release and the direct public successor to 1.27.8.9. It deliberately preserves the existing permission model, CSP, state/Sync/profile schemas, complete Personal+Work recovery model, navigation policy, image/SVG validation and user-visible feature set.

### Settings persisted-state / editing-draft separation

1.27.8.9 correctly prevented asynchronous external state from repainting/rebuilding the launcher behind open Settings. The Snow Leopard audit found a separate model/UI consistency race: an external state event could update the in-memory authoritative settings while untouched controls or debounced local Settings edits still held older values. A later control change could therefore turn stale UI into false local intent, or an external event could replace a local edit before its debounce persisted.

1.27.9 keeps one explicit pending Settings draft while the panel is open. Incoming persisted state becomes the new write baseline; unpersisted dirty fields are overlaid onto that state before Settings preview/reconciliation; untouched controls refresh from incoming state; dirty values remain local intent until the matching write succeeds. Dirty tracking is value/persistence based, not focus based. Existing concurrent-write/rebase logic is unchanged and continues to resolve real persisted concurrency.

Behavioral regression tests execute the production paths for the stale sibling-control case, the debounced Tile Size case and the grouped background-controls case.

### Favicon quality discovery

1.27.8.9 introduced provenance/geometry-aware candidate suitability, but several quality-discovery stop points still used a raw pixel-side threshold. That could terminate discovery after a very large manifest/touch candidate before a better conventional favicon had even been fetched.

1.27.9 retains bounded early exits for network/battery efficiency, but termination now requires an authoritatively suitable candidate using the same reviewed resolution/provenance/geometry policy as winner comparison. Automatic resolution and the manual detected-favicon chooser also share one deterministic candidate preference/tie-break policy. Behavioral resolver tests exercise the full sequence with a huge manifest candidate discovered first and a better conventional favicon fetched later, plus the positive case where an excellent preferred favicon may still terminate early. There are no site-specific exceptions.

### New Tab source/package sanitation

The Firefox and Chrome New Tab JavaScript and critical/secondary CSS were byte-identical. They now have one canonical maintained source under `src/shared/newtab/`; the deterministic build copies those exact bytes into both browser packages. This is build-time consolidation only: it adds no runtime module/import or startup cost, and browser-specific background workers/manifests/overlays remain separate.

The historical monolithic `src/shared/newtab/newtab.css` remains as a reviewed reference for legacy/full-CSS regression assertions but is explicitly removed from `dist/` during the build. Runtime continues to use `newtab-critical.css` plus CSP-safe on-demand `newtab-secondary.css`. This removes roughly 22 KB of compressed unused payload from each browser package while preserving the white-pill fix and critical/secondary ownership contract.

### Localization, accessibility and packaging

All 32 UI catalogs and both browsers' 32 manifest locale catalogs are revalidated for exact key coverage, non-empty strings, placeholder parity and reverse-map safety. No new localization key is introduced. Existing reduced-motion animation suppression is now explicitly regression-tested, including the critical-only hello mascot. GitHub-ready source packaging excludes generated Python `__pycache__`/`.pyc` files.

### Security / compatibility

No new permissions or host permissions. State schema remains 18, synchronized shortcut/settings record schema remains 10, and local Sync bookkeeping meta schema remains 12. Complete Personal+Work recovery, previous-generation fallback, waiting-local merge, conflict/tombstone rules, profile/import hardening, HTTP(S)-only navigation, CSP, remote-image byte/dimension limits and SVG validation are unchanged.

## Chrome Web Store — release note

Zero-feature Snow Leopard maintenance release. Improves Settings cross-tab/edit consistency, completes favicon quality discovery, removes unused packaged CSS, consolidates shared New Tab source and strengthens regression/localization/package hygiene. No new permissions.

## GitHub commit title

`Release MosaicSync 1.27.9 — Snow Leopard maintenance and sanitation`

## GitHub commit description

MosaicSync 1.27.9 is a zero-feature maintenance release and direct successor to 1.27.8.9. It separates open-Settings persisted state from unpersisted local draft values so external storage updates cannot create stale overwrites or erase debounced edits; completes favicon quality discovery by replacing raw-size stop conditions with the shared suitability policy; canonicalizes the byte-identical Firefox/Chrome New Tab runtime source at build time; removes the unused monolithic stylesheet from runtime packages; and strengthens behavioral, localization, reduced-motion and packaging regression coverage. No new permissions, schemas, CSP changes, telemetry or remote code.

## GitHub release title

`MosaicSync 1.27.9`

## GitHub release description

MosaicSync 1.27.9 is the Snow Leopard release: no new features, just a cleaner and more defensive engine. Settings now keeps incoming authoritative state separate from pending user edits, favicon discovery uses one suitability policy for ranking and bounded stopping, Firefox/Chrome New Tab runtime source is maintained once and emitted identically at build time, and an unused legacy stylesheet is no longer shipped. All existing Sync recovery, security, localization and first-frame behavior is preserved. No new permissions.
