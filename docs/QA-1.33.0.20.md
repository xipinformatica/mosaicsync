# MosaicSync 1.33.0.20 QA / release-candidate checklist

Status: **PASS** — final-source mechanical certification is the handoff gate.

## Scope

Narrow post-audit correctness corrective over 1.33.0.19. Snow Leopard II performance scope remains closed.

Production correction is intentionally limited to one authority distinction inside `reconcileIfNewCommit()`:

- `completeRemoteDescriptor()` remains fallback-aware and continues to represent recoverability/continuity;
- `completeLiveRemoteDescriptor()` now gates missing-own-Recovery self-heal and stale non-quota error clearing;
- torn Personal or Work live delivery therefore cannot manufacture Recovery state or erase a generic error;
- complete live delivery still converges by repairing the missing own Recovery generation and clearing a genuinely stale generic error;
- explicit quota errors remain sticky.

No Normal Sync merge selection, Recovery wire format, persisted schema, permission, CSP, browser floor or privacy policy is changed.

## Red-before-green

Against untouched 1.33.0.19, the dedicated 1.33.0.20 gate was **10/14 PASS, 4/14 FAIL**.

The four red failures were the same confirmed defect on both browser-shaped runtimes:

- torn Personal live delivery incorrectly published a current-device Recovery generation;
- torn Work live delivery incorrectly published a current-device Recovery generation;
- those same paths therefore failed before they could satisfy the paired stale-error preservation assertion.

The other ten tests are intentional coverage strengthening and already passed on 1.33.0.19: catastrophic-loss negative control, frozen target-set behavior, survivor-publication fail-closed behavior, learned-artwork privacy, and different-intent Shortcut Editor ownership.

With 1.33.0.20 the dedicated gate is **14/14 PASS**.

## Corrective safety

The fix does not broaden or alter the `already-applied` decision itself. It narrows only the two side effects introduced in 1.33.0.19. A partial non-zero live namespace can still remain in existing torn-delivery handling, but it cannot claim enough authority to republish Recovery or erase an error until both live ledgers validate.

The convergence regressions deliberately run the same fixture twice: first with one live ledger torn (no repair/error clear), then after the missing live records arrive (Recovery repairs and the stale generic error clears). A total live wipe remains owned by catastrophic-loss quarantine.

Whole-device Recovery cleanup retains the 1.33.0.19 protocol unchanged: freeze target roots, publish/verify a fresh acting-device survivor, re-read, and delete only still-eligible roots from the original frozen plan. A post-plan target generation is explicitly injected by the new regression and must survive. If survivor publication fails, the target remains untouched.

The strong opposite-cleanup survivor guarantee requires concurrently destructive peers to implement the post-plan frozen-target protocol (1.33.0.19+). An older peer cannot retroactively honor the newer protocol; this is documented as a mixed-version rollout boundary rather than hidden behind a local lock claim.

## Privacy/test hardening

A permanent model-level regression now proves `remote`, `favicon` and `firefox` learned artwork normalizes to `imageSyncKind: "device"`, with empty `imageSyncData` and no synchronized asset ID even if hostile/legacy input requests synchronized pixels.

Shortcut Editor coverage now includes Edit A→Edit B, Add→Edit and Edit→Add while secondary styles are unresolved; exactly one modal owner may mutate the form.

## Certification

The counts below are the sealed candidate results and are re-proved by the final-source clean-room certification command. No source/documentation edit is permitted after that final proof.

## Focused verification

- Startup: **255/255 PASS**
- New Tab: **485/485 PASS**
- Sync: **301/301 PASS**
- Recovery: **176/176 PASS**
- Browser/parity/permissions: **202/202 PASS**
- Core: **178/178 PASS**
- Security: **160/160 PASS**
- Release: **373/373 PASS** (365 ordinary release assertions plus 8 isolated Snow Leopard II instrumentation assertions)

## Authoritative full suite

- ordinary tests: **1,262/1,262 PASS**
- Snow Leopard II instrumentation: **8/8 PASS**
- total: **1,270/1,270 PASS**

The +14 total over 1.33.0.19 is entirely attributable to `tests/corrective-133020.test.mjs`.

## Structural / performance gates

- reachability: **0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions**
- retained review-only exports/test hooks remain unchanged and are not treated as dead code
- Step-5 routine Sync-watch storage census: **unchanged from 1.33.0.19**
  - Sync-off startup: 7 local gets / 0 local sets / 0 Sync reads
  - Sync-on startup: 11 local gets / 3 local sets / 2 full Sync reads
  - Sync-watch alarm: 7 local gets / 3 local sets / 3 full Sync reads
- package-size baseline updated consciously for 1.33.0.20 after the narrow production change
- generated Firefox/Chromium release-contract checks: required in final mechanical certification

The `.20` fix adds no new routine storage read/write and no new startup module/DOM work. Its production change is a predicate gate inside an existing reconciliation path.

## Browser environment

Real-browser certification remains limited by the available toolchain: Chromium/Xvfb are present, while a compatible ChromeDriver and Firefox/GeckoDriver pair are unavailable. The final release classification is therefore **MECHANICAL_ONLY**; no browser-millisecond or heap claim is made.

## Final handoff gate

The handoff requires `npm run certify:mechanical` from these exact final source bytes. That command rebuilds, runs the full suite and reachability/release contracts, packages Firefox/Chrome/source ZIPs, extracts the source ZIP into a clean room, repeats build/test/reachability/package there, and requires byte-for-byte identical Firefox, Chrome, source and `build-manifest.json` hashes. The certification report in `artifacts/certification-report.json` is the final evidence; no source/documentation edit is permitted after that run.
