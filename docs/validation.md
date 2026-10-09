# Publication candidate validation

Checked on 9 October 2026 in an independent copy. The private app, firmware, backend configuration, and device credentials were not modified. No device flashing, commissioning, emulator launch, or Android port was performed.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS: 820 packages installed; lockfile declarations match the manifest. |
| `npx --no-install tsc --noEmit` | PASS after publication-only catalog/test changes. |
| `node --test tests/*.test.cjs` | PASS: 81 tests, zero failures, zero skipped. Initial run was 77/79; fixes are described below. |
| `npx --no-install expo config --type public --json` | PASS. |
| `npx --no-install expo export --platform ios --output-dir .review/export-ios` | PASS: 1,428 modules bundled. This is a JavaScript bundle check, not a device launch. |
| `ruby -c ios/Podfile` | PASS. |
| `plutil -lint ios/LampBLE.xcodeproj/project.pbxproj ios/LampBLE/Info.plist ios/LampBLE/LampBLE.entitlements` | PASS. |
| `xcodebuild -list -project ios/LampBLE.xcodeproj` | PASS using the installed Xcode developer directory explicitly. |
| `npx --no-install install-skia` | PASS: platform libraries installed locally. Initial CocoaPods attempt stopped because npm had skipped Skia's installation script. |
| `pod install --project-directory=ios` | PASS after installing Skia, using Xcode 26.4 / CocoaPods 1.16.2. |
| Unsigned iOS native device build, command below | PASS: BUILD SUCCEEDED, using the exact external ST SDK. Does not validate distribution signing or fresh hardware behavior. |
| SDK installer exact-file verification and wrong-AAR rejection | PASS. |
| `bash android/gradlew --version` | UNAVAILABLE: no usable Java runtime. No Android native build/launch claimed. |
| Dedicated lint | NOT RUN: no lint script/configuration supplied. TypeScript and available tests were run. |
| Staged file/security patterns, internal links, license hashes, isolated Git history | PASS for the prepared file inventory; commissioning/deployed hardware and asset-provenance limitations remain separately documented. |
| Unauthenticated GET to configured Portal device endpoint | HTTP 401. Read-only negative check, not a complete deployed access-control audit. |
| Initial full `git diff --cached --check` | Inherited whitespace warnings in unchanged vendor headers, license text, and three original UI/graph files. ARC preparation/test/documentation changes pass the scoped check. Vendor and license bytes were preserved. |

## Native build command

On this machine, the active developer directory was Command Line Tools, so commands used a per-command override without reconfiguring the machine:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild -workspace ios/LampBLE.xcworkspace -scheme LampBLE \
  -configuration Debug -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath .review/DerivedData CODE_SIGNING_ALLOWED=NO build
```

## Publication-only changes

- The schedule permission test now executes the actual wrapper and delegated helper for revoked, disconnected, unavailable-route, and permitted cases. The current shared Schedule layout is tested for read-only snapshots and edit gating rather than requiring an obsolete separate branch. App command/authentication behavior was not changed.
- Eleven cadence strings were absent from five catalogs. Those catalogs explicitly reuse the canonical existing English definitions; no Japanese/German/Spanish/French/Italian translations were invented. Existing English/Danish wording is preserved, and translation review remains pending. This retains the existing user-visible English fallback.
- The Xcode development team is cleared for independent developer signing.
- SDK installation is explicit and hash-checked. Two proprietary headers and two vendor archives are Git-ignored external dependencies, not disabled functions.
- Documentation, license scope, third-party notices, visual plan, and an architecture graphic were added. Original working runtime implementation is otherwise preserved.

## Remaining release decisions

Public publication waits for the separate Android build-and-launch review, commissioning/security decisions, independently reproducible native SDK acquisition or an approved legacy cleanup, and final reserved-asset provenance approval. No GitHub repository or remote was created during this preparation.
