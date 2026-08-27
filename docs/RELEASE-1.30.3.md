# MosaicSync 1.30.3 publication notes

## Release status

MosaicSync 1.30.3 is the direct zero-new-features stability successor to 1.30.2. It is built specifically around reproduced Settings freezes seen on Firefox: Separate Light/Dark Wallpapers on Linux Mint 22.3 Cinnamon/X11 and Windows 11, plus Frequently Visited on the Linux machine.

## Validation

Automated release gates: **559/559 tests pass**, benchmark passes, package-size guard passes, and a clean extraction of the GitHub-ready source rebuilds the Firefox and Chrome archives byte-for-byte identically. The reproduced Settings freeze still requires the documented Linux/Windows Firefox hardware retest before declaring that specific hardware symptom resolved publicly.

## Mozilla Developer Hub changelog

Zero-new-features stability release. Settings no longer uses Firefox's native modeless `<dialog>` after reproduced freezes while expanding Separate Light/Dark Wallpapers; the fixed panel keeps accessible dialog semantics and explicit close/Escape/outside-click behavior. Separate Wallpapers and Frequently Visited now minimize live layout/repaint work. Space switching is blocked while Settings owns a pending draft. Stale shortcut/wallpaper async jobs and System-theme reconciliation are generation-guarded. Favicon conventional-fallback timeouts remain provisional, durable favicon-recovery queue mutations are serialized/rebased and reject non-finite timestamps, and final slider interactions persist immediately. No new permissions, schemas, CSP changes, telemetry, remote code or features.

## Notes to Reviewer

Corrective maintenance only. The main UI change replaces only the modeless Settings `<dialog>` element with an ordinary fixed `<aside role="dialog" aria-modal="false">`; appearance and interaction remain a fixed top-right Settings panel. This is a targeted response to reproducible Firefox freezes on both Linux and Windows when the Separate Light/Dark Wallpapers section changed layout, with a related Frequently Visited freeze on Linux. Settings retains programmatic naming plus explicit open/close, Escape and outside-click handling. The Separate Wallpapers checkbox now changes visibility of already-prepared cards without repainting both preview images in the same gesture. Other changes harden async ownership/cancellation, System-theme ordering, favicon quality timeout completion, device-local recovery-queue concurrency and final-event persistence. No permission, synchronized/storage/profile schema, CSP, remote-code or network-scope changes.

## GitHub release title

`MosaicSync 1.30.3`

## GitHub release description

MosaicSync 1.30.3 is a zero-new-features stability release focused on Settings reliability and async ownership. It removes Firefox's native modeless dialog lifecycle from the Settings panel after the Separate Light/Dark Wallpapers toggle reproduced freezes on Linux and Windows Firefox, and reduces layout churn in that control plus Frequently Visited. It also prevents Settings drafts from crossing Spaces, discards stale shortcut/wallpaper image jobs, makes System-theme resolution last-result-wins, completes favicon fallback timeout propagation, serializes/rebases favicon recovery-queue mutations, rejects non-finite recovery timestamps and persists final slider values immediately. No permissions, schemas, CSP, telemetry, remote code or feature surface changed.

## GitHub Desktop commit

**Summary:** `Release MosaicSync 1.30.3`

**Description:** `Fix reproduced Firefox Settings freezes, harden Settings/Space ownership and async artwork cancellation, complete favicon timeout/recovery-queue resilience, and add 1.30.3 regressions. Zero new features or permissions.`
