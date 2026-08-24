# MosaicSync 1.27.6 QA / artwork, cancellable favicon picker and edge-regression checklist

## Release identity
- [ ] Firefox manifest version = `1.27.6`.
- [ ] Chrome manifest version + `version_name` = `1.27.6`.
- [ ] Shared `VERSION`, visible Settings label, README, CHANGELOG, build manifest and package-size baseline = `1.27.6`.

## Shortcut artwork sizing
- [ ] Default 76 px tile uses 53 px contained artwork (~70%).
- [ ] 60 px and 96 px slider endpoints remain approximately 70%.
- [ ] Built-in top-level icons use 70% of the tile.
- [ ] Tile dimensions, grid density and the fixed label reservation are unchanged from 1.27.5.
- [ ] Cover mode remains 100% edge-to-edge.
- [ ] First paint and authoritative render use the same 53/76 ratio.

## Manual favicon discovery cancellation
- [ ] New Tab sends `mosaicsync:discover-favicon-choices` with a unique request ID.
- [ ] Closing/resetting the shortcut editor sends `mosaicsync:cancel-favicon-choices` for only the active request.
- [ ] Background worker owns the `AbortController`; no `AbortSignal` is passed through extension messaging.
- [ ] In-flight manual HTTP(S) favicon/page/manifest fetches abort when the matching request is cancelled.
- [ ] Cancelling one request cannot cancel another request ID.
- [ ] Late cancelled results cannot repopulate a closed/reopened editor.
- [ ] Automatic favicon resolver/ranking/winner/single-flight behavior remains unchanged.

## Favicon permission/cache bounds
- [ ] A cached candidate result exists, Website Access is revoked, then the next picker attempt returns permission-required and does not read the cached result.
- [ ] Per-result 400K and aggregate 800K retained-character bounds remain enforced.
- [ ] Aggregate-bound regression evicts the oldest entry rather than exceeding the cap.

## Public Suffix List
- [ ] Reviewed semantic rules/count/hash remain unchanged from 1.27.5.
- [ ] Source/runtime behavior agrees for exact/private/wildcard/exception/IDN cases plus IPv4, bracketed IPv6, localhost, single-label hosts and additional `kawasaki.jp` wildcard/exception cases.

## CSS / tooling
- [ ] CSS class-reference audit uses actual class-bearing HTML/JS contexts rather than arbitrary substring matches.
- [ ] No CSS selector is removed unless proven unreferenced.
- [ ] Missing `python3` produces an actionable package-size parity-test error.

## Compatibility / security
- [ ] No permission, host-permission or CSP changes from 1.27.5 except version identity.
- [ ] Local state schema remains 18 and Sync record schema remains 10.
- [ ] No telemetry, remote code or new remote service.
- [ ] Clean-source build reproduces both runtime ZIPs byte-for-byte.
