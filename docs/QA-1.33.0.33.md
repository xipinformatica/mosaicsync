# MosaicSync 1.33.0.33 QA / release-candidate checklist

1.33.0.33 is a narrow corrective over the published 1.33.0.32 folder-discovery demonstration. Production scope is limited to staged animation timing and motion-callout placement, plus release/test metadata.

## Acceptance

- The eight-animation motion sequence remains wholly inside the inert tutorial overlay.
- Web Animations iteration-level easing is absent or `linear`; non-linear curves are applied per keyframe segment so keyframe offsets retain wall-clock meaning.
- The ghost reaches the target no later than the fake choice popover begins appearing.
- The choice popover is fully visible for at least 900 ms.
- Every non-neutral “Create folder” pulse keyframe occurs while the choice popover is fully visible.
- The fake folder begins appearing only after the choice popover starts fading out.
- The fake opened-folder panel begins appearing after the fake folder begins appearing.
- With room above the demonstrated pair, the motion callout is measured after mount and placed above the pair rather than over the fake popover/panel.
- Reduced-motion behavior remains the 1.33.0.31/.32 static path with zero staged fake popover/folder animations.
- Existing 1.33.0.31 lifecycle protections and 1.33.0.32 state/DOM isolation protections remain green.
- No real shortcut/folder mutation, Sync/Recovery change, permission/CSP/schema change, new locale key or network activity.

## Red-before-green evidence

`tests/feature-133033.test.mjs` was added against the published 1.33.0.32 baseline before production changes. It initially passed 1/3 and failed exactly the two intended blockers: iteration-level non-linear easing and the callout remaining below/over the staged UI. After the corrective both tests pass, while the third group-ownership test remains green.

The final candidate must pass the full unique test inventory, all canonical groups, reachability, syntax/JSON checks, deterministic build/package checks and clean archive inspection before publication.

## Final mechanical evidence

- Full unique suite: 1363/1363 PASS across 193/193 test files.
- Canonical groups: Startup 285/285; New Tab 557/557; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 281/281; Core 201/201; Release 466/466.
- Reachability: 0 unreachable shared modules; 0 unused named imports; 0 unreferenced private functions.
- Syntax/data: 493 JS/MJS files pass `node --check`; 93 JSON files parse; 38 relative Markdown links resolve.
