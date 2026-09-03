# Step 5.4 — test architecture audit

Baseline: manually validated MosaicSync 1.30.18.29.

## Verdict

The suite did not need a broad rewrite. Most important state/data invariants already have direct unit or generated-runtime behavioral coverage. The highest-value missing layer was the complete New Tab module startup boundary exposed by withdrawn 1.30.18.26: isolated helper tests and source-shape assertions could pass while the actual generated module aborted synchronously before later UI/Frequently Visited wiring.

Step 5.4 therefore adds one reusable full generated-New-Tab harness and keeps production code unchanged apart from release identity.

## Coverage classification

| Boundary | Previous protection | Step-5.4 treatment |
|---|---|---|
| Complete New Tab module startup | Bootstrap/function-level tests plus the 1.30.18.28 color-swatch block regression | **Strengthened:** import the complete generated Firefox/Chromium module graph and require `interactionReady` |
| Settings basic interactivity | Source/event wiring plus feature-specific behavioral tests | **Strengthened:** generated Settings button is clicked and must actually open the panel |
| Appearance-color startup | Direct frozen-expression equivalence and generated color-swatch block | **Strengthened:** full module import uses the real generated owner and caller; negative mutation recreates the `.26` contract failure |
| Frequently Visited startup | Extracted-function behavioral tests plus some source-shape wiring assertions | **Strengthened:** enabled profile must call the browser Top Sites path and render in the full generated module |
| Frequently Visited Settings toggle | Behavioral preference/permission tests plus source-shape call checks | **Strengthened:** real generated `change` listener is driven OFF then ON and must hide/restore controls and live strip |
| Settings appearance deferral | Source ordering plus `appearance-lifecycle-12610` behavioral execution | Existing behavioral coverage is already the primary proof; source shape remains supplementary |
| FV decode-before-commit | Older source-order assertion plus `corrective-1301812` slow-decode behavioral race | Existing behavioral coverage is already stronger; retain structural guard only as supplementary |
| Recovery effect ordering | Pure transition tests, source-order guardrails, generated interruption/restart suites | No change: generated failure/restart coverage already proves behavior; regex guards remain secondary architecture tripwires |
| Sync conflict/concurrency | Direct behavioral concurrency/rebase tests | No change required |
| Manifest permissions/CSP/release identity | Literal generated/package contract tests | Structural tests are appropriate because literal output is the contract |
| Critical/secondary CSS and bootstrap order | Generated HTML/CSS source structure plus targeted VM first-paint behavior | Structural assertions remain appropriate where ordering/selector ownership itself is the invariant |

## Negative regression

The new startup harness is tested against a temporary generated tree modified to reproduce the withdrawn 1.30.18.26 failure class. The mutation changes `normalizeHexColor(value)` into a helper that requires a second validator argument while the real caller remains unchanged.

Required result:

- module startup fails;
- `interactionReady` is never reached;
- Settings click wiring is absent;
- storage-change wiring is absent;
- Frequently Visited never calls Top Sites.

This prevents a future test from becoming green merely because it exercises an extracted helper correctly in isolation.

## Scope explicitly rejected

- No production refactor for testability.
- No Recovery or Sync changes.
- No DOM/controller extraction.
- No replacement of all regex/source-shape tests merely to improve a metric.
- No new dependency or test framework.
- No permission, CSP, schema, locale or persisted-data change.

Step 5.4 improves the suite at the integration boundary that actually failed in production while preserving useful structural tests elsewhere.
