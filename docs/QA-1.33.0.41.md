# MosaicSync 1.33.0.41 QA / release-candidate checklist

## Acceptance and regression evidence

- Unmodified 1.33.0.40 with the new behavioral test added: 1/5 passing, 4/5 failing before cloud-publication case was added; failures reproduced poisoned current clocks, almost-exhausted current clocks, stale New Tab import authority, and concurrent persisted replacement.
- Fix regenerates usable stamps on explicit import, including both Spaces, fine-grained Settings and existing cross-Space namespace markers; plausible current/backup future clocks retain precedence.
- Ordinary `nextMutationTime()` still rejects exhausted clocks. Only user-directed import and its explicit authoritative publish use bounded recovery.
- New Tab rereads full persistent state after confirmation; any intervening persisted workspace change before the final write aborts inside the persistence transaction with no asset/journal/profile changes.
- Welcome's existing pre-import persistent reread remains intact.
- No state schema, Sync/Recovery wire format, permission, feature or privacy change.

## Final certification results

Full regression suite: **1424/1424 PASS** (including the corrective two-device Firefox/Chrome skewed-clock regressions). A controlled-concurrency clean-room run passed **1424/1424** and produced byte-identical release archives. The built-in unrestricted certification encountered two intermittent Chrome startup-preview failures during its clean-room retest (**1422/1424**); both passed independently and in the complete controlled-concurrency rerun. Real-browser smoke remains a separate release gate; report its results independently and do not treat generated-runtime or packaged contracts as browser smoke.
