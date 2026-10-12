# MosaicSync 1.33.0.55 QA / release-candidate checklist

Public baseline: 1.33.0.54. Scope: one-shot post-save automatic website-name enrichment, metadata parsing and narrowly scoped conditional persistence.

- [ ] URL-first Enter saves offline immediately, with no wait for website access or network.
- [ ] Previously granted website permission: 1 post-save metadata request; `og:site_name` preferred to cleaned title.
- [ ] No permission: zero naming requests; manual-name opt-out and existing edits: zero post-save requests.
- [ ] Editor's previous request is still cancelled on save/closure. The post-save job uses a distinct request ID.
- [ ] Redirects still refused; HTTP errors, malformed HTML, fake script/comment meta, login/error content and Unicode bidi characters rejected.
- [ ] Name-only update checks latest stored URL/name/createdAt/modifiedAt inside storage write lock. Manual edit (including same-name), URL change or deletion causes no write or Sync journal.
- [ ] Favicon/position/Space/folder changes stay intact; active/inactive Spaces and folder children covered.
- [ ] Failed original save starts zero requests; failed enrichment write preserves saved shortcut.
- [ ] No Web Locks => fail closed; no additional permissions, telemetry, data format or Sync/Recovery authority changes.
- [ ] Complete Node test suite, test inventory, ZIP integrity, independent clean-room rebuild/replay.
- [ ] Four-browser GitHub Actions gate and native keyboard/real-site check on final commit.

Deferred LOW backlog: shared-host name specificity and confusable IDN display labels (not part of .55).
