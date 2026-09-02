# MosaicSync 1.24.14e QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.4`; Chrome exposes `version_name: "1.24.14e"` and Firefox must not contain `version_name`.
2. The first favicon pass remains latency-first: native/browser artwork or `/favicon.ico` can be shown provisionally without waiting for HTML/manifest parsing.
3. The first intentional quality follow-up is due immediately and does not consume a failure attempt; only unresolved follow-up retries use the normal 15s/60s/5m/30m backoff.
4. In every quality pass, `discoverPageIconInfo()` and declared candidate retrieval must occur before `probeConventionalFaviconQualityUpgrade()`. Guessed filenames must use the isolated post-discovery fallback deadline and can never starve authoritative metadata discovery.
5. Cross-host declared icons (for example a page whose touch icon is hosted on a static/CDN hostname) must be eligible when the existing all-sites Website Access permission is granted.
6. Authenticated deep links that redirect off-origin must still inspect the original public root before learning redirect-provider artwork.
7. Chrome `_favicon` remains a fast provisional browser-local fallback with unknown intrinsic quality. With an empty native cache and Website Access granted, a never-visited site must still resolve from network-declared artwork without requiring the user to visit it first.
8. Chrome may read `_favicon` without Website Access, but network discovery must continue to respect the optional host permission. No permission escalation or third-party favicon proxy is permitted.
9. The 1.24.14e upgrade must reset favicon recovery once for technical versions 1.24.14 through 1.24.14.3 so 1.24.14d learned artwork is reevaluated under the corrected ordering. User uploads remain untouched.
10. No domain-specific favicon mapping is permitted. Full Firefox/Chrome regression, parity, benchmark, syntax, archive-integrity and deterministic-package checks must pass.
