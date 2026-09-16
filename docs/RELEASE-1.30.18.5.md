# MosaicSync 1.30.18.5 publication notes

## Mozilla Developer Hub changelog

Fixes the remaining first-paint Space-name flash by carrying personalized Space labels through the browser.session acceleration layer instead of briefly falling back to Personal/Work. Recovery cleanup now ages other devices from local observations rather than their wall clocks, and incomplete root-less fragments require multiple cleanup observations as well as the grace period before reclamation. Also adds end-to-end near-quota failure coverage. No ordinary Sync/profile schema, permission, CSP, telemetry or backend change.

## Notes to Reviewer

1.30.18.5 is a narrow corrective follow-up to 1.30.18.4. A real-device visual test showed that the synchronous first-frame Space bootstrap could be correct and then be briefly overwritten by the next browser.storage.session render snapshot, because that lightweight snapshot did not include both personalized Space names. The session render snapshot now carries sanitized Personal/Work custom labels and the disposable render-snapshot schema is advanced so older name-less session entries are rejected. This changes only a local acceleration cache; authoritative state and synchronized schemas are unchanged.

Recovery maintenance is also made less dependent on wall clocks. Other-device retention/cap aging now uses this installation's persisted sequence of GC observations of each recovery root instead of the publisher's `publishedAt`. Root-less chunk reclamation still uses a local wall-time grace, but now also requires two later GC observations; therefore a single forward clock correction cannot make the next cleanup delete a newly observed in-flight publication, while backward corrections restart the wall-time observation safely. The existing immutable-generation, root-last, quota-aware rotation and post-write verification design remains unchanged.

Regression coverage includes Firefox/Chrome session-speed Space-label preservation, clock-skewed remote recovery aging, forward-clock-jump orphan safety, and an integrated near-quota path where pre-retirement succeeds but the replacement root fails and one verified fallback must remain. No new user-facing strings, permissions, CSP changes, telemetry, remote code or backend are introduced.

## GitHub release title

`MosaicSync 1.30.18.5`

## GitHub release description

MosaicSync 1.30.18.5 closes the remaining personalized-Space first-paint flash by keeping custom Space labels consistent through every startup cache layer. It also makes recovery-device aging local-observation based, hardens abandoned-fragment cleanup against clock jumps, and adds integrated near-quota failure coverage while preserving the 1.30.18.4 favicon and recovery fixes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.5`

**Description:** `Finish Space first-paint continuity and harden recovery cleanup clocks.`
