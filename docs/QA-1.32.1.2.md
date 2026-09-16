# MosaicSync 1.32.1.2 QA / release-candidate checklist

## Scope

Localization-only corrective over 1.32.1.1. No production feature behavior is intentionally changed. The release closes the semantic gap where locale catalogs could be structurally complete while newer UI strings still contained English source text.

## Localization audit contract

- 33 supported source UI catalogs.
- 473 keys per catalog: **15,609 total catalog cells**.
- 32 non-English catalogs: **15,136 translated/localized cells** under the same key contract.
- Complete Recovery safety-copy manager translated in every non-English catalog.
- Complete Custom Branding surface translated in every non-English catalog; legitimate local technical words such as `Logo` may naturally equal the English spelling.
- `Sync storage` is now source-catalog-backed and localizable instead of an English-only Recovery HTML literal.
- Placeholder shape and browser-platform localization contracts remain enforced by the existing localization suite.

## Permanent 1.32.1.2 localization regressions

`tests/localization-integrity-13212.test.mjs` adds four independent gates:

1. Recovery/Custom Branding critical keys may not equal their English source values in any non-English locale.
2. Every exact-English value in a non-English catalog — including single-word values — must be explicitly reviewed as an invariant, cognate or established local technical loan.
3. Any exact-English multi-word value is additionally rejected unless it is a narrowly documented linguistic/technical exception.
4. Visible New Tab static text, `aria-label`, `title` and `placeholder` values must be catalog-backed or explicitly reviewed as invariant.

Reviewed exact-English multi-word exceptions after the audit are deliberately limited to:

- French `syncSourceId`: `source {id}` — *source* is the normal French noun in this UI context.
- Maltese `bookmarksCount`: `{count} bookmarks` — Microsoft terminology uses *bookmark* as an established Maltese computing loan.

The final single-word audit also normalized Maltese *folder* to the standard Maltese spelling **fowlder/fowlders**, and the Burgundy color label to **Borgonja**. Established computing loans such as *shortcut*, *bookmark* and *Sync* remain intentionally unchanged where they are the standard local UI term.

## Translation methodology

Translations were reviewed in the actual UI contexts before being written: the Recovery manager's title, explanatory copy, copy/device labels, destructive-action confirmations and result messages; and the Custom Branding editor's identity, device-local/privacy explanation, logo/text controls, validation and save feedback. Each locale reuses its established MosaicSync vocabulary where available instead of translating isolated English words without context.

## Architecture / privacy contract

- No permission or host-permission changes.
- No CSP, remote code, telemetry or service changes.
- No local/Sync persisted-schema change.
- No profile-format change; Custom Branding remains profile-v3 export/import data exactly as in 1.32.1.1.
- No Normal Sync, pending-journal, Recovery wire-format or ownership change.
- No browser-floor or first-paint ownership change.

## Final automated verification

- Complete release-authoritative suite: **1121/1121 passing**.
- 1.32.1.2 semantic localization-integrity gates: **4/4 passing**.
- Combined localization/catalog verification: **14/14 passing**.
- Startup: **168/168**.
- New Tab: **362/362**.
- Sync: **238/238**.
- Recovery: **137/137**.
- Security: **128/128**.
- Browser/parity contracts: **178/178**.
- Core: **130/130**.
- Release: **228/228**.

Runtime reachability is clean: zero unreachable shared modules, zero unused named imports and zero unreferenced private functions.

The canonical performance benchmark completes successfully. The release does not add startup/runtime feature logic; the runtime growth is confined to localization payload text and the permanent audit test is source-only.

## Package size

Final generated runtime payloads:

- Firefox: **2,385,006 raw bytes**, **697,051 deflated payload bytes**.
- Chrome: **2,406,648 raw bytes**, **711,566 deflated payload bytes**.

The localization source grows because English fallback text has been replaced with real translated wording; compressed payload size remains within the consciously updated 1.32.1.2 baseline.

## Certification environment

Browser-smoke probe result:

- Chromium is present.
- ChromeDriver is not available.
- Firefox is not available.
- GeckoDriver is not available.
- Xvfb is available.

Therefore this environment can truthfully certify the release as **MECHANICAL_ONLY**, not as a real Firefox/Chromium browser-smoke pair. The build, tests, reachability, benchmark, package contracts, clean-room source rebuild and deterministic artifact comparison remain mandatory and are completed before publication.

## Clean-room publication contract

The final GitHub-ready source ZIP is extracted into a clean directory, rebuilt and retested from that extracted source, then repackaged. The clean-room Firefox, Chrome and GitHub-ready ZIPs must reproduce the publication artifacts byte-for-byte before the release is handed off.
