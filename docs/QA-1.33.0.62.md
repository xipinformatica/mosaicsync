# MosaicSync 1.33.0.62 QA / release-candidate checklist

## Scope

Stage 2B-C1 only: profile-import atomicity in Settings and first-run Welcome. This release does not change normal shortcut saving, Sync/Recovery schemas, permissions, translations or backup file formats. Protected `DEVELOPER-GUIDE.md` SHA-256: `e18406e412a7ab2132d47aaa1511b305756e7944e51050b31459d753ca2e593e`.

## Baseline evidence

Independent Claude review of .61 found a naturally occurring mixed branding/layout outcome after closing a real Chromium tab: 2/25 interruption runs, 13 fully applied, 10 nothing applied. Real Chrome quota tests B3/B4 preserved all prior stored keys. An injected commit-then-reject was cosmetic and conditional. Claude recommended merging branding into the profile's existing storage.local.set; Firefox atomicity and second-device Sync remain unverified.

## Candidate requirements

1. Exactly one guarded storage.local.set must contain profile, assets, asset index, branding and pending Sync journal (if active); no preliminary branding write or rollback.
2. Reject-before-write, quota rejection and stale baseline preserve every existing durable key; commit-then-reject may report error but must never leave mixed profile/branding.
3. Both New Tab Settings and Welcome source resolution use the same atomic import path; normal user edits do not touch branding.
4. Real Chromium Settings import: B2/B3/B4/B13 remain safe, B6/B7 injected errors cannot produce mixed branding/layout, and at least 30 timed tab closes across small and large imports yield zero mixed outcomes.
5. Full tests, inventory, browser gate, deterministic package contracts and clean-room byte-compare all pass.
6. Independent reviewer evaluates actual source diff, real-browser evidence, and any untested cases before store release.

## Remaining gaps

Firefox-specific injected storage-failure tests, receiving-device Sync, whole-browser-process kill during an import and other Stage 2 data-integrity areas (folder/reorder/Settings failure handling) are not certified by this narrow change.

## Status

Private candidate until all acceptance evidence is complete. Do not publish based solely on local test success.
