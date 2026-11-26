# Gemini Neon Independent Foundation Review — 2026-11-26

Reviewed PR #1 (`roy/foundation-hardening`, head `7b3e4628985274e35146480cdfd65624183d2a12`) and all 41 repository files + Notion hub.

## Architectural Verdict
**Keep `Vite + React + TypeScript + direct Three.js`** for P0–P1. Compared against Next.js 16 and React Three Fiber, direct Three.js keeps the static bundle minimal, gives deterministic WebGL resource disposal on low-end phones, and is straightforward for multiple cloud AI agents to audit and maintain from a phone. Defer `three-mesh-bvh`, `MeshoptDecoder`, and manifest splitting (`data/index.json` + per-species JSON chunks) until P1/P2 profiling confirms real mesh counts and payload sizes — while planning the data-split seam before exceeding ~100 structures so `src/App.tsx` does not statically bundle megabytes of JSON.

## Findings by Severity

### 1. Critical (Fixed in this PR)
- **`scripts/validate-catalog.mjs` — Calendar rollover bug:** `Date.parse("2026-02-31")` succeeds in JS and rolls over to March 3. Fixed with strict UTC round-trip date validation (`strictDate`).
- **`scripts/validate-catalog.mjs` — `inspectGLB` BIN chunk, SVG XSS & complexity gaps:** Previously did not verify BIN chunk magic/bounds, allowed `data:image/svg+xml` / `data:text/html` data URIs, did not check `extensionsUsed`, and had no mobile size/vertex/primitive/image ceiling. Fixed with strict `LIMITS`, BIN chunk validation, raster/binary-only `SAFE_DATA_URI_RE`, and `extensionsUsed` + `extensionsRequired` checks.
- **`scripts/validate-catalog.mjs` — Three.js node-name sanitization mismatch:** Node names containing `.` or spaces (e.g. Blender's `Femur.001`) passed CI but are silently mutated by Three.js at runtime. Enforced `SAFE_NODE_NAME_RE` (`^[A-Za-z0-9_-]{1,128}$`) in both catalog bindings and `inspectGLB`.
- **`src/Viewer.tsx` & `src/App.tsx` — Crash resilience, disposal completeness & link security:** Added `ErrorBoundary` around lazy `<Viewer />`, extended `disposeTree` to cover `Line`/`LineSegments`/`Points` + `renderer.renderLists?.dispose()`, added `safeHttpsUrl` + `rel="noopener noreferrer"` on external links.

### 2. Foundational Improvements (Implemented in this PR)
- **Claim-level anatomy schema & reviewer role guard (`src/catalog.ts`, `scripts/validate-catalog.mjs`):** Added backward-compatible `ontology` (`uberonId`, `navEdition`), `claims` (`origin`, `insertion`, `innervation`, `blood-supply`, `function`, `clinical-note` with per-claim `evidence`), `review.role`, and a guard rejecting obvious AI self-approval strings (`Gemini`, `ChatGPT`, `Roy`, `Claude`, etc.) on `expert-reviewed` records.
- **Keyboard accessibility & safe material-cloning highlight/isolation (`src/Viewer.tsx`, `src/App.tsx`, `src/style.css`):** Added keyboard orbit/zoom/reset on the canvas, 44px touch targets, `:focus-visible` outlines, and interactive structure highlight + isolate controls that clone materials safely before mutation.
- **Synthetic non-anatomical GLB test suite (`tests/catalog.test.mjs`):** Expanded from 6 to 14 unit tests using an in-memory single-triangle GLB generator (kept strictly outside `public/models/`).

### 3. Optional / Deferred to P1–P2
- Split `data/catalog.json` into a lightweight manifest + lazy per-species/specimen JSON files once structure count grows past ~50–100 entries.
- Integrate official Khronos `gltf-validator` CLI in GitHub Actions once the first real pilot `.glb` is prepared.
- Add headless Playwright + Chromium SwiftShader smoke test on a synthetic non-anatomical fixture in CI + real Android device FPS/RAM check.
- Enable `MeshoptDecoder` + `three-mesh-bvh` when real high-poly CT meshes are introduced in P1/P2.

### 4. Decisions Confirmed & Preserved
- Independent MIT codebase with strict separation of third-party asset licenses and explicit `NC`/`SA` handling.
- Strict separation of `Specimen`, `Structure`, and `Asset`, dual `review` + `rightsReview`, and SHA-pinned GitHub Actions with `npm ci`.
- Demand-rendered, abortable Three.js viewer with `URLModifier` blocking remote GLB URIs and `webglcontextlost`/`restored` handling.

### 5. Open Risks / Questions for Roy & Ibrahim
- **Real WebGL browser test not yet run in CI:** Node unit tests and TypeScript/Vite build are verified, but headless Chromium WebGL + real Android touch/FPS testing remain pending before P1 release.
- **First pilot specimen selection:** Recommend auditing `Figshare 7240529` (Greyhound Hindlimb, `CC BY 4.0`, 29 volumetric STLs) or `Edinburgh Open.Ed` (`CC BY 4.0` CT skulls) as the single coherent P1 pilot before touching `CC BY-NC` sources.
