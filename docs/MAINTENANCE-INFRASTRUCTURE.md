# MosaicSync Maintenance Infrastructure roadmap

The five-step zero-new-features / full-code-refinement program is complete and frozen at MosaicSync 1.30.18.32. The Maintenance Infrastructure roadmap improves the guardrails around that frozen runtime. It does not authorize continued production refactoring.

## Roadmap

| Phase | Release | Goal | Runtime policy |
|---|---|---|---|
| M1 | 1.30.18.33 | Automated real Firefox + Chromium smoke testing | Frozen except release identity |
| M2 | 1.30.18.34 | One-command end-to-end release certification | Frozen unless a concrete defect is found |
| M3 | 1.30.18.35 | Permanent architecture map, ADRs and regression catalogue | Documentation-first |
| M4 | 1.30.18.36 | Test-suite classification and targeted commands | Test/tooling-only |
| M5 | 1.30.18.37 | Targeted fuzz/property testing at trust boundaries | Test/tooling-first |
| M6 | 1.30.18.38 | Browser/dependency/security maintenance audit and infrastructure freeze | Audit/freeze |

## M1 — real-browser smoke testing

M1 adds `tools/browser-smoke.mjs`, a dependency-free WebDriver client and smoke orchestrator. It deliberately sits outside the extension runtime graph.

The smoke uses fresh, disposable browser profiles and checks the actual browser New Tab override rather than importing MosaicSync modules into a simulated DOM. The browser must:

1. resolve New Tab to the MosaicSync extension page;
2. seed an isolated onboarded profile through the extension's own `storage.local` API;
3. return through the browser's New Tab override;
4. reach the production `interactionReady` startup boundary;
5. expose a real rendered shortcut and a consistent disabled Frequently Visited surface;
6. open Settings through a real element click;
7. switch Work and Personal Spaces through real element clicks;
8. follow the seeded shortcut through a real browser navigation.

The smoke intentionally does not grant optional Top Sites, Bookmarks or host permissions. Permission recovery remains covered by the generated-runtime suites while M1 proves the browser can fully initialize and interact with the extension without broadening its permission surface.

### Commands

```text
npm run smoke:probe
npm run smoke:firefox
npm run smoke:chrome
npm run smoke:browsers
```

Firefox requires Firefox plus GeckoDriver. The smoke packages and temporarily installs the distinct development add-on ID `mosaicsync-dev@xipinformatica.cat`, preventing the automation profile from sharing the production add-on's identity/storage namespace.

Chromium requires ChromeDriver plus a Chromium build that permits automated unpacked-extension loading. Chrome for Testing is preferred for this purpose. On Linux, the runner starts Xvfb automatically if no graphical display is present and Xvfb is available.

Explicit binary paths can be supplied with:

```text
MOSAICSYNC_FIREFOX_BIN
MOSAICSYNC_GECKODRIVER_BIN
MOSAICSYNC_CHROME_BIN
MOSAICSYNC_CHROMEDRIVER_BIN
MOSAICSYNC_XVFB_BIN
```

Missing required binaries are hard failures, never silent skips.

## M2 — one-command end-to-end release certification

M2 makes `npm run certify` the canonical definition of a fully certified MosaicSync release. The command composes the already-reviewed maintenance gates rather than introducing a parallel build or test implementation.

A full run requires:

1. canonical deterministic build;
2. full regression suite;
3. runtime reachability audit;
4. real Firefox + Chromium smoke (`npm run smoke:browsers`);
5. performance benchmark;
6. deterministic runtime-size report;
7. generated-tree release contracts;
8. deterministic public release packaging;
9. packaged Firefox/Chromium release contracts;
10. clean extraction of the just-created GitHub-ready source ZIP;
11. rebuild, full retest, reachability and release contracts from that clean tree;
12. repackage from the clean tree;
13. byte-for-byte SHA-256 equality for Firefox ZIP, Chromium ZIP, GitHub-ready source ZIP and `build-manifest.json`.

`npm run certify:mechanical` is intentionally separate. It skips only the real-browser lane and always records `MECHANICAL_ONLY` / `fullyCertified:false`. It exists so restricted CI/sandbox environments can verify every other gate without creating false evidence that the real browsers were exercised.

Certification evidence is written to `artifacts/certification-report.json`, which is a generated release artifact and is not included in the GitHub-ready source ZIP.

## M3 — permanent architecture knowledge

**Completed in 1.30.18.35.** M3 keeps the application runtime frozen and preserves the reasoning that would otherwise be easiest to lose over time.

- `docs/ARCHITECTURE.md` remains the canonical ownership map rather than creating a second competing architecture manual.
- `docs/adr/` contains concise accepted/frozen decision records for non-obvious boundaries that future cleanup could otherwise undo.
- `docs/REGRESSION-CATALOG.md` links major historical failure families to the permanent tests that detect recurrence.
- M3 documentation is guarded by tests that verify the ADR index, required decision/rationale/guardrail/evidence structure, architecture links and the existence of every referenced permanent test.
- The knowledge base must stay intentionally small. Add an ADR only when the *reason* for a decision is important to preserve; do not document every function or turn prose into a second implementation.


## Permanent maintenance rule

A future production-architecture change requires a demonstrated bug, browser/platform requirement, security/privacy requirement, measurable maintenance problem, or separately approved product objective. A large file, an aesthetic preference, or a desire to keep refactoring is not sufficient justification.
