# MosaicSync 1.30.18.45 QA / release-candidate checklist

## Scope

Correct only two reproduced New Tab UI issues on top of certified 1.30.18.44:

1. reduce excessive vertical dead space above folder-popover shortcut tiles without changing tile size, columns, labels, horizontal spacing, footer controls or drag behavior;
2. make shortcut-editor Image style changes visibly update the preview before Save in both normal and compact laptop layouts.

No Sync, Recovery, localization, permission, CSP, state/profile schema, browser-adapter or user-data-format change is authorized.

## Negative proof

- Untouched 1.30.18.44: **CONFIRMED FAIL 2/2** — the folder CSS retains the old 10/7/7 px stacked top spacing, and compact editor CSS has no `#shortcutDialog .image-preview.cover img` override capable of beating its more-specific image-size rule.
- 1.30.18.45 candidate: both focused checks pass after the scoped correction.

## Corrective behavior

- folder header bottom padding: 10 px → 3 px;
- folder grid top padding: 7 px → 2 px;
- folder item-card top padding: 7 px → 4 px;
- net artwork-row lift: approximately 15 px while preserving all other folder geometry contracts;
- `shortcutImageStyle` continues to call `updateImagePreview()` immediately;
- `updateImagePreview()` continues to toggle the `cover` class;
- compact dialog cover preview now has sufficient selector specificity to render 100% × 100% with `object-fit: cover` before Save;
- returning to contain mode immediately restores the existing compact contain dimensions.

## Candidate gates

- focused 1.30.18.45 regressions: **2/2 PASS**
- full pre-version regression suite: **993/993 PASS**
- final full regression suite: **993/993 PASS**
- runtime reachability: **PASS**
- deterministic Firefox/Chrome/GitHub-ready packaging: **PASS**
- mechanical clean-source certification: **PASS — MECHANICAL_ONLY**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**
