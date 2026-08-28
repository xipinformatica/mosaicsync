#!/usr/bin/env python3
"""Create deterministic runtime ZIPs from dist/firefox and dist/chrome."""
from pathlib import Path
import json
import re
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUT = ROOT / "artifacts"
DEV_OUT = ROOT / "dev-artifacts"
FIXED_TIME = (2026, 1, 1, 0, 0, 0)

SOURCE_EXCLUDED_DIRS = frozenset({
    ".git", "node_modules", "artifacts", "dev-artifacts", "coverage", ".nyc_output",
    "__pycache__", "tmp", "temp", "web-ext-artifacts"
})
SOURCE_EXCLUDED_NAMES = frozenset({"package-size-report.json", ".DS_Store", "Thumbs.db", "Desktop.ini"})
SOURCE_EXCLUDED_SUFFIXES = (".pyc", ".pyo", ".log", ".tmp", ".temp", ".bak", ".swp", ".zip", ".xpi", ".crx", ".pem")

def should_include_source_path(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in SOURCE_EXCLUDED_DIRS for part in rel.parts[:-1]):
        return False
    if path.name in SOURCE_EXCLUDED_NAMES:
        return False
    if path.name.endswith("~") or path.suffix.lower() in SOURCE_EXCLUDED_SUFFIXES:
        return False
    return path.is_file()

def package_source(version: str) -> Path:
    output = OUT / f"mosaicsync-{version}-github-ready.zip"
    OUT.mkdir(exist_ok=True)
    paths = sorted(
        (path for path in ROOT.rglob("*") if should_include_source_path(path)),
        key=lambda path: path.relative_to(ROOT).as_posix()
    )
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in paths:
            rel = path.relative_to(ROOT).as_posix()
            info = ZipInfo(rel, FIXED_TIME)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    return output

def package(browser: str, version: str) -> Path:
    source = DIST / browser
    # Public release artifacts deliberately use exactly three ZIP names:
    # browser-labelled Firefox, browser-labelled Chrome, and GitHub-ready source.
    output = OUT / (f"mosaicsync-{version}-firefox.zip" if browser == "firefox" else f"mosaicsync-{version}-chrome.zip")
    OUT.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(p for p in source.rglob("*") if p.is_file()):
            rel = path.relative_to(source).as_posix()
            info = ZipInfo(rel, FIXED_TIME)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    return output



FIREFOX_PRODUCTION_GECKO_ID = "mosaicsync@xipinformatica.cat"
FIREFOX_DEV_GECKO_ID = "mosaicsync-dev@xipinformatica.cat"

def package_firefox_dev(version: str) -> Path:
    """Create an explicitly non-release Firefox package for about:debugging.

    It deliberately uses a different Gecko ID so a temporary development copy
    cannot overlay, replace or share the storage namespace of the AMO release.
    """
    source = DIST / "firefox"
    manifest_path = source / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    gecko = manifest.setdefault("browser_specific_settings", {}).setdefault("gecko", {})
    if gecko.get("id") != FIREFOX_PRODUCTION_GECKO_ID:
        raise SystemExit(
            f"Refusing dev package: production Firefox ID drifted to {gecko.get('id')!r}"
        )
    gecko["id"] = FIREFOX_DEV_GECKO_ID
    manifest["name"] = "MosaicSync Dev"
    manifest["short_name"] = "MosaicSync Dev"

    output = DEV_OUT / f"mosaicsync-{version}-firefox-dev-temporary.zip"
    DEV_OUT.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(p for p in source.rglob("*") if p.is_file()):
            rel = path.relative_to(source).as_posix()
            info = ZipInfo(rel, FIXED_TIME)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            if rel == "manifest.json":
                payload = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
            else:
                payload = path.read_bytes()
            archive.writestr(info, payload, compress_type=ZIP_DEFLATED, compresslevel=9)
    return output

def size_category(rel: str) -> str:
    if rel.startswith("core/i18n-locales/") or rel == "core/i18n-runtime-catalog.js": return "localization"
    if rel == "core/public_suffix_list.dat": return "public-suffix-list"
    if rel.startswith("assets/backgrounds/"): return "wallpapers"
    if rel.startswith("_locales/"): return "manifest-localization"
    if rel.startswith("newtab/") and rel.endswith(".js"): return "newtab-js"
    if rel.startswith("newtab/") and rel.endswith(".css"): return "newtab-css"
    if rel.startswith("newtab/") and rel.endswith(".html"): return "newtab-html"
    if rel.startswith("background/"): return "background"
    if rel.startswith("core/"): return "shared-core"
    if rel.startswith("welcome/"): return "welcome"
    if rel.startswith("assets/"): return "assets"
    if rel == "manifest.json": return "manifest"
    return "other"

def package_size_report(paths: dict[str, Path], version: str) -> Path:
    report = {"schemaVersion": 1, "version": version, "browsers": {}}
    for browser, path in paths.items():
        categories = {}
        files = []
        with ZipFile(path, "r") as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                category = size_category(info.filename)
                entry = categories.setdefault(category, {"files": 0, "rawBytes": 0, "compressedBytes": 0})
                entry["files"] += 1
                entry["rawBytes"] += info.file_size
                entry["compressedBytes"] += info.compress_size
                files.append({
                    "path": info.filename,
                    "category": category,
                    "rawBytes": info.file_size,
                    "compressedBytes": info.compress_size,
                })
        files.sort(key=lambda item: (-item["compressedBytes"], -item["rawBytes"], item["path"]))
        report["browsers"][browser] = {
            "archiveBytes": path.stat().st_size,
            "rawBytes": sum(item["rawBytes"] for item in files),
            "compressedPayloadBytes": sum(item["compressedBytes"] for item in files),
            "categories": dict(sorted(categories.items())),
            "largestFiles": files[:30],
        }
    output = OUT / "package-size-report.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
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

    if sys.argv[1:] == ["--firefox-dev"]:
        print(package_firefox_dev(release_label))
        raise SystemExit(0)
    if sys.argv[1:]:
        raise SystemExit("Usage: tools/package.py [--firefox-dev]")

    outputs = {browser: package(browser, release_label) for browser in ("firefox", "chrome")}
    for browser in ("firefox", "chrome"):
        print(outputs[browser])
    print(package_source(release_label))
    print(package_size_report(outputs, release_label))
