# MosaicSync 1.24.14f QA contract

1. Firefox and Chrome technical manifest versions are `1.24.14.5`; Chrome exposes `version_name: "1.24.14f"` and Firefox must not contain `version_name`.
2. `DONATE_URL` is exactly `https://ko-fi.com/mosaicsync`; Welcome and Settings use it directly through their existing donation actions.
3. No supported locale contains the obsolete `donationSoon` or `donationPreparing` keys, and no Settings/Welcome UI displays donation-page preparation text.
4. Firefox/Chrome New Tab Sync help tooltips and the Welcome Sync help tooltip use the shared viewport-tooltip positioning helper.
5. Visible tooltips are rendered outside clipped dialog containers, clamped to the viewport, and flip below the anchor when necessary.
6. Tooltip positioning introduces no new user-facing hard-coded strings.
7. All 1.24.14e favicon resolver behavior and tests remain intact. Direct upgrades from technical versions 1.24.14 through 1.24.14.4 still schedule the one-time favicon-quality recheck.
8. Firefox/Chrome parity, security, concurrency, profile, storage, localization, benchmark and reproducible-build contracts must continue to pass.
