# MosaicSync 1.33.0.49 QA / release-candidate checklist

## Strict scope
- Compare with SHA-256-identified, W-1-corrected 1.33.0.48 source (`b612314d393a39f7…`).
- Only modify favicon suitability scoring, 480-key Ukrainian runtime/manifest localization registration, version/build metadata, regressions and documentation. Do not refactor discovery paths or affect Sync/Recovery.
- Validate Ukrainian `uk-UA` auto locale, explicit switching, placeholder parity, Chrome wording and manifest metadata in both Firefox and Chrome.
- Native-speaker Ukrainian proofreading is a release recommendation; automated checks cannot certify translation nuance.

## Mandatory checks
1. Score selection: 48px declared link < 180px declared touch, 32px conventional favicon > generic 512px manifest, 64px link still sufficient for bounded early exit, rectangle/invalid images penalized, selector deterministic.
2. Run existing real resolver, background queue, no-downgrade, manual preference, artwork persistence and stale-result tests; verify unchanged scheduling and permission behavior.
3. Verify all 480 Ukrainian keys and interpolation placeholders against English; inspect representative long Sync, Recovery, backup and errors in both browser editions.
4. Full 8-group suite, all regression files and clean-room replay; generated manifests/release contract and package reproducibility.
5. Real Chromium 141, current Chromium, Firefox 140 and current Firefox GitHub Actions browser smoke on the **exact commit**. No CI result = no browser certification.
6. Independent adversarial favicon/runtime audit and language review before store publication.

## Non-goals
No favicon network probing changes; no quality-ledger re-audit policy bump; no rescanning all existing shortcuts; no new schema, permissions, telemetry, user-interface rearrangement or Sync/Recovery changes. Existing 30-day quality audits are not mass-invalidated.

## Independent Claude F-1/F-2/F-3/F-4 follow-up (same .49)
- **F-1 redirect / parent-host:** no new 128+ resolution tier for those source kinds. Full real `resolveFaviconForUrl` under mocked network must keep the site's own 16px ICO ahead of an off-origin redirected login-provider 128px ICO; prior .49 failed this.
- **F-2 Windows tile (conservative policy):** preserve the pre-.49 weight for `tile`. Large mask/legacy Windows tile glyphs, which may be invisible on light themes, must not replace a 16px own-site icon solely due to the size bonus. The full resolver test includes this scenario.
- **Positive control:** website-declared 180px touch artwork must still beat a 48px link; generic large manifest art must still be bounded; early-stop, manual-choice safety and scheduling unchanged.
- **F-3/F-4:** Ukrainian uses account-*mediated* Sync transfer wording, and two Chrome Sync status strings use the `Chrome Sync` product label, not an invented Chrome account. No data format or behavior changes.
- Ukrainian Chrome extension metadata must stay at or below the documented 132-character manifest description limit. Earlier languages exceeding the cap are pre-existing and are not modified here.
- Regression evidence: the added three test cases failed on the initial .49 (two favicon resolver environments plus Ukrainian) and passed after correction.
- Remaining publication gates: exact-commit four-browser CI and independent reviewer acceptance; no invented browser certification.
