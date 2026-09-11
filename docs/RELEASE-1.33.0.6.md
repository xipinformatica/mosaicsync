# MosaicSync 1.33.0.6 publication notes

## Mozilla changelog

Continues Snow Leopard II Step 3 by moving the interaction-only Bookmarks dialog shell and dedicated controller out of ordinary New Tab startup. Bookmarks is materialized on first use while the browser Bookmarks API remains lazy. No permission, Sync/Recovery data-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.33.0.6 is Snow Leopard II Step 3B. The always-visible Bookmarks launcher button remains in the initial New Tab, but the Bookmarks dialog shell and `bookmarks-controller.js` are dynamically loaded only when that button is first used. The shell is created with DOM APIs only (`createElement`, `createElementNS`, `textContent`, explicit attributes); no executable HTML sink or remote markup is introduced.

After first use, the existing dedicated Bookmarks controller resumes ownership of button toggling, permission/search handling, close/reset lifecycle and folder-color menu. `core/bookmarks.js` remains lazy. Normal Sync, Recovery, storage authority and persisted schemas are unchanged.

## Chrome Web Store release notes

Reduces New Tab startup work by moving the Bookmarks dialog/controller behind first use while preserving the same Bookmarks behavior and permissions. No data-format changes.

## GitHub release title

`MosaicSync 1.33.0.6`

## GitHub release description

MosaicSync 1.33.0.6 continues **Snow Leopard II Step 3 — DOM/CSS/lazy secondary UI** with Step 3B.

The Bookmarks button remains part of the primary launcher, but the interaction-only Bookmarks dialog and its dedicated controller no longer need to be parsed, allocated, eagerly bound or statically evaluated on every New Tab.

On first Bookmarks use, MosaicSync loads secondary CSS, the Bookmarks controller and a safe programmatic dialog shell. The historical controller then owns the same button, permission/search controls, close/reset lifecycle and folder-color menu as before. The browser Bookmarks API module remains lazy.

Deterministic structural change versus 1.33.0.5:

- initial live DOM: **631 → 598 elements**
- secondary live elements: **523 → 490**
- eager ID bindings: **198 → 186**
- secondary eager bindings: **163 → 151**
- static New Tab module closure: **24 → 23 modules**
- static module source: **655,718 → 640,462 bytes**
- startup HTML: **52,027 → 49,564 bytes**
- combined startup HTML + static-module source: **−17,719 bytes**

The complete extension archive grows modestly because the safe deferred shell still ships. Snow Leopard II optimizes startup work, not package size.

Full suite: 1,186/1,186 PASS. Focused Startup: 189/189; New Tab: 420/420; Security: 146/146; Release: 289/289.

No new permissions, telemetry, remote code, persisted-state schema, profile format, Normal Sync/Recovery wire format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** Release MosaicSync 1.33.0.6 — lazy-load Bookmarks UI from New Tab startup

**Description:** Move the Bookmarks dialog shell and dedicated controller behind first use, reducing startup DOM, eager bindings and static module evaluation while preserving Bookmarks ownership and lazy browser API access.
