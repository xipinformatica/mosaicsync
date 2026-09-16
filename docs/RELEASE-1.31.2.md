# MosaicSync 1.31.2 publication notes

## Mozilla changelog

Documentation-only developer-handoff release. Adds a comprehensive source-only Developer Guide and a prominent README link so future maintainers can understand MosaicSync ownership, First Paint, Sync/Recovery, browser adapters, privacy boundaries, tests and release workflow before changing code. Apart from the required version identity bump, production behavior is unchanged from 1.31.1. No new features, permissions or data-format changes.

## Mozilla Notes to Reviewer

MosaicSync 1.31.2 is intentionally documentation-only over the frozen and audited 1.31.1 runtime. The source repository adds `DEVELOPER-GUIDE.md` at its root and links it prominently from `README.md`. The guide documents canonical source ownership, authoritative state versus disposable startup projections, First Paint, Normal Sync, reset authority, tombstones, Restore, Recovery, browser adapters, artwork/privacy boundaries, MV3 concurrency, testing, browser smoke, deterministic certification, packaging and frozen-architecture maintenance rules.

The only runtime-file differences are the required 1.31.1 -> 1.31.2 release/version identity strings. There are no production logic, feature, permission, host-permission, CSP, persisted-schema, Sync/Recovery wire-format, browser-floor or adapter-behavior changes.

## Chrome Web Store release notes

Documentation-only maintenance release. The source repository gains a comprehensive Developer Guide; installed extension behavior is unchanged from 1.31.1 apart from the version identity.

## GitHub release title

`MosaicSync 1.31.2`

## GitHub release description

MosaicSync 1.31.2 is the developer-handoff documentation release over the frozen 1.31.1 runtime. It adds a root-level `DEVELOPER-GUIDE.md` and a prominent README entry so a new maintainer can quickly understand the repository, First Paint, Sync/Reset/Restore/Recovery, browser boundaries, privacy invariants, permanent regression suite and deterministic release workflow. No production behavior, feature, permission, CSP, persisted schema or Sync/Recovery wire format changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.31.2`

**Description:** `Add the source-only Developer Guide and onboarding links without changing the frozen 1.31.1 runtime behavior.`
