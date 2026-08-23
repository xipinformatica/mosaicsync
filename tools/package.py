#!/usr/bin/env python3
"""Create deterministic runtime ZIPs from dist/firefox and dist/chrome."""
from pathlib import Path
import json
import re
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

def verify_release_identity(version: str) -> None:
    checks = {
        ROOT / "src" / "shared" / "core" / "constants.js": rf'export const VERSION = "{re.escape(version)}";',
        ROOT / "src" / "firefox" / "newtab" / "newtab.html": rf'MosaicSync · {re.escape(version)}',
        ROOT / "src" / "chrome" / "newtab" / "newtab.html": rf'MosaicSync · {re.escape(version)}',
        ROOT / "README.md": rf'Current source release: {re.escape(version)}',
        ROOT / "README-DEVELOPMENT.md": rf'Current release: {re.escape(version)}',
    }
    for path, pattern in checks.items():
        if not re.search(pattern, path.read_text(encoding="utf-8")):
            raise SystemExit(f"Release identity mismatch in {path.relative_to(ROOT)}: expected {version}")

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    first_heading = re.search(r"^## ([^\n]+)$", changelog, re.MULTILINE)
    if not first_heading or first_heading.group(1).strip() != version:
        raise SystemExit(f"CHANGELOG.md must begin with release {version}")

    build_manifest = json.loads((ROOT / "build-manifest.json").read_text(encoding="utf-8"))
    built_versions = {name: data.get("version") for name, data in build_manifest.get("browsers", {}).items()}
    if built_versions != {"firefox": version, "chrome": version}:
        raise SystemExit(f"build-manifest.json release identity mismatch: {built_versions}")


if __name__ == "__main__":
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
    verify_release_identity(release_label)
    for browser in ("firefox", "chrome"):
        print(package(browser, release_label))
