#!/usr/bin/env python3
"""Validate MosaicSync's browser/store release contract on built trees or ZIPs."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.30.18.25"
PRODUCTION_GECKO_ID = "mosaicsync@xipinformatica.cat"
DEV_GECKO_ID = "mosaicsync-dev@xipinformatica.cat"
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; connect-src http: https:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self'"

FIREFOX_TOP_LEVEL = frozenset({
    "manifest_version", "name", "short_name", "version", "description", "permissions",
    "background", "chrome_url_overrides", "icons", "action", "browser_specific_settings",
    "optional_permissions", "content_security_policy", "author", "homepage_url",
    "optional_host_permissions", "default_locale", "chrome_settings_overrides",
})
CHROME_TOP_LEVEL = frozenset({
    "manifest_version", "name", "short_name", "version", "version_name",
    "minimum_chrome_version", "description", "permissions", "background",
    "chrome_url_overrides", "icons", "action", "optional_permissions",
    "content_security_policy", "author", "homepage_url", "optional_host_permissions",
    "default_locale",
})

FIREFOX_REQUIRED = ["storage", "alarms"]
CHROME_REQUIRED = ["storage", "alarms", "favicon"]
OPTIONAL_PERMISSIONS = ["topSites", "bookmarks"]
OPTIONAL_HOSTS = ["http://*/*", "https://*/*"]
DATA_COLLECTION_REQUIRED = ["none"]
DATA_COLLECTION_OPTIONAL = ["browsingActivity", "technicalAndInteraction"]

# Fixed literal HTTP(S) destinations that may legitimately appear in runtime code.
# User-entered shortcut/site URLs are dynamic and therefore do not appear here.
APPROVED_FIXED_HOSTS = frozenset({
    "xipinformatica.cat",
    "github.com",
    "ko-fi.com",
    "mozilla.org",       # MPL source header / license text
    "www.w3.org",        # SVG namespace
    "example.com",       # non-network UI examples/placeholders
})

URL_RE = re.compile(r"https?://[^\s\"'`<>)}]+", re.I)


def _fail(message: str) -> None:
    raise ValueError(message)


def validate_manifest(browser: str, manifest: dict) -> None:
    expected_keys = FIREFOX_TOP_LEVEL if browser == "firefox" else CHROME_TOP_LEVEL
    keys = frozenset(manifest.keys())
    if keys != expected_keys:
        _fail(f"{browser}: unapproved manifest property drift; expected {sorted(expected_keys)}, got {sorted(keys)}")

    if manifest.get("manifest_version") != 3:
        _fail(f"{browser}: manifest_version must be 3")
    if manifest.get("name") != "MosaicSync" or manifest.get("short_name") != "MosaicSync":
        _fail(f"{browser}: production product identity drift")
    if manifest.get("version") != VERSION:
        _fail(f"{browser}: version must be {VERSION}")
    if manifest.get("default_locale") != "en":
        _fail(f"{browser}: default_locale must remain en")
    if manifest.get("homepage_url") != "https://xipinformatica.cat/mosaicsync/":
        _fail(f"{browser}: homepage_url drift")
    if manifest.get("chrome_url_overrides") != {"newtab": "newtab/newtab.html"}:
        _fail(f"{browser}: New Tab override contract drift")
    if manifest.get("optional_permissions") != OPTIONAL_PERMISSIONS:
        _fail(f"{browser}: optional permission allow-list drift")
    if manifest.get("optional_host_permissions") != OPTIONAL_HOSTS:
        _fail(f"{browser}: optional host-permission allow-list drift")
    if manifest.get("content_security_policy", {}).get("extension_pages") != CSP:
        _fail(f"{browser}: CSP contract drift")

    if browser == "firefox":
        if manifest.get("permissions") != FIREFOX_REQUIRED:
            _fail("firefox: required permission allow-list drift")
        bss = manifest.get("browser_specific_settings")
        if not isinstance(bss, dict) or frozenset(bss.keys()) != {"gecko"}:
            _fail("firefox: browser_specific_settings must contain only gecko; Android support is not approved")
        if "gecko_android" in bss:
            _fail("firefox: gecko_android is forbidden for the desktop-only production release")
        gecko = bss.get("gecko", {})
        if frozenset(gecko.keys()) != {"id", "strict_min_version", "data_collection_permissions"}:
            _fail("firefox: gecko capability contract drift")
        if gecko.get("id") != PRODUCTION_GECKO_ID:
            _fail("firefox: production Gecko ID drift")
        if gecko.get("strict_min_version") != "140.0":
            _fail("firefox: strict_min_version drift")
        data = gecko.get("data_collection_permissions", {})
        if data.get("required") != DATA_COLLECTION_REQUIRED or data.get("optional") != DATA_COLLECTION_OPTIONAL:
            _fail("firefox: data-collection declaration drift")
        if manifest.get("chrome_settings_overrides") != {"homepage": "newtab/newtab.html"}:
            _fail("firefox: Home/new-window override is an intentional product contract")
        if "version_name" in manifest or "minimum_chrome_version" in manifest:
            _fail("firefox: Chrome-only version keys leaked into Firefox")
    else:
        if manifest.get("permissions") != CHROME_REQUIRED:
            _fail("chrome: required permission allow-list drift")
        if manifest.get("version_name") != VERSION:
            _fail("chrome: version_name must match canonical version")
        if manifest.get("minimum_chrome_version") != "104":
            _fail("chrome: minimum_chrome_version must remain 104 until an API-floor review deliberately changes it")
        if "browser_specific_settings" in manifest or "chrome_settings_overrides" in manifest:
            _fail("chrome: Firefox-only manifest capability leaked into Chrome")


def _literal_fixed_hosts(text: str) -> set[str]:
    hosts: set[str] = set()
    for raw in URL_RE.findall(text):
        token = raw.rstrip(".,;]")
        if "${" in token or "*" in token:
            continue
        try:
            host = (urlparse(token).hostname or "").lower()
        except ValueError:
            continue
        if host and "." in host:
            hosts.add(host)
    return hosts


def validate_runtime_files(files: dict[str, bytes], browser: str) -> None:
    if "manifest.json" not in files:
        _fail(f"{browser}: package has no manifest.json")
    forbidden_prefixes = ("tests/", "docs/", "tools/", "bench/", "fixtures/")
    forbidden_suffixes = (".map", ".pem", ".crx", ".xpi")
    for rel in files:
        lowered = rel.lower()
        if rel.startswith(forbidden_prefixes) or lowered.endswith(forbidden_suffixes) or "/__pycache__/" in f"/{lowered}/":
            _fail(f"{browser}: non-runtime artifact leaked into production package: {rel}")
        if lowered.startswith("readme") or lowered.endswith("/readme.md"):
            _fail(f"{browser}: repository documentation leaked into production package: {rel}")
    manifest = json.loads(files["manifest.json"].decode("utf-8"))
    validate_manifest(browser, manifest)

    unexpected_hosts: dict[str, list[str]] = {}
    for rel, payload in files.items():
        # Binary artwork is not expected to decode as UTF-8 and has no executable URL literals.
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if DEV_GECKO_ID in text or "MosaicSync Dev" in text:
            _fail(f"{browser}: development identity leaked into production artifact: {rel}")
        for host in _literal_fixed_hosts(text):
            if host in {"localhost", "127.0.0.1"}:
                _fail(f"{browser}: local-development endpoint leaked into production artifact: {rel}")
            if host not in APPROVED_FIXED_HOSTS and not host.endswith(".invalid"):
                unexpected_hosts.setdefault(host, []).append(rel)
    if unexpected_hosts:
        detail = ", ".join(f"{host} ({sorted(set(paths))[:3]})" for host, paths in sorted(unexpected_hosts.items()))
        _fail(f"{browser}: unapproved fixed external host literal(s): {detail}")


def validate_tree(browser: str, root: Path) -> None:
    files = {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()}
    validate_runtime_files(files, browser)


def validate_zip(browser: str, path: Path) -> None:
    with ZipFile(path, "r") as archive:
        files = {info.filename: archive.read(info) for info in archive.infolist() if not info.is_dir()}
    validate_runtime_files(files, browser)


def main(argv: list[str]) -> int:
    if not argv:
        for browser in ("firefox", "chrome"):
            validate_tree(browser, ROOT / "dist" / browser)
        print("Release contract OK for dist/firefox and dist/chrome.")
        return 0
    if len(argv) == 3 and argv[0] == "--zip":
        validate_zip(argv[1], Path(argv[2]))
        print(f"Release contract OK for {argv[1]} ZIP: {argv[2]}")
        return 0
    print("Usage: tools/release_contract.py [--zip firefox|chrome path]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except ValueError as error:
        print(f"Release contract FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
