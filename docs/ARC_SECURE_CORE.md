# ARC Secure Core

*Hardware-backed trust, engineered for real-world constraints.*

**ARC Secure Core** is our security architecture for a family of connected devices: intelligent lighting, environmental probes, gateways, and future control systems. Its purpose is straightforward: make device identity, encrypted communication, and permission-aware control part of the hardware experience — whether a device is connected to the cloud or operating locally.

Our latest development work has reached an encouraging engineering milestone. We have **validated the core encrypted-session design in host-based tests** and **measured the footprint of its bounded protocol logic against the constrained memory budget of our STM32WBA5 firmware**. We are now preparing the next step: end-to-end integration and testing on ARC hardware.

## Small footprint. Strong foundations.

An ARC wireless controller has several jobs at once. It communicates over Bluetooth LE and Thread, handles real-time device data, and supports local operation. Security has to work within that environment, not compete with it for resources.

That is why ARC Secure Core is being designed around compact state, bounded messages, and measured memory use from the beginning.

**Progress demonstrated in October 2026:**

- **Protocol validation:** Our experimental secure-session core completed **35 host-side checks**, including handshake behavior, authenticated commands, reconnect handling, and rejection of invalid messages. An independent implementation was used to check protocol interoperability.
- **Measured embedded footprint:** An STM32WBA5-targeted review build added approximately **336 bytes of static RAM and 4.1 KB of flash** for the protocol control layer. Instrumented Probe T firmware has also provided real on-device heap and stack measurements to guide the remaining integration budget.
- **Real device identification:** The ARC iOS app successfully scanned a physical Probe T QR label and matched its hardware identity to a device registered in the ARC backend.

These results bring together three essential parts of the architecture: **a tested secure-communication design, an evidence-based embedded resource budget, and a working path from physical device identity to the ARC application**.

## Built around STM32 hardware capabilities

ARC's wireless platform uses the **STM32WBA5**, a multiprotocol microcontroller with security capabilities that are particularly relevant to embedded systems:

- **AES and secure AES hardware** provide a path to efficient symmetric cryptography and protected key operations.
- **Hardware HASH** supports cryptographic hashing and key-derivation building blocks.
- **True random-number generation** provides a hardware entropy source for cryptographic operations.
- **Public-key acceleration** supports selected asymmetric algorithms and elliptic curves.
- **Arm TrustZone and device security features** offer a foundation for stronger isolation and credential protection as the platform advances.

The opportunity is to combine **the flexibility of a well-defined protocol** with **the efficiency of silicon designed for cryptography**. Each primitive is being matched to the capabilities of the selected STM32 device; for example, the X25519 exchange in our current Noise-based trial requires an appropriate embedded software implementation rather than direct acceleration by the STM32WBA5 PKA.

The objective is not encryption for its own sake. It is dependable protection that fits alongside wireless communication, sensing, telemetry, and real-time control.

## A connected experience with device-owned permissions

ARC Secure Core is designed around a clear division of responsibility:

**Identify.** A public device QR label helps the app recognize a physical product and find its account registration. The label is an identifier, not a secret or an access credential.

**Establish trust.** An authorized controller and device establish an authenticated, encrypted local session using credentials managed through an intentional enrollment process.

**Enforce access.** The wireless device checks command permissions locally, so the ability to connect over Bluetooth does not automatically mean the ability to control hardware. Where a separate real-time controller is used, its local operating and safety limits remain authoritative.

**Keep working locally.** The longer-term design supports secure, permission-aware device operation without requiring a round trip to the cloud for every command.

The result is intended to feel simple to users — *scan, identify, connect, control* — while maintaining a meaningful distinction between recognizing a device and being authorized to operate it.

## Preparing end-to-end integration

Our next engineering milestone is to bring these pieces together on the physical platform: cryptographic primitives, device provisioning, authenticated sessions, local authorization, and app-to-device command exchange.

Testing will focus on **memory and execution budgets under simultaneous Bluetooth LE and Thread activity**, peripheral coordination, reconnect and offline behavior, and correct handling of rejected or interrupted sessions.

ARC Secure Core is advancing from a validated protocol design and measured embedded feasibility toward **hardware-integrated, end-to-end secure communication** — designed with the practical constraints of connected products in mind.

---

**Technical background:** [Noise Protocol Framework](https://noiseprotocol.org/noise.html) · [ST STM32WBA security features](https://wiki.st.com/stm32mcu/wiki/Security%3ASecurity_features_on_STM32WBA) · [STM32WBA5 reference manual (RM0493)](https://www.st.com/resource/en/reference_manual/dm00821869.pdf)

For repository security disclosures, see [SECURITY.md](../SECURITY.md).
