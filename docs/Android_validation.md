# ARC Android Validation

**October 2026 · Physical-device validation**

ARC's shared React Native application now runs on **iOS and Android**, combining a common user experience with platform-specific native hardware communication.

## Validated on Android

Tested on a **Samsung Galaxy Tab A8 running Android 14**.

- Native Android build, installation, and application launch
- Sign-in, cloud history retrieval, and telemetry graph display
- Native BLE discovery and communication with ARC's STM32WBA5 hardware
- Live lamp status and telemetry, including Probe data received through the Lamp
- Lighting controls and device reconnection

## Platform and test results

| Component | Validated configuration |
| --- | --- |
| Application | React Native 0.86.3 · Expo SDK 57 |
| Android | API 36 build target · Kotlin native BLE integration |
| Physical test device | Samsung Galaxy Tab A8 · Android 14 |
| Automated regression suite | **111/111 passing**, as reported in the project's published platform status |

## Release status

**Android hardware integration and the core application experience have been demonstrated on a physical device.** Broader device coverage and final production-release validation remain ongoing.

For implementation and architecture, see the [ARC React Native repository](https://github.com/arc-motion-light/arc-react-native-app).
