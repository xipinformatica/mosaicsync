# MosaicSync 1.24.14m2 QA

## Scope

Visual-only Donate mascot pill rasterization fix on top of 1.24.14m1. No Sync/storage/profile/permission/schema/localization/favicons/security behavior changes.

## Required checks

- Firefox and Chrome Settings “Thank you!” pill has no bright midpoint pixels on the rounded left/right edges.
- Welcome Donate “Thank you!” pill uses the same anti-aliased inset ring.
- Pill geometry, position, hover/focus animation, mascot wave and localized text are unchanged.
- Light and dark appearances retain a 1 px visual ring without a physical CSS border.
- Technical manifest version is `1.24.14.14`; Chrome exposes `version_name: 1.24.14m2`; Firefox has no `version_name`.
- Full automated regression suite passes before packaging.

## Final verification

- Automated regression suite: **138/138 passing**.
- Benchmark completed successfully after the visual-only change; no hot-path runtime code changed.
- Build manifest regenerated from the final Firefox and Chrome trees.
