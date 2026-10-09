# Third-party notices

Third-party material keeps its own license. The PolyForm grant applies only to ARC-owned original work.

| Material | Distribution treatment |
| --- | --- |
| `ios/vendor/STBLEMesh/include/` permissive headers | 15 headers retain their explicit ST copyright/BSD notices; notice reproduced in `licenses/ST-headers-BSD-3-Clause.txt`. |
| ST iOS mesh archive, `BlueNRG_Mesh.h`, `STMeshCompositionDataModel.h` | External local dependencies; not in Git. The two headers carry proprietary/confidential legends. The archive is verified against ST iOS SDK 1.11.000. |
| `android/app/libs/mesh-release.aar` | External local dependency; not in Git. Its namespaces identify Nordic Mesh, but exact upstream revision and modifications remain unverified. |
| React Native / Expo generated native templates and custom settings-plugin scaffold | Upstream packages declare MIT; ARC does not assert exclusive ownership of generated scaffolding. Preserve applicable upstream notices. |
| `android/gradle/wrapper/gradle-wrapper.jar` and Gradle wrapper scripts | Gradle tooling, Apache License 2.0. |
| `android/app/src/main/res/drawable/rn_edit_text_material.xml` | Android Open Source Project, Apache License 2.0; existing copyright notice retained. |
| npm, CocoaPods, and Android Maven dependencies | Retrieved separately by their dependency managers; original package licenses apply. |

See `licenses/MIT-upstream.txt`, `licenses/Apache-2.0.txt`, [locked direct dependencies](docs/dependencies.md), and [native SDK instructions](docs/native-sdks.md).

Nordic's upstream Android nRF Mesh project permits source/binary redistribution under BSD-3-Clause, but that alone does not establish the provenance of this local AAR. [Upstream project](https://github.com/NordicSemiconductor/Android-nRF-Mesh-Library), [upstream license](https://github.com/NordicSemiconductor/Android-nRF-Mesh-Library/blob/main/LICENSE).

ST's header license must not be assumed to license the archive or differently marked headers. Obtain the supported SDK directly through [STSW-BNRG-Mesh](https://www.st.com/en/embedded-software/stsw-bnrg-mesh.html) under its applicable agreement. No vendor archive is downloaded or sublicensed by this repository.
