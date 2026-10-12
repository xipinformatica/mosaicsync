# MosaicSync 1.33.0.58 publication notes

**Release candidate. Run the GitHub four-browser gate before publishing to AMO or the Chrome Web Store.**

## Changelog for Firefox / Chrome

- Stabilized automatic shortcut naming when a site redirects within its own approved host.
- Improved browser compatibility checks for new-tab onboarding, especially Chrome tab focus and Firefox New Tab automation.
- Kept strict redirect safety controls and offline-name fallbacks when a redirect cannot be verified.
- No new permissions, hosts, telemetry, stored-data formats, or migration.

## Firefox AMO Notes to Reviewer

This update from the last published MosaicSync version (1.33.0.49) **adds the `webRequest` API permission**, initially introduced in 1.33.0.56. It is used only to observe the `Location` response header for MosaicSync's own optional, user-initiated website-title lookup requests when a site redirects. It is not used to monitor general browsing, track visited sites, block network requests, or send telemetry. No new host permissions were added; website access remains optional and checked for each request.

Redirects are strictly limited to the same hostname (or www equivalent), the same port, and no HTTPS downgrade. Unverified/cross-host redirects are not followed. Fetch requests omit credentials and referrers and are bounded by a shared 4-second deadline. On unsupported browsers, MosaicSync keeps the safe offline website name.

No profile-data migration, Sync/Recovery change, translations, or background tracking was introduced. Production Firefox ID `mosaicsync@xipinformatica.cat` remains unchanged. Desktop only.

## Chrome Web Store — webRequest justification

Used solely for privacy-preserving automatic shortcut title naming. When a user adds a website and grants optional website access, MosaicSync correlates the response headers of its own temporary page-title request to confirm a safe same-host redirect. It never inspects general browsing activity, follows unknown redirects, or collects browsing history. No always-on host permissions or telemetry.

## GitHub release title

`MosaicSync 1.33.0.58`

## GitHub release comments

Chrome browser-gate Welcome-tab focus fixed; Firefox New Tab now uses its privileged browser command. Page-title redirect observers now remain registered for the lifetime of the extension background and wait briefly for an asynchronous response-header event, retaining strict same-host verification and fail-closed behavior. Tests now judge each redirect individually. Requires successful four-browser GitHub matrix before store publication.

## Publication gate

Mechanical regression and package checks must pass. Real browsers: Chromium 141, Chromium stable, Firefox 140, Firefox current. Local mechanics alone do not certify live browser behavior.
