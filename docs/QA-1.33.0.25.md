# MosaicSync 1.33.0.25 QA / release-candidate checklist

1.33.0.25 is deliberately limited to first-paint test-contract unification over authoritative 1.33.0.24:

- no intended extension runtime behavior change;
- production New Tab JS/CSS behavior remains unchanged apart from release identity text;
- background Sync/Recovery/storage behavior is unchanged;
- first-paint ownership completeness and value equality consume one shared test-only ownership declaration;
- classifying a property as `PARITY_REQUIRED` automatically enrolls it in real bootstrap-versus-authoritative value comparison;
- reserved test-only mutation probe names cannot collide with production first-paint properties;
- a fully classified property with divergent authoritative/bootstrap values must fail.

Required release gates:

- `tests/corrective-133023.test.mjs`, `tests/corrective-133024.test.mjs`, and `tests/corrective-133025.test.mjs` green;
- red-before-green proof demonstrates the 1.33.0.24 two-list contract can miss a correctly classified property with mismatched formulas, while 1.33.0.25 rejects it;
- complete canonical and clean-room suites green;
- focused Startup/New Tab/Sync/Recovery/Security/Browser/Core/Release groups green;
- runtime reachability remains 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions;
- production source diff versus 1.33.0.24 contains no behavioral code change beyond mandatory release identity surfaces;
- Firefox, Chrome and GitHub-ready source ZIPs reproduce deterministically from a clean-room source extraction;
- browser automation status reported honestly.

No Sync/Recovery wire-format, Recovery-generation format, persisted schema, profile format, permission, CSP, browser-floor or privacy-boundary change is in scope.
