# MosaicSync 1.33.0.68 QA / release-candidate checklist

**PRIVATE — HOLD for independent accessibility re-audit, exact-candidate GitHub release gate and real signed-in multi-device Sync.**

1. Verify 1.33.0.67 to 1.33.0.68 runtime diff is CSS-only plus version identity. Sync, storage, Recovery, permissions, and all 34 translations must be byte-identical.
2. In real Chromium, test forced-colours mode: empty Personal +, empty Work +, populated-grid + must remain visible, unlike the original .67 candidate.
3. Compare normal dark/light rendering to .67. Preserve 22x22 plus geometry, font independence, and centering at 60, 61, 76, 77 and 96px tile sizes and at 100%–200% display scaling.
4. Check real keyboard Enter/Space, accessible names, focus rings, click, hover, cross-Space drag target and ordinary grid slot behavior.
5. Verify the startup CSS remains under its existing 36,500-byte budget; do not raise the threshold just to pass.
6. Run npm test, test inventory, clean-room build, deterministic Firefox/Chrome/GitHub packaging and package-size baseline.
7. Run six GitHub jobs on the exact release commit and real two-device offline/concurrent Sync test before store publication.
