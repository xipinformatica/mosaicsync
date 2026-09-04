# MosaicSync 1.30.18.44 publication notes

## Mozilla changelog

Refines the quota-safe **Clear Sync copy** reset and New Tab presentation. Clearing MosaicSync data from Firefox Sync now preserves the user’s **Sync across Firefox** preference while keeping the device safely uninitialized in `await-remote` mode until a deliberate new source is chosen; it still preserves the local Personal/Work layout, leaves only the intentional-reset sentinel remotely, and never auto-republishes the old profile. The reset warning/completion text is updated in all 33 UI languages. New Tab now uses a thin theme-aware scrollbar with a transparent track from first paint, preventing the opaque dark hover strip seen on Light wallpapers. No permissions, CSP, state/profile schema, reset-intent schema or Sync/Recovery wire-format versions change.

## Mozilla Notes to Reviewer

MosaicSync 1.30.18.44 is a narrowly scoped corrective follow-up to 1.30.18.43. It contains two user-reproduced fixes and no new product feature or permission.

### Clear Sync copy keeps the Sync preference enabled

1.30.18.43 fixed a real quota-full reset failure by arming intentional-reset protection locally, calling `browser.storage.sync.clear()`, then writing back and verifying only the existing versioned reset-intent sentinel. That quota-safe ordering is unchanged in 1.30.18.44.

The 1.30.18.43 initiator state also set `syncEnabled:false`, which made the Settings **Sync across Firefox** switch turn off after a successful reset. That was unnecessarily different from the already-safe behavior of another device that *observes* the same reset-intent sentinel: observing peers keep Sync enabled but become uninitialized in `await-remote` mode.

1.30.18.44 makes the initiating device use the same safety model. `clearSyncData()` preserves the user’s existing `syncEnabled` preference. When Sync was enabled, the successful reset state is `syncEnabled:true`, `syncInitialized:false`, `syncBootstrapMode:"await-remote"`, `syncStatus:"waiting"`. Automatic local publication still requires `syncInitialized:true`, so clearing the cloud copy cannot immediately republish the preserved local Personal/Work profile. The intentional-reset continuity marker is armed before the namespace clear, and the reset-intent sentinel remains the only synchronized item after success. An explicit **Use this device as Sync source** can create the next authoritative profile, or the device can safely wait for another MosaicSync peer to create it.

If the browser refuses the namespace clear itself, the exact pre-reset local control/continuity state is restored because no remote deletion was committed. If the namespace was cleared but sentinel write/verification unexpectedly fails, the device remains uninitialized rather than being re-armed for automatic publication. Quota-full behavior from 1.30.18.43 is preserved.

The destructive confirmation and completion text are updated in all 33 runtime languages so they no longer claim Sync will be switched off. They state that Sync remains enabled while MosaicSync waits for a deliberate new source.

### Theme-aware New Tab scrollbar

On Firefox/Windows with Light appearance and a bright wallpaper, the previously unstyled `.page` scrollbar could expose a platform-native opaque dark track when hovered. The page is the actual scrolling element (`html`/`body` remain overflow-hidden), so 1.30.18.44 explicitly owns only that scrollbar in `newtab-critical.css`.

Firefox receives `scrollbar-width: thin` and `scrollbar-color: var(--scrollbar-thumb) transparent`. Chromium receives the equivalent `::-webkit-scrollbar` rules. The track is transparent in both themes; Light uses a restrained medium-grey thumb and Dark uses a subtle light-grey thumb, with a slightly stronger hover only where the engine exposes a thumb hover pseudo-element. The rules are in critical first-paint CSS so there is no native-track flash before the complete New Tab UI loads. Scrolling geometry, page overflow ownership and layout are unchanged.

Permanent regressions cover Firefox and Chromium reset semantics, quota-full preservation, no automatic republish after reset, all-locale reset messaging, and critical scrollbar ownership/transparent-track styling. The untouched 1.30.18.43 source fails both new 1.30.18.44 corrective checks before the production changes are applied.

No permissions, host permissions, CSP, browser capability, state/profile schema, reset-intent schema, Sync/Recovery wire-format, telemetry, remote code or unrelated product behavior changes.

## Chrome Web Store release notes

Clear Sync copy now keeps **Sync across Firefox** enabled while MosaicSync safely waits for a deliberate new source, preserving the quota-full hard-reset behavior and local layout. New Tab also uses a thin theme-aware scrollbar with a transparent track so Light wallpapers no longer show an opaque dark hover strip. Reset messaging is updated in all supported UI languages. No new permissions.

## GitHub release title

`MosaicSync 1.30.18.44`

## GitHub release description

MosaicSync 1.30.18.44 refines the safe Sync reset and Light-theme New Tab presentation.

**Clear Sync copy** still works when browser Sync storage is full, preserves the local Personal/Work layout and leaves only the intentional-reset sentinel remotely. It now also preserves the user’s **Sync across Firefox** setting: the device stays safely uninitialized in `await-remote` mode and cannot automatically republish the old profile until a deliberate source is chosen. Reset messaging is updated across all 33 UI languages.

New Tab now owns a thin theme-aware scrollbar from first paint. Its track remains transparent in Light and Dark appearance, with a restrained theme-appropriate thumb, eliminating the opaque black hover strip visible against bright wallpapers.

No permissions, CSP or Sync/Recovery wire-schema versions change.

## GitHub Desktop

**Summary:** `Release MosaicSync 1.30.18.44`

**Description:** `Keep Sync enabled after a safe reset and polish the New Tab scrollbar.`
