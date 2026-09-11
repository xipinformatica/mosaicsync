# MosaicSync 1.33.0.4 QA / release-candidate checklist

## Scope

Snow Leopard II Step 3A only: validate one lazy secondary-UI boundary by moving the Settings-owned Wallpaper Gallery shell out of startup HTML/eager wiring without changing wallpaper behavior, Settings ownership, Sync/Recovery semantics or permissions.

## Production changes

- `newtab.html` no longer contains the Wallpaper Gallery `<dialog>` shell.
- New deferred `newtab/wallpaper-gallery-shell.js` constructs the 11-element shell only on first use.
- `newtab.js` replaces the two eager gallery ID lookups with lazy references and a dynamic import.
- Lazy open captures the current Settings ownership generation, awaits secondary styles/shell construction, and refuses to show if Settings closed or reopened meanwhile.
- Dynamically-created close/backdrop controls bind at mount time rather than relying on the startup-only `[data-close-dialog]` scan.

## Permanent coverage

- `tests/optimization-13304.test.mjs`
  - gallery shell absent from initial HTML;
  - deferred-module / no-eager-lookup contract;
  - Settings ownership revalidation across lazy load;
  - structural census reduction;
  - dynamic close/backdrop wiring.
- The Step-3A regression file was demonstrated red **5/5** on untouched 1.33.0.3 and green after implementation.

## Structural evidence

Canonical JSON: `docs/SNOW-LEOPARD-II-STEP3A-1.33.0.4.json`.

- Initial live DOM: **642 → 631** elements.
- Secondary Settings/dialog live DOM: **534 → 523** elements.
- Eager ID bindings: **200 → 198**.
- Secondary eager bindings: **165 → 163**.
- Wallpaper Gallery shell: **11 elements / 3 IDs** moved behind first use.
- Combined initial HTML + static module source: **707,873 → 707,745 bytes** (−128 bytes); the ~3.1 KB gallery constructor is deferred off startup.

This is intentionally a pilot slice. Step 3 remains in progress.

## Final verification

- Full release-authoritative suite: **1,176/1,176 PASS**.
- New Tab group: **407/407 PASS**.
- Startup group: **176/176 PASS**.
- Release group: **279/279 PASS**.
- Runtime reachability: no high-confidence unreachable shared modules, unused named imports or unreferenced private functions.
- Package size: Firefox **2,411,733 raw / 704,606 deflated bytes**; Chromium **2,433,375 raw / 719,121 deflated bytes**.
- Browser probe: Chromium and Xvfb available; ChromeDriver absent; Firefox and GeckoDriver absent. Real-browser timing/smoke therefore remains unavailable and is not claimed.
- Deterministic packaging and clean-room reproduction: **PASS**. A fresh extraction of the GitHub-ready ZIP rebuilt, passed all 1,176 tests and reproduced the Firefox, Chrome, source ZIP and build manifest byte-for-byte before final QA wording was sealed; the final source ZIP is reverified below.
