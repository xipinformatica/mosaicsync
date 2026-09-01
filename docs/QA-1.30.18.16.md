# MosaicSync 1.30.18.16 QA / release-candidate checklist

## Scope freeze

- [x] Starts from audited 1.30.18.15 commit `21d01a38f90ea1411eee6ec90ce134dc2090b744`.
- [x] No new product feature.
- [x] Step 2 first-paint/cache ownership remains frozen.
- [x] Production favicon policy remains unchanged unless the new behavioral tests expose a defect.
- [x] Intentional dual `permissions.onRemoved` listener topology remains unchanged.

## Step 3.1 adapter-boundary hardening

- [x] Firefox open-tab favicon recovery executes the generated production background and real Firefox adapter.
- [x] The open-tab fixture forces every network fallback to fail, proving the favicon came from `tabs.query()` / `favIconUrl` and the real adapter context.
- [x] Firefox `tabs.onUpdated` executes the durable expected-navigation → scheduled learning → real native adapter → device-local artwork path.
- [x] Chromium protected Chrome Web Store learning executes the real `_favicon` adapter path, strips remote source provenance and forbids remote favicon fetch.
- [x] Tests verify outcomes, not only source shape or adapter symbol presence.

## Preservation gates

- [x] No production background semantic rewrite is part of the planned patch.
- [x] Sync, Recovery, device attribution, alarms, mutation queues and persistence semantics remain owned by the shared core.
- [x] Firefox/Chrome adapter boundary remains capability-only.
- [x] No state/meta/Sync/Recovery schema change.
- [x] No permission or CSP change.
- [x] No telemetry/backend change.

## Automated/package gates

The release-certification build must complete all of the following before the artifacts are treated as final:

- [ ] Full automated suite passes from final versioned source.
- [ ] Performance benchmark passes.
- [ ] Package-size report reviewed.
- [ ] Firefox and Chrome deterministic runtime ZIPs generated and validated.
- [ ] GitHub-ready source archive generated and validated.
- [ ] Fresh extraction reruns the full test suite, benchmark and size checks.
- [ ] Fresh extraction rebuilds byte-for-byte identical Firefox/Chrome and GitHub-ready ZIPs.
- [ ] SHA-256 checksums recorded.

## Real-hardware acceptance

No new user-visible behavior is introduced. Normal Firefox/Chromium smoke testing remains appropriate before public publication, with particular attention to automatic favicon recovery after opening/visiting a shortcut.
