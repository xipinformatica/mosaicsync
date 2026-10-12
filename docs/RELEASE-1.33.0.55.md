# MosaicSync 1.33.0.55 publication notes

**Previous public version: 1.33.0.54.**

## Firefox Add-ons / Chrome Web Store

MosaicSync can now improve shortcut names automatically after you add them. Shortcuts still save instantly, and when website access is already available, MosaicSync can use the website's own name to make the suggestion more accurate. Your manually chosen names are always protected.

## Mozilla Notes to Reviewer

This release adds an optional *one-time post-save automatic name enrichment* to the URL-first shortcut creation introduced in .53. The existing editor request is still cancelled when the editor closes. After a successful new automatic shortcut creation **only if optional website access was already granted**, one distinct bounded background request may obtain the website title and `og:site_name`. No permission prompt is made solely for naming; requests omit credentials/referrer, refuse redirects and use a four-second deadline/256KB cap. Results are screened by existing malformed/control, login/verification/redirect/error page title filters. The favicon HTML discovery path is untouched.

The enrichment result is applied via a new conditional persistence transaction under the existing Web Lock, reading the *latest* compact state. The target's stable shortcut ID, saved URL, original title, creation timestamp and modified timestamp must still match. Only the title and mutation timestamps are patched; an unrelated favicon, position or Space/folder move is never reverted by a stale shortcut copy. If the record was manually edited, changed, deleted or ownership cannot be verified, the result is discarded. A missing write lock or any storage failure also fails closed. Successful name changes participate in the existing Normal Sync pending mutation-journal protection. No new schema fields or Sync/Recovery protocol changes.

Regression testing should include a brand site-name in `og:site_name`, a slow response with a same-title deliberate manual rename, a second New Tab writing concurrently, deletion, a move, failed initial/secondary saves, absence of permission, and a redirecting site. The four-browser GitHub Actions gate must be run on the exact final commit.

## GitHub release title

`MosaicSync 1.33.0.55`

## GitHub release description

### Smarter automatic shortcut names

New shortcuts still save immediately. When website access is already available, MosaicSync can now recognize the website's real name after saving and improve the label automatically — for example, turning a plain URL-based label into the name supplied by the site. Manual names always remain yours.

This release also strengthens name-update safety during simultaneous edits and Sync, with no new permissions or background scans.

**Privacy-first. Open source. For Firefox and Chromium.**
