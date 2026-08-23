# MosaicSync 1.26.8 manual QA

- Confirm Settings displays `MosaicSync · 1.26.8` in Firefox and Chrome.
- Confirm Firefox/Chrome manifests, Chrome `version_name`, internal `VERSION`, build manifest and package filenames all report `1.26.8`.
- Open Settings and switch Appearance repeatedly between Automatic, Dark and Light. The Settings skin must switch immediately without closing the panel.
- With separate Light/Dark wallpapers enabled, theme colors must switch immediately while the potentially unsafe wallpaper/background repaint remains deferred until Settings closes.
- Re-test the 1.26.5 regression: enabling/disabling separate Light/Dark wallpapers and selecting active day/night wallpapers must not blank or freeze the open Settings panel.
- Re-test 1.26.6 folder extraction: drag a child from a 3+ item folder to an empty main-grid slot, then repeat with a two-item folder and confirm correct folder dissolution.
