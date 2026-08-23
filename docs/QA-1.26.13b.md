# MosaicSync 1.26.13b QA contract

1. Firefox and Chrome technical manifest versions are `1.26.13.1`; Chrome exposes `version_name: "1.26.13b"`, Firefox has no `version_name`, shared `VERSION` and Settings display `1.26.13b`, and release package filenames use `1.26.13b`.
2. Firefox `newtab/newtab.js` explicitly imports `getNativeTopSites` from `../core/platform.js` before `frequentCandidates()` calls it.
3. Firefox Frequently Visited uses the shared Firefox platform adapter, which calls `browser.topSites.get({ newtab: true, includeFavicon: true, limit })` and returns a bounded list.
4. Chrome keeps its existing adapter behavior. No permission, Sync/profile schema, first-frame Frequently Visited snapshot, drag/drop, hidden-domain, appearance/wallpaper, folder or favicon-hardening behavior changes.
5. Full Firefox/Chrome regression, parity, benchmark, syntax, package-integrity and GitHub-ready-source checks must pass.
