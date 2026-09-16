# MosaicSync 1.27.4 QA / runtime-size and favicon-picker checklist

## Release identity
- [ ] Firefox manifest version = `1.27.4`.
- [ ] Chrome manifest version + `version_name` = `1.27.4`.
- [ ] Shared `VERSION`, Settings label, README, CHANGELOG, build manifest and package-size baseline = `1.27.4`.

## Runtime-size compaction
- [ ] Full reviewed PSL remains in `src/shared/core/public_suffix_list.dat` with upstream provenance/comments.
- [ ] Both runtime PSL files contain the exact same meaningful rule sequence and compact MPL/provenance header.
- [ ] All 32 reviewed source locale catalogs remain readable key/value objects.
- [ ] Generated runtime locale modules reconstruct exactly the same 405 keys/values/order for every locale in Firefox and Chrome.
- [ ] Locale loading remains lazy (English + active locale), not all 32 catalogs at startup.
- [ ] `npm run size` reports category and largest-file measurements.
- [ ] `package-size-baseline.json` matches the 1.27.4 generated runtime and the >15% unexpected-growth guard passes.

## Manual favicon chooser
- [ ] Automatic `resolveFaviconForUrl()` regression identity remains unchanged from 1.27.2/1.27.3.
- [ ] Candidate image fetch/decode concurrency never exceeds 2.
- [ ] Site-declared `data:` favicon candidates still pass through declared-image/SVG validation and can appear in the chooser.
- [ ] Immediate repeated detection for the exact URL reuses the short-lived in-memory candidate cache.
- [ ] Cache expires after 30 seconds, retains at most four URL results, rejects oversized result sets and remains memory-only.
- [ ] Website Access is checked before cached discovery and refreshed before a result is admitted to cache.
- [ ] Closing Edit shortcut clears candidate DOM/data, collapses the picker, re-enables the button and increments the generation so late results are ignored.
- [ ] Editing the shortcut URL invalidates existing candidates/in-flight results.
- [ ] Candidate buttons expose localized Browser/Website source and dimensions in `title`/`aria-label` when dimensions are known.
- [ ] Selecting one detected favicon still persists only that exact candidate as explicit user artwork; other candidates remain ephemeral and Sync remains opt-in.

## Cleanup / compatibility
- [ ] `.stack-actions` and `.full-button` have no remaining runtime/source references.
- [ ] State schema remains 18; Sync schema remains 10; profile format unchanged.
- [ ] Firefox/Chrome manifests have no permission/host-permission/CSP changes from 1.27.3 except version identity.
- [ ] Full automated suite, JS syntax checks, Python packaging compile, benchmark, deterministic packaging, clean-source rebuild, leakage scans and SHA-256 verification pass.
