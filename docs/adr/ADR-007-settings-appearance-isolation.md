# ADR-007 — Settings appearance preview is isolated while Settings is open

**Status:** Accepted / frozen

## Decision

While Settings is open, wallpaper/background/dim preview is rendered through the isolated appearance preview surface. The real full-page wallpaper/background/dim commit remains deferred until Settings closes. Lightweight canvas text/shadow presentation may follow the visible Light/Dark preview immediately.

## Why

Firefox/Linux exposed a compositor failure mode where repainting the real full-viewport page underneath the open Settings surface could leave Settings blank/white even though JavaScript continued running. The isolated preview restores live feedback without reintroducing that compositor risk.

## Do not casually change

Do not “simplify” the Settings-open guard by repainting `.page` directly. Do not defer canvas text/shadow presentation when the visible preview has already changed theme.

## Evidence

- `tests/stabilization-1265.test.mjs`
- `tests/corrective-1301811.test.mjs`
- `tests/snow-leopard-130.test.mjs`
- `docs/RELEASE-1.30.11.md`
