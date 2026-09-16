# 1.24.9 optimization decisions

Implemented after 1.24.8 passed Firefox and Chrome testing:

- lower-allocation Sync comparisons and write detection;
- normalized-state fast paths in background reconciliation;
- development-only timing marks for reconciliation and favicon recovery;
- additional Firefox/Chrome source consolidation through adapters.

Measured and deliberately not implemented:

- visible-only shortcut hydration: active-Space hydration is already effectively negligible in the 200-shortcut fixture and placeholders would worsen visual stability;
- aggressive service-worker dynamic splitting: no demonstrated startup cost justified changing event-loading semantics;
- wallpaper decode eviction: current preload lifetime is bounded and preserves flash-free Space switching;
- broad CSS rewrites: visual-regression risk exceeds the small expected parse benefit.

Still explicitly rejected: framework/Zustand migration, TypeScript conversion for its own sake, manual Sync-conflict dialogs, Sync-health dashboards, or another storage-format rewrite without a demonstrated need.
