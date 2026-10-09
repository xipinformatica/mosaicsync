# MosaicSync 1.33.0.42 QA / release-candidate checklist

## Requirements

- Welcome: profile candidate remains memory-only until local source is chosen; baseline survives Sync-choice delay; concurrent changes abort under the existing local storage write transaction, and no asset/journal/profile/branding residue remains.
- New Tab: keep previous explicit-import guard and present a localized retry explanation for the existing conflict code.
- Credential-containing URL policy: new shortcuts, native Firefox imports, bookmark drag-to-shortcut and Frequently Visited shortcut authoring fail closed; read-only browser bookmark search/display and explicit native browser-bookmark creation remain available, while previously stored shortcuts are neither erased nor migrated silently.
- Retain 1.33.0.41 two-device skewed-clock convergence and poisoned-clock recovery regression coverage.
- No new permissions or schema changes.

## Claude GO follow-up: B-1/B-2/B-3 same-version corrective

- B-1: credential-bearing HTTP(S) browser bookmarks stay visible in MosaicSync's browser-bookmark UI and can be created as ordinary browser bookmarks, but cannot be turned into a new MosaicSync shortcut (including drag/drop).
- B-2: `normalizeShortcutUrl` now throws the exact English i18n catalog string, so both Frequently Visited toast paths translate correctly without an additional bespoke catch.
- B-3: when an invalidated profile is rejected by the Welcome local-source resolution action, discard the staged candidate and return to source selection; retry must load the file anew, and the stale operation may not modify durable layout/branding/preferences/Sync journals.
- Three new behavioral tests fail on the originally submitted 1.33.0.42 and pass on this corrective. Full inherited suite: **1,431/1,431 PASS** (working tree).

## Certification

Run the focused new regression file, full inherited suite (including cross-device Sync), runtime reachability, package contracts, package-size census, and deterministic independent rebuild. Browser smoke remains separate and must not be claimed if drivers are unavailable.

## Deferred

- Existing credential-containing shortcuts and poisoned historical cloud peers require an explicitly designed migration/recovery policy; they are not silently modified here.
- Audit the four remaining raw save-error UI paths in a dedicated step rather than globally replacing every error.message.
