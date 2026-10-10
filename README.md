# ARC — React Native App

*Connecting people with light, their environment, and the physical world.*

Welcome to **ARC Open Development**.

ARC is being built as a connected platform for intelligent lighting, environmental sensing, and practical exploration. This repository is the mobile part of that work: one shared React Native application for **iOS and Android**, developed alongside ARC's electronics, firmware, and cloud services.

We are glad you are here. Whether you are a developer, researcher, educator, or simply curious about how connected systems come together, you are welcome to explore the work and follow its progress.

## A look inside ARC

<p align="center">
  <img src="assets/MainViewDark_1.PNG" alt="ARC application in dark mode" width="43%" />
  &emsp;&emsp;
  <img src="assets/MainViewLight_1.PNG" alt="ARC application in light mode" width="43%" />
</p>

The app brings device control and environmental data into one place. Its current implementation includes:

- **Lighting and schedules** — channel controls, power and fan settings, operating limits, schedules, and photoperiod visualization.
- **Measurements and history** — live telemetry, environmental readings, historical graphs, local records, and cloud synchronization.
- **Connected devices** — BLE communication with ARC hardware, device selection, and cloud-backed inventory and permissions.
- **A shared experience** — dark and light themes, multilingual interface catalogs, and native support for iOS and Android.

## iOS and Android

The same React Native foundation serves both platforms, with native interfaces for the hardware features each operating system provides.

**iOS** — The ARC app has been approved for **TestFlight** and is available to invited testers. iOS is also our established hardware-development platform. See the [iOS validation notes](docs/validation.md).

**Android** — Native Android operation has been demonstrated on a **Samsung Galaxy Tab A8 (Android 14)**, including BLE communication with ARC's STM32WBA5 hardware, lamp controls, live telemetry, cloud history, and graph visualization. See [Android validation](docs/Android_validation.md).

The latest documented automated regression result is **111 passing tests**. Both platforms remain in active development; broader compatibility and production-release validation are ongoing.

## How it fits together

ARC pairs a **shared TypeScript application** with platform-specific native code. The app connects over BLE to ARC's STM32WBA5 wireless controller, which works alongside the STM32G4 lamp controller and the wider OpenThread sensor network. Cloud services support accounts, device access, and telemetry history.

If you would like to look more closely, start with [architecture](docs/architecture.md), [security boundaries](SECURITY.md), or the [STM32G4 lamp firmware](https://github.com/arc-motion-light/arc-stm32g4-lamp-firmware).

## Explore the code

The application uses **Expo SDK 57** and **React Native 0.86.3**. To install dependencies and run the available checks:

```sh
npm ci
npx tsc --noEmit
node --test tests/*.test.cjs
```

The repository includes native iOS and Android projects. Building them requires the corresponding Apple or Android toolchain and, for retained integrations, separately obtained vendor SDK components. See [native SDK setup](docs/native-sdks.md) and [dependency notes](docs/dependencies.md). Signing credentials and private device firmware are not included.

This is an actively developed hardware-connected application. Available features depend on the connected device, its firmware, and account permissions.

## Welcome to the conversation

ARC Open Development is an invitation to learn from the engineering, exchange ideas, and help shape useful technology. We especially welcome thoughtful conversations about embedded systems, mobile interfaces, lighting, environmental data, and education.

Explore [ARC Open Development](https://github.com/arc-motion-light/arc-open-development), visit [arcstore.io](https://arcstore.io), or write to [juan@arcstore.io](mailto:juan@arcstore.io) about collaboration, TestFlight access, or commercial licensing.

## Licensing

ARC-owned source code is shared under [PolyForm Noncommercial 1.0.0](LICENSE); documentation is licensed under [CC BY-NC 4.0](licenses/CC-BY-NC-4.0.txt). Third-party components and reserved ARC assets retain their respective terms. See [licensing](LICENSING.md), [third-party notices](THIRD_PARTY_NOTICES.md), and [trademarks](TRADEMARKS.md).
