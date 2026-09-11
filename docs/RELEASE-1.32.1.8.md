# MosaicSync 1.32.1.8 publication notes

## Mozilla changelog

Fixes a Settings lifecycle edge where Custom Branding could finish asynchronous preparation after Settings had already closed, allowing the child dialog to appear without its owning panel. Child opening now carries an explicit Settings ownership generation across every await, so stale work is discarded even if Settings closes and reopens before preparation completes. No permission, profile-format, persisted-schema, Sync/Recovery wire-format, CSP or browser-floor changes.

## Mozilla Notes to Reviewer

1.32.1.8 is a narrow New Tab Settings lifecycle corrective. It changes only ownership validation around asynchronous Custom Branding dialog preparation. Custom Branding remains device-local; Normal Sync/Recovery data and algorithms are unchanged. No new permissions, remote code, telemetry, schemas or browser-floor changes.

## Chrome Web Store release notes

Fixes a Settings child-dialog timing edge so delayed Custom Branding preparation cannot reopen after its owning Settings panel has closed. No permission or data-format changes.

## GitHub release title

`MosaicSync 1.32.1.8`

## GitHub release description

MosaicSync 1.32.1.8 is a narrow Settings child-dialog ownership corrective over 1.32.1.7.

The 1.32.1.5 unknown-unknowns audit found that `openCustomBrandingDialog()` crosses several asynchronous preparation boundaries before calling `showModal()`. If Settings closed while that work was pending, the old request could still finish later and display Custom Branding after its owning panel had disappeared. A close-and-reopen sequence was subtler still: checking only whether Settings was visible at the end would let an older request attach itself to a newer Settings session.

Custom Branding opening now captures the current Settings ownership generation before asynchronous preparation begins. Closing Settings advances that generation. Ownership and panel visibility are revalidated after secondary-style loading, module loading and the device-local branding read; the branding result stays local until the final ownership check succeeds. Stale work returns without installing a draft or showing the modal.

A permanent corrective regression was proven red 3/3 on untouched 1.32.1.7 and green after correction, including a close-and-reopen sequence that proves an old request cannot attach to a later Settings session.

No feature, permission, persisted-schema, profile-format, Normal Sync/Recovery wire-format, CSP or browser-floor changes.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.32.1.8 — bind delayed Custom Branding opening to Settings ownership`

**Description:** `Invalidate pending Custom Branding dialog preparation when Settings closes, revalidate ownership after every await, and prevent stale child work from attaching to a later Settings session.`
