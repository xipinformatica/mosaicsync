# MosaicSync compatibility and security watchpoints

This document records the externally visible browser/API assumptions behind the frozen MosaicSync runtime. It is a maintenance map, not a second implementation specification. The manifests and release-contract tests remain authoritative.

Last reviewed: **2026-09-03** after the post-M6 external-audit correction / MosaicSync 1.30.18.38.

## Supported browser floors

### Firefox: 140+

The production manifest intentionally sets `browser_specific_settings.gecko.strict_min_version` to `140.0`.

Why 140 is the floor:

- Firefox 140 added `browser_specific_settings.gecko.data_collection_permissions`, which MosaicSync declares for Mozilla's built-in data-collection consent model.
- MosaicSync's Firefox manifest uses Manifest V3, a stable extension ID, `storage`, `alarms`, optional `topSites` / `bookmarks`, optional HTTP(S) hosts, the New Tab override, and the Firefox homepage override.
- Firefox-specific Top Sites options (`newtab`, `includeFavicon`, `limit`) remain behind `getNativeTopSites()`. Shared New Tab native-cache hydration uses that adapter; Chromium therefore calls `topSites.get()` with no Firefox-only options.
- Firefox native open-tab favicon recovery reads `tabs.query({url: ...})` only after matching HTTP(S) host access is already granted; MosaicSync deliberately does not request the broad `tabs` permission.

Primary external references reviewed in M6:

- MDN Firefox 140 add-on developer notes: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/140
- MDN `browser_specific_settings`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- MDN `permissions.request()`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request
- MDN `topSites.get()`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/topSites/get
- MDN Tabs permissions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs

### Chromium / Chrome: 104+

The production Chromium manifest intentionally sets `minimum_chrome_version` to `104`.

Why 104 is the floor:

- Manifest V3 itself predates this floor.
- `chrome.storage.session`, used as a disposable session cache, is available from Chrome 102 in Manifest V3.
- Promise-based `chrome.topSites.get()` is available from Chrome 96.
- Chrome 104 introduced the Manifest V3 `chrome-extension://<id>/_favicon/` URL used by MosaicSync's browser-local favicon adapter. This is the highest known minimum among MosaicSync's audited Chromium capabilities and therefore justifies the existing floor exactly.
- The `favicon` permission is intentionally required on Chromium because the browser-local `_favicon` source is a core platform capability there. Optional `topSites`, `bookmarks`, and HTTP(S) host permissions remain optional.

Primary external references reviewed in M6:

- Chrome Extensions What's New — Chrome 104 favicon API: https://developer.chrome.com/docs/extensions/whatsnew/
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome Top Sites API: https://developer.chrome.com/docs/extensions/reference/api/topSites
- Chrome favicon guide: https://developer.chrome.com/docs/extensions/how-to/ui/favicons
- Chrome minimum version manifest key: https://developer.chrome.com/docs/extensions/reference/manifest/minimum-chrome-version

## Permission budget

MosaicSync follows a least-privilege split.

### Required on Firefox

- `storage` — local, session and synchronized extension state.
- `alarms` — bounded background maintenance / retry scheduling.

### Required on Chromium

- `storage`
- `alarms`
- `favicon` — browser-local Manifest V3 favicon endpoint.

### Optional on both browsers

- `topSites` — Frequently Visited only after user opt-in.
- `bookmarks` — bookmark integration only after user action/consent.
- `http://*/*` and `https://*/*` optional host permissions — website favicon retrieval and matching-tab metadata only after the feature/user grants access.

MosaicSync does **not** request `tabs`, `history`, `cookies`, `webRequest`, `scripting`, `downloads`, `management`, `nativeMessaging`, `unlimitedStorage`, or content-script access.

Firefox additionally declares Mozilla's data-collection contract as `required: ["none"]`, with the feature-specific optional categories already reviewed for Sync consent. Do not broaden these declarations without a separately reviewed privacy/product reason.

## CSP and remote-code boundary

The release contract pins the extension-page CSP to:

```text
default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; connect-src http: https:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self'
```

Maintenance implications:

- executable JavaScript remains extension-packaged/self-hosted;
- there is no `unsafe-eval` or `unsafe-inline` script allowance;
- there are no content scripts or externally-connectable entry points;
- HTTP(S) network access exists for explicitly designed favicon/image discovery, not remote executable code;
- fixed runtime destination hosts remain allow-listed by `tools/release_contract.py`.

## Dependency boundary

The repository intentionally has **no npm runtime or development dependencies**. The maintenance scripts use Node.js built-ins and Python's standard library. WebDriver smoke uses the standard WebDriver HTTP protocol rather than a third-party browser-automation package.

Do not add a dependency merely for convenience. A new dependency needs a concrete reduction in risk or maintenance cost that is greater than the supply-chain/update burden it introduces.

## Chromium automation target for M1

The real-browser smoke lane intentionally uses **Chrome for Testing or Chromium**, not current branded Google Chrome. Branded Chrome removed the `--load-extension` command-line path used by this dependency-free WebDriver harness starting with Chrome 137, and later branded releases also removed related extension command-line switches. `tools/browser-smoke.mjs` therefore rejects known branded-Chrome binaries rather than advertising an automation target that cannot load the unpacked MosaicSync runtime. This affects maintenance tooling only; it does not change MosaicSync's production Chromium compatibility floor.

## Periodic review triggers

Re-run a compatibility review when any of these occurs:

1. Mozilla changes AMO manifest/data-collection requirements.
2. Firefox deprecates or materially changes an API MosaicSync uses.
3. Chrome changes Manifest V3 service-worker, `_favicon`, storage/session, permission or New Tab behavior.
4. A store rejects the current manifest or permission declaration.
5. A supported browser floor is raised for a concrete API reason.
6. Real-browser smoke begins failing on a current stable browser without a MosaicSync code change.

Do not raise browser minimum versions merely because newer versions exist.
