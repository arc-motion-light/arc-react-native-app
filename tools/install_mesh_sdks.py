#!/usr/bin/env python3
"""Install locally obtained SDK files; never download or redistribute vendor archives."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'tools/mesh-sdk-manifest.json').read_text())


def verified(path, expected):
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'SDK file does not match the audited version: {path.name}')
    return path


def unique(root, name, expected):
    matches = [p for p in root.rglob(name) if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == expected]
    if not matches:
        raise SystemExit(f'No audited {name} found. Obtain the supported SDK version; do not substitute silently.')
    return matches[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ios-sdk', type=Path, help='Locally licensed ST SDK directory')
    parser.add_argument('--android-aar', type=Path, help='Locally obtained exact Nordic-based AAR')
    parser.add_argument('--accept-vendor-terms', action='store_true', help='Confirm you have the rights to use these files locally')
    args = parser.parse_args()
    if not args.accept_vendor_terms or not (args.ios_sdk or args.android_aar):
        parser.error('Provide a local SDK and --accept-vendor-terms; this flag does not grant redistribution rights.')
    copies = []
    if args.ios_sdk:
        item = MANIFEST['ios_archive']
        copies.append((unique(args.ios_sdk, Path(item['path']).name, item['sha256']), ROOT/item['path']))
        for name, digest in MANIFEST['ios_headers'].items():
            copies.append((unique(args.ios_sdk, name, digest), ROOT/'ios/vendor/STBLEMesh/include'/name))
    if args.android_aar:
        item = MANIFEST['android_archive']
        copies.append((verified(args.android_aar, item['sha256']), ROOT/item['path']))
    # Validate the complete requested input before installing any file.
    for source, destination in copies:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
    print(f'Installed {len(copies)} verified SDK files locally. Restricted files remain Git-ignored.')


if __name__ == '__main__':
    main()
