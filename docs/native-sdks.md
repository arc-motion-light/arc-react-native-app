# External native mesh dependencies

The real native integrations remain in this source candidate. Essential vendor files are obtained separately so ARC source publication does not imply rights to redistribute them.

## iOS

The audited archive is `libST-BLE-Meshuniversal.a` from **ST BLE Mesh SDK 1.11.000**, supplied within STSW-BNRG-Mesh V1.13.001. Its bytes match ARC's current archive. Obtain that version under ST's terms from the [official product page](https://www.st.com/en/embedded-software/stsw-bnrg-mesh.html); availability of archived versions has not been independently confirmed.

Fifteen public API headers carry explicit permissive notices and are retained unchanged. `BlueNRG_Mesh.h` and `STMeshCompositionDataModel.h` carry proprietary/confidential legends and are installed locally with the SDK instead. They are Git-ignored.

The accompanying SLA0071 production-limited agreement conditions redistribution on embedding in a Licensee Product and associated terms. It does not establish unrestricted posting of the standalone archive. Its open-source exception applies to individually licensed portions; it is not a blanket archive grant.

```sh
python3 tools/install_mesh_sdks.py --ios-sdk /path/to/licensed/ST-SDK --accept-vendor-terms
```

The script checks all 17 expected headers and the archive against `tools/mesh-sdk-manifest.json` before copying any requested files. It does not grant rights, download software, modify credentials, or change native behavior.

## Android

The existing `MeshManagerModule.kt` uses Nordic's Android nRF Mesh API. The local `mesh-release.aar` has Nordic namespaces but contains no license/version record sufficient to prove its exact origin or modifications. Do not substitute a new SDK release and assume API compatibility.

```sh
python3 tools/install_mesh_sdks.py --android-aar /path/to/locally-obtained/mesh-release.aar --accept-vendor-terms
```

Exact upstream identification or a validated replacement is still required for reproducible independent acquisition. Nordic's upstream BSD grant allows redistribution subject to its conditions, but this candidate does not distribute the unverified AAR.

## Legacy removal proposal

Current hardware uses WBA5 BLE/OpenThread. The native app still eagerly creates ST/Nordic objects and exposes legacy scan, provision, proxy, and vendor-message methods. These compile-time dependencies cannot be removed by deleting binaries alone. On iOS, the current scan starts both CoreBluetooth discovery and ST scanning, then merges their results. Shared `createOpenMeshClient` also delegates vendor-message sends through the native module; it is not proof of an SDK-independent transport. Android constructs `MeshManagerApi` eagerly, and its vendor-send path requires the Nordic mesh network/app key/proxy. Thus the source is not yet a cleanly separated legacy plugin.

A bounded follow-up should separate direct current BLE transports from those legacy methods, establish which UI actions use each path, and verify current-device discovery, reconnect, controls, route configuration, and history on iOS and Android. Only then remove obsolete mesh classes, headers, link entries, AAR dependencies, OOB defaults, and UI controls together. This candidate preserves the working bridges and supplies an explicit external dependency boundary.
