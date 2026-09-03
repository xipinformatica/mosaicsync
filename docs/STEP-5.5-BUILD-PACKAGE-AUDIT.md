# Step 5.5 — build/package simplification audit

## Scope

MosaicSync 1.30.18.31 starts from the manually validated 1.30.18.30 source and changes release tooling only. No extension runtime algorithm is in scope.

## Pipeline map

`src/shared + src/{firefox,chrome}` → `tools/build.mjs` → deterministic `dist/firefox` + `dist/chrome` + `build-manifest.json` → `tools/package.py` → release-contract validation → deterministic Firefox/Chrome/GitHub-ready ZIPs + package-size report.

## Simplifications accepted

1. **One ZIP policy.** `package_source`, browser release packaging and temporary Firefox development packaging previously repeated the same `ZipInfo` timestamp/compression/permission loop. They now feed `(archive path, bytes)` entries to one `write_deterministic_zip` owner.
2. **Packaging owns freshness.** `package.py` now invokes the canonical build before inspecting manifests or creating an artifact. A same-version source edit can therefore no longer be accidentally packaged from a stale pre-existing `dist/` tree.
3. **One release-version source for the contract.** `release_contract.py` reads the canonical `export const VERSION` from shared constants rather than carrying another version literal that has to be advanced manually. Browser manifests still have to match that canonical version and Chrome `version_name` is still validated.
4. **One obvious release command.** `npm run release:package` invokes the self-building packager. `firefox:dev` no longer redundantly runs the build itself.

## Preservation proof

Before the 1.30.18.31 identity bump, these tooling changes were applied to an otherwise unchanged 1.30.18.30 clean extraction. The resulting Firefox and Chromium release ZIPs were byte-for-byte identical to the manually validated/live 1.30.18.30 artifacts. The GitHub-ready source ZIP necessarily differs because the reviewed tooling source itself changed.

## Candidates rejected

- The JavaScript runtime size reporter and Python package-size reporter retain separate measurement roles: the former measures deterministic deflate payloads from `dist`, while the latter records actual ZIP compressed sizes/archive bytes. Merging them across languages would add coupling rather than remove responsibility.
- `build-manifest.json` remains tracked/reviewable and is not folded into packaging; it independently proves the generated browser trees.
- `release_contract.py` remains a separate scanner instead of being embedded in the packager so it can validate built trees and arbitrary ZIPs independently.
- Source exclusion rules remain explicit in the packager because GitHub-ready source packaging has a different trust boundary from runtime packaging.
- Temporary Firefox development packaging remains separate from public Firefox packaging because its deliberately different Gecko ID protects production storage identity.

## Frozen runtime boundary

No New Tab, background, core model/storage, browser-adapter, manifest capability, CSS, locale catalog, persisted schema, Sync, Recovery, favicon or Frequently Visited algorithm is changed by Step 5.5.
