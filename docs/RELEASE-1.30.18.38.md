# MosaicSync 1.30.18.38 publication notes

## Mozilla changelog

Post-M6 corrective release based on independent external code review. Fixes a Chromium Top Sites adapter-boundary leak in device favicon hydration and hardens cross-platform release smoke tooling. Sync, Recovery, permissions, schemas and product features are unchanged.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.38 is a narrow post-M6 corrective release, not a new refactoring or Maintenance Infrastructure phase.

An independent code-first audit of 1.30.18.37 identified one inherited LOW production issue: shared New Tab device-favicon hydration called `topSites.get()` with Firefox-specific `newtab` / `includeFavicon` / `limit` options even in the generated Chromium runtime. MosaicSync already had the correct platform abstraction. 1.30.18.38 changes that shared hydration call to the existing `getNativeTopSites({ limit: 100 })` adapter. Firefox therefore preserves its richer Top Sites call while Chromium uses `topSites.get()` without unsupported options.

The new regression was proven negatively against the untouched 1.30.18.37 source: a schema-strict generated Chromium mock observed one illegal options-bearing call and the new corrective suite failed. In 1.30.18.38 the same generated Chromium path throws on any such call and must complete with zero options-bearing Top Sites calls; Firefox's options path is positively preserved.

Two maintenance-tool findings are also corrected. The real Chromium smoke lane now treats Chrome for Testing or Chromium as supported unpacked-extension automation targets and rejects known branded Google Chrome command-line binaries, whose current releases no longer support this `--load-extension` testing contract. Node ESM filesystem roots in browser smoke/certification tests now use `fileURLToPath()` instead of URL `.pathname` for Windows-safe path handling.

No permissions, CSP, content scripts, host-permission model, persisted schema, Sync, Recovery, first-paint, Frequently Visited product policy, favicon storage/privacy policy, localization or user-data format is broadened or redesigned.

## Chrome Web Store release notes

Corrective maintenance release: fixes a Chromium Top Sites API adapter leak in native favicon hydration and improves automated release-smoke portability. No new feature, permission, privacy, Sync/Recovery or data-format change.

## GitHub release title

`MosaicSync 1.30.18.38`

## GitHub release description

MosaicSync 1.30.18.38 is the narrow post-M6 corrective release produced from independent external audit findings.

It routes native favicon Top Sites hydration through the existing Firefox/Chromium adapter, adds a schema-strict Chromium regression that fails on the 1.30.18.37 bug, rejects obsolete branded-Chrome command-line smoke targets in favor of Chrome for Testing / Chromium, and fixes Windows ESM file-URL path conversion in maintenance tooling.

This is not M7 and does not reopen generic architectural refactoring. Sync, Recovery, first paint, permissions, CSP, schemas and product features remain frozen.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.38`

**Description:** `Apply narrow post-M6 external-audit corrections for Chromium Top Sites adapter usage and browser-smoke portability; no architecture or feature redesign.`
