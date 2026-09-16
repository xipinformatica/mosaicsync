# MosaicSync 1.33.0.5 publication notes

## Mozilla changelog

Process-only Snow Leopard II maintenance corrective: canonical Step-3A coverage now runs in the focused Startup and New Tab suites, and the critical-path census ignores HTML-looking strings inside raw script/style text when counting live DOM. Wallpaper Gallery runtime behavior is unchanged. No permission or data-format changes.

## Notes to Reviewer

1.33.0.5 changes developer/test tooling plus the normal release identity only. The canonical 1.33.0.4 dynamic Wallpaper Gallery implementation is unchanged.

The focused Startup/New Tab test groups now include the Step-3A regression file, and the developer-only critical-path census masks raw `<script>`/`<style>` contents before structural tag counting. The masking helper is not shipped as extension runtime code.

Normal Sync/Recovery, persisted schemas, permissions and browser floors are unchanged.

## Chrome Web Store release notes

Maintenance-only update to performance-audit and focused test tooling. No user-facing feature, permission, Sync/Recovery or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.5`

## GitHub release description

MosaicSync 1.33.0.5 is the process-only follow-up to canonical 1.33.0.4 (the requested ".4.1" corrective; Chromium requires a four-component technical version, so the unified valid release is 1.33.0.5).

It carries forward exactly two process improvements discovered while reconciling the parallel 1.33.0.4 siblings:

1. `tests/optimization-13304.test.mjs` is now part of both focused Startup and New Tab test groups, ensuring the canonical lazy Wallpaper Gallery contract is exercised during focused certification.
2. The developer-only critical-path census masks raw `<script>` and `<style>` contents before structural DOM counting, preventing HTML-looking strings inside raw-text elements from inflating live-DOM measurements.

The canonical production implementation remains the dynamic `newtab/wallpaper-gallery-shell.js` module from 1.33.0.4. Step 3 remains in progress and no Step-3B surface is added here.

No new permissions, telemetry, remote code, persisted-state schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.5 — harden Step-3A focused coverage and census tooling

**Description:** Add canonical Step-3A regression coverage to focused Startup/New Tab suites and make structural DOM census ignore raw script/style text, with no production behavior change.
