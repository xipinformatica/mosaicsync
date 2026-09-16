# MosaicSync 1.24.13 QA contract

1.24.13 is a narrowly scoped production-hardening release on top of 1.24.12. No user-visible feature, permission, Sync schema, asset-store schema, `.mosaicsync` format, favicon algorithm or UI behavior change is intended.

Release checks:

- A failed atomic `storage.local` state/asset write must preserve the complete previously persisted compact state, asset index and asset bytes.
- A failed atomic state/asset write must expose the internal `STORAGE_LOCAL_WRITE_FAILED` category while retaining the original failure as its cause.
- MosaicSync must never fall back to saving compact state while omitting newly referenced asset bytes.
- Failed background silent writes must remove both in-memory and durable `storage.session` local-write suppression markers.
- Successful write ordering remains assets + compact references in one `storage.local.set`, followed only then by stale-asset cleanup.
- Firefox and Chrome platform text adapters keep compatible call signatures.
- All 1.24.12 concurrency, profile-security, CSP/XSS, SVG, cache-bound, localization, parity and generated-build-hash tests must continue to pass unchanged.
