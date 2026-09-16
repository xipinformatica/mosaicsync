# MosaicSync 1.24.12 QA contract

1.24.12 is a security/correctness hardening release. No user-visible feature, permission, Sync schema, asset-store schema, or `.mosaicsync` format change is intended.

Release checks:

- Two New Tab contexts editing different shortcuts from the same base must preserve both edits.
- A deletion must not erase an unrelated concurrent addition.
- A cross-Space move must not erase an unrelated concurrent addition.
- Concurrent edits to different settings fields must both survive.
- Concurrent local favicon hydration must survive an unrelated core edit.
- v2 profile imports must reject checksum-valid extra/unreferenced assets and accept exact referenced asset sets.
- CSP must remain strict; executable HTML/code sinks remain absent.
- Remote SVG favicon admission must reject script, event handlers, embedded documents/images, external references, XML entities/stylesheets and non-fragment CSS URLs.
- Oversized image data URLs and malformed/overlong asset IDs must fail before expensive decoding/hash work.
- All long-lived runtime/cache budgets remain finite and bounded.
- Firefox and Chrome builds must pass the same shared regression suite and browser parity checks.
