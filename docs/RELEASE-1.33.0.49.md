# MosaicSync 1.33.0.49 publication notes

## Firefox Add-ons / Chrome Web Store release notes

Improved automatic favicon quality selection for many websites, while retaining quick icons and manual choices. Added full Ukrainian language support. No new permissions.

## Mozilla Notes to Reviewer

Compared with 1.33.0.48, the only favicon runtime behavior change is the candidate-suitability ranking in `src/shared/background/background-core.js`: 128px+ imagery gains a modest extra resolution bonus; declared touch artwork gains preference, while generic manifest artwork remains bounded below clean conventional favicons. Existing early-stop threshold (375), fast-first resolution, retry/audit ledger, queue, manual picker, protected artwork and storage formats are unchanged.

Added a 480-key Ukrainian runtime catalog, dynamic locale registration, and explicit localized Firefox/Chrome manifest descriptions. 34 UI locales are now available; default English and the 24 EU official languages remain unchanged. No permissions, CSP, telemetry, Sync/Recovery protocol or storage-schema changes.

Full automated regression and reproducible package results are documented in QA; four-browser CI and native Ukrainian proofreading must be confirmed before publication.

## GitHub release title

`MosaicSync 1.33.0.49`

## GitHub release description

A focused favicon-quality update with complete Ukrainian localization. Automatic discovery keeps its fast initial result and bounded asynchronous quality search, but prioritizes well-sized suitable icon artwork more effectively. The manual favicon chooser and user-selected icon overrides remain intact. Ukrainian is selectable and recognized automatically across New Tab, Settings, Welcome and browser metadata. All existing data, permissions and synchronization formats are preserved.
