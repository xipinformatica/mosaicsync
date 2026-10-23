# MosaicSync 1.33.0.84 publication notes

**PRIVATE STABLE CANDIDATE — NOT APPROVED FOR PUBLICATION.**

## GitHub release title

`MosaicSync 1.33.0.84`

## Proposed simple store changelog (cumulative since last confirmed public 1.33.0.63)

- Makes synchronization and recovery more reliable, especially when computers reconnect after a Sync reset or receive changes out of order.
- Improves the safety of keeping local changes and avoids accepting incomplete Personal and Work layouts.
- Adds a clearer warning before clearing the synchronized copy: update and connect your other computers and let them finish syncing first.
- Improves automatic website icons: blurry results can recover sooner after temporary website errors, and sharp icons are protected against accidental downgrade.
- Includes small accessibility improvements. No tracking, new permissions, or new account requirements.

**Known limitation:** If another computer remains offline through a Sync reset, it may need you to choose which layout to keep when it reconnects. Export a backup first. This situation is not claimed fixed by 1.33.0.84.

## .84 corrective details for reviewers

- Chrome native cached favicons are canvas-rendered at 128 px without an originating site-image URL, so their canvas dimensions are not proof of actual image sharpness. Corrected automatic selection permits real site-provided artwork to replace these thumbnails.
- Earlier 1.33.0.x installations, including experimental .83, may recheck existing weak automatically learned icons once after upgrading where Website Access is available. Manual uploads and explicit icon choices remain unchanged.
- This is the only executable behavior change relative to .83 (plus the eligibility threshold). The code changes are favicon-only in the background.

## Mozilla reviewer notes

1.33.0.84 is based on the private 1.33.0.83 source (itself derived from independently audited 1.33.0.71 K1). The Clear Sync warning and all 34 translations are retained. The production Sync/Recovery code, permissions and schemas are unchanged. Only `background-core.js` favicon audit/learning paths are updated: incomplete or poor-quality discoveries receive seven-day rechecks, known sharper automatically learned pixels cannot be overwritten by fewer pixels, and existing weak automatic favicons are rechecked once following an upgrade from earlier 1.33.0.x versions (including public .63 and private .83) where Website Access is available. Explicit user-selected uploads/picker selections are excluded. No new network permission, ongoing polling, storage schema or Stage 3B code.

Require independent exact-package audit, six GitHub release jobs for the exact owner-approved commit, and real signed-in Chrome/Firefox two-device reset tests (or mark NOT PERFORMED). **Private HOLD; no publication authorization.**

## .83 favicon foundation retained in .84

- Retains the .82 Clear Sync warning and 1.33.0.71 K1 background Sync/Recovery semantics.
- Rechecks weak automatically learned favicons once on upgrade from earlier 1.33.0.x versions (including public .63 and private .83) (only when existing Website Access is available); expired/low-quality checks retry after seven days.
- Prevents automatic favicon downgrades in queued and tab-visit learning; protects user-selected images. No protocol or new permission changes.
- Independent audit and real browser / two-device release gates remain pending.
