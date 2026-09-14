# MosaicSync 1.33.0.24 QA / release-candidate checklist

1.33.0.24 is deliberately limited to first-paint test-contract completeness over authoritative 1.33.0.23:

- no intended extension runtime behavior change;
- production New Tab JS/CSS behavior remains unchanged apart from release identity text;
- background Sync/Recovery/storage behavior is unchanged;
- every geometry property observed from the real authoritative `applySettings()` owner must be explicitly classified exactly once;
- every geometry property written by synchronous bootstrap must be parity-owned;
- mutation guards must reject both an authoritative-only and bootstrap-only new property.

Required release gates:

- `tests/corrective-133024.test.mjs` green;
- mutation proof demonstrates the 1.33.0.23 hardcoded contract misses an added authoritative property while the 1.33.0.24 completeness contract rejects it;
- complete canonical and clean-room suites green;
- focused Startup/New Tab/Sync/Recovery/Security/Browser/Core/Release groups green;
- runtime reachability remains 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions;
- production source diff versus 1.33.0.23 contains no behavioral code change beyond mandatory release identity surfaces;
- Firefox, Chrome and GitHub-ready source ZIPs reproduce deterministically from a clean-room source extraction;
- browser automation status reported honestly.

No Sync/Recovery wire-format, Recovery-generation format, persisted schema, profile format, permission, CSP, browser-floor or privacy-boundary change is in scope.
