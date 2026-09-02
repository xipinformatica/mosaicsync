# MosaicSync 1.24.14b QA contract

1.24.14b is a favicon-quality-only follow-up to 1.24.14.

Required invariants:

- The normal first-pass favicon resolver remains favicon-first and does not add `/icon.ico` requests.
- Only `preferQuality` retries with an existing low-resolution icon probe `/icon.ico`, `/favicon.svg`, `/favicon.png`, and `/apple-touch-icon.png`.
- The best measured candidate wins; a sufficiently large conventional icon may finish the retry before HTML/manifest discovery.
- No host/domain-specific favicon mapping is permitted.
- Remote fetches retain the existing bounded-fetch, MIME sniffing/rasterization, `credentials: "omit"`, no-referrer, CSP, and host-permission protections.
- Firefox and Chrome background implementations carry the same generic quality-upgrade behavior.
- All prior 1.24.14 tests, security/concurrency/profile/cache/localization tests, and build parity checks must remain green.
