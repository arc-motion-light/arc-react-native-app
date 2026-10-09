# Android: next build-and-launch experiment

The source is shared with iOS, and the existing Android native project, resources, and Kotlin adapters are preserved. Android is not asserted to be production-ready.

## Obvious launch blockers

- This audit machine has no usable Java runtime; Gradle cannot start. Install a supported JDK and Android SDK before the separate experiment.
- `android/settings.gradle` refers to `expo/scripts/autolinking.gradle`, which does not exist in the installed Expo 57 package. Its older integration must be reconciled with the current Expo/RN versions.
- The retained Gradle wrapper is 8.5; build/SDK/Kotlin defaults date from an older native project. Compatibility with RN 0.86.3 is not established. Do not silently regenerate the project.
- The exact Nordic-based mesh AAR remains an external dependency, although it belongs to the earlier nRF52 architecture. The native module constructs SDK objects and uses its types; removal requires a reviewed cleanup.
- `android/app/debug.keystore` is excluded. The existing configuration requires a locally generated debug keystore and uses debug signing for release too; it must not be presented as production signing.
- The Android application ID remains a development placeholder, `com.example.lampble`.
- BLE/location permissions, bonding, device discovery/reconnect, native-module registration, Skia/Hermes compatibility, and background behavior require platform-specific checks.

## Separate next milestone

1. Resolve toolchain and native project configuration locally.
2. Aim to launch the existing shared UX/UI, recording real screenshots and failures.
3. Distinguish UI rendering from functional BLE, cloud, and hardware tests.
4. Trace and remove legacy nRF52 integration only if current paths remain complete.
5. Review the findings before publishing this repository.

No Android port, native-project regeneration, emulator launch, or hardware testing was performed as part of this preparation task.
