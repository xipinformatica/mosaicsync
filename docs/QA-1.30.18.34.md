# MosaicSync 1.30.18.34 QA / release-candidate checklist

## Baseline

- [x] Begin from exact certified 1.30.18.33 GitHub-ready source.
- [x] 1.30.18.33 SHA-256 re-verified as `d5c69f40a04295282f924c0d928c36f9fbc4fb83cec535fda97ad7047dcdde83`.
- [x] Untouched .33 baseline rebuilt and passed 945/945 tests.
- [x] M2 tooling applied at .33 identity reproduced the validated .33 Firefox and Chromium ZIP hashes byte-for-byte.

## M2 scope

- [x] Product runtime remains frozen; production changes are release identity only.
- [x] `npm run certify` is the canonical full certification entry point.
- [x] Full certification includes real Firefox + Chromium smoke and cannot silently skip it.
- [x] `certify:mechanical` is explicit and reports non-full certification.
- [x] Clean-room verification starts from the packaged GitHub-ready source ZIP.
- [x] Firefox, Chromium, source ZIP and build-manifest mismatches fail certification.
- [x] Four focused M2 tests cover the certification contract.

## Release gates

- [ ] Official `npm run certify` full real-browser lane exercised on a suitable machine. In this sandbox it was deliberately run and failed closed at the Firefox/GeckoDriver gate, proving missing real-browser dependencies cannot produce a false green certification.
- [x] Full 1.30.18.34 suite passes after final identity/docs update: 950/950.
- [x] Reachability remains clean: zero unreachable shared modules, unused named production imports or unreferenced private functions.
- [x] Benchmark completes.
- [x] Generated and packaged Firefox/Chromium release contracts pass.
- [x] Package-size baseline refreshed; runtime raw size remains byte-identical to .33 (Firefox 2,181,757 B; Chromium 2,203,401 B).
- [x] `npm run certify:mechanical` completes all non-browser gates and clean-room byte reproduction in this sandbox and records `MECHANICAL_ONLY` / `fullyCertified:false`.
- [x] Candidate GitHub-ready source ZIP clean-extracts and reproduces all release artifacts byte-for-byte; a final pass is rerun after this QA text is frozen.

## Certification rule

`npm run certify` is the authoritative complete release gate. `npm run certify:mechanical` is useful evidence in a restricted environment but is never described as a full certification because it does not execute the real-browser lane.

## Mechanical certification evidence before final QA freeze

- Firefox ZIP: `126f9ea411d507e075442c2e87e7d50cb0b3a508cefc0e6e3ed761790e9f7e4f`
- Chromium ZIP: `9153cc702b4533aa6e3498ee891a24db952a4f7b79d54ce772bfd8343d7a389c`
- Build manifest: `7c20f6e01fbd7971561ea7d38505bfcbc656d64363069ea1a365282f401c93a4`

The GitHub-ready source hash is intentionally recorded after this exact QA text is frozen and the final archive is reproduced again.
