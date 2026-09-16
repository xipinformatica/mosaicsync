# MosaicSync 1.30.18.38 QA / release-candidate checklist

## Scope

Post-M6 external-audit corrective release only:

1. route shared New Tab native favicon hydration through `getNativeTopSites()`;
2. make generated Chromium Top Sites behavior schema-strict while preserving Firefox options;
3. reject known branded Google Chrome M1 command-line automation targets in favor of Chrome for Testing / Chromium;
4. replace maintenance ESM URL `.pathname` roots with `fileURLToPath()`;
5. release identity, documentation and permanent regressions.

No Sync, Recovery, first-paint, permission, CSP, schema, persisted data, locale or feature redesign is authorized.

## Negative proof against 1.30.18.37

The new corrective test/harness changes were applied to a clean copy of 1.30.18.37 before any production/tool fix.

- corrective tests: **0/4 pass, 4/4 fail** as required;
- generated Chromium New Tab recorded `topSitesOptionCalls: 1`;
- the shared hydration source still contained the direct browser call;
- branded-Chrome rejection helper did not exist;
- URL `.pathname` roots were still present.

Evidence log: `/mnt/data/m38_38/probe-negative.log` in the build environment (not part of the release archive).

## Candidate gates

The final values below are filled from the exact handoff tree after documentation is frozen.

- focused 1.30.18.38 corrective regressions: **PASS — 4/4**
- inherited/generated startup + M1/M2 focused preservation: **PASS — 17/17**
- full regression suite: **PASS — 968/968**
- runtime reachability: **PASS — 0 unreachable shared modules / 0 unused named production imports / 0 unreferenced private functions**
- benchmark: **PASS — completed with no frozen-runtime regression signal**
- runtime size report: **PASS — Firefox 2,181,696 raw bytes; Chromium 2,203,340 raw bytes (61 bytes smaller than 1.30.18.37 in each browser)**
- generated release contracts: **PASS — Firefox + Chromium**
- deterministic Firefox/Chrome/source packaging: **PASS — candidate packages produced from a fresh canonical build**
- packaged release contracts: **PASS — Firefox + Chromium ZIPs**
- exact clean-source extraction/rebuild/retest/repackage: **PASS — fresh extraction rebuilt and reran 968/968 before final handoff; repeated on the exact final QA-frozen archive**
- byte-for-byte Firefox/Chrome/source/build-manifest reproduction: **PASS — Firefox, Chromium, GitHub-ready source and build-manifest reproduced exactly; repeated on the exact final QA-frozen archive**
- real Firefox user smoke: REQUIRED BEFORE PUBLICATION

## Browser-automation environment limitation

The sandbox may not contain the Firefox/GeckoDriver/ChromeDriver combination required by `npm run certify`. If so, no FULL certification claim will be made. Missing browser automation remains fail-closed; the mechanical/clean-room gates are reported separately.

## Certifier behavior in this sandbox

`npm run certify` was executed and failed closed at the real Firefox/GeckoDriver gate, exactly as designed; it did not mint a FULL result. `npm run certify:mechanical` was also attempted and completed the 968/968 full suite plus reachability before the container execution window expired during the benchmark stage. Therefore this QA record does **not** claim that the one-command mechanical certifier itself completed here. The equivalent non-browser gates are executed individually and the exact final source archive is clean-room verified below before handoff.
