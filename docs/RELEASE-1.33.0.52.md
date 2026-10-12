# MosaicSync 1.33.0.52 publication notes

## Firefox Add-ons / Chrome Web Store release notes

New shortcuts now get friendly, distinguishable names immediately and offline. When website access is already allowed, leaving the URL field can suggest a concise page title; you can always choose your own name. Repeated or cancelled lookups no longer create unnecessary website requests, and misleading login/error pages cannot replace a useful name.

## Mozilla Notes to Reviewer

Compared with 1.33.0.49, the New Tab shortcut editor now derives a provisional hostname label for new shortcuts. A bounded `<title>` lookup using the existing credential-free `fetchHtmlHead` helper begins only after URL-field blur/Enter with previously granted optional website permission. Typing and incomplete hostnames initiate no request. Hostname naming preserves distinguishing subdomains/tenants; unreadable, multilingual login, error, loading, and bot-check titles or authentication URL redirects are excluded. No new permissions or host patterns were added. Redirected login-provider titles, invalid URLs, overlong titles and stale edits are rejected. Editing existing shortcuts and manually entered titles remain authoritative. Title lookups now use a separate cancellation ID, refuse HTTP redirects, and exclude fake titles in HTML comments/scripts. Google service aliases require the genuine google.com domain. No change to the favicon resolver, Sync/Recovery protocol or saved data format.

The speculative universal 1px button-padding shift was removed after an independent Linux font regression; existing flex-centered button layout, focus, sizing and click behavior remain unchanged. Regression coverage verifies duplicate-request prevention, cancellation, misleading titles, exact-domain aliases, fallback, stale-response and manual-override behaviors. The real-browser smoke now exercises automatic naming. Browser smoke and independent review are required prior to publishing.

## GitHub release title

`MosaicSync 1.33.0.52`

## GitHub release description

- Friendly hostname-based names immediately when adding shortcuts, distinguishing related services.
- Safer optional website titles: no duplicate lookups, cancelled lookups stop, misleading login/error titles are ignored, and unrelated websites cannot claim Google service names.
- Consistent native button text alignment across fonts; no blanket offset.
- No new permissions or changes to favicon discovery, Sync, Recovery, or storage formats.
