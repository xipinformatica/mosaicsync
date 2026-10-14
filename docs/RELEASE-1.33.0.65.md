# MosaicSync 1.33.0.65 publication notes

**PRIVATE CANDIDATE — DO NOT UPLOAD TO STORES OR GITHUB MAIN.** Based on the independently Chromium-accepted corrected 1.33.0.64 candidate, which itself contains the Stage 2D Sync repairs. Neither the .64 GitHub release gate nor signed-in two-device acceptance has been confirmed here.

## Store changelog (Firefox / Chrome)

- Displays an accurate **Waiting for another device** Sync status instead of incorrectly reporting **Sync ready** while a Space is still waiting for a coherent remote ledger.
- Keeps the waiting explanation visible when the other Space has synchronized successfully.
- Translates the waiting status and explanation in all 34 supported languages, including Catalan, Spanish and Italian.
- Includes the previous .64 candidate's independent Chromium-accepted Sync convergence, fingerprint, cross-Space isolation and deletion-evidence corrections.

No new browser permissions, telemetry, Sync wire fields, storage migrations or external services are introduced **by .65**. The inherited .64 repair-witness metadata and durable local deletion evidence remain unchanged.

## Firefox AMO Notes to Reviewer

MosaicSync 1.33.0.65 makes a targeted Sync status UI correction on top of the accepted .64 source. It preserves a waiting warning in the final per-Space reconciliation result and renders a localized waiting headline and detail whenever an initialized profile has `syncStatus=waiting`. Previously the healthy Space could clear the pending Space's warning, and the Settings panel could show the ready headline. The new messages have complete translations in all 34 UI locales. No changes were made to the cooperative witness quorum, deletion authority, Sync wire protocol, permissions or telemetry in this version.

The inherited .64 protocol includes safe cross-device ledger repair and durable deletion evidence; it remains subject to real signed-in Chrome/Firefox Sync verification. An old retired author or .63 peer can still leave its own Space waiting until an edit occurs. Firefox real-device verification is outstanding.

**Status:** Not independently accepted as .65. No final .65 GitHub release gate or real signed-in two-device test. Do not publish yet.

## GitHub release title

`MosaicSync 1.33.0.65`

## GitHub release comments

Stage 2E private candidate: truthful and localized Sync waiting UI, including preservation of the pending Space's explanation after a healthy Space reconciles. Carries forward the independently Chromium-accepted Stage 2D fixes from .64 unchanged. No new permissions, telemetry, migrations or Sync protocol modifications in .65.

## Publication gate

Independent real-Chromium waiting-state review (Personal and Work pending), 34-language UI review, full automated suite, reproducible packages, the six GitHub jobs on the exact final .65 source, and real signed-in two-device Sync convergence. HOLD until those gates are met.
