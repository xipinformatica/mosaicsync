# MosaicSync 1.27.7 QA / favicon state-render consistency checklist

## Release identity
- [ ] Firefox manifest version = `1.27.7`.
- [ ] Chrome manifest version + `version_name` = `1.27.7`.
- [ ] Shared `VERSION`, visible New Tab version label, README, CHANGELOG and build manifest = `1.27.7`.

## Device-local artwork propagation
- [ ] Start with a shortcut showing the fallback letter and allow background favicon recovery to learn an icon without changing the shortcut core clock.
- [ ] The visible top-level tile updates to the learned favicon without opening Edit shortcut or reloading New Tab.
- [ ] Opening Edit shortcut shows the same artwork as the tile.
- [ ] Exact own `storage.local` write echoes remain harmless and do not trigger a Sync write or layout mutation.
- [ ] Folder mosaics and open folder contents still update when a child favicon changes.

## Choose detected favicon
- [ ] A shortcut that already has learned `favicon` artwork exposes that image as an available detected candidate.
- [ ] A browser-native `firefox` favicon can also be shown as an existing detected candidate.
- [ ] Uploaded artwork and built-in icons are never injected into the detected-favicon candidate list.
- [ ] Existing candidate pixels are deduplicated against newly discovered candidates.
- [ ] A successful website inspection with zero candidates still says `No additional site icons found.`
- [ ] A failed website-head inspection with no fallback candidate shows the localized inspection-failure status instead.
- [ ] Permission denial continues to show the existing Website Access message.
- [ ] Closing/resetting the editor still cancels only the matching manual discovery request.

## MosaicSync-style inline favicon fixture
- [ ] Page metadata containing a declared inline SVG and declared base64 PNG is parsed as favicon metadata.
- [ ] The declared PNG remains acceptable through the existing bounded image path.
- [ ] The fixture is test-only and is not packaged into Firefox/Chrome runtime ZIPs.

## Automatic favicon protection
- [ ] `resolveFaviconForUrl()` remains byte-for-byte identical to 1.27.6 in both browser editions.
- [ ] Automatic ranking, winner selection, quality mode, retry, fallback and single-flight semantics are unchanged.

## Compatibility / security
- [ ] No permission, host-permission or CSP changes from 1.27.6 except version identity.
- [ ] Local state schema remains 18 and Sync record schema remains 10.
- [ ] All 32 source locale catalogs have exact key parity.
- [ ] No telemetry, remote code or new remote service.
- [ ] Clean-source build reproduces both runtime ZIPs byte-for-byte.
