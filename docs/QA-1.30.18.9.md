# MosaicSync 1.30.18.9 QA / release-candidate checklist

## Release identity / packaging

- [x] Firefox manifest/runtime/Settings version is exactly `1.30.18.9`.
- [x] Chrome manifest/version_name/runtime/Settings version is exactly `1.30.18.9`.
- [x] Render-manifest schema is v4; the obsolete v2 read bridge is removed.
- [x] GitHub-ready source and both browser ZIPs reproduce byte-for-byte from a clean extraction.
- [x] Firefox and Chrome browser ZIPs pass the production release-contract scanner.

## Step 2.1 ownership/consolidation regressions

- [x] Complete shared `storage.session` startup snapshots are published only from authoritative startup/persistence boundaries; routine New Tab presentation refresh no longer republishes full structural state.
- [x] Frequently Visited site refresh patches only `firstPaint.frequent` in the current shared session snapshot, so a presentation-only update cannot downgrade newer Space/grid state.
- [x] Persisting the device active-Space pointer refreshes the shared session projection from persisted profile state rather than from an arbitrary older New Tab.
- [x] Every runtime page-local render-manifest publication is gated against shared session structural truth, including delayed preview generation and artwork-change fallback publication.
- [x] The persistent localStorage render manifest retains synchronized FV enable/count truth but stores no browser-derived Frequently Visited site candidates.
- [x] Persistent bootstrap contains no browser-derived FV site/card painter or hidden-domain filtering path; session/live code owns those candidates.
- [x] Classic bootstrap manifest/session key + manifest-version knowledge is generated from canonical constants and loaded before classic startup scripts.
- [x] Top Sites permission remove/add behavior is covered through the production background runtime harness rather than source-regex-only wiring.
- [x] Historical security/startup regressions were updated to the new ownership contract rather than weakened.

## Preservation gates

- [x] Full automated suite passes before final packaging: 799/799.
- [x] Work shortcut-grid authorization remains unchanged and stricter than global/device-local FV presentation.
- [x] Current known-artwork first-paint behavior remains covered; a known favicon must not flash a fallback letter.
- [x] Space-name startup continuity remains covered under current manifest schema.
- [x] Non-English Frequently Visited first-frame heading protection remains covered.
- [x] Sync quota accounting/warning behavior remains covered.
- [x] Normal Sync/Recovery/state/profile schema versions are unchanged.
- [x] Permissions, CSP, privacy boundaries, telemetry policy and backend-free operation are unchanged.
- [x] Runtime compressed-size delta versus 1.30.18.8 is small and reviewed.
- [x] Benchmark/size/release-contract gates pass on the final versioned source.

## Manual browser checks before/after store publication

- [ ] Firefox warm-session startup: repeatedly open New Tabs in Personal and Work; verify no Space-name/grid downgrade or second visible correction.
- [ ] Firefox: with Frequently Visited populated, cold-restart the browser and confirm persistent first frame does not resurrect stale browser-history cards; current sites may appear at the early session/live handoff.
- [ ] Firefox: remove/restore Top Sites permission and confirm suppression/recovery works without changing the synchronized Show setting.
- [ ] Firefox: learn/change a favicon with another New Tab open and confirm an older tab cannot overwrite the newer first-frame artwork identity.
- [ ] Firefox in Catalan (or another non-English locale): confirm no English Frequently Visited heading/subtitle appears on first frame.
- [ ] Chrome: repeat warm startup, permission lifecycle, Work, and favicon checks.
