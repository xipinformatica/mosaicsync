# MosaicSync 1.33.0.30 publication notes

## AMO changelog

Improves Recovery safety when two devices manage old safety copies at the same time. Also fixes shortcut addresses such as `localhost:3000` / `example.com:8443` and avoids asking for website access when the shortcut address is invalid.

## Mozilla Notes to Reviewer

1.33.0.30 is a narrow corrective over 1.33.0.29. In `recovery-generation-lifecycle.js`, whole-device manual Recovery deletion now requires every target generation to have remained visible across multiple existing device-local GC observations before the target set can receive destructive authority; the frozen-plan + fresh-revalidation protocol remains in place. This specifically prevents a newly delivered target generation, including the survivor published during an opposite-device cleanup, from immediately joining a destructive whole-device plan. No Recovery/Sync wire-format or schema change is introduced.

`newtab/ui-utils.js` now distinguishes schemeless dotted-host/localhost/IPv6 + numeric-port input from real URI schemes, accepting common forms such as `localhost:3000` and `example.com:8443/path` while unsupported schemes remain rejected by the existing HTTP(S)-only navigation gate. `newtab.js` performs synchronous URL/destination validation before requesting optional all-sites permission and immediately attaches rejection handling to that permission Promise. Permanent behavioral coverage is in `tests/corrective-133030.test.mjs`, including the reproduced two-device Recovery interleaving and real blank-name save path.

No new permission, CSP, persisted profile schema, Sync/Recovery wire format, browser floor or privacy boundary is introduced.

## GitHub release title

`MosaicSync 1.33.0.30`

## GitHub release description

MosaicSync 1.33.0.30 is a focused safety and correctness update.

- Whole-device Recovery cleanup is more conservative when another device has a newly observed safety generation, preventing the reproduced opposite-device cleanup race from consuming that fresh survivor.
- Shortcut addresses such as `localhost:3000` and `example.com:8443/path` now normalize correctly without weakening rejection of unsupported URI schemes.
- Invalid shortcut addresses are rejected before MosaicSync asks for optional all-websites access.
- Permanent behavioral tests now execute the two-device Recovery interleaving and the real blank-name save path.

Normal Sync behavior, Recovery wire format, permissions and privacy boundaries are unchanged.
