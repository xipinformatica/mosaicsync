# MosaicSync 1.33.0.31 QA / release-candidate checklist

1.33.0.31 is a single-feature discoverability release over 1.33.0.30. It adds a one-time, device-local folder gesture hint and deliberately changes no shortcut/folder mutation semantics, profile schema, Sync/Recovery wire format, permissions, CSP, browser floor or privacy boundary.

## Acceptance

- Hint eligibility requires at least six top-level shortcuts in the active Space, no folder in either Space, manual ordering, a visible/idle launcher, completed authoritative render, and no pending remote bootstrap.
- Recently opened order never shows the hint because drag is unavailable there.
- The hint lazy-loads only while its device-local flag is unset.
- The visual demonstration clones only the inner `.tile` into an inert, pointer-transparent overlay. It never clones `.shortcut-slot`, carries no `data-id`, and never changes the real launcher grid.
- The demonstrated flow is accurate: one shortcut ghost moves onto another and the copy tells the user to choose “Create folder”; no fake folder is created because production drag first opens the real two-choice popover.
- `prefers-reduced-motion: reduce` is checked in JavaScript; reduced-motion users get static callout/arrow/ring guidance with no WAAPI movement.
- Eligibility is revalidated immediately before mount. Interaction or layout/render changes cancel the demonstration rather than chasing stale geometry. Descendant artwork churn (favicon/preview replacement inside an existing tile) does not consume the one-time hint; only a direct shortcut-grid child replacement cancels it.
- The flag is stored only in `localStorage` as `mosaicsync.folder-hint.v1`; no `browser.storage`, Sync journal, clocks, Recovery data or profile export data are touched.
- Seeing a folder in either Space or reaching the real shortcut-on-shortcut drop choice permanently suppresses the hint.
- Multi-tab suppression uses the existing localStorage storage-event path; no locks or coordination protocol are introduced.
- All 33 reviewed locale catalogs include `folderDiscoveryTitle` and `folderDiscoveryBody`, preserving the `{action}` placeholder so the body names the localized existing `createFolder` action.

## Regression evidence

`tests/feature-133031.test.mjs` owns the feature contract. The first run against untouched 1.33.0.30 was red because the new module did not exist. A subsequent independent pre-publication audit found one blocking lifecycle bug and three narrow hardening opportunities; behavioral regressions were added before production changes and reproduced all four against the first 1.33.0.31 candidate:

- descendant favicon/preview mutations cancelled the mounted one-time hint because the grid observer watched the whole subtree; the final observer watches direct grid children only, so real re-renders still cancel while artwork hydration does not;
- interaction or explicit cancellation during the asynchronous lazy-stylesheet wait could allow a stale late mount; mount attempts now carry an invalidation generation and pre-mount interaction listeners remain authoritative across that wait;
- temporary eligibility failures could consume the page's one-shot pointer opportunity; retryable failures now reinstall pointer discovery, while structural failures such as too few shortcuts or Recently opened order remain disarmed until a meaningful later trigger;
- Manual-layout rows with very large empty gaps are no longer treated as visually adjacent tutorial pairs.

The permanent suite also asserts that motion animation touches overlay nodes only and animates compositor-friendly `transform`/`opacity` properties.

Final canonical evidence: Startup 285/285, New Tab 548/548, Sync 350/350, Recovery 225/225, Security 219/219, Browser/parity 272/272, Core 201/201, Release 457/457. The final release candidate must also pass reachability, syntax/JSON checks, deterministic build/package checks and clean archive inspection.

## Manual visual checks before publication

1. Manual order, six visible top-level shortcuts, no folders: move the pointer over the launcher, remain idle, verify the one-time ghost drag and readable callout.
2. Confirm the ghost is visually derived from shortcut A, target B gets the expected accent ring, real tiles never shift, and the callout explains the second real step (“Create folder”).
3. Interact during the delay and during the demonstration; it should cancel immediately without blocking the launcher.
4. Switch Space, resize/zoom, or cause a re-render while showing; the overlay should disappear cleanly.
5. Set Recently opened order; the hint must never appear.
6. Enable reduced motion at OS/browser level; only static guidance should appear.
7. Create a real folder or trigger the drop-choice popover; the hint must not return on later New Tabs on that device.
8. Open two visible MosaicSync windows before first display; at worst one harmless simultaneous display is acceptable, but once either writes the flag the other must suppress/cancel.
