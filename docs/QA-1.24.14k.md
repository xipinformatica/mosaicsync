# MosaicSync 1.24.14k QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.10`; Chrome exposes `version_name: "1.24.14k"` and Firefox must not contain `version_name`.
2. `VERSION` is `1.24.14k`. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still receive the one-time favicon-quality repair.
3. Normalization must guarantee unique record IDs inside each workspace across top-level shortcuts, folders, and folder children before `flattenStateNormalized()` constructs the Sync `Map`.
4. Repairing an invalid duplicate ID must preserve all otherwise-valid records; Sync flattening must not silently collapse a shortcut/folder because another record reused its ID.
5. Profile import/export applies an additional profile-boundary repair across Personal and Work so a hostile/corrupt profile cannot leave the same record ID simultaneously ambiguous in both Spaces.
6. General Sync normalization must not globally rewrite equal IDs across Spaces, preserving existing cross-Space move/reconcile semantics; cross-Space duplicate repair is profile-boundary hardening only.
7. The 1.24.14j proactive favicon commit-failure behavior remains unchanged: transient atomic commit failure retains durable work with attempts/backoff and does not persist a false Sync error.
8. No Sync schema, profile format, local-state schema, permission, CSP, favicon discovery ordering, user-facing text, or localization catalog change is introduced by 1.24.14k.
