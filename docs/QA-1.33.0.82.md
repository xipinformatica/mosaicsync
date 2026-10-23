# MosaicSync 1.33.0.82 QA / release-candidate checklist

**PRIVATE HOLD.** No GitHub changes or store submission authorized.

## Scope

Start from approved .71 K1. Only update version identity, add the warning inside the existing Clear Sync confirmation, translate it in all 34 source UI catalogs, and add corrective tests, documentation and a size baseline. No Stage 3B generation protocol or new Sync storage reads.

## Regression gates

- Source SHA-256 must match `882c573dcf268f9adabac490f1800edba0d1e7ae9eb9ab6d6e30f711e0cfec46` for the baseline .71 K1 ZIP.
- Protected DEVELOPER-GUIDE.md SHA-256 `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e` must remain exact.
- Entire existing 1,658-test K1 suite and new warning tests must pass, with inventory, deterministic ZIPs and clean-room rebuild.
- Live production background and all storage formats must remain byte-for-byte identical with K1 apart from generated release identity where applicable.
- Real signed-in two-device tests (Chrome first, then Firefox) including offline during Clear Sync, reconciliation, pending local edits, mixed versions, and post-reset explicit layout selection. **NOT PERFORMED in this candidate-building environment unless separate real-device evidence is supplied.**
- Six GitHub browser release jobs on the exact commit after the owner chooses to push, plus independent adversarial audit.

## Known limit

An offline peer can write old records before it learns of the reset; this may require explicit layout selection after reconnection. Warning is preventative UX, not a distributed atomic reset solution. Stage 3B .72–.81 is archived, unshipped, and intentionally absent.
