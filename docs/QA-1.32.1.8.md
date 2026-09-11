# MosaicSync 1.32.1.8 QA / release-candidate checklist

## Scope

Narrow Settings child-dialog ownership corrective over 1.32.1.7. No Normal Sync/Recovery data, wire-format, persisted-state schema, profile-format, permission, CSP or browser-floor changes.

## Corrective invariant

- A Settings-owned child dialog may become visible only while the same Settings ownership generation that launched it is still active.
- Closing Settings invalidates every in-flight asynchronous Custom Branding open, including work paused in secondary-style loading, module loading or device-local branding reads.
- Closing and reopening Settings creates a different ownership epoch; an older request cannot attach itself to the later panel.
- Device-local Custom Branding data remains local until ownership has been revalidated after every relevant await; stale reads cannot install a draft or open the modal.

## Permanent regressions

`tests/corrective-13218.test.mjs` covers closing Settings during delayed child preparation, close-and-reopen ownership replacement while branding data is still pending, and the explicit ownership-token contract. The three regressions were red 3/3 on untouched 1.32.1.7 before the production correction.

## Final automated verification

Full/focused tests, benchmark, size baseline, reachability, mechanical certification and clean-room artifact reproduction are recorded after the publication tree is frozen.
