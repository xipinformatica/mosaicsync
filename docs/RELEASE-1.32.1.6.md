# MosaicSync 1.32.1.6 publication notes

## Mozilla changelog

Fixes a New Tab concurrency race where a delayed Personal/Work Space hydration could replace a newer authoritative state and put the next local edit at risk of overwriting an unrelated concurrent change. Space switching and drag previews now discard stale asynchronous hydration and retry from current state. No permission, profile-format, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.6 is a narrow New Tab concurrency corrective. It changes only ownership/revalidation around asynchronous Space local-asset hydration and destination-background preload. Normal Sync/Recovery data, algorithms and wire formats are unchanged. No new permissions, remote code, telemetry, schemas or browser-floor changes.

## Chrome Web Store release notes

Fixes a rare Space-switch concurrency race so delayed local-asset loading cannot replace a newer state update before the next edit. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.32.1.6`

## GitHub release description

MosaicSync 1.32.1.6 is a narrow concurrency corrective over 1.32.1.5.

An adversarial scheduler audit found that a Personal/Work switch could begin device-local asset hydration from one state, receive a newer authoritative storage update while awaiting, and then resume by assigning the older hydrated result. That could leave live state derived from the older snapshot while the optimistic write baseline already represented the newer authority; the next user edit could therefore persist stale workspace contents without triggering the intended rebase.

Space hydration is now owned by the current UI operation and state generation. Hydrated candidates remain local until ownership and authority are revalidated after each relevant await. If authority changes, MosaicSync retries hydration from current state. If the Space switch or drag preview is superseded, the old result is discarded. The same protection covers destination-background preload and drag-preview teardown.

A permanent adversarial regression was proven red 3/3 on 1.32.1.5 and green after correction. It injects a concurrent authoritative shortcut during delayed hydration and proves that shortcut survives the next local save.

No feature, permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.6 — guard Space hydration against stale authority`

**Description:** `Prevent delayed Space-switch/drag hydration from replacing newer authoritative state; retry from current state and preserve concurrent edits through the next save.`
