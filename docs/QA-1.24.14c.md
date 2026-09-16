# MosaicSync 1.24.14c QA contract

1.24.14c is a narrow favicon-quality correction on top of 1.24.14b.

Required invariants:

- The normal first-pass favicon resolver remains favicon-first and unchanged in request order.
- Quality-only conventional probes from 1.24.14b remain browser-neutral; no host-specific icon mapping is introduced.
- If credential-free deep-page discovery redirects off the shortcut's original origin, the quality retry may inspect the original origin root for declared application icons.
- Root-derived candidates are accepted only when the root request itself remains on the original origin; a root that also redirects to an account/login provider is ignored.
- A sufficiently high-quality original-site root icon wins before redirect-provider favicon learning.
- Remote fetches retain bounded reads, MIME sniffing/rasterization, SVG admission, `credentials: "omit"`, no-referrer, CSP, and host-permission protections.
- Existing automatically learned favicons from 1.24.14 and 1.24.14b are re-checked once on upgrade; user-uploaded artwork is untouched.
- Firefox and Chrome carry the same resolver behavior.
- All prior security, concurrency, profile, cache, localization, optimization, build-parity, and favicon tests remain green.
