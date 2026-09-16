# MosaicSync 1.30.18.46 QA / release-candidate checklist

## Scope

Correct only the incomplete 1.30.18.45 shortcut-editor live Image-style preview. Do not touch the valid 1.30.18.45 folder-spacing correction or any Sync, Recovery, localization, permission, CSP, state/profile schema, browser-adapter or user-data-format behavior.

## Negative proof

- Untouched 1.30.18.45: **CONFIRMED FAIL 1/2** on the new 1.30.18.46 focused checks. The live `change`/`cover` class path already passes, but there is no universal dialog-specific cover selector after all responsive contain-size rules, so normal desktop can remain visually contained in fill-tile mode.
- 1.30.18.46 candidate: both focused checks pass after the single CSS cascade correction.

## Corrective behavior

- `shortcutImageStyle` still calls `updateImagePreview()` immediately;
- `updateImagePreview()` still toggles only the preview `cover` class and does not persist editor state;
- `#shortcutDialog .image-preview.cover > img` is the universal cover authority after every responsive `#shortcutDialog .image-preview img` contain-size rule;
- cover mode renders preview artwork at 100% × 100% with `object-fit: cover` on normal desktop, short laptop and narrow layouts;
- returning to contain mode immediately restores the existing viewport-specific contained dimensions;
- folder-popover spacing remains byte-for-byte unchanged from 1.30.18.45.

## Candidate gates

- focused 1.30.18.46 regressions: **2/2 PASS**
- full pre-version regression suite: **995/995 PASS**
- final full regression suite: **995/995 PASS**
- runtime reachability: **PASS**
- deterministic Firefox/Chrome/GitHub-ready packaging: **PASS**
- mechanical clean-source certification: **PASS — MECHANICAL_ONLY**
- real Firefox user smoke: **REQUIRED BEFORE PUBLICATION**
