# MosaicSync 1.30.18.16 publication notes

## Mozilla Developer Hub changelog

Boundary-hardening release for the new shared Firefox/Chromium background architecture. Adds production-runtime regressions for Firefox open-tab favicon cache lookup, real `tabs.onUpdated` favicon learning, and Chromium protected Chrome Web Store `_favicon` handling. The tests confirm existing production behavior is correct, including device-local automatic favicons and no new Sync favicon bytes. No product features, permissions, CSP or Sync/Recovery schema changes.

## Notes to Reviewer

This is a narrow test-hardening release on the accepted 1.30.18.15 shared-background architecture. New tests execute the generated production backgrounds with the real Firefox/Chrome adapters rather than stubbing the adapter seam: Firefox `tabs.query()` open-tab favicon cache, Firefox `tabs.onUpdated` expected-navigation-gated learning/marker cleanup, and Chromium protected Chrome Web Store `_favicon` plus placeholder-sentinel protection. Those regressions pass against the existing production implementation, so no favicon runtime logic was changed. No permission, CSP, state/meta/Sync/Recovery schema, telemetry, backend, Step-2 first-paint/cache/session, Frequently Visited persistence or browser-history privacy change.

## Chrome Web Store release notes

Reliability/testing update for the shared background architecture. Production-runtime coverage now protects browser-local favicon behavior across Firefox and Chromium, including Chrome Web Store `_favicon` safety. No new features or permissions.

## GitHub release title

`MosaicSync 1.30.18.16`

## GitHub release description

MosaicSync 1.30.18.16 is a narrow Step 3 boundary-hardening follow-up to the accepted 1.30.18.15 shared-background baseline.

The release adds production-runtime behavioral regressions that execute the real generated Firefox/Chrome backgrounds and adapters. Firefox coverage now proves open-tab favicon hydration through host-scoped `tabs.query()` without network fallback, and exercises the actual `tabs.onUpdated` → expected-navigation gate → favicon-learning path with durable/session marker cleanup. Chromium coverage proves protected Chrome Web Store pages continue to use browser-local `_favicon`, never fall back to protected remote favicon fetches, strip remote provenance, and reject the generic placeholder sentinel.

The new tests pass against the existing production favicon implementation, so no favicon runtime rewrite or corrective behavior change was required. Automatic/browser-learned favicon pixels remain device-local and absent from synchronized shortcut records.

No new product features, permissions, CSP, state/meta/Sync/Recovery schema, Step-2 first-paint/cache/session ownership, Frequently Visited persistence, telemetry or backend changes.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.18.16`

**Description:** Add production-runtime adapter-boundary regressions for Firefox favicon learning and Chromium protected `_favicon` behavior; no production favicon logic change.
