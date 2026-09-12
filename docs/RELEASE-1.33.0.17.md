# MosaicSync 1.33.0.17 publication notes

## Mozilla changelog

Completes Snow Leopard II Step 7 — runtime loading/dead work. MosaicSync keeps the parser-time `builtin-icons.js` helper required by first paint, but removes the duplicate static import from the main New Tab ES-module graph. The eager New Tab module closure falls from 23 to 22 modules (644,249 → 640,098 raw source bytes) with first-paint behavior unchanged. Reachability remains clean with no high-confidence unreachable shared modules, unused named imports or unreferenced private functions. No permission, Sync/Recovery format, schema, network, CSP or browser-floor change.

## Notes to Reviewer

1.33.0.17 changes one runtime-loading edge only. `newtab.html` still loads `builtin-icons.js` as a classic parser-time helper before `render-bootstrap.js`, because the first-paint renderer needs `globalThis.__mosaicsyncBuiltinIcons`. The main `newtab.js` no longer also imports that same idempotent file as an ES module. Module scripts are deferred by default, so the classic owner is already installed before the authoritative module body executes; the former module evaluation could only hit the helper's existing-global early return. No Sync, Recovery, storage, permission or destructive-authority code changes.

## Chrome Web Store release notes

Removes one duplicate New Tab startup-module evaluation while preserving the existing first-paint icon helper. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.33.0.17`

## GitHub release description

MosaicSync 1.33.0.17 completes **Snow Leopard II Step 7 — runtime loading/dead work**.

The Step-7 audit found no high-confidence unreachable shared module, unused named import or unreferenced private function. It did find one duplicated startup edge: `builtin-icons.js` must remain a classic parser-time helper so `render-bootstrap.js` can draw built-in shortcut glyphs during first paint, but `newtab.js` also statically imported the same file into the main ES-module graph. Because the helper is idempotent and already installed globally before deferred module execution, that second evaluation performed no useful work.

1.33.0.17 removes only that duplicate module edge:

- static New Tab closure: **23 → 22 modules**;
- raw static-module source: **644,249 → 640,098 bytes**;
- parser-time classic scripts: **unchanged at 9 / 28,892 bytes**;
- post-change reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**.

Defensive/reference exports and explicit test hooks remain intentionally retained. No additional deletion or lazy-loading boundary was accepted where the complexity cost exceeded the measured benefit.

No Sync, Recovery, pending-journal, permission, storage schema, profile format, network, CSP, privacy-boundary or browser-floor change.

Step 7 is closed. **Step 8 — final Snow Leopard II freeze and adversarial performance/correctness audit — is next.**

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.17 — close Snow Leopard II Step 7

**Description:** Remove the duplicate built-in-icon ES-module startup edge while preserving the classic first-paint helper; static New Tab closure falls 23→22 modules and Step 7 closes with clean reachability.
