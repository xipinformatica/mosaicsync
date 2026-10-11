# MosaicSync 1.33.0.48 publication notes

## Firefox Add-ons / Chrome Web Store release notes
Internal maintenance update that preserves existing features and saved data. No new permissions.

## Mozilla Notes to Reviewer
Neofix 4 is a **behavior-preserving** New Tab persistence-boundary restructuring over 1.33.0.47. Six existing calls to `writeLocalStateWithBaseline()` now route through `persistence-gateway.js` with the same options, return and rejection semantics. The two gateway operations reflect ordinary baseline-aware writes and guarded whole-profile imports. Timestamp calculation, state adoption, error presentation, Settings draft preservation and branding rollback remain in their original call sites. No Sync/Recovery protocol changes, permissions, CSP, telemetry, schema or new browser dependencies. Mechanical and browser CI evidence must accompany publication; passing Node tests alone does not qualify.

## GitHub release title

`MosaicSync 1.33.0.48`

## GitHub release description

Neofix 4 reduces concentrated New Tab persistence complexity without changing user-visible behavior. Six existing saves route through one auditable helper with the same authorization and conflict rules. All browser permissions and profile/Sync formats remain unchanged. Release gate: complete regressions, reproducible packages, independent architecture audit and real-browser CI.
