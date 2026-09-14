# MosaicSync 1.33.0.22 QA / release-candidate checklist

1.33.0.22 is deliberately limited to two New Tab UI corrections over authoritative 1.33.0.21:

- synchronous bootstrap folder geometry matches authoritative `applySettings()` at non-default tile sizes;
- editing a child shortcut preserves the open folder and modal pointer activity cannot trigger the outside-folder close path.

Required release gates:

- `tests/corrective-133022.test.mjs` green, including 68/76/84px first-frame geometry and folder-editor pointer ownership;
- complete regression suite green;
- focused Startup/New Tab/Browser/Release groups green;
- runtime reachability remains 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions;
- critical-path/storage census shows no new startup I/O/module work;
- Firefox, Chrome and GitHub-ready source ZIPs reproduce deterministically from a clean-room source extraction;
- browser automation status reported honestly.

No Sync/Recovery wire-format, persisted-schema, permission, profile-format, CSP, browser-floor or privacy-boundary change is in scope.
