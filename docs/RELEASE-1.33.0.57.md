# MosaicSync 1.33.0.57 publication notes

This is a corrective release candidate based on the supplied GitHub-ready 1.33.0.56 source. **The new GitHub browser matrix has not yet been verified on this exact revision. Do not claim browser certification before the gate passes.**

## Firefox / Chrome version notes

Improves automated release checks for both browsers. Fixes Firefox CI cleanup and opens Firefox New Tab using a true browser keyboard shortcut. The Chrome test now waits for an in-page confirmation to finish closing before reopening it. Browser redirect-title checks distinguish positive observed redirects from browsers where the required response headers cannot be observed; the latter keep MosaicSync's safe hostname fallback and do not follow unverified URLs.

## Reviewer notes

Retains the required `webRequest` API permission introduced in 1.33.0.56. No new permissions, optional hosts, data types, background connectivity or telemetry were added in .57. Browser website permission remains optional; the test-only manifest pregrants it. Automatic shortcut naming only makes one bounded title lookup after an allowed action and never sends browser history.

A redirect is followed only when the original extension-origin GET can be correlated to a verified Location response header. Same-host/www only, no changed port, no HTTPS downgrade, no credentials, no referrer; shared four-second timeout and three-hop bound remain. When browser APIs do not expose those headers, the title lookup explicitly fails closed and MosaicSync retains its offline hostname title. No unsafe `redirect:follow` fallback is implemented. The feature's availability is browser-dependent and should not be presented as universally guaranteed.

No saved-profile migrations, Sync/Recovery changes or localizations were introduced. Production Firefox ID remains `mosaicsync@xipinformatica.cat`; desktop only.

## GitHub release title

`MosaicSync 1.33.0.57`

## Store release comments / changelog

- Reliability improvements for automatic browser compatibility checks, including Firefox New Tab and shortcut-deletion confirmation testing.
- Retains privacy-preserving automatic shortcut naming, which gracefully falls back to a website name if a redirect cannot be verified in your browser.
- No changes to saved layouts, Sync, Recovery, permissions or translations.

## Publication gate

See QA-1.33.0.57.md. Run the GitHub four-browser gate (Chromium 141/stable; Firefox 140/current) against the uploaded GitHub-ready source before publishing the browser store ZIPs. Never interpret a locally passing Node test as a real browser pass.
