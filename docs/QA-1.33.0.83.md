# MosaicSync 1.33.0.83 QA / release-candidate checklist

**PRIVATE HOLD.** No GitHub changes or store submission authorized.

## Scope

Build directly from private 1.33.0.82, which itself is the approved 1.33.0.71 K1 production baseline plus the Clear Sync warning. Version .83 changes only favicon handling and release metadata: bounded rechecks after weak/failed audits, protection against automatic pixel-resolution downgrades (background queue and tab learning), and a one-time attempt to recheck weak automatic artwork on upgrade. No change to Sync/Recovery, permissions, telemetry, schemas, manually selected artwork, or Stage 3B.

## Regression gates

- Compare complete 1.33.0.82 source to .83; Sync and Recovery sources must remain byte-for-byte identical.
- Protected DEVELOPER-GUIDE.md SHA-256 `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e` remains exact.
- Run all baseline tests plus focused Chrome/Firefox Instagram-like background regressions, including red-before-green against .82; check test inventory and deterministic ZIPs from a clean-room source extraction.
- Independent audit, six GitHub release checks on the exact owner-approved commit and real signed-in two-device acceptance remain prerequisites for publication. **Real signed-in two-device test NOT PERFORMED here.**
- No verified browser-driver smoke available in this environment; do not treat simulated background results as signed-in two-device acceptance.

## Known limit

An offline peer can write old records before it learns of the reset; this may require explicit layout selection after reconnection. Warning is preventative UX, not a distributed atomic reset solution. Stage 3B .72–.81 is archived, unshipped, and intentionally absent.

## .83 focused favicon corrective

- Retains the .82 Clear Sync warning and 1.33.0.71 K1 background Sync/Recovery semantics.
- Rechecks weak automatically learned favicons once on upgrade from 1.33.0.70–.82 (only when existing Website Access is available); expired/low-quality checks retry after seven days.
- Prevents automatic favicon downgrades in queued and tab-visit learning; protects user-selected images. No protocol or new permission changes.
- Independent audit and real browser / two-device release gates remain pending.
