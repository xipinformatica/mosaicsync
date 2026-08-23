# MosaicSync 1.26.17.4 QA / audit checklist

1. Import a normal `.mosaicsync` profile from Settings and from the first-run Welcome flow; both must still restore successfully.
2. Verify an oversized file is rejected before its contents are read and shows the localized “profile too large” message.
3. Verify manually created/imported/synchronized shortcuts remain HTTP(S)-only; `javascript:`, `data:`, `blob:`, `file:`, `about:` and browser-internal schemes must never become navigable shortcut anchors or new-tab targets.
4. With Sync enabled, deliberately restore an older profile and confirm the imported profile remains the authoritative synchronized source after confirmation.
5. Exercise concurrent edits across Personal/Work plus automatic favicon recovery; unrelated inactive-Space edits and same-shortcut cache/core changes must survive rebasing.
6. At widths below 900 px, Frequently Visited must keep the current configurable show-and-wrap behavior without the obsolete “hide card 4+” rule.
7. Confirm upgrade hydration still runs for the intended historical 1.24.14 resolver-quality range and contains no dead current-`VERSION` migration gate.
8. Run the full Firefox/Chrome regression suite, benchmark, source/build identity checks, ZIP integrity checks and permission/CSP diff review before publishing.
