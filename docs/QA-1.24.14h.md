# MosaicSync 1.24.14h QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.7`; Chrome exposes `version_name: "1.24.14h"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14h`. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still receive the one-time 1.24.14e favicon-quality repair; upgrading from 1.24.14g does not repeat it.
3. Click-triggered favicon learning must never hold the main serialized background queue while waiting on browser/native favicon resolution, remote favicon fetches, HTML/manifest discovery, redirects, or the 8-second quality resolver budget.
4. State and permission preflight remains serialized. Every favicon commit re-reads the latest local state and re-evaluates current eligible targets before calling the existing rebasing local write, so an in-flight network result cannot resurrect a deleted shortcut or overwrite unrelated concurrent edits.
5. Native/browser fallback behavior and the 1.24.14e declared-first quality resolver ordering are unchanged on both browsers. Chrome Web Store protected-page handling remains native-only.
6. Click-triggered favicon network work is separate from the state queue, capped at 3 concurrent jobs, bounded by `PENDING_NAVIGATION_MAX_ENTRIES`, and repeated update events for one tab coalesce to the newest tab snapshot.
7. Favicon-learning failures are best-effort device-local cache failures and must not persist a durable Sync error. Pending navigation is cleared only after at least one favicon candidate is successfully committed.
8. No user-facing strings, locale catalogs, permissions, CSP, Sync conflict semantics, profile format, persistent storage schema, or icon-recovery queue schema change.
9. Permanent regression tests must prove: (a) a deliberately stalled favicon network promise does not block another serialized state task; (b) commit-side target discovery re-reads current state and skips a shortcut removed while networking was in flight; (c) the separate job queue is concurrency-bounded and same-tab updates coalesce.
