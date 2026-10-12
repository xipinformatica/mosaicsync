# MosaicSync 1.33.0.60 publication notes

## Store changelog (Firefox / Chrome)

- Corrects automated release validation on fresh Firefox profiles when the New Tab switches to the initial Welcome page.
- Improves GitHub Actions browser-failure logging and diagnostic evidence.
- Preserves secure, bounded automatic website title detection and browser compatibility improvements from 1.33.0.59.
- No new features, permissions, telemetry, storage schema, translations, or changes to Sync/Recovery.

## Firefox reviewer notes

Corrective release. Compared with last published 1.33.0.49, the current manifest includes the `webRequest` API permission (added in 1.33.0.56) to verify response headers only during MosaicSync-initiated optional website-title lookups. Listeners register on demand and are removed after five seconds of inactivity; unrelated events delivered briefly during that window are ignored and not saved or transmitted. Host access remains optional and gated. No always-on host permissions, tracking or telemetry. This version only changes release-test instrumentation and version metadata relative to 1.33.0.59. The source retains the same permission set and storage/Sync/Recovery behavior.

## GitHub release title

`MosaicSync 1.33.0.60`

## GitHub release comments

Fixes the Firefox fresh-profile browser-gate timing race that could query a New Tab just as first-run onboarding redirects it to the Welcome page. Adds durable browser test diagnostics to the GitHub evidence artifacts. The Chrome and Firefox runtime logic and security features from 1.33.0.59 are otherwise unchanged. Requires a successful full four-browser GitHub release gate before store publication.

## Publication gate

All mechanical regression, package, release-contract and clean-source rebuild checks must pass, plus native browser jobs on Chromium 141, Chromium stable, Firefox 140 and Firefox current. Mechanical tests alone do not certify the native-browser result.
