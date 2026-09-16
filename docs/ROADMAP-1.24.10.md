# 1.24.10 Instant New Tab decisions

Implemented after 1.24.9 proved stable in Firefox and Chrome:

- tiny, content-keyed favicon previews in the disposable synchronous render manifest, under a strict total cache budget;
- an early `storage.session` read started before the ES-module graph is parsed;
- cached grid bootstrap moved ahead of hidden dialog markup in the parser;
- matching boot grids are kept on screen until authoritative local state is ready, avoiding an unnecessary intermediate rebuild;
- image optimization and render-preview maintenance moved off the static New Tab module graph.

Deliberately unchanged: Sync semantics, favicon network discovery, profile/asset schemas, `.mosaicsync` v2, permissions, UI features, Spaces behavior, and browser-specific API adapters.

The preview cache is never authoritative. It is safe to delete, cap, partially populate, or rebuild at any time.
