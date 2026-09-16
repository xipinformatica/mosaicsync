# MosaicSync Security

Security reports are welcome.

## Reporting a vulnerability

If you believe you have found a security vulnerability in MosaicSync, please report it privately by email:

**mosaicsync@xipinformatica.cat**

Please include, when possible:

- the affected MosaicSync version;
- Firefox or Chromium/Chrome and browser version;
- operating system;
- a clear description of the issue;
- reproduction steps or a minimal proof of concept;
- the security impact you believe is possible.

For an issue that may expose user data, bypass a trust boundary, execute code, or otherwise be exploitable, please **do not publish exploit details in a public GitHub issue before we have had a reasonable opportunity to investigate it**.

Ordinary non-security bugs and feature requests may be reported through the public GitHub issue tracker.

## Security boundaries

MosaicSync's permanent regression suite includes checks around areas such as:

- Content Security Policy and extension-page injection boundaries;
- imported profile validation and asset integrity;
- SVG/image validation and resource-size limits;
- concurrent extension-state writes;
- Sync conflict/reconciliation behavior;
- storage failure and rollback behavior;
- bounded caches and hostile/high-cardinality input;
- same-extension messaging boundaries;
- favicon recovery and remote-resource handling;
- Firefox/Chromium parity.

These tests are not a claim that the software is vulnerability-free. They are intended to make previously identified security and correctness properties permanent and reviewable.

Run the full suite with:

```bash
npm test
```

## Supported source

Security reports should preferably be tested against the latest source on the `main` branch or the latest publicly released extension version.

## Disclosure

We appreciate responsible disclosure and will try to acknowledge useful reports, reproduce the problem, assess affected versions, and publish a fix and release note when appropriate.
