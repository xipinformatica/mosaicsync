# MosaicSync 1.33.0.29 publication notes

## AMO changelog

Adding a shortcut no longer requires a name. Enter the website address and MosaicSync will use the site's address as the name automatically; you can still type your own name whenever you want.

## Mozilla Notes to Reviewer

1.33.0.29 is a narrow New Tab usability release. `src/shared/newtab/newtab.html` removes the HTML `required` constraint from `#shortcutTitle` while leaving `#shortcutUrl` required. The existing save boundary in `newtab.js` already normalizes the URL first and resolves an empty title with `hostLabel(url)`, so no persisted schema or data migration is introduced. New Add Shortcut sessions focus the mandatory URL field; Edit Shortcut retains title focus. The release also adds test-only behavioral coverage for the already-correct manual Recovery cleanup torn-generation cases and bookmark drag/drop mutations identified in the post-1.33.0.28 adversarial audit. No permission, CSP, Sync/Recovery format, retention rule, browser floor or privacy boundary changes.

## GitHub release title

`MosaicSync 1.33.0.29`

## GitHub release description

MosaicSync 1.33.0.29 makes shortcut creation quicker: the website address is the only required text field, and leaving the name blank automatically uses the site's address as the shortcut name. Existing shortcuts can still be named or renamed normally.

This release also strengthens permanent automated coverage for Recovery cleanup and bookmark drag-and-drop without changing those features' production behavior. Sync, Recovery formats, permissions and privacy boundaries are unchanged.
