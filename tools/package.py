#!/usr/bin/env python3
"""Create deterministic runtime ZIPs from dist/firefox and dist/chrome."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUT = ROOT / "artifacts"
FIXED_TIME = (2026, 1, 1, 0, 0, 0)

def package(browser: str, version: str) -> Path:
    source = DIST / browser
    output = OUT / f"mosaicsync-{version}-{browser}.zip"
    OUT.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(p for p in source.rglob("*") if p.is_file()):
            rel = path.relative_to(source).as_posix()
            info = ZipInfo(rel, FIXED_TIME)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    return output

if __name__ == "__main__":
    import json
    manifests = {
        browser: json.loads((DIST / browser / "manifest.json").read_text())
        for browser in ("firefox", "chrome")
    }
    versions = {browser: manifest["version"] for browser, manifest in manifests.items()}
    if len(set(versions.values())) != 1:
        raise SystemExit(f"Browser technical versions differ: {versions}")
    # MosaicSync has one canonical release identity everywhere. Chrome
    # version_name, when present, must exactly match the technical manifest
    # version; we never publish a separate display/internal version.
    chrome_version_name = manifests["chrome"].get("version_name", versions["chrome"])
    if chrome_version_name != versions["chrome"]:
        raise SystemExit(
            f"Chrome version_name must equal canonical version: "
            f"version={versions['chrome']!r}, version_name={chrome_version_name!r}"
        )
    release_label = versions["chrome"]
    for browser in ("firefox", "chrome"):
        print(package(browser, release_label))
