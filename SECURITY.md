# Security boundaries

Report security concerns privately to juan@arcstore.io; do not include credentials or device/customer records in public issues.

Firebase web/mobile configuration and service URLs identify client services. They are not administrator credentials. Access must be enforced by deployed backend token verification, DeviceGrants, Firestore Rules, and applicable IAM/API restrictions. The reviewed backend source validates Firebase tokens and device permissions; this source review is not an independent confirmation of every deployed rule or restriction.

The app's permission checks support the user interface and command paths; they do not replace hardware authorization. `requireLocalTrust` is not enabled by default. The secure envelope/session interfaces are foundations, not evidence of a deployed device verifier. Local Probe route intent and a successful BLE write must not be described as an authenticated persistent assignment.

## Legacy commissioning under review

The static OOB default is in a reachable legacy Bluetooth Mesh UI. The iOS coordinator rejects a non-empty static OOB argument before calling ST provisioning. Its empty-argument path uses ST provisioning without wiring static OOB authentication. Android passes OOB data to Nordic's authentication API and can fall back from static-OOB provisioning to standard provisioning. Standard provisioning may negotiate a different authentication method; this code alone does not establish the effective device-side protection.

The iOS legacy coordinator also enables ST’s `useDefaultSecuritiesCredential` setting when creating a new mesh network. Its effective SDK defaults require review independently of the static OOB argument.

These paths do not establish that current WBA5/Thread hardware accepts the default. The inspected current Lamp sources do not show a consumer for it. Available Probe sources retain a legacy mesh scaffold, and their relation to the installed image is not proved. The accepted commissioning credentials and fallback behavior on deployed hardware remain a release-review item. Do not treat a fixed public default as adequate authentication or use it for production provisioning.

No device credentials, firmware, backend permissions, or app authentication behavior were changed for this candidate. Legacy SDK removal is a separate proposed cleanup requiring proof that current workflows retain their functionality.
