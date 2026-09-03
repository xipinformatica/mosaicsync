# MosaicSync 1.30.18.35 publication notes

## Mozilla Developer Hub changelog

Completes Maintenance Infrastructure M3 by preserving MosaicSync's architectural knowledge in a permanent ownership map, concise decision records and a regression catalogue. Product behavior, permissions and data formats are unchanged.

## Notes to Reviewer

MosaicSync 1.30.18.35 begins from the validated 1.30.18.34 runtime and does not reopen the frozen 1.30.18.32 application architecture.

M3 is documentation/test infrastructure. The existing `docs/ARCHITECTURE.md` remains the single architecture ownership map and gains a short plain-English navigation layer. Nine concise ADRs under `docs/adr/` record the rationale and evidence behind non-obvious frozen choices such as disposable startup caches, device-local browser-derived data, shared browser-neutral ownership, Recovery separation, catastrophic-loss confirmation, reset authority, Settings appearance isolation, deterministic fail-closed certification and the post-refinement freeze policy.

`docs/REGRESSION-CATALOG.md` records ten high-value historical failure families and links each to permanent tests, including the withdrawn 1.30.18.26 New Tab startup regression. Four M3 integrity tests ensure the knowledge map stays linked, ADRs keep their decision/rationale/guardrail/evidence structure, and every referenced regression test exists.

The only extension-runtime edits are unified release identity. No startup, New Tab, Settings, Frequently Visited, favicon/artwork, storage, Sync, Recovery, permission, CSP, schema, locale or browser-adapter behavior changes.

## Chrome Web Store release notes

Maintenance documentation/test infrastructure only: preserves architecture decisions and historical regression knowledge around the frozen runtime. No feature, permission or synchronized-data-format change.

## GitHub release title

`MosaicSync 1.30.18.35`

## GitHub release description

MosaicSync 1.30.18.35 completes Maintenance Infrastructure M3 by turning the architectural knowledge accumulated during the refinement program into permanent project references.

The existing architecture document remains the canonical ownership map, nine concise ADRs preserve the rationale behind non-obvious frozen boundaries, and a regression catalogue connects major historical failures to the tests that prevent recurrence. The production runtime remains frozen apart from release identity.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.35`

**Description:** Preserve the frozen MosaicSync architecture through a canonical ownership map, concise ADRs and a permanent regression catalogue; no product behavior change.
