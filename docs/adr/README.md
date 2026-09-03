# MosaicSync Architecture Decision Records

These records preserve a small set of non-obvious decisions that future maintenance must not casually simplify away.

They are intentionally concise. `docs/ARCHITECTURE.md` remains the system map; ADRs explain *why* selected boundaries exist and what evidence must be reconsidered before changing them.

An ADR marked **Accepted / frozen** is not a ban on future change. It means a change needs a demonstrated bug, browser/platform requirement, security/privacy requirement, measurable maintenance problem, or separately approved product objective, plus regression evidence for the old invariant.

## Index

- [ADR-001 — Authoritative state is separate from disposable startup caches](ADR-001-authority-vs-startup-caches.md)
- [ADR-002 — Browser-derived artwork and Frequently Visited candidates stay device-local](ADR-002-device-local-browser-derived-data.md)
- [ADR-003 — One shared browser-neutral core with small explicit browser adapters](ADR-003-shared-core-browser-adapters.md)
- [ADR-004 — Recovery is a safety layer, not a second Sync algorithm](ADR-004-recovery-vs-normal-sync.md)
- [ADR-005 — Catastrophic Sync loss requires independent confirmation and durable restart grace](ADR-005-catastrophic-loss-confirmation.md)
- [ADR-006 — Intentional reset is authoritative and must not resurrect stale local state](ADR-006-intentional-reset-authority.md)
- [ADR-007 — Settings appearance preview is isolated while Settings is open](ADR-007-settings-appearance-isolation.md)
- [ADR-008 — Release artifacts come from a fresh deterministic build and full certification fails closed](ADR-008-deterministic-release-certification.md)
- [ADR-009 — Frozen architecture is changed only for a concrete reason](ADR-009-refactor-freeze-policy.md)
