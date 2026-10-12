# MosaicSync 1.33.0.56 QA / release-candidate checklist

Baseline: supplied 1.33.0.55. New scope: checked canonical title redirects and memory-only outcome diagnostics.

Node tests cover opaque manual responses, same-host/www canonical paths, cross-site rejection before contact, unsafe second hops, loops, limits, missing permission, cancellation, observer cleanup, foreign initiators and ambiguous observations. Existing editor race, post-save persistence, favicon, Sync and Recovery tests remain in the complete suite.

Required before publication:

- Four-browser GitHub gate on the exact final commit (Chromium 141/current, Firefox 140/current).
- Test newly created automatic shortcuts with website access enabled: elpais.com, elperiodico.com and elperiodic.ad, including Enter submission; confirm manual edits win over delayed enrichment.
- Test an update from the published extension, including permission handling for the new webRequest API permission.
- Review the updated privacy and reviewer notes; do not claim “no new permissions”.

Local focused results: all 14 new naming regressions pass. Deliberately removing the same-host restriction in an isolated copy causes three of those tests to fail. Real Chromium and Firefox launch attempts were made; Chromium was blocked at process-socket creation (`Operation not permitted`), while Firefox could not establish a usable Marionette session. Neither counts as a browser pass. The dedicated `tools/title-redirect-smoke.mjs` check is wired into every browser CI lane; its disposable test manifest pregrants website access but leaves production runtime bytes unchanged. It checks canonical redirect names, rejection before cross-host contact, loops, the shared deadline and diagnostics. It does not certify real upgrade/permission prompts.

The complete mechanical certification command is `npm run certify:mechanical`. It runs the entire suite without exclusions, validates release contracts and ZIPs, unpacks the source into a clean tree, rebuilds, reruns all tests and compares all three packages byte-for-byte. Exact artifact hashes and completed steps are emitted in `artifacts/certification-report.json` when run.

Node mocks and static assertions are not substitutes for native browser event/API verification or real-site behavior under the user's network conditions.
