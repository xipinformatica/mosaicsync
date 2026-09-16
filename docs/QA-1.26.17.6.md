# MosaicSync 1.26.17.6 QA / performance-stability checklist

1. Open Firefox and Chrome New Tabs repeatedly with normal profiles; first paint, authoritative reconciliation, Space switching, folders, Settings and wallpaper appearance must remain visually identical to 1.26.17.5.
2. Seed automatic-icon recovery with multiple shortcuts using the exact same URL and quality mode. Confirm one resolver/network job fans out to every matching ID, while a different path on the same origin and the quality pass each remain separate resolver jobs.
3. While favicon networking is in flight, delete/edit/move one matching shortcut and confirm stale-result revalidation still prevents resurrection/overwrite while unaffected matching IDs can still hydrate.
4. Enable Frequently Visited and refresh/focus repeatedly without changing shortcut state; the explicit-host Set should be reused. Then add/delete/move/import/Sync-replace a shortcut and confirm the next refresh rebuilds the Set and never suggests an explicit shortcut from either Space or a folder.
5. Confirm production startup produces no MosaicSync performance `console.debug` output unless `globalThis.MOSAICSYNC_DEV_METRICS = true`; with the flag enabled, existing local diagnostics still work.
6. Execute the first-paint hostile-URL behavioral tests (`javascript:`, `data:`, etc.) and the missing-helper case; no unsafe anchor may be created and the authoritative renderer must remain able to take over.
7. Execute checksum-valid hostile profile tests and verify dangerous own prototype keys are absent throughout the normalized tree and `Object.prototype` remains unchanged.
8. Re-run favicon recovery, permission grant/revoke, Sync/concurrency/rebase, local-asset GC, profile import/export, localization and parity regressions unchanged.
9. Run the complete Firefox/Chrome suite and benchmark; compare 1.26.17.5 and 1.26.17.6 results in the same environment.
10. Rebuild twice and require byte-identical Firefox/Chrome runtime ZIPs; extract the GitHub-ready source in a clean directory, run the full suite there, rebuild runtime packages and require byte identity with the delivered ZIPs.
11. Diff both manifests against 1.26.17.5: only the release version fields may change. Re-check CSP, permissions, host permissions, secrets, absolute paths and runtime-package contents before publishing.
