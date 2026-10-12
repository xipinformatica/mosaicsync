# MosaicSync 1.33.0.52 QA / release-candidate checklist

## Scope

Source baseline: audited and published corrected 1.33.0.49. Changes are limited to shortcut naming safety and fallback accuracy, tests, documentation and version/package metadata. Button layout is unchanged.

## Behavior gates

- New shortcut from valid URL gets an immediate short offline hostname name. Country-code second-level suffixes, localhost and IP addresses behave conservatively.
- If optional website access is already granted, URL completion may initiate a bounded metadata lookup and replace the suggestion with a cleaned page title; no new permission requests and no extra favicon-discovery work.
- The title fetch reuses the existing bounded HTML-head reader with credentials omitted, no referrer, a four-second deadline and redirect refusal. Reject non-HTTP URLs, misleading comment/script titles and forged Google service hostnames.
- No manually typed name or existing shortcut name may be changed by background results. In-flight old-URL results, closed editors, replaced editor sessions and saves must be protected.
- Failed fetches, absent permissions, malformed, generic, multilingual login/bot/error/redirect/loading titles or authentication destinations leave a usable fallback and must never prevent saving. IDN suggestions must be safe display-only Unicode.
- Cancel, Escape and backdrop close must not trigger optional title requests by blurring the URL field; in-flight title lookups are cancelled independently from favicon requests. Repeated blur must not repeat a request. Original action-button layout is preserved.
- Run all regression groups, full suite, independent clean-room replay and reproducible Firefox/Chrome/source ZIP builds.
- Run the GitHub four-browser release gate on the exact commit (including the newly added automatic naming smoke), plus independent audit before store publication.

## Non-goals

No changes to favicon scoring, background favicon queue, Sync/Recovery, storage format, new permissions, network telemetry or localization catalogs.
