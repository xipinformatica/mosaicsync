# MosaicSync 1.33.0.56 publication notes

Source baseline: supplied 1.33.0.55. Latest confirmed public release in this conversation: 1.33.0.54. This is a release candidate, not an assertion of publication.

## Firefox / Chrome version notes

Automatic shortcut naming recognizes more websites, including sites that redirect to a canonical address or language page. Shortcuts still save immediately and preserve names you choose yourself.

## Reviewer notes

This release adds the required **webRequest API permission** to both manifests. There is no new host permission; website access remains optional. Manual Fetch responses hide redirect destinations in browsers. Temporary, non-blocking request-start and response-header listeners correlate request IDs and read Location for extension-origin GET requests matching the active title URL, then are removed in finally. Responses from favicon requests already in flight are ignored. It ignores tab traffic and other extensions. Ambiguous or unavailable observations fail closed.

Each redirect is checked before contact: HTTP(S), same hostname or its www equivalent, same explicit port, no credentials and no HTTPS downgrade. Maximum three redirects; loops stop. All hops share the existing four-second abort deadline. Final HTML remains bounded to 256,000 bytes and passes the existing metadata/title filters. Requests omit credentials and referrer, use no-store, and never enable automatic redirect following. Favicon discovery retains its original fetch path and behavior.

The .55 conditional name-only post-save update is retained, including protection against later manual renames, URL changes and deletion. No storage-schema or Sync/Recovery protocol changes. No UI string changes; all 34 locales remain present.

Diagnostics are local aggregate counts only, held in background memory. In an extension page console:

```js
await (globalThis.browser || globalThis.chrome).runtime.sendMessage({type: 'mosaicsync:get-shortcut-title-diagnostics'})
```

Reasons include permission, network, timeout, cancelled, HTTP status, no-metadata, redirect-blocked, redirect-loop, redirect-limit, redirect-unavailable and redirect-ambiguous. `metadata-found` means extraction succeeded, not necessarily that the UI accepted the title or committed a rename. No URL/title/request-ID history is retained or transmitted.

## GitHub release title

`MosaicSync 1.33.0.56`

## Publication gate

See QA-1.33.0.56.md for evidence and remaining checks. Run the GitHub four-browser gate on the exact final commit before store submission. Website TLS failures, bot protection, missing permission or absent/unsuitable metadata still legitimately preserve the offline name. This release cannot guarantee a proper brand name for every website.

Deferred LOW backlog: shared-host suffix specificity and visually confusable IDN fallback labels.
