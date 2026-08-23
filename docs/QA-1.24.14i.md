# MosaicSync 1.24.14i QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.8`; Chrome exposes `version_name: "1.24.14i"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14i`. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still receive the one-time favicon-quality repair; upgrades from 1.24.14g/h do not repeat it.
3. The 1.24.14h rule remains: clicked-tab favicon network discovery must run outside the serialized Sync/state queue, with only state preflight/commit serialized.
4. Proactive batch recovery must re-read current state before commit and the durable queue after networking. Deletion, URL changes, and disabling automatic site icons must invalidate stale results.
5. Proactive recovery is Space-aware: moving a shortcut between Personal and Work must not discard an otherwise valid in-flight recovery, and the shortcut's current Space controls `autoSiteIcons` eligibility.
6. An identical already-installed favicon is an unchanged success: no local-state write, no failure count, and no retry when the result is final.
7. The proactive batch engine is behaviorally covered on both Firefox and Chrome, including stale/deleted/disabled targets, same-URL shortcut isolation, post-network queue re-read, Space movement, and idempotent telemetry.
8. Clicked-tab favicon scheduler concurrency/coalescing is behaviorally tested rather than relying on constant-name/source-shape assertions.
9. Same-field concurrent settings edits with equal clocks converge deterministically regardless of arrival order. `chooseNewerRecord` ordering itself is unchanged.
10. No Sync schema, profile format, local-state schema, permission, CSP, or localization catalog changes are introduced by 1.24.14i.
