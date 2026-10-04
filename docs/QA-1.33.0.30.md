# MosaicSync 1.33.0.30 QA / release-candidate checklist

1.33.0.30 is a narrow corrective over 1.33.0.29. It addresses the independently reproduced asymmetric whole-device Recovery cleanup interleaving, schemeless letter-led hostname+port normalization, and shortcut permission-request ordering. It also upgrades the 1.33.0.29 blank-name save guarantee to behavioral submit-path coverage. No persisted schema, Sync/Recovery wire format, permission, CSP, browser floor or privacy-boundary change is introduced.

## Red-before-green evidence

Against the untouched 1.33.0.29 source, `tests/corrective-133030.test.mjs` was introduced with four initially failing protections:

- opposite-device Recovery cleanup allowed a newly observed target survivor into the second device's destructive target set;
- `localhost:3000` / `example.com:8443/path` were rejected as if the hostname were a URI scheme;
- an invalid shortcut URL initiated optional all-websites permission before URL validation;
- the new corrective test had not yet been registered in its certification groups.

The first three production regressions are green after the narrow fixes; the release also adds a behavioral real-submit-path assertion proving a blank shortcut name persists as the normalized host.

## Recovery safety contract

Whole-device cleanup still freezes an initial target set, publishes/validates a fresh current-device survivor, re-reads Sync and intersects the frozen roots with fresh eligibility. 1.33.0.30 adds a prior destructive-authority gate: every target root must already be present in the existing device-local `deviceSnapshotRootSeenPass` observation journal for the configured minimum number of GC passes. A newly delivered target generation therefore blocks the whole-device plan instead of expanding deletion authority. This is deliberately local safety metadata; no Recovery root/chunk or Sync schema changes.

## URL / permission contract

- dotted hostnames, `localhost`, and bracketed IPv6 literals followed by a numeric port may be treated as schemeless web addresses;
- true explicit non-HTTP schemes remain untouched and are rejected by `safeShortcutNavigationUrl()`;
- synchronous URL/destination validation occurs before `permissions.request()`;
- the permission Promise attaches rejection handling immediately so later save failures cannot leave a rejecting Promise unowned.

## Certification

- Canonical test files: **190**, with **0 ungrouped files**.
- Canonical regression result: **1,340 / 1,340 PASS** through complete focused-group coverage. The monolithic `npm test` command exceeded the execution ceiling after 1,101 passing tests with no observed failure, so certification used the eight canonical groups instead of misclassifying the timeout.
- Startup: **285 / 285 PASS**
- New Tab: **534 / 534 PASS**
- Sync: **350 / 350 PASS**
- Recovery: **225 / 225 PASS**
- Security: **219 / 219 PASS**
- Browser/parity: **258 / 258 PASS**
- Core: **201 / 201 PASS**
- Release: **443 / 443 PASS**. The release wrapper reached 435/435 before the environment ceiling; its final two Snow Leopard II files were then run directly and passed **8 / 8**, completing the same 443-test release set.
- Runtime reachability: **0 unreachable shared modules, 0 unused named imports, 0 unreferenced private functions**.
- Deterministic package SHA-256 values are recorded with the final handoff after two identical packaging runs.
