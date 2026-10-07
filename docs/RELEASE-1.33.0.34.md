# MosaicSync 1.33.0.34 publication notes

## AMO / Chrome Web Store changelog

Reduces repeated image work when several New Tabs react to the same saved-state change. Artwork that a tab has already verified can now be reused without reading and validating the same unchanged image again.

## Mozilla Notes to Reviewer

1.33.0.34 is a narrow storage/read-path performance refinement over 1.33.0.33.

MosaicSync stores device-local artwork under content-addressed `storage.local` keys. Before this release, every persisted-state change caused each open New Tab to re-read and fully validate every referenced active-Space asset, including unchanged favicons and wallpaper. Validation includes raster validation and content-ID hashing, so the repeated work scaled with both image count/size and the number of open New Tabs.

The read path now reuses an exact asset ID/value pair only after that same JavaScript context has already read and successfully validated it. First encounters and genuinely new IDs still perform the authoritative `storage.local` read and full validation. Cached verified bytes are also inserted into the existing normalization memo so the same image is not re-hashed later in that hydration pass.

This change does not alter the persisted asset format, asset IDs, write locking, write-path collision detection/repair, Sync, Recovery, permissions, CSP, profile schema, telemetry, network behavior or browser floors. The verified cache is not newly pruned in this release; cache-retention work is intentionally deferred to a separate follow-up.

Permanent behavioral protection is in `tests/optimization-133034.test.mjs`. The regression proves that first hydration validates all referenced assets, a later state containing one new asset reads only that new ID, and an identical later state performs no asset read while still hydrating the correct artwork.

The Developer Guide also received documentation-only cleanup so it remains an evergreen architecture/development guide rather than accumulating version-labelled release-history sections.

## GitHub release title

`MosaicSync 1.33.0.34`

## GitHub release description

MosaicSync 1.33.0.34 reduces repeated local image work after saved-state changes.

- Unchanged favicons and wallpapers already verified by the current New Tab can be reused without another storage read, decode and content hash.
- New artwork still goes through the full validation path.
- Existing content-collision, corruption, Sync and Recovery protections are unchanged.
- The Developer Guide was cleaned up to keep release history out of the evergreen architecture documentation.

No new feature, permission, CSP, profile-schema or Sync/Recovery-format change is included.

## Final certification

Full unique suite: 1365/1365 PASS across 194/194 test files. Canonical groups: Startup 285/285; New Tab 559/559; Sync 350/350; Recovery 225/225; Security 219/219; Browser/parity 281/281; Core 203/203; Release 468/468. Reachability, syntax/JSON/link checks and deterministic packaging are clean in the sealed artifacts.
