# MosaicSync 1.30.18.31 publication notes

## Mozilla Developer Hub changelog

Completes Step 5.5 with deterministic build/package pipeline simplification only. Product behavior, permissions and data formats are unchanged.

## Notes to Reviewer

1.30.18.31 begins from the manually validated/live 1.30.18.30 runtime. No extension production algorithm is refactored.

The release tooling now has one deterministic ZIP writer shared by Firefox, Chromium, GitHub-ready source and the explicitly non-release Firefox development package. `tools/package.py` also runs the canonical build before packaging, preventing stale same-version `dist/` output from being published. The release-contract scanner derives its expected version from the canonical shared `VERSION` declaration instead of maintaining a second hard-coded release version.

Before changing release identity to 1.30.18.31, this tooling refactor was applied to an otherwise unchanged 1.30.18.30 tree. The generated Firefox and Chromium ZIPs were byte-for-byte identical to the already validated 1.30.18.30 artifacts.

No feature, UI behavior, permission, CSP, schema, persisted payload, locale, first-paint/cache, Frequently Visited, favicon, Sync, Recovery, storage or browser-adapter behavior changes.

## Chrome Web Store release notes

Internal build/release tooling simplification only. Runtime behavior, permissions and synchronized data formats are unchanged.

## GitHub release title

`MosaicSync 1.30.18.31`

## GitHub release description

MosaicSync 1.30.18.31 completes Step 5.5 by simplifying and hardening the deterministic build/package handoff without changing extension behavior.

All ZIP modes now share one deterministic writer, release packaging always rebuilds the canonical runtime before creating artifacts, and release-contract validation takes its expected version from the shared canonical VERSION rather than a duplicate tooling literal. The refactor was proven against 1.30.18.30 before the version bump: Firefox and Chromium release ZIPs remained byte-for-byte identical.

No product runtime algorithm or browser capability changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.31`

**Description:** Complete Step 5.5 with deterministic build/package simplification and stale-dist protection, with no product behavior change.
