# ADR-009 — Frozen architecture is changed only for a concrete reason

**Status:** Accepted / frozen

## Decision

The production-architecture refinement program ended at 1.30.18.32. Future structural changes require a demonstrated bug, browser/platform requirement, security/privacy requirement, measurable maintenance problem, or separately approved product objective.

Large files, aesthetic preferences, newer patterns or a desire to continue cleanup are not sufficient reasons by themselves.

## Why

After the five-step program, the final forensic audit found no production defect and no further extraction/deletion justified by evidence. Additional refactoring now carries increasing regression risk and diminishing maintenance return.

## Do not casually change

Do not reopen frozen First Paint, Sync, Recovery, browser-boundary or New Tab orchestration work merely to reduce line count or introduce a fashionable abstraction.

## Evidence

- `docs/STEP-5.6-FINAL-FORENSIC-AUDIT.md`
- `docs/QA-1.30.18.32.md`
- `docs/MAINTENANCE-INFRASTRUCTURE.md`
