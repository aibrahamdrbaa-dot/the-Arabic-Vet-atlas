# Cat skeleton source audit

Scope: domestic cat, a single documented specimen with full skeletal coverage.

- [University of Edinburgh Open.Ed](https://open.ed.ac.uk/3d-skeletons-and-skulls/): collection includes a domestic-cat CT recording and states CC BY 4.0. Exact mesh archive has not been obtained or inspected. Confirm specimen identifier, anatomy coverage, units, and downloadable item metadata before release.
- [Tavernier Amaury](https://sketchfab.com/3d-models/cat-skeleton-7106115b299649e992476f2d3b4fc602): published as photogrammetry of a complete cat skeleton, CC Attribution–NonCommercial–ShareAlike. Obtain original file through the official download. Verify provenance, topology, thin or occluded bones, and whether anatomy can be segmented without inventing geometry. Keep the exact license with any derivative.
- [3D Anatomy Studios](https://3danatomystudios.com/portfolio/digital-rendering-of-a-complete-cat-skeleton/): segmented multiple CT scans and supplemented the skull with a different specimen. The rendered work and the underlying records have distinct rights questions. Do not treat the published reconstruction as a single-specimen source.
- [Ketbome build script](https://github.com/Ketbome/vet-atlas/blob/main/scripts/build-cat-skeletal.ts): mixed modeled geometry and scans. Reference for pipeline comparison only.
- [NAV](https://www.wava-amav.org/wava-documents.html): use terminology once meshes are identified. Arteries remain pending a verified feline dataset and registration evidence. No labels or arterial geometry derived by guesswork.

Publication checklist for the incoming source: record acquisition URL, author, original archive SHA-256, license and rights evidence; audit skull, vertebrae, ribs, sternum, pelvis, four limbs and tail; document gaps; segment identifiable bones, preserve scale and transforms; validate GLB and reviewed node bindings; add real specimen and rights records to the catalog. The local file viewer can inspect a candidate before publication. Its file-based IDs are not anatomical IDs.
