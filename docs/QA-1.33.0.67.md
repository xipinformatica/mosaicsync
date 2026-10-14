# MosaicSync 1.33.0.67 QA / release-candidate checklist

**HOLD until independent audit, six GitHub checks, and real signed-in two-device Sync verification.** Built from the independently audited 1.33.0.66 source. No modifications to the protected Developer Guide.

1. In empty Personal and empty Work, inspect the dashed onboarding plus at 60, 76 and 96 px tile sizes, normal and high DPI, dark and light themes. The ink center should equal the tile center to within raster rounding.
2. In a populated Space, hover/focus an empty grid slot. Its ordinary plus should use the same geometry and remain visible under the original hover/focus rules.
3. Compare Inter, Windows Segoe UI, Liberation Sans and DejaVu Sans. Plus geometry must not depend on font family or weight. Compare both glyphs with the 1.33.0.66 baseline; preserve the visual character of a lightweight plus.
4. Verify click, Enter/Space, focus-visible outline, drag-and-drop cross-Space highlight and translated accessible button names in both browsers.
5. Confirm only New Tab HTML/CSS and shortcut-button DOM creation differ in runtime code from .66; Sync/Recovery/storage/deletion evidence and permissions byte-identical. No new inline styles, SVG files, network or font dependencies.
6. Run npm test, inventory, packaging and clean-room deterministic rebuild. Independently audit in real Chromium and Firefox when possible.
7. Six GitHub jobs and real signed-in two-device offline concurrent-edit test remain blocking release gates. Historical-device witness liveness remains a known limitation.
