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
    versions = {}
    for browser in ("firefox", "chrome"):
        versions[browser] = json.loads((DIST / browser / "manifest.json").read_text())["version"]
    if len(set(versions.values())) != 1:
        raise SystemExit(f"Browser versions differ: {versions}")
    version = versions["firefox"]
    for browser in ("firefox", "chrome"):
        print(package(browser, version))
