# MosaicSync 1.33.0.20 publication notes

## Mozilla changelog

Narrow post-audit correctness corrective. Unchanged Sync reconciliation now requires complete live Personal + Work ledgers before it self-heals a missing current-device Recovery generation or clears a stale non-quota Sync error. Recovery fallback can still prove recoverability/continuity, but a torn live delivery can no longer masquerade as an authoritative healthy no-op. Complete live delivery still converges normally; explicit quota errors remain sticky. Regression coverage also hardens frozen Recovery cleanup targets, fail-closed survivor publication, device-local learned artwork and Shortcut Editor rapid-open ownership. No permission, schema, Sync/Recovery wire-format or browser-floor change.

## Mozilla Notes to Reviewer

1.33.0.20 is a narrow corrective over 1.33.0.19 and does not reopen Snow Leopard II. In `reconcileIfNewCommit()`, the existing `completeLiveRemoteDescriptor()` predicate now gates the two unchanged-reconcile side effects added in 1.33.0.19: missing-own-Recovery self-heal and stale non-quota error clearing. `completeRemoteDescriptor()` remains unchanged for fallback-assisted continuity/recoverability. Permanent browser-shaped regressions prove torn Personal/Work delivery cannot run either side effect, then prove both converge once complete live delivery arrives. Additional tests protect the frozen Recovery target-set invariant, abort destructive cleanup if the acting-device survivor cannot be published, keep web-learned artwork device-local, and strengthen different-intent Shortcut Editor reentrancy coverage. The historical `null has no properties` throw site remains unreproduced and no speculative null patch was added.

## Chrome Web Store

Corrects a torn-Sync delivery edge case so Recovery self-heal and stale generic error clearing happen only after complete live Personal + Work data is verified. Adds stronger Recovery, privacy and dialog-race regressions. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.20`

## GitHub release description

MosaicSync 1.33.0.20 is a narrow post-audit correctness corrective over 1.33.0.19. It fixes the confirmed completeness-boundary defect where fallback-assisted Recovery data could make an incomplete live Sync delivery look healthy enough to self-heal Recovery or clear a generic error. Those side effects now require complete live Personal + Work ledgers; once live delivery completes, the same no-op reconcile converges normally. The release also adds permanent regressions for frozen Recovery targets, fail-closed survivor publication, device-local learned artwork and different-intent Shortcut Editor rapid-open ownership. Normal Sync/Recovery wire formats, schemas, permissions, privacy boundaries and browser floors are unchanged; Snow Leopard II remains closed.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.20 — live-completeness Recovery/error corrective

**Description:** Require complete live Personal+Work Sync before unchanged-state Recovery self-heal or stale generic-error clearing, and add adversarial Recovery/privacy/dialog regressions without reopening Snow Leopard II.
