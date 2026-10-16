# MosaicSync 1.33.0.71 QA / release-candidate checklist

**PRIVATE CANDIDATE. No independent Claude approval, GitHub checks or signed-in multi-device acceptance yet.**

## Scope: Stage 3A, dataset-embedded reset authority

In .70, the persistent reset key can arrive after the replacement Personal/Work dataset and permit an offline device to merge pre-reset shortcuts (N4). The final dataset commit markers now carry `resetEpoch` and `resetInitiatedByDevice`. Before any initialized device merges, retries a pending mutation, repairs deletion authority or publishes, the reset guard examines both coherent core-marker keys and the durable separate reset record. It safely waits on a newer epoch even when the standalone key has not arrived. A stamp in either Space is sufficient to quarantine until the replacement profile is coherent. The separate epoch key can also arrive **first** while both old ledgers remain visible: a healthy legacy device must not adopt the epoch until both ledgers carry the new stamp and initiator; a waiting device must not rejoin an unstamped pre-reset layout or its matching old Recovery copy. Legacy-current-epoch adoption additionally requires both Personal and Work to be stamped with the same authoritative reset epoch and initiator; matching revisions and baseline alone do not establish epoch membership. A device that has observed a reset waits for dual stamped datasets even if only the persistent key (not either stamp) has arrived. Dataset commits refuse to claim a newer epoch that has not yet been accepted locally.

The Sync dataset schema version, persisted profile/backup formats, browser permissions, locales and protected DEVELOPER-GUIDE.md are unchanged. Browser Sync core marker values gain two optional fields, not a new key. Legacy readers that ignore these fields do not gain full N4 protection; an older publisher may overwrite a tagged marker, so simultaneous mixed-version use is a known limitation.

## Evidence to reproduce

- `tests/stage3a-key-first-133071.test.mjs`: two Chrome/Firefox real-background simulated key-first reset regressions. Up-to-date OLD-layout device receives persistent key before removal/republish; must wait rather than adopt, refuse joining unstamped old ledgers, then accept both new stamped Spaces without republishing obsolete shortcuts. Red-before-green on previous held .71.
- `tests/stage3a-reset-order-133071.test.mjs`: ten Chrome/Firefox production-background simulations: marker-last, pending old-world edit, Work-only epoch stamp, legitimate stamped current-epoch legacy upgrade and actual post-reset dual-Space stamping.
- Compare the same test harness against the unchanged .70 runtime. N4 reproductions must be red before and green after, and the .70 N6 edit-preservation scenarios must remain green.
- Full current suite: **1,658/1,658** passed on the corrected private K1 build. Complete regression suite, package and release contracts, browser smoke and true signed-in multi-device tests must be independently verified.
- Unresolved hazards for independent audit: marker overwritten by a <=.70 device; incomplete delivery of dataset records/marker; ambiguous storage commits and worker death between core writes and dataset commit; duplicate epochs with conflicting initiators; quota-full commit; concurrent local mutation while a reset is learned.

## Release gates

1. Independent Claude architecture review of the exact ZIP and adversarial N4/N6 compatibility.
2. Six GitHub release checks on the accepted source commit.
3. Real signed-in two-device Chrome then Firefox tests, including the standalone key delivered first or last, after restart, two spaces and pending local changes.
4. Publication only after explicit authorization. All required store changelogs must be cumulative since the actual last published store version.

## K1 acceptance (late offline reconnect)

- Held .71: `tests/stage3a-key-first-133071.test.mjs` must fail in both simulated Chrome and Firefox backgrounds because the key-first observer incorrectly adopts the old revision.
- Corrected .71: 2/2 must pass; device quarantines immediately, refuses to join while Personal and Work remain unstamped, then joins only the fully stamped replacement. No old shortcut is republished.
- Real signed-in Chrome/Firefox acceptance **remains mandatory**. Include one device offline through the entire reset with many shortcuts, reconnect when the reset key might be delivered first, and compare both devices for resurrected IDs.
- Known limits: key-first first-time device during reset (K2), fast-clock Recovery (P2), corrupted maximum epoch (P3), records/offline writes before reset awareness (O6/OFFW), and older peers overwriting stamps. These are not claimed fixed.
