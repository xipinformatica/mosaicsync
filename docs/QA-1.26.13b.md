# MosaicSync 1.26.13b QA contract (internal candidate — not published)

1. Treat `1.26.13b` as an internal candidate after `1.26.12`; it was not published. Firefox and Chrome technical manifest versions are `1.26.13.1`; Chrome exposes `version_name: "1.26.13b"`, Firefox has no `version_name`, shared `VERSION` and Settings display `1.26.13b`, and package filenames use `1.26.13b`.
2. Firefox and Chrome render a bounded, device-local Frequently Visited snapshot in the first-frame manifest when enabled, then refresh it asynchronously without delaying New Tab startup.
3. Frequently Visited cards can be dragged onto an empty main-grid slot to create a normal shortcut at that exact position, and the existing context-menu add action remains available.
4. “Hide this site” blocks the registrable domain and its subdomains device-locally using the bundled Public Suffix List; hidden domains are not synchronized or exported in MosaicSync profiles.
5. Existing users with automatic icon learning enabled but missing HTTP/HTTPS host access can receive the one-time Website access callout; the actual optional permission request remains user-initiated.
6. SVG root geometry parsing is quote-aware and remote raster dimensions fail closed when unknown before browser decoding.
7. Firefox `newtab/newtab.js` explicitly imports `getNativeTopSites` before `frequentCandidates()` calls it, and the Firefox platform adapter calls `browser.topSites.get({ newtab: true, includeFavicon: true, limit })`.
8. Full Firefox/Chrome regression, parity, benchmark, syntax, package-integrity and GitHub-ready-source checks must pass.
