# MosaicSync 1.24.14d QA contract

1. Firefox `manifest.json` must not contain Chrome-only `version_name`; Chrome must expose `version_name: "1.24.14d"` while both technical manifest versions are `1.24.14.3`.
2. Chrome `_favicon` pixels remain a fast local fallback but must carry unknown intrinsic quality (`width/height/qualitySide = 0`), because the requested canvas size may be an upscale of a small source.
3. Browser-native Chrome artwork stored under the historical `firefox` source-kind label must be eligible for direct quality-upgrade recovery. User uploads remain excluded.
4. The favicon quality resolver remains generic: no Google News hostname mapping or hard-coded site artwork is permitted.
5. Authenticated deep-link recovery, same-origin image validation, `credentials: "omit"`, CSP, Sync, concurrency and profile semantics remain unchanged.
6. Full Firefox/Chrome regression, parity, benchmark, syntax, archive-integrity and deterministic-package checks must pass.
