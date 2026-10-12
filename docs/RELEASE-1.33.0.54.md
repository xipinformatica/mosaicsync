# MosaicSync 1.33.0.54 publication notes

**Publication baseline:** 1.33.0.49 was the last public release. Versions 1.33.0.50–1.33.0.53 were internal development/review candidates, not store releases.

## Firefox Add-ons / Chrome Web Store release notes

Adding shortcuts is now quicker: enter a website address first and press Enter to save. **Automatic naming** suggests a readable website name without needing to type one; turn it off to choose your own name. More accurate website recognition and safer page-title suggestions reduce misleading names and unnecessary website requests.

Confirmation messages now appear directly in MosaicSync instead of browser pop-ups, including when deleting shortcuts. This works consistently in Firefox and Chrome, even if browser JavaScript dialogs have been blocked.

## Mozilla Notes to Reviewer

Compared with the published 1.33.0.49, the shared New Tab shortcut editor offers URL-first creation, automatic names and an in-page confirmation system. New shortcuts suggest a local hostname-based label without any network activity while the URL is being typed. If prior optional website access exists, leaving the URL field can trigger a bounded credential-free/no-referrer page-title lookup. It makes no extra permission request, refuses redirects, rejects misleading login/error/verification titles, ignores fake `<title>` elements in comments/scripts, and cancels/deduplicates unnecessary requests. Existing manually chosen names stay authoritative.

The URL input is first and initially focused. Automatic naming is on by default for new shortcuts, with the name displayed in a read-only (not disabled) field. Unchecking it permits manual name entry; editing an existing shortcut defaults to manual naming. Enter from the URL field submits without requesting a webpage title or moving focus to Name; a pending-save guard prevents duplicate submissions.

All ten native JavaScript confirm prompts in New Tab are replaced by one accessible, translated `<dialog>` overlay. This protects deletion, Recovery cleanup, import/replace, Sync actions and setup from Firefox/Chromium native dialog suppression. Cancel is focused by default, Escape/backdrop dismisses safely, confirmation messages use textContent (not HTML), concurrent confirmation requests fail closed, and deletion revalidates the current shortcut after asynchronous confirmation.

All 34 existing languages have the new automatic-naming text. Firefox and Chrome use identical shared UI code. No new permissions, telemetry, storage format, Sync/Recovery protocol, or favicon discovery changes were made. Automated tests cover the new behavior; GitHub Actions four-browser smoke exercises URL-first Enter and confirmation Cancel/Accept and must pass on the final published commit. Local browser-driver execution is not claimed.

## GitHub release title

`MosaicSync 1.33.0.54`

## GitHub release description

### What's new since 1.33.0.49

- **Faster shortcut creation:** Enter a website address first, then press Enter to save.
- **Automatic naming:** MosaicSync suggests the shortcut name. Uncheck the new option to type your own.
- **More reliable suggestions:** better recognition of websites and safer optional webpage-title lookup, with fewer unnecessary requests.
- **Confirmations that always work:** MosaicSync now shows its own localized confirmation dialogs instead of browser pop-ups, including for shortcut deletion.
- **Firefox and Chromium parity:** same experience across supported browsers; no new permissions or changes to Sync, Recovery or saved-data formats.

Versions 1.33.0.50–1.33.0.53 were unpublished development builds.

## 1.33.0.54 pre-publication audit corrections

- The optional name title fetch reads a bounded input without prematurely trusting `</head>` strings inside scripts, and title extraction discards unfinished raw-text regions through the input cap. Favicon HTML-head reader behavior is unchanged.
- Confirmations opened from Settings now keep Settings open when cancelled, accepted or dismissed with Escape.
- Real HTTP loopback and Settings event-order regressions are permanently added.
