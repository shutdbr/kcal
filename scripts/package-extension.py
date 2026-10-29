#!/usr/bin/env python3
"""Build the downloadable extension without npm dependencies or generated secrets."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
source = root / 'extensions/canvas-import'
target = root / 'static/downloads/kcal-canvas-extension.zip'
target.parent.mkdir(parents=True, exist_ok=True)
# Explicit allowlist: never accidentally package test fixtures or local credentials.
files = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'extract.js', 'transfer.js', 'README.md']
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (source / name).read_bytes())
print(f'Built {target.relative_to(root)}')
