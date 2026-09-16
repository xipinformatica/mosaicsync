# MosaicSync 1.30.18.2 QA / release-candidate checklist

## Automated gates

- [ ] Full Node regression suite passes from the final source.
- [ ] Benchmark and package-size guards pass.
- [ ] Firefox/Chrome/source package versions are exactly `1.30.18.2`.
- [ ] Clean GitHub-ready extraction reproduces the same public packages byte-for-byte.
- [ ] Release-contract scanner accepts both built runtime trees and both public browser ZIPs.

## 1.30.18.2 regressions

- [x] Frequently Visited ON + missing Top Sites permission keeps synchronized intent ON and exposes a visible launcher recovery state.
- [x] Startup permission checking never calls `permissions.request()` automatically; normal updates with an intact grant remain silent.
- [x] The launcher recovery action starts `permissions.request()` synchronously from the user click and restores suggestions without an OFF → ON toggle.
- [x] The existing Settings Grant permission action shares the same recovery path and Settings visually emphasizes the missing prerequisite.
- [x] A live missing-permission result clears stale cached Frequently Visited cards before unlocking the recovery action.
- [x] Permission restoration hides both recovery surfaces, clears the device-local candidate cache and refreshes suggestions automatically.
- [x] Existing permission `onAdded` / `onRemoved` reconciliation remains filtered to Top Sites and self-heals without waking unrelated Website Access work.
- [x] All user-visible recovery text reuses the existing 33-locale message keys; no hardcoded new English runtime string is introduced.

## Manual acceptance

- [ ] With Frequently Visited ON and Top Sites permission already granted, update/reload MosaicSync and confirm no Firefox permission prompt appears.
- [ ] Remove/revoke Top Sites permission while Frequently Visited remains ON; open New Tab and confirm a clear Grant permission action appears where Frequently Visited normally sits.
- [ ] Click Grant permission, allow Firefox's prompt, and confirm suggestions appear immediately without toggling Show OFF/ON.
- [ ] Deny the permission and confirm the Show toggle remains ON while the recovery action remains available.
- [ ] Grant permission from Settings and confirm the launcher recovery state disappears automatically.
- [ ] Confirm 1.30.18.1 first-paint cache behavior remains intact for Personal/Work and stale cached Frequent cards never become actionable before live reconciliation.
