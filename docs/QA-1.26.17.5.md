# MosaicSync 1.26.17.5 QA / audit checklist

1. Open a normal HTTP and HTTPS shortcut from the main grid, from a folder and through “Open in new tab”; behavior must match 1.26.17.4.
2. Verify the synchronous first-paint grid and Frequently Visited cards use the shared HTTP(S)-only URL helper before assigning `href`. A missing helper must skip the disposable bootstrap rather than create a permissive fallback.
3. Try `javascript:`, `data:`, `blob:`, `file:`, `about:`, `chrome:`, `moz-extension:` and malformed/overlong URLs through profile state, Sync reconstruction, render manifest and first-paint fixtures; none may become a navigable MosaicSync shortcut.
4. Confirm the shared URL helper stays tiny (<1.8 KB), contains no fetch/timer/storage work and is loaded immediately before `render-bootstrap.js` at the bottom of both Firefox and Chrome New Tab documents.
5. Import checksum-valid hostile profiles carrying `__proto__`, `constructor` and `prototype` at package/profile/state/settings/Space/shortcut/folder-child/assets boundaries. They must either normalize safely or fail closed, and `Object.prototype` must remain unchanged.
6. Re-run profile import/export, Firefox native shortcut import, Frequently Visited hiding and registrable-domain handling to confirm central URL validation did not alter valid HTTP(S) behavior.
7. Run the complete Firefox/Chrome suite, benchmark, release-identity checks, deterministic package reproduction, ZIP integrity, source secret scan and permissions/CSP diff review before publishing.
