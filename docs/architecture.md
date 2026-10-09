# Architecture and current boundaries

ARC uses a shared React Native application with native platform adapters. `App.tsx` currently contains substantial orchestration and UI logic; this release does not refactor it.

| Layer | Responsibility |
| --- | --- |
| Shared UI, graphs, and catalogs | Lighting/schedules, telemetry visualization, themes, language selection |
| Cloud clients | Firebase sign-in, Portal inventory and grants, telemetry/history synchronization |
| Local stores | Device metadata, history, cursors, preferences, and pending local intent |
| BLE/protocol clients | Direct current device packets, status/ACK decoding, queued transfers |
| Native bridges | Platform discovery/connection and retained legacy Bluetooth Mesh methods |
| ARC hardware | G4 Lamp control, WBA5 BLE/OpenThread and history, Probe measurement/Thread transmission |

Thread operational datasets are hardware configuration, separate from cloud account ownership and app-local assignment intent. Thread attachment does not itself establish an authorized binding.

Cloud ownership/sharing has an existing backend authority. A device-verifiable, durable assignment lifecycle is still unfinished; neither a UI permission check nor BLE write completion is sufficient proof. See SECURITY.md.

Current and legacy paths coexist. Direct BLE clients handle current packet traffic, while ST/Nordic APIs remain wired into the native modules and legacy workflows. Architectural history is documented here without publishing WBA firmware or importing private Git history.
