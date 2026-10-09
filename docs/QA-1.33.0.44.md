# MosaicSync 1.33.0.44 QA / release-candidate checklist

## Scope and baseline

- Baseline is the independently Claude-GO-approved 1.33.0.43 source ZIP, SHA-256 `64e6ff2e14c4597e78cd688fa416e66e32a9c0aed264af94fab57b16e153cb87`.
- Preserve all .41 two-device clock/Recovery regressions, .42 B-1/B-2/B-3 fixes, and .43 save feedback corrections.
- Frequently Visited toggle/count: coded quota/nonquota errors are translated; no raw diagnostics leak; existing persistence and Sync semantics are unchanged.
- Profile importing: quota errors are correctly explained in New Tab and both Welcome stages. Existing precedence for stale, oversize, malformed and failed Sync publication remains.
- All 33 UI catalogs include dedicated imported-profile storage advice.

## Verification

- Red-before-green tests: `tests/trust-boundary-133044.test.mjs`; source used for failure proof .43.
- Complete Node suite and all focused groups.
- Runtime reachability, release contract, size baseline and packaging determinism.
- Extract packaged GitHub-ready source into a clean directory; rebuild, re-run complete suite and compare all three ZIP hashes.
- Real browser smoke test must be reported as PASS only if a browser actually installed and exercised the extension.

## Known residual risk and deliberate exclusions

- Remote Sync peers damaged by impossible clocks from older imports may not recover automatically after one device imports a healthy backup. Multi-device protocol research and adversarial tests are required for that separate project. **This is not fixed by .44.**
- Existing shortcut URLs embedding credentials are not stripped or removed on upgrade; new authoring is blocked.
- Cosmetic formality differences between some locales are not data-integrity defects.
