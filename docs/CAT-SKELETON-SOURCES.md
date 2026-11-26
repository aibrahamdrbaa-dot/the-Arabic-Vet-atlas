# Cat skeleton source audit

Scope: domestic cat (*Felis catus*), a single documented specimen with full skeletal coverage.

## Selected Primary Geometry Source (Active in `/cat/skeleton/`)

- **[cat skeleton — Tavernier Amaury (@svtavernier)](https://sketchfab.com/3d-models/cat-skeleton-7106115b299649e992476f2d3b4fc602)**
  - **Acquisition method:** Official Sketchfab download provided by project owner.
  - **License verified via Sketchfab API:** [Creative Commons Attribution–NonCommercial–ShareAlike 4.0 (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/) (`nonCommercial: true`, ShareAlike required on derivatives).
  - **Original archive checksums (SHA-256):**
    - `cat_skeleton.glb` (`7,338,612` bytes): `891f86c4effe001a895459e30b1064c47cab7f3d69837f49d6b509775c103ac9`
    - `cat-skeleton.zip` (`6,881,595` bytes): `eeeaf7353db4b7d7befa0432234eba37330fd368c73f055cbdeade8517cd112e`
    - `source/Chat.glb` inside zip (`3,765,488` bytes): `c570679a9f450c32aeded26c7b459993e984ee6fb01677170e4cd7cdf9220783`
  - **Derivative GLB hosted in atlas (`site/cat/skeleton/models/felis-catus-tavernier-skeleton.glb`):**
    - Size: `3,534,008` bytes (`3.37 MiB`, within the `15 MiB` mobile safety ceiling).
    - SHA-256: `e59e517be3d0f1f207294d3dbf071aba9eaca3f8dad063d85947f97735b50be5`
    - Units & Transform: Rotated `-90°` around `+Y` (cranial `-Z`, dorsal `+Y`, left `-X`), scaled `0.04 m / raw unit` (final bounding box: length `0.476 m`, standing height `0.248 m`, width `0.125 m`), centered X/Z and grounded to `y = 0`.
    - Geometry & Material Edits: Single fused photogrammetric surface (`74,235` triangles; `98.63%` in one connected component) segmented strictly along verifiable anatomical boundaries into **26 selectable GLB nodes** with zero invented geometry; removed `KHR_materials_specular` extension for core glTF 2.0 compatibility; embedded `2048px` JPEG albedo texture (`quality=86`).
  - **Actual anatomical coverage & documented gaps (no invented geometry):**
    - **Present and segmented (26 nodes):** `cranium`, `mandibula`, `vertebrae_cervicales`, `vertebrae_thoracicae`, `vertebrae_lumbales`, `os_sacrum`, `vertebrae_caudales`, `costae_sinistrae`, `costae_dextrae`, `sternum`, `os_coxae_sinistrum`, `os_coxae_dextrum`, `scapula_sinistra`, `scapula_dextra`, `humerus_sinister`, `humerus_dexter`, `antebrachium_sinistrum`, `antebrachium_dextrum`, `manus_sinistra`, `manus_dextra`, `femur_sinister`, `femur_dexter`, `crus_sinistrum`, `crus_dextrum`, `pes_sinister`, `pes_dexter`.
    - **Missing / not distinguishable as separate bones in scan:** Hyoid apparatus (*Apparatus hyoideus*), vestigial clavicles (*Claviculae*), patellae (*Patellae*), sesamoid bones (*Ossa sesamoidea*), and separate costal cartilages.
    - **Fused / overlapping surface regions:** Individual vertebrae within each spinal region, individual ribs at costovertebral/sternal junctions, radius with ulna, tibia with fibula, carpal/tarsal/metacarpal/metatarsal/phalangeal bones, and closed mandible occlusion with cranium. Thin mounting base contact patches remain under the four paws.
    - **Arteries:** Not added in this release. Pending a verified feline arterial dataset with spatial registration evidence for *Felis catus*.
    - **Review status:** `draft` (pending human veterinary anatomist review and rights sign-off before promotion to `public/models/`).

## Terminology & Pipeline References

- **[WAVA — Nomina Anatomica Veterinaria (NAV), Sixth Edition (2017)](https://www.wava-amav.org/wava-documents.html):** Authority for all Latin anatomical terms in `data/catalog.json` and `site/cat/skeleton/catalog.json`.
- **[Ketbome/vet-atlas (`scripts/build-cat-skeletal.ts`)](https://github.com/Ketbome/vet-atlas/blob/main/scripts/build-cat-skeletal.ts):** Used strictly for coordinate convention and node-organization comparison; mixed modeled geometry and scans were NOT copied.

## Reserve / Excluded Candidates (Not Used in This Build)

- **[University of Edinburgh Open.Ed — 3D Skeletons and Skulls](https://open.ed.ac.uk/3d-skeletons-and-skulls/) / [Domestic Cat (Felis catus) on Sketchfab](https://sketchfab.com/3d-models/domestic-cat-felis-catus-7c99ca836d834c39872ecf5e9b5e2087):** CT scan by Dr. Tobias Schwarz, adapted by Brian Mather (RDSVS, University of Edinburgh), CC BY 4.0 (`541,305` verts / `1,085,008` faces). Retained as a documented reserve candidate for future CT-level individual-bone upgrades; not used in this published release.
- **[3D Anatomy Studios](https://3danatomystudios.com/portfolio/digital-rendering-of-a-complete-cat-skeleton/):** Excluded — combines multiple CT scans and a supplemental skull from a different specimen with unresolved rights.
