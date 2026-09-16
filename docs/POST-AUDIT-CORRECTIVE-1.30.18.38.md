# MosaicSync 1.30.18.38 post-M6 external-audit corrective record

## Decision

1.30.18.38 is a **narrow corrective release**, not M7 and not a reopening of the five-step or Maintenance Infrastructure refactoring programs.

The M6 self-audit and Mistral review found no production defect. A later code-first Grok review independently reproduced the 1.30.18.37 build/test/package evidence and found one inherited LOW production API-contract leak plus two maintenance-tool defects. Claude's partial independent review also reproduced the mechanical release evidence but ended before its deep ownership/API phase.

The permanent maintenance policy explicitly allows a frozen boundary to be reopened for a demonstrated bug or browser/platform issue. 1.30.18.38 applies that rule and stops after the verified findings.

## Finding A — Chromium Top Sites adapter leak

### 1.30.18.37 behavior

`hydrateDeviceFavicons()` in shared New Tab called:

```js
browser.topSites.get({
  newtab: true,
  includeFavicon: true,
  limit: 100
});
```

Those arguments are Firefox-specific. MosaicSync already had the correct platform boundary:

- Firefox/shared `getNativeTopSites()` calls `topSites.get({ newtab, includeFavicon, limit })`.
- Chromium `getNativeTopSites()` calls `topSites.get()` with no arguments.

The direct shared call bypassed that boundary.

### 1.30.18.38 correction

Shared New Tab now calls:

```js
getNativeTopSites({ limit: 100 });
```

No new module, policy, permission or state shape is introduced.

### Negative and preservation proof

Before the production fix, the new four-test 1.30.18.38 corrective probe was copied onto the untouched 1.30.18.37 source. All **4/4 failed**. The generated Chromium smoke recorded one illegal options call:

```text
topSitesCalls: 3
topSitesZeroArgCalls: 2
topSitesOptionCalls: 1
```

After the correction:

- Chromium generated New Tab must complete with `topSitesOptionCalls === 0` and at least one zero-argument call.
- Firefox generated New Tab must still make at least one options-bearing Top Sites call.

The Chromium harness mock throws on any options-bearing call, so this is a schema-strict behavioral regression rather than documentation alone.

## Finding B — branded Chrome M1 automation target

Current branded Google Chrome no longer supports the command-line unpacked-extension contract used by M1 (`--load-extension` was removed from branded Chrome beginning with Chrome 137). The dependency-free M1 runner therefore must not advertise known branded Google Chrome installations as usable targets.

1.30.18.38:

- auto-discovers Chrome for Testing or Chromium;
- rejects known branded Google Chrome binary paths;
- retains hard failure when no compatible Chromium target/driver exists;
- does not change production Chromium support or store packaging.

## Finding C — Windows ESM file paths

`tools/browser-smoke.mjs` and one M2 certification test derived filesystem roots from URL `.pathname`. That is not the portable Node conversion for Windows drive-letter/file-URL semantics.

1.30.18.38 uses `fileURLToPath()` for both roots. No runtime extension source depends on this maintenance-tool path handling.

## Explicitly rejected adjacent work

The following external observations are intentionally **not** included:

- test-group regex cleanup;
- duplicate build removal inside certification;
- generalized New Tab harness redesign;
- CSP/host-permission redesign;
- favicon architecture redesign;
- Sync/Recovery/first-paint changes;
- generic line-count/refactor work.

None is required to correct the demonstrated findings.

## Freeze rule after 1.30.18.38

After focused regressions, full suite, reachability, contracts, deterministic packaging and exact clean-source reproduction pass, the architecture and Maintenance Infrastructure return to the frozen state. No M7 exists. No generic 1.30.18.39 is planned.
