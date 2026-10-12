# MosaicSync 1.33.0.53 QA / release-candidate checklist

## Scope

Source baseline: published 1.33.0.49, followed by internal candidates 1.33.0.50–1.33.0.52. Scope: safer automatic naming, URL-first creation and browser-neutral in-page confirmations, plus tests/documentation/release metadata. Button layout is unchanged.

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

No changes to favicon scoring, background favicon queue, Sync/Recovery protocol, storage format, new permissions or telemetry. One new string is included in each of the 34 existing localization catalogs.

## 1.33.0.53 confirmation and name-editor QA

- [ ] New shortcut: URL is first, automatic naming initially checked, Name read-only and visibly subdued.
- [ ] Enter from URL saves and closes; invalid URL stays editable; rapid Enter does not duplicate a shortcut.
- [ ] Manual naming opt-out edits the title; edit existing shortcut preserves existing title.
- [ ] Delete: shared modal, Cancel/Escape/backdrop preserve shortcut, confirm removes it. Repeat on Firefox and Chromium with native JS dialogs blocked.
- [ ] Verify other destructive prompts (Recovery, Sync, imports) still require explicit acceptance.
- [ ] Real four-browser GitHub Actions matrix green on the exact publication commit (not locally verified).
