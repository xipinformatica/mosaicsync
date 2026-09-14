# MosaicSync 1.33.0.23 QA / release-candidate checklist

1.33.0.23 is deliberately limited to one production efficiency change plus first-paint regression hardening over authoritative 1.33.0.22:

- healthy catastrophic-loss liveness uses a positive-only fixed-key probe before authoritative reconciliation;
- empty, dynamic-item-only, failed or otherwise ambiguous probes preserve the established full-read confirmation path;
- normal authoritative reconciliation, Recovery decoding/self-heal, pending journals, five-minute watchdog cadence and destructive Recovery revalidation are unchanged;
- synchronous bootstrap geometry is compared against the real authoritative `applySettings()` owner, and artwork ownership covers immediate/builtin/deferred/fallback semantics.

Required release gates:

- `tests/corrective-133023.test.mjs` green, including red-before-green evidence for the removed healthy-path full read;
- historical Snow Leopard II snapshots remain immutable while current live-count assertions explicitly encode the separately-proven .23 exception;
- complete canonical and clean-room suites green;
- focused Startup/New Tab/Sync/Recovery/Security/Browser/Core/Release groups green;
- runtime reachability remains 0 unreachable shared modules / 0 unused named imports / 0 unreferenced private functions;
- Firefox, Chrome and GitHub-ready source ZIPs reproduce deterministically from a clean-room source extraction;
- browser automation status reported honestly.

No Sync/Recovery wire-format, Recovery-generation format, persisted schema, profile format, permission, CSP, browser-floor or privacy-boundary change is in scope.
