# MosaicSync 1.33.0.66 QA / release-candidate checklist

**PRIVATE HOLD pending independent visual audit and outstanding release gates.** Baseline: independently accepted .65 source ZIP SHA-256 `169adbbb9f5d9734f6b123fec2a7f62a61b9816a99dfe3a0a52c0044a6d7f775`.

1. In an empty Personal Space, inspect the dashed onboarding +. It should be optically centered in both axes at normal zoom; repeat in empty Work.
2. In a populated Space, hover a free grid slot: its regular + button must retain the .65 alignment and appearance.
3. Verify hover, focus, keyboard activation, drag-and-drop cross-Space target and accessibility labels remain unchanged.
4. Compare `.empty-ghost-tile span` CSS against .65: the only visual rule difference must be `translateY(-1px)` -> `translateY(-2.5px)`. No Space-specific selector changes.
5. Verify Sync safety and deletion evidence files byte-identical to .65; no permission or data-schema changes. Run full regression suite and check reproducible packages.
6. Before store publication, complete the six GitHub release checks and two real signed-in Chrome profiles' offline concurrent-edit convergence. Real Firefox testing remains open.

Known limitations inherited from .65: retired-device Sync waiting, witness-key cleanup, remote reset/deletion evidence review, real Firefox Sync verification. Do not treat this visual release as closing those issues.
